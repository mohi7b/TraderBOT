/* ============================================================
 * D1 — The seam: a person, their workspace, their key, and the engine
 * identity/core/errors.cjs        (one vocabulary for every refusal)
 * identity/core/rbac.cjs          (one table that says who may)
 * identity/store/schema.cjs       (one database, one hash-chained audit table)
 * identity/service.cjs            (register · login · authorize · trail)
 * secrets/core/cipher.cjs         (one room, one lock: seal/open)
 * secrets/service.cjs             (put · get · list · revoke · material)
 * gateway/service.cjs             (the door: the order the two are asked in)
 * ============================================================
 * The three suites next door each prove that one layer keeps its own promises:
 * D1 identity, D2 the vault, D3 the door — every one of them against doubles,
 * with no socket anywhere near it. This file is the other half of that
 * argument, and the harder half: the four layers are wired to each other for
 * real, over one in-memory database and one injected clock, and a request
 * arrives exactly as a socket would hand it over. Nothing here is a spy but the
 * caller, so what is checked is the seam itself — that the promises are still
 * the ones each layer published, once they are asked *through each other*:
 *
 *   A. a person, a workspace and a token — and the chain that says so: one
 *      `POST /auth/register` makes the account, the tenant and the owner row,
 *      mints the pair, and leaves both decisions in the trail; `/auth/me`
 *      answers from the tables rather than from what the token claims;
 *   B. the workspace comes from the token, never from the wire: a path or an
 *      `X-Tenant-Id` that names another tenant is `tenant-mismatch` — refused
 *      before a table is read, with nothing on the wire that says whether it
 *      exists — and the disagreement, which identity never sees, is written
 *      into the workspace's own chain;
 *   C. one permission table, asked at one door: the owner reaches a key and an
 *      operator does not, the refusal that reaches the wire is identity's own
 *      code and identity's own words, and the vault is never asked at all;
 *   D. a key goes in sealed and comes back through one route: the plaintext is
 *      in neither the row, nor the chain, nor the inventory;
 *      `/secrets/:provider/reveal` is the one route that returns a value, and a
 *      revocation is a closed door rather than a deleted row;
 *   E. the engine's door is a seam, not a route: `material` has no path to
 *      reach it (`404`), the engine is handed the plaintext in-process with no
 *      person to ask about, it meets the same revocation a person does, and it
 *      cannot see another workspace's key;
 *   F. one chain holds every layer's decision, and it is a chain: identity's
 *      entries, the vault's entries and the door's own two refusals verify as
 *      one trail, and a rewritten or dropped line is named where it broke.
 *
 * Run: node gateway/tests/seam-identity-gateway.test.cjs
 *      node gateway/tests/run-all.cjs seam-identity-gateway   # this file alone
 * ============================================================ */
const assert = require("assert");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..", "..");
const { PERMISSIONS } = require(path.join(ROOT, "identity", "core", "rbac.cjs"));
const { migrate } = require(path.join(ROOT, "identity", "store", "schema.cjs"));
const { createIdentity } = require(path.join(ROOT, "identity", "service.cjs"));
const { migrate: migrateVault } = require(path.join(ROOT, "secrets", "store", "schema.cjs"));
const { createVault } = require(path.join(ROOT, "secrets", "service.cjs"));
const { createGateway } = require(path.join(ROOT, "gateway", "service.cjs"));

const START = 1_700_000_000_000;
const KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const OWNER = Object.freeze({ email: "owner@example.com", password: "Correct-Horse-9" });
const OPERATOR = Object.freeze({ email: "operator@example.com", password: "Battery-Staple-7" });
const SECRET_VALUE = "sk-live-2f9c1b7a4e6d8f0a1c3e5b7d9f1a3c5e";
const LABEL = "default";
const ELSEWHERE = "11111111-2222-4333-8444-555555555555";

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `D1: ${msg}`);
    checks += 1;
};
const eq = (actual, expected, msg) => {
    assert.strictEqual(actual, expected, `D1: ${msg} (saw ${JSON.stringify(actual)})`);
    checks += 1;
};

/** Rows in a table, counted the one way this file counts them. */
const rows = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

/** Everything a table holds, as text — how this file looks for a plaintext. */
const dump = (db, table) => JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());


/* ------------------------------------------------------------
 * The four layers, wired to each other for real
 * ---------------------------------------------------------- */

/**
 * One database, one clock, one identity layer, one vault and one door — which
 * is the whole picture of a deployment, minus the socket. The vault is a tenant
 * of identity's schema rather than a database of its own, and the door records
 * into the very same chain identity and the vault write into. That is the seam
 * this file is about: three writers, one ledger, one clock.
 */
function harness(config = {}) {
    const db = new Database(":memory:");
    migrate(db);        /* identity first: `secrets` references its tables */
    migrateVault(db);   /* then the vault's own second ledger, in the same file */

    const clock = {
        t: START,
        advance(ms) {
            this.t += ms;
            return this.t;
        }
    };
    const now = () => clock.t;

    const identity = createIdentity({ db, now, secret: "s".repeat(32) });
    const vault = createVault({
        db,
        now,
        key: KEY,
        authorize: identity.authorize,
        audit: identity.stores.audit
    });
    const gateway = createGateway({ identity, vault, audit: identity.stores.audit, now, config });

    return { db, clock, now, identity, vault, gateway, audit: identity.stores.audit };
}

/* ------------------------------------------------------------
 * A request and a response, as a socket would hand them over
 * ---------------------------------------------------------- */

/** A request double: the six things the pipeline touches, and a body that ends. */
function request({ method = "GET", url = "/", headers = {}, body = null, address = "203.0.113.7" } = {}) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { ...headers };
    req.socket = { remoteAddress: address };
    req.resume = () => {};

    const text = body === null ? null : typeof body === "string" ? body : JSON.stringify(body);
    if (text !== null && !("content-type" in req.headers)) req.headers["content-type"] = "application/json";

    /* Emitted on a macrotask, after the pipeline has attached its listeners. */
    setImmediate(() => {
        if (text !== null) req.emit("data", Buffer.from(text, "utf8"));
        req.emit("end");
    });
    return req;
}

/** A response double: what `send` writes, and nothing else. */
function response() {
    const res = {
        writableEnded: false,
        statusCode: null,
        headers: {},
        text: null,
        setHeader(name, value) { res.headers[String(name).toLowerCase()] = value; },
        writeHead(status) { res.statusCode = status; },
        end(chunk) { res.writableEnded = true; res.text = chunk === undefined ? null : chunk.toString("utf8"); }
    };
    res.json = () => {
        try {
            return JSON.parse(res.text);
        } catch {
            return null;
        }
    };
    return res;
}

/** Drive one request through the door and wait for the answer to be written. */
async function call(gateway, spec) {
    const req = request(spec);
    const res = response();
    gateway.handle(req, res);
    for (let spin = 0; spin < 1000 && !res.writableEnded; spin += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    ok(res.writableEnded, `the door answered ${req.method} ${req.url}`);
    return res;
}

/** The one header a caller carries, plus whatever else this test wants to say. */
const auth = (access, extra = {}) => ({ authorization: `Bearer ${access}`, ...extra });

/** Register through the door, and keep what a client would keep. */
async function enter(gateway, who) {
    const res = await call(gateway, {
        method: "POST",
        url: "/auth/register",
        body: { email: who.email, password: who.password }
    });
    const body = res.json();
    ok(res.statusCode === 201 && body && body.ok === true, `${who.email} registered through the door`);
    return { body, access: body.access, workspaceId: body.workspace.id, userId: body.user.id };
}

/* ------------------------------------------------------------
 * A. a person, a workspace and a token — and the chain that says so
 * ---------------------------------------------------------- */

async function aPersonArrivesAndTheChainSaysSo() {
    const { gateway, db, identity, audit } = harness();

    const res = await call(gateway, {
        method: "POST",
        url: "/auth/register",
        body: { email: ` ${OWNER.email.toUpperCase()} `, password: OWNER.password }
    });
    const body = res.json();

    eq(res.statusCode, 201, "registering is a creation, so the answer is 201");
    ok(body.ok === true && body.registered === true, "and the person is in");
    eq(body.role, "owner", "the first member of a new workspace is its owner");
    eq(body.member.role, "owner", "and the membership row register returned rides along");
    eq(body.workspace.ownerUserId, body.user.id, "the workspace is theirs");
    ok(typeof body.access === "string" && body.access.length > 40, "a token came back with them, in the same answer");
    ok(!("passwordHash" in body.user) && !("emailNormalized" in body.user), "what leaves the door is the public person, never the hash");

    const row = identity.stores.users.findByEmail(OWNER.email);
    ok(/^scrypt\$/.test(row.passwordHash), "the table holds a scrypt hash, not the password");
    ok(!dump(db, "users").includes(OWNER.password), "and the password is nowhere inside the row it was typed at");
    eq(rows(db, "workspaces"), 1, "one account is one workspace");
    eq(rows(db, "memberships"), 1, "with exactly one member in it");

    const me = await call(gateway, { url: "/auth/me", headers: auth(body.access) });
    const who = me.json();
    eq(me.statusCode, 200, "the token is re-read online, so /auth/me answers");
    eq(who.role, "owner", "with the role the roster holds now");
    eq(who.workspace.id, body.workspace.id, "and the workspace the token is for");
    ok(who.permissions.includes(PERMISSIONS.SECRETS_WRITE), "an owner may hold a venue key");

    const seen = identity.trail(body.user.id, { workspaceId: body.workspace.id });
    ok(seen.ok, "the owner may read the trail of their own workspace");
    const actions = seen.entries.map((entry) => `${entry.action}:${entry.outcome}`);
    ok(actions.includes("register:allow"), "and it says the account was made");
    ok(actions.includes("login:allow"), "and that the door then let them in — two decisions, two lines");
    ok(seen.entries.every((entry) => entry.workspaceId === body.workspace.id), "every entry it shows belongs to that workspace");
    eq(audit.counts().entries, rows(db, "audit"), "the counts are the table's, not a second ledger");
}

/* ------------------------------------------------------------
 * B. the workspace comes from the token, never from the wire
 * ---------------------------------------------------------- */

async function theWorkspaceComesFromTheTokenNeverFromTheWire() {
    const { gateway, identity } = harness();
    const owner = await enter(gateway, OWNER);

    const mine = await call(gateway, { url: "/workspaces", headers: auth(owner.access) });
    eq(mine.statusCode, 200, "an account's workspaces are readable with its token");
    eq(mine.json().workspaces.length, 1, "exactly the one it registered");
    eq(mine.json().workspaces[0].role, "owner", "with the role it holds there");

    /* A path may name a workspace; its only power is to disagree. */
    const onPath = await call(gateway, { url: `/workspaces/${ELSEWHERE}/members`, headers: auth(owner.access) });
    const pathWhy = onPath.json();
    eq(onPath.statusCode, 403, "a path that names another workspace is refused");
    eq(pathWhy.code, "tenant-mismatch", "as a tenant that does not match — not as a workspace that does not exist");
    eq(pathWhy.requested, ELSEWHERE, "the wire gets back what it sent, and nothing about whether it exists");
    ok(!("members" in pathWhy), "and no roster, because no table was read to make this answer");

    /* A header that disagrees is the same refusal, and the same non-answer. */
    const onWire = await call(gateway, { url: "/workspaces", headers: auth(owner.access, { "x-tenant-id": ELSEWHERE }) });
    eq(onWire.statusCode, 403, "a header that names another workspace is refused the same way");
    eq(onWire.json().code, "tenant-mismatch", "with the same code");
    eq(onWire.json().requested, ELSEWHERE, "the same echo of the id that was asked for");
    ok(onWire.json().tenant === owner.workspaceId, "and it names the tenant the token is actually for, which is the caller's own");

    /* A header that agrees is not a second identity — it is harmless, and visible. */
    const agreed = await call(gateway, { url: "/workspaces", headers: auth(owner.access, { "x-tenant-id": owner.workspaceId }) });
    eq(agreed.statusCode, 200, "a header that agrees changes nothing");
    eq(agreed.json().workspaces[0].id, owner.workspaceId, "the answer is the token's workspace, as it always was");

    /* Both disagreements are the door's own decisions, and identity never saw them. */
    const trail = identity.trail(owner.userId, { workspaceId: owner.workspaceId });
    const refusals = trail.entries.filter((entry) => entry.action === "gateway-tenant");
    eq(refusals.length, 2, "both disagreements are in the workspace's own chain — the fact identity is never told about");
    ok(refusals.every((entry) => entry.outcome === "deny" && entry.code === "tenant-mismatch"), "each one naming the code it was refused with");
    ok(refusals.every((entry) => entry.target === ELSEWHERE), "and the workspace that was asked for, which is the evidence a reviewer wants");
    ok(refusals.every((entry) => entry.workspaceId === owner.workspaceId), "attributed to the tenant that was actually calling");
    eq(gateway.stats().byCode["tenant-mismatch"], 2, "and the door counts them the same way twice");
}


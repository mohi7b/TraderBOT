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

/* ------------------------------------------------------------
 * Two readers, because these three layers speak two shapes and one chain
 * ---------------------------------------------------------- */

/** A refusal, or `null` — the shape identity, the vault and the wire all speak. */
const refusal = (result) => (result.ok ? null : result);

/** A trail as `action:outcome` strings — the one way this part reads a chain. */
const linesOf = (entries) => entries.map((entry) => `${entry.action}:${entry.outcome}`);

/* ------------------------------------------------------------
 * C. one permission table, asked at one door
 * ---------------------------------------------------------- */

async function onePermissionTableAskedAtOneDoor() {
    const { gateway, vault, identity } = harness();
    const owner = await enter(gateway, OWNER);

    /* The owner keeps a venue key. It goes in through the door, and identity's
     * table is asked twice on the way: once by the door for the route, once by
     * the vault for the act itself. */
    const stored = await call(gateway, {
        method: "PUT",
        url: "/secrets/binance",
        headers: auth(owner.access),
        body: { label: LABEL, value: SECRET_VALUE }
    });
    eq(stored.statusCode, 200, "the owner may store a venue key, because the table says so");
    eq(stored.json().secret.provider, "binance", "and what comes back is the vault's own answer");
    eq(vault.stats().decisions.allowed, 1, "one act reached the vault, and the vault asked the table before it acted");

    /* A second person: an account of their own first, then a seat at the desk's
     * table — the seat is what makes them a colleague. */
    const operator = await enter(gateway, OPERATOR);
    ok(operator.workspaceId !== owner.workspaceId, "an account registers into a workspace of its own before it is anyone's colleague");

    const invited = await call(gateway, {
        method: "POST",
        url: `/workspaces/${owner.workspaceId}/invite`,
        headers: auth(owner.access),
        body: { email: OPERATOR.email, role: "operator" }
    });
    eq(invited.statusCode, 200, "the owner invites them into the desk's workspace");
    eq(invited.json().member.role, "operator", "with the role that runs bots and never reads a key");
    ok(!invited.json().member.permissions.includes(PERMISSIONS.SECRETS_READ), "and the membership row says that out loud");

    const seated = await call(gateway, {
        method: "POST",
        url: "/auth/login",
        body: { email: OPERATOR.email, password: OPERATOR.password, workspaceId: owner.workspaceId }
    });
    const asOperator = seated.json();
    eq(seated.statusCode, 200, "the operator signs in, naming the desk's workspace");
    eq(asOperator.workspace.id, owner.workspaceId, "and lands in that workspace rather than in the one they registered with");
    eq(asOperator.role, "operator", "with the role the roster holds there");
    ok(!asOperator.permissions.includes(PERMISSIONS.SECRETS_READ), "and the permissions the token came with say the same");

    /* The same route, the same key, a token that is real: refused by the table. */
    const reveal = await call(gateway, {
        method: "POST",
        url: "/secrets/binance/reveal",
        headers: auth(asOperator.access),
        body: { label: LABEL }
    });
    const why = reveal.json();
    eq(reveal.statusCode, 403, "the operator reaches the same route and is refused");
    eq(why.code, "forbidden", "with identity's code for a role that does not carry the permission");
    ok(/secrets:read/.test(why.message), "and identity's own words, which name the permission rather than the door");
    ok(!("value" in why), "never the value — this door never had one to give");

    /* The proof that the refusal belongs to identity: the vault's own counter did
     * not move, because the vault was never reached. */
    eq(vault.stats().decisions.denied, 0, "the vault refused nothing, because the vault was never asked");
    eq(vault.stats().decisions.allowed, 1, "and the one act that reached it is still the owner's");

    /* The same table, asked at the vault's own door: no HTTP, no route, and the
     * same answer — one table, two doors, one vocabulary. */
    const direct = refusal(vault.put(operator.userId, owner.workspaceId, { provider: "binance", value: SECRET_VALUE }));
    ok(direct !== null, "the vault refuses the operator directly, with no request anywhere");
    eq(direct.code, "forbidden", "with the same code, because it is the same question");
    eq(vault.stats().decisions.denied, 1, "and this time the vault did ask — and counted the no");

    /* Both refusals are the one kind of no a reviewer must be able to find. */
    const trail = identity.trail(owner.userId, { workspaceId: owner.workspaceId });
    const forbiddens = trail.entries.filter((entry) => entry.code === "forbidden");
    eq(forbiddens.length, 2, "both refusals are in the workspace's chain, because `forbidden` is a code worth finding later");
    ok(forbiddens.every((entry) => entry.outcome === "deny" && entry.actorUserId === operator.userId),
        "each one a denial, each one attributed to the operator who asked");
    eq(gateway.stats().byCode.forbidden, 1, "and the door counted only the one it answered itself");

    /* The operator may read the trail of the workspace they work in: that is in
     * the table too, and it is how a colleague audits a colleague. */
    const readTheTrail = await call(gateway, { url: "/audit", headers: auth(asOperator.access) });
    eq(readTheTrail.statusCode, 200, "the operator may read the trail, because the same table grants audit:read");
    ok(readTheTrail.json().entries.every((entry) => entry.workspaceId === owner.workspaceId),
        "and the trail it reads is the workspace the token is for");
    ok(readTheTrail.json().entries.some((entry) => entry.code === "forbidden"),
        "which includes the lines about their own refused reach");
}

/* ------------------------------------------------------------
 * D. a key goes in sealed and comes back through one route
 * ---------------------------------------------------------- */

async function aKeyGoesInSealedAndComesBackThroughOneRoute() {
    const { gateway, vault, db, identity } = harness();
    const owner = await enter(gateway, OWNER);

    /* In: the value is handed over exactly once, on the way in — and the answer
     * to the write carries no part of it back. */
    const stored = await call(gateway, {
        method: "PUT",
        url: "/secrets/binance",
        headers: auth(owner.access),
        body: { label: LABEL, value: SECRET_VALUE }
    });
    eq(stored.statusCode, 200, "the key is stored");
    eq(stored.json().created, true, "for the first time, and the vault says so");
    ok(!JSON.stringify(stored.json()).includes(SECRET_VALUE), "and the answer to the write carries no part of the value back");

    /* Sealed at rest: the row, the whole table, and the chain that recorded it. */
    const row = vault.stores.secrets.rawByKey(owner.workspaceId, "binance", LABEL);
    ok(/^v1\$/.test(row.ciphertext) && !row.ciphertext.includes(SECRET_VALUE),
        "at rest it is the vault's sealed format, not the key");
    ok(!dump(db, "secrets").includes(SECRET_VALUE), "and the plaintext is nowhere in the table it was typed at");
    ok(!dump(db, "audit").includes(SECRET_VALUE), "nor anywhere in the chain that recorded the write");

    /* The inventory names what exists and never what it says. */
    const listed = await call(gateway, { url: "/secrets", headers: auth(owner.access) });
    eq(listed.statusCode, 200, "the owner may list what exists");
    eq(listed.json().secrets.length, 1, "one key");
    eq(listed.json().counts.active, 1, "active, and not revoked");
    ok(!JSON.stringify(listed.json()).includes(SECRET_VALUE), "and the inventory carries no value at all");
    ok(!("ciphertext" in listed.json().secrets[0]), "not even the sealed text: the inventory is metadata and only metadata");

    /* One route hands a value back, and this is it. */
    const revealed = await call(gateway, {
        method: "POST",
        url: "/secrets/binance/reveal",
        headers: auth(owner.access),
        body: { label: LABEL }
    });
    eq(revealed.statusCode, 200, "the one route that hands a value back answers");
    eq(revealed.json().value, SECRET_VALUE, "with exactly the value that went in");
    eq(revealed.json().label, LABEL, "against the label it was stored under");
    eq(revealed.json().secret.useCount, 1, "and the row records that it was handed out once");

    /* Out: revocation closes the door and keeps the row. A key pulled after a
     * leak must not become a key that never existed. */
    const revoked = await call(gateway, {
        method: "POST",
        url: "/secrets/binance/revoke",
        headers: auth(owner.access),
        body: { label: LABEL, reason: "rotated after a leak" }
    });
    eq(revoked.statusCode, 200, "the owner may revoke");
    eq(revoked.json().secret.revoked, true, "and the row says revoked");

    const again = await call(gateway, {
        method: "POST",
        url: "/secrets/binance/reveal",
        headers: auth(owner.access),
        body: { label: LABEL }
    });
    eq(again.statusCode, 409, "the route that returned the value is now closed");
    eq(again.json().code, "secret-revoked", "as a revocation, not as a key that is missing");
    eq(again.json().reason, "rotated after a leak", "carrying the reason the revocation was recorded with, so an operator can read why");
    ok(!("value" in again.json()), "and no value, ever");
    eq(vault.stores.secrets.rawByKey(owner.workspaceId, "binance", LABEL).use_count, 1,
        "the refused reach did not touch the row either");

    const stillThere = await call(gateway, { url: "/secrets", headers: auth(owner.access) });
    eq(stillThere.json().secrets.length, 1, "the row is still there: revocation is not deletion");
    eq(stillThere.json().counts.revoked, 1, "counted as revoked");
    eq(stillThere.json().counts.active, 0, "so nothing in this workspace is active");
    ok(stillThere.json().secrets[0].revokedAt !== null && stillThere.json().secrets[0].revokedReason === "rotated after a leak",
        "with the time and the reason of the revocation kept on the record");

    /* The chain holds the whole story of the key, and none of its value. */
    const trail = identity.trail(owner.userId, { workspaceId: owner.workspaceId });
    const about = trail.entries.filter((entry) => entry.target === `binance:${LABEL}`);
    const lines = linesOf(about);
    ok(lines.includes("secret-put:allow"), "the write is in the chain");
    ok(lines.includes("secret-get:allow"), "the reveal is in the chain");
    ok(lines.includes("secret-get:deny"), "and the reach that met the revocation is a denial, not a silence");
    ok(lines.includes("secret-revoke:allow"), "the revocation is in the chain too");
    ok(about.every((entry) => !JSON.stringify(entry.meta || {}).includes(SECRET_VALUE)),
        "and every line of it is metadata, never the value");
    ok(about.every((entry) => entry.workspaceId === owner.workspaceId && entry.actorUserId === owner.userId),
        "each one attributed to the workspace and the person who asked for it");
}

/* ------------------------------------------------------------
 * E. the engine's door is a seam, not a route
 * ---------------------------------------------------------- */

async function theEnginesDoorIsASeamNotARoute() {
    const { gateway, vault, identity } = harness();
    const owner = await enter(gateway, OWNER);
    const other = await enter(gateway, OPERATOR);

    await call(gateway, {
        method: "PUT",
        url: "/secrets/binance",
        headers: auth(owner.access),
        body: { label: LABEL, value: SECRET_VALUE }
    });

    /* No spelling of the engine's door is a route — a caller may try every one. */
    const spellings = ["/material", "/material/binance", "/engine/material",
        "/secrets/binance/material", "/secrets/binance/reveal/material"];
    for (const url of spellings) {
        const res = await call(gateway, { url, headers: auth(owner.access) });
        eq(res.statusCode, 404, `there is no route at ${url}`);
        eq(res.json().code, "no-route", "and the refusal says so in those words");
        eq(res.json().path, url, "echoing the path it was asked for, and nothing about what might live there");
    }

    /* The nearest spelling is the vault's list of venues and not the engine's
     * door: `material` is not a provider, so the write is refused as a venue
     * this API does not hold — a 400 about the caller's own typo. */
    const guessed = await call(gateway, {
        method: "PUT",
        url: "/secrets/material",
        headers: auth(owner.access),
        body: { label: LABEL, value: SECRET_VALUE }
    });
    eq(guessed.statusCode, 400, "the one path grammar that matched is a key write");
    eq(guessed.json().code, "provider-unknown", "judged as an unknown venue, never as a second door");

    /* And no request reached the seam, because none is routed to it. */
    const routed = identity.stores.audit.trail({ limit: 1000 });
    ok(!routed.some((entry) => entry.action === "secret-inject"), "no request in this process ever reached the injection seam");
    ok(gateway.table().every((entry) => !/material|inject/i.test(entry.path)), "and the route table this API publishes names no path like it");
    eq(gateway.stats().routes, gateway.table().length, "the door publishes exactly the routes it serves, and no more");

    /* The seam itself: a workspace, no person, and the plaintext — in-process. */
    const injected = vault.material(owner.workspaceId, "binance", { label: LABEL });
    ok(injected.ok === true, "the engine's door opens for a workspace alone, with no token and no person");
    eq(injected.value, SECRET_VALUE, "and hands the plaintext over at the seam, inside this process");
    ok(!("actorUserId" in injected), "with no caller attributed, because an engine is not a person");

    /* The seam meets the same revocation a person meets, and the same absence:
     * there is no second reading of a revoked key just because nobody asked. */
    await call(gateway, {
        method: "POST",
        url: "/secrets/binance/revoke",
        headers: auth(owner.access),
        body: { label: LABEL }
    });
    eq(refusal(vault.material(owner.workspaceId, "binance", { label: LABEL })).code, "secret-revoked",
        "a revoked key stays revoked at the engine's door, exactly as it does at the reveal route");
    eq(refusal(vault.material(other.workspaceId, "binance", { label: LABEL })).code, "secret-not-found",
        "another workspace's key is simply not there, because the workspace id is the whole question");
    eq(refusal(vault.material(null, "binance", { label: LABEL })).code, "secret-not-found",
        "and a workspace that was never named reaches nothing at all");

    /* The engine's own reads are in the same chain, attributed to a workspace and
     * to no person — which is the whole point of the seam. */
    const after = identity.stores.audit.trail({ limit: 1000 });
    const injects = after.filter((entry) => entry.action === "secret-inject");
    eq(injects.length, 3, "three injections were recorded: one that worked and two that did not");
    ok(injects.some((entry) => entry.outcome === "allow"), "the one that worked is in the chain");
    ok(injects.some((entry) => entry.outcome === "deny" && entry.code === "secret-revoked"), "and the one that met the revocation names its code");
    ok(injects.every((entry) => entry.actorUserId === null), "no injection line has a person on it");
    eq(injects.filter((entry) => entry.workspaceId !== null).length, 2, "the two that named a workspace are attributed to it");
    ok(injects.some((entry) => entry.workspaceId === null), "and the one that named none is recorded as belonging to none");
    eq(identity.verifyAudit().audit.ok, true, "the chain still verifies with the engine's own reads folded into it");
}

/* ------------------------------------------------------------
 * F. one chain holds every layer's decision, and it can be walked
 * ---------------------------------------------------------- */

/** The stored columns of an entry, so a test can put one back exactly as it was. */
const columnsOf = (entry) => ({
    seq: entry.seq,
    at: entry.at,
    workspaceId: entry.workspaceId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    outcome: entry.outcome,
    code: entry.code,
    target: entry.target,
    meta: entry.meta,
    prevHash: entry.prevHash,
    hash: entry.hash
});

async function oneChainHoldsEveryLayersDecision() {
    const { gateway, identity, audit, db } = harness();
    const owner = await enter(gateway, OWNER);

    /* One ordinary morning at the desk, exercising all three layers: a key in, a
     * key out, a workspace named that is not the token's, and a password typed
     * wrong — which is the one line nobody should be able to erase. */
    await call(gateway, { method: "PUT", url: "/secrets/binance", headers: auth(owner.access), body: { label: LABEL, value: SECRET_VALUE } });
    await call(gateway, { method: "POST", url: "/secrets/binance/reveal", headers: auth(owner.access), body: { label: LABEL } });
    await call(gateway, { url: `/workspaces/${ELSEWHERE}/members`, headers: auth(owner.access) });
    await call(gateway, { method: "POST", url: "/auth/login", body: { email: OWNER.email, password: "Not-The-Password-1" } });

    const whole = audit.trail({ limit: 1000 });
    const lines = linesOf(whole);

    /* Three writers, one ledger: identity's decisions, the vault's, and the
     * door's own refusals that identity is never told about. */
    ok(lines.includes("register:allow") && lines.includes("login:allow"), "identity's decisions are in it");
    ok(lines.includes("secret-put:allow") && lines.includes("secret-get:allow"), "the vault's decisions are in it too");
    ok(lines.includes("gateway-tenant:deny"), "and the door's own refusal, which identity never saw");
    ok(lines.includes("login:deny"), "and a refused login, which is the other kind of line entirely");

    eq(audit.counts().entries, whole.length, "the counts are the table's own, not a second ledger");
    const page = identity.trail(owner.userId, { workspaceId: owner.workspaceId });
    eq(page.entries.length, whole.length, "and this workspace's page holds every line of the morning, because every line belongs to it");
    eq(page.counts.entries, audit.counts().entries, "the counts that come back with a page are the table's, the same number again");
    eq(gateway.stats().byCode["tenant-mismatch"], 1, "the door counted its own refusal once");
    eq(gateway.stats().audited, 1, "and says it wrote one line — the one it made without identity");

    /* One chain means one verifier, and it says yes. */
    const walked = audit.verify();
    eq(walked.ok, true, "the whole chain verifies as one hash-chained trail");
    eq(walked.checked, whole.length, "every row of it was walked, not a sample");
    eq(walked.head, whole[0].hash, "and it ends on the hash of the newest row");
    eq(identity.verifyAudit().audit.head, walked.head, "identity's own verifier agrees, because it is the same chain and not a copy");

    /* The claim the layer makes is that the chain is append-only. A test that
     * only read it back would prove nothing, so it is broken on purpose — and
     * put back, and broken the other way. */
    const restore = db.prepare(`INSERT INTO audit
        (seq, at, workspace_id, actor_user_id, action, outcome, code, target, meta, prev_hash, hash)
        VALUES (@seq, @at, @workspaceId, @actorUserId, @action, @outcome, @code, @target, @meta, @prevHash, @hash)`);

    const middle = whole[Math.floor(whole.length / 2)];
    db.prepare("DELETE FROM audit WHERE seq = ?").run(middle.seq);
    const holed = audit.verify();
    eq(holed.ok, false, "a line dropped out of the middle breaks the chain");
    eq(holed.brokenAt, middle.seq + 1, "and it is named at the row that no longer follows the one before it");

    restore.run(columnsOf(middle));
    eq(audit.verify().ok, true, "putting the line back, byte for byte, closes the hole again");

    const rewritten = whole.find((entry) => entry.action === "secret-put");
    db.prepare("UPDATE audit SET outcome = 'deny' WHERE seq = ?").run(rewritten.seq);
    const edited = audit.verify();
    eq(edited.ok, false, "a rewritten outcome is as visible as a missing line");
    eq(edited.brokenAt, rewritten.seq, "and this time it is the rewritten row itself that is named");
    ok(edited.checked < whole.length, "with how far it walked before the first row that did not fit");
}

/* ------------------------------------------------------------
 * The run — each part on its own database, so none can explain another away
 * ---------------------------------------------------------- */

const PARTS = [
    ["a person arrives and the chain says so", aPersonArrivesAndTheChainSaysSo],
    ["the workspace comes from the token, never from the wire", theWorkspaceComesFromTheTokenNeverFromTheWire],
    ["one permission table, asked at one door", onePermissionTableAskedAtOneDoor],
    ["a key goes in sealed and comes back through one route", aKeyGoesInSealedAndComesBackThroughOneRoute],
    ["the engine's door is a seam, not a route", theEnginesDoorIsASeamNotARoute],
    ["one chain holds every layer's decision, and it can be walked", oneChainHoldsEveryLayersDecision]
];

async function main() {
    let failed = 0;

    for (const [name, part] of PARTS) {
        const before = checks;
        try {
            await part();
            process.stdout.write(`  ok    ${name}  (${checks - before} checks)\n`);
        } catch (error) {
            failed += 1;
            process.exitCode = 1;
            process.stdout.write(`  FAIL  ${name}\n        ${error && error.message}\n`);
        }
    }

    const tail = failed === 0
        ? `D1 seam: ${checks} checks passed across ${PARTS.length} parts\n`
        : `D1 seam: ${failed} of ${PARTS.length} parts failed after ${checks} checks\n`;
    process.stdout.write(tail);
}

main();


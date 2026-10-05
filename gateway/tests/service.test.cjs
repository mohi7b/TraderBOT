/* ============================================================
 * File: gateway/tests/service.test.cjs
 * Section: gateway/tests (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   D3 — the door, with no socket anywhere near it. Every seam the gateway
 *   borrows is a double with a journal, so the one question this file asks is
 *   answerable without a database and without a port:
 *
 *     "was identity asked at all, and was it asked in this order?"
 *
 *   The order is the design of gateway/service.cjs, so it is the design this
 *   file checks, section by section, with nothing but `assert` and a counter:
 *
 *     1. wiring — a door without a clock, without identity or without the audit
 *        chain does not start, and names what is missing; a missing vault is a
 *        deployment, not a bug;
 *     2. the route table — what this API exposes is data: `/health` is public
 *        and pays no budget, a verb that is not this path's is a `405` naming
 *        the ones that are, and `material` has no route to reach it;
 *     3. the address budget is spent before identity is asked anything, so a
 *        flood never becomes a database read — and `/health` never pays;
 *     4. authenticate — no header, a scheme that is not `Bearer`, a token
 *        identity refuses: each answer is identity's, and no act runs;
 *     5. tenant — a path or a header that disagrees with the token is refused,
 *        written into the chain, and identity is not asked to judge it;
 *     6. the workspace budget belongs to the tenant the token named, and only
 *        to it;
 *     7. permission — identity's one door decides, its refusal reaches the wire
 *        unchanged, and this layer never reads a role;
 *     8. the body is read last, so a closed door is never handed one, and a
 *        body past the ceiling is a `413` rather than a buffer that grows;
 *     9. the act's answer travels with its code and its words — and nothing it
 *        withheld: the `WITHHELD` list is checked key by key;
 *    10. counters, events and the trail carry metadata only, a listener that
 *        throws cannot turn an answer into no answer, and a throw out of an act
 *        is a `500` that is counted, announced and recorded.
 *
 * Run: node gateway/tests/service.test.cjs
 *      node gateway/tests/run-all.cjs            # every file in this folder
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const ROOT = path.join(__dirname, "..", "..");
const { CODES, accept, refuse } = require(path.join(ROOT, "identity", "core", "errors.cjs"));
const { PERMISSIONS } = require(path.join(ROOT, "identity", "core", "rbac.cjs"));
const { createGateway, EVENTS } = require(path.join(ROOT, "gateway", "service.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `D3: ${msg}`);
    checks += 1;
};
const eq = (actual, expected, msg) => {
    assert.strictEqual(actual, expected, `D3: ${msg} (saw ${JSON.stringify(actual)})`);
    checks += 1;
};
const deepEq = (actual, expected, msg) => {
    assert.deepStrictEqual(actual, expected, `D3: ${msg} (saw ${JSON.stringify(actual)})`);
    checks += 1;
};
/** The code of a wiring bug, which is thrown rather than answered. */
const codeOf = (fn) => {
    try {
        fn();
        return null;
    } catch (error) {
        return error.code || String(error.message || error);
    }
};

/* ------------------------------------------------------------
 * A request and a response, as the pipeline reads and writes them
 * ---------------------------------------------------------- */

/**
 * A request double: the six things the pipeline touches — `method`, `url`,
 * `headers`, `socket.remoteAddress`, `resume`, and a body that arrives as
 * `data`/`end` events. The body is emitted on a macrotask, after the pipeline
 * has attached `readBody`'s listeners: that ordering is the only subtlety here,
 * and a `nextTick` instead would lose the body without failing loudly.
 */
function request({ method = "GET", url = "/", headers = {}, body = null, address = "203.0.113.7" } = {}) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
    );
    req.socket = { remoteAddress: address };
    req.resume = () => { req.resumed = true; };
    let bytes = null;
    if (body !== null) {
        const text = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
        bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8");
        if (typeof body !== "string" && !Buffer.isBuffer(body) && !("content-type" in req.headers)) {
            req.headers["content-type"] = "application/json";
        }
    }
    /* A request with no body still ends: the pipeline may only be waiting for
     * `end`, and a double that never sends it would hang rather than fail. */
    setImmediate(() => {
        if (bytes) req.emit("data", bytes);
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

/**
 * Drive one request through the door and wait for the answer to be written.
 * The wait is the point: `handle` returns immediately — it is a socket's
 * entry point — and the answer arrives after the pipeline's promises settle.
 */
async function call(gateway, req, res = response()) {
    gateway.handle(req, res);
    for (let spin = 0; spin < 1000 && !res.writableEnded; spin += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    ok(res.writableEnded, `the door answered ${req.method} ${req.url}`);
    return res;
}

/* ------------------------------------------------------------
 * The seams, as doubles with a journal
 * ---------------------------------------------------------- */

const IDENTITY_VERBS = Object.freeze([
    "inspect", "authorize", "register", "login", "refresh", "logout", "me",
    "workspacesFor", "members", "invite", "trail"
]);
const VAULT_VERBS = Object.freeze(["list", "put", "get", "revoke"]);

/** What identity's `inspect` says about the caller this file pretends to be. */
const OWNER = Object.freeze({
    user: Object.freeze({ id: "u-owner", email: "owner@example.com" }),
    claims: Object.freeze({ wid: "w-1" }),
    role: "owner",
    permissions: Object.freeze([PERMISSIONS.SECRETS_READ, PERMISSIONS.SECRETS_WRITE]),
    session: Object.freeze({ id: "s-1" })
});

const BEARER = Object.freeze({ authorization: "Bearer access-1" });

/**
 * Every seam the door is wired to, each one a spy that journals the call and
 * answers with what the test asked for: a value, or a function of the arguments
 * for the cases where the answer depends on who is calling. Nothing here reads
 * a database, and nothing here sleeps.
 */
function seams({ identityAnswers = {}, vaultAnswers = null, config = {} } = {}) {
    const journal = [];
    const chain = [];
    const clock = {
        t: 1_700_000_000_000,
        advance(ms) { clock.t += ms; }
    };

    const note = (name, answer) => (...args) => {
        journal.push({ name, args });
        return typeof answer === "function" ? answer(...args) : answer;
    };

    const defaults = {
        inspect: accept(OWNER),
        authorize: accept({ allowed: true }),
        register: accept({ user: OWNER.user, member: Object.freeze({ role: "owner" }) }),
        login: accept({ access: "access-1", refresh: "refresh-1", user: OWNER.user }),
        refresh: accept({ access: "access-2", refresh: "refresh-2" }),
        logout: accept({ ended: 1 }),
        me: accept({ user: OWNER.user, role: "owner" }),
        workspacesFor: accept({ workspaces: [] }),
        members: accept({ members: [] }),
        invite: accept({ invitation: Object.freeze({ email: "new@example.com" }) }),
        trail: accept({ entries: [], counts: { entries: 0, denials: 0 } })
    };

    const identity = {};
    for (const verb of IDENTITY_VERBS) {
        const answered = Object.prototype.hasOwnProperty.call(identityAnswers, verb);
        identity[verb] = note(verb, answered ? identityAnswers[verb] : defaults[verb]);
    }

    const vaultDefaults = {
        list: accept({ secrets: [] }),
        put: accept({ secret: Object.freeze({ provider: "binance", label: "main" }) }),
        get: accept({ secret: Object.freeze({ provider: "binance", label: "main" }), value: "plain-text" }),
        revoke: accept({ secret: Object.freeze({ provider: "binance", label: "main", revoked_at: 1 }) })
    };

    let vault = null;
    if (vaultAnswers !== null) {
        vault = {
            core: Object.freeze({ MAX_SECRET_BYTES: 16 * 1024 })
        };
        for (const verb of VAULT_VERBS) {
            const answered = Object.prototype.hasOwnProperty.call(vaultAnswers, verb);
            vault[verb] = note(`vault.${verb}`, answered ? vaultAnswers[verb] : vaultDefaults[verb]);
        }
        /* Not a verb of the API: the engine's seam, which this layer must never
         * be able to reach — the journal proves it never does. */
        vault.material = note("vault.material", accept({ value: "plain-text" }));
    }

    const audit = {
        entries: chain,
        append(entry) {
            const row = Object.freeze({ seq: chain.length + 1, ...entry });
            chain.push(row);
            return row;
        }
    };

    const gateway = createGateway({ identity, vault, audit, now: () => clock.t, config });

    return {
        gateway,
        identity,
        vault,
        audit,
        chain,
        clock,
        journal,
        names: () => journal.map((entry) => entry.name),
        asked: (name) => journal.some((entry) => entry.name === name),
        countOf: (name) => journal.filter((entry) => entry.name === name).length,
        argsOf: (name) => journal.filter((entry) => entry.name === name).map((entry) => entry.args),
        actionsOf: () => chain.map((entry) => `${entry.action}:${entry.outcome}`)
    };
}

/** A gateway whose identity refuses everything, for the wiring section. */
function bare({ now = () => 1_700_000_000_000, identity, vault = null, audit, config = {} } = {}) {
    return createGateway({ now, identity, vault, audit, config });
}

/* ------------------------------------------------------------
 * 1. a door that is not wired completely does not start
 * ---------------------------------------------------------- */

async function aDoorThatIsNotWiredCompletelyDoesNotStart() {
    const { identity, audit } = seams();
    const clock = () => 1_700_000_000_000;

    eq(codeOf(() => createGateway({ identity, audit })), CODES.NO_CLOCK,
        "a door with no clock does not start: it is handed one and never reads one");
    eq(codeOf(() => createGateway({ now: clock, audit })), CODES.NO_DB,
        "nor does a door without identity — the only layer that knows who is calling");
    eq(codeOf(() => createGateway({ now: clock, identity })), CODES.BAD_ENTRY,
        "nor without the audit chain it writes its own refusals into");
    eq(codeOf(() => createGateway({ now: clock, identity, audit, vault: { put() {}, get() {} } })), CODES.NO_VAULT_KEY,
        "and a vault that cannot list, put, get and revoke is not a vault");
    eq(codeOf(() => createGateway({ now: clock, identity, audit, config: null })), CODES.BAD_ENTRY,
        "the config is an object of overrides, not whatever arrived");

    /* A number that is not a number is a wiring bug, never a silent fallback. */
    const refused = [
        [{ port: "eight" }, "port is an integer"],
        [{ port: 70_000 }, "port past 65535"],
        [{ maxBodyBytes: 0 }, "a ceiling of zero bytes"],
        [{ host: "   " }, "a host that is only spaces"],
        [{ requestTimeoutMs: -1 }, "a negative timeout"],
        [{ ip: { capacity: 0, refillPerSec: 1 } }, "an address budget of zero"],
        [{ workspace: { capacity: 1 } }, "a tenant budget with no refill"],
        [{ maxBuckets: Number.NaN }, "a bucket ceiling that is not a number"]
    ];
    for (const [config, what] of refused) {
        eq(codeOf(() => bare({ identity, audit, config })), CODES.BAD_ENTRY, `config: ${what} is refused at construction`);
    }

    const shaped = seams({ config: { tenantHeader: "X-Tenant-Id", trustProxy: true, maxBodyBytes: 128 } }).gateway;
    eq(shaped.config.tenantHeader, "x-tenant-id", "a header name is lower-cased once, where it is read");
    eq(shaped.config.trustProxy, true, "and a deployment's own numbers are the ones the door obeys");
    eq(shaped.config.maxBodyBytes, 128, "including the ceiling a body may reach");

    const plain = seams().gateway;
    eq(plain.stats().state, "idle", "a door nobody asked to listen is idle, not closed");
    eq(plain.address(), null, "and has no address until it does");
    eq(plain.stats().vault, false, "a deployment with no vault says so");
    eq(seams({ vaultAnswers: {} }).gateway.stats().vault, true, "and one with a vault says that");
    ok(Object.isFrozen(plain.config) && Object.isFrozen(plain.table()), "what it hands out is frozen: an API is not a variable");
    eq(codeOf(() => plain.on("request", "not a function")), CODES.BAD_ENTRY, "a listener is a function");
    const unsubscribe = plain.on(EVENTS.REQUEST, () => {});
    eq(typeof unsubscribe, "function", "and subscribing hands back the unsubscribe, not a promise of one");
    unsubscribe();
    deepEq(Object.keys(EVENTS).sort(), ["ALLOWED", "INTERNAL", "REFUSED", "REQUEST"], "the four things it announces are named once");
    await plain.stop();
    ok(true, "while stopping a door that never listened resolves rather than throwing");
}

/* ------------------------------------------------------------
 * 2. what this API exposes is data, and `/health` is the door's own
 * ---------------------------------------------------------- */

async function whatThisApiExposesIsData() {
    const vaulted = seams({ vaultAnswers: {} });
    const withVault = vaulted.gateway;
    const surface = (gateway) => gateway.table().map((entry) => `${entry.method} ${entry.path}`).sort();

    deepEq(surface(withVault), [
        "GET /audit",
        "GET /auth/me",
        "GET /health",
        "GET /secrets",
        "GET /workspaces",
        "GET /workspaces/:workspaceId/members",
        "POST /auth/login",
        "POST /auth/logout",
        "POST /auth/refresh",
        "POST /auth/register",
        "POST /secrets/:provider/reveal",
        "POST /secrets/:provider/revoke",
        "POST /workspaces/:workspaceId/invite",
        "PUT /secrets/:provider"
    ], "the whole surface is one frozen list, readable in one sitting");

    const table = withVault.table();
    ok(table.every((entry) => typeof entry.summary === "string" && entry.summary.length > 0),
        "and every route says in one line what it is for");
    ok(table.every((entry) => Object.isFrozen(entry)), "each entry is frozen, so nothing rewrites the API at runtime");
    eq(table.filter((entry) => entry.vault).length, 4, "four routes need the vault");
    ok(table.filter((entry) => entry.vault).every((entry) => entry.permission !== null),
        "and each of those names the permission the vault will judge it by");
    ok(!table.some((entry) => /material/i.test(entry.path)),
        "while the engine's injection seam has no path at all: what is not a route cannot be asked for");

    const withoutVault = seams().gateway;
    deepEq(surface(withoutVault).filter((entry) => entry.includes("secrets")), [],
        "a deployment with no vault has no vault routes, rather than routes that fail");
    eq(withoutVault.table().length, 10, "and says so by having ten routes and not fourteen");

    const health = table.find((entry) => entry.path === "/health");
    ok(health.public === true && health.limits === false && health.permission === null,
        "/health is public, unlimited and asks nobody's permission: a heartbeat that could be rate-limited reports an outage during one");

    /* The one route a caller may reach with no token at all is the heartbeat. */
    const open = seams();
    const heartbeat = await call(open.gateway, request({ method: "GET", url: "/health" }));
    eq(heartbeat.statusCode, 200, "and it answers without a token");
    eq(heartbeat.json().status, "alive", "saying it is alive");
    eq(heartbeat.json().routes, 10, "and how big the surface it is the door of is");
    eq(open.countOf("inspect"), 0, "without asking identity anything about anyone");

    /* A guess at a verb is told which ones would have worked. */
    const wrongVerb = await call(withVault, request({ method: "GET", url: "/auth/login", headers: BEARER }));
    eq(wrongVerb.statusCode, 405, "a verb this path does not take is a 405");
    eq(wrongVerb.json().code, CODES.WRONG_METHOD, "with the code that names it");
    eq(wrongVerb.headers.allow, "POST", "and the list of verbs, in the header a client acts on");
    deepEq(wrongVerb.json().allow, ["POST"], "and in the body a person reads");
    ok(!vaulted.asked("inspect"), "without asking identity anything: the route table answered first");

    const nowhere = await call(withVault, request({ method: "GET", url: "/material", headers: BEARER }));
    eq(nowhere.statusCode, 404, "and a path nothing answers is a 404");
    eq(nowhere.json().code, CODES.NO_ROUTE, "with no route, named as such");
    ok(!vaulted.asked("vault.material"), "and the vault's seam is never called by this layer, not even by accident");

    const mangled = await call(withVault, request({ method: "GET", url: "/auth/%E0%A4%A", headers: BEARER }));
    eq(mangled.statusCode, 400, "a path that was never percent-encoded is a 400, not a crash");
    eq(mangled.json().code, CODES.BAD_REQUEST, "and says which mistake it was");
}

/* ------------------------------------------------------------
 * 3. the address budget is spent before identity is asked anything
 * ---------------------------------------------------------- */

async function aFloodNeverBecomesADatabaseRead() {
    const world = seams({ config: { ip: { capacity: 1, refillPerSec: 1 } } });

    /* The heartbeat opts out of the budget on purpose, and pays nothing. */
    for (let beat = 0; beat < 4; beat += 1) {
        const alive = await call(world.gateway, request({ method: "GET", url: "/health" }));
        eq(alive.statusCode, 200, "the one route with no budget answers every time, however often it is asked");
    }
    eq(world.countOf("inspect"), 0, "and it never asks identity anything: there is nobody to ask about");

    const paid = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(paid.statusCode, 200, "a caller with a budget left is served");
    const spent = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(spent.statusCode, 429, "and the one after that is refused, before identity is asked");
    eq(spent.json().code, CODES.RATE_LIMITED, "with the one code a caller that must wait is told");
    ok(Number(spent.headers["retry-after"]) >= 1, "and the one header HTTP promises it in, in whole seconds");
    eq(world.countOf("inspect"), 1, "identity was asked exactly once: the flood never reached it");
    eq(world.countOf("me"), 1, "and the act ran exactly once, for the request that paid");

    /* A refused request is not allowed to cost a database read even when its
     * token is nonsense: the budget is arithmetic, and arithmetic comes first. */
    const garbage = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: { authorization: "Bearer nonsense" } }));
    eq(garbage.statusCode, 429, "a request whose token is nonsense is answered by the budget, not by identity");

    const entry = world.chain.find((row) => row.action === "gateway-budget");
    ok(entry && entry.outcome === "deny", "the spent budget is written into the chain this layer cannot leave to identity");
    eq(entry.code, CODES.RATE_LIMITED, "with the code that names it");
    eq(entry.target, "203.0.113.7", "and the address it was spent at");
    eq(entry.meta.action, "me", "and which route was asked for");
    eq(entry.actorUserId, null, "and nobody, because a caller that cannot even pay is not yet anybody");

    /* The clock is injected, so "later" is a fact this test can state. */
    world.clock.advance(1000);
    const later = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(later.statusCode, 200, "once the injected clock says the bucket refilled, the same address is served again");

    /* One caller behind a trusted proxy is one caller, and the header says who. */
    const proxied = seams({ config: { trustProxy: true, ip: { capacity: 1, refillPerSec: 1 } } });
    await call(proxied.gateway, request({ method: "GET", url: "/auth/me", headers: { ...BEARER, "x-forwarded-for": "198.51.100.9, 10.0.0.1" } }));
    const forwarded = await call(proxied.gateway, request({ method: "GET", url: "/auth/me", headers: { ...BEARER, "x-forwarded-for": "198.51.100.9" } }));
    eq(forwarded.statusCode, 429, "with `trustProxy`, the first hop is the caller and its budget follows it");
    eq(proxied.chain.find((row) => row.action === "gateway-budget").target, "198.51.100.9",
        "and the chain names that hop, not the socket in front of it");
}

/* ------------------------------------------------------------
 * 4. a token that is missing, mis-spelled, or refused by identity
 * ---------------------------------------------------------- */

async function noTokenMeansIdentityIsNeverAsked() {
    const world = seams();
    const none = await call(world.gateway, request({ method: "GET", url: "/auth/me" }));
    eq(none.statusCode, 401, "a route that is not public wants an access token");
    eq(none.json().code, CODES.TOKEN_MISSING, "and says that is what is missing");
    eq(world.countOf("inspect"), 0, "identity is not asked whether a token that was never sent is good");
    eq(world.countOf("me"), 0, "and no act runs for it");

    const basic = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: { authorization: "Basic dXNlcjpwdw==" } }));
    eq(basic.statusCode, 401, "a scheme this API does not speak is not a token");
    eq(basic.json().code, CODES.TOKEN_INVALID, "and is refused as an invalid one, not as a missing one");
    ok(basic.json().message.includes("Bearer"), "with the shape it wanted, in words the caller can act on");
    eq(world.countOf("inspect"), 0, "so the credential is never offered to identity at all");

    const bare = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: { authorization: "Bearer" } }));
    eq(bare.json().code, CODES.TOKEN_INVALID, "`Bearer` with nothing after it is the same refusal");
    const spaced = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: { authorization: "Bearer    " } }));
    eq(spaced.json().code, CODES.TOKEN_INVALID, "and so is `Bearer` followed by nothing but spaces");
    eq(world.countOf("inspect"), 0, "and neither of those reached identity either");

    const lower = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: { authorization: "bearer access-1" } }));
    eq(lower.statusCode, 200, "while the scheme is case-insensitive, so a client that spells it lower is not punished for it");

    /* identity's own refusal is the answer: its code, its words, nothing added. */
    const refused = seams({ identityAnswers: { inspect: refuse(CODES.TOKEN_EXPIRED, "this access token has expired", { meta: "private" }) } });
    const expired = await call(refused.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(expired.statusCode, 401, "identity's own code decides the status here, not a second table kept in this layer");
    eq(expired.json().code, CODES.TOKEN_EXPIRED, "and the code travels unchanged");
    eq(expired.json().message, "this access token has expired", "with identity's words, not a paraphrase of them");
    ok(!("meta" in expired.json()), "while the chain's private note stays in the chain");
    eq(refused.countOf("me"), 0, "and no act runs for a caller identity refused");

    /* A revoked session is a row in a table, and that table is read online. */
    let live = true;
    const online = seams({
        identityAnswers: {
            inspect: () => (live ? accept(OWNER) : refuse(CODES.TOKEN_INVALID, "this session has ended"))
        }
    });
    const before = await call(online.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(before.statusCode, 200, "a live session is served");
    live = false;
    const after = await call(online.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(after.statusCode, 401, "and the same token stops being accepted the moment the table says so, without waiting to expire");
    eq(online.countOf("inspect"), 2, "because the token is verified online on every request and never trusted from the last one");
}

/* ------------------------------------------------------------
 * 5. the workspace comes from the token, never from the wire
 * ---------------------------------------------------------- */

async function aPathIsNotAnIdentity() {
    const world = seams();
    const header = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: { ...BEARER, "x-tenant-id": "w-other" } }));
    eq(header.statusCode, 403, "a header that names another workspace is refused");
    eq(header.json().code, CODES.TENANT_MISMATCH, "as a tenant mismatch, the one name for both directions of disagreement");
    eq(world.countOf("inspect"), 1, "and the caller was authenticated first: the token is what there is to disagree with");
    eq(world.countOf("authorize"), 0, "identity's permission door is never asked about a request that is already refused");
    eq(world.countOf("me"), 0, "and no act runs");

    const written = world.chain.find((row) => row.action === "gateway-tenant");
    ok(written && written.outcome === "deny", "the mismatch is written down here, because identity never sees it");
    eq(written.workspaceId, "w-1", "with the workspace the token is for");
    eq(written.actorUserId, "u-owner", "and who tried");
    eq(written.target, "w-other", "and the workspace they named, which is the fact a reviewer wants later");
    eq(written.meta.tenant, "w-1", "and the tenant the wire was supposed to name");
    ok(!("meta" in header.json()) && !("workspaceId" in header.json()),
        "while the wire is handed a public refusal and not the chain's entry");
    eq(header.json().tenant, "w-1", "though the refusal may say which two disagreed: that is the caller's own token and nobody else's");
    eq(world.gateway.stats().limits.workspace.keys, 0,
        "and no tenant bucket is opened for it: a request refused before the tenant step never reaches the tenant's budget");

    const path = await call(world.gateway, request({ method: "GET", url: "/workspaces/w-other/members", headers: BEARER }));
    eq(path.statusCode, 403, "a path that names another workspace is refused the same way");
    eq(path.json().code, CODES.TENANT_MISMATCH, "with the same code, because it is the same disagreement");
    eq(path.json().requested, "w-other", "naming what was asked for");

    /* A header that agrees is harmless, not silently ignored: it reads the same
     * as a URL that reads like a URL. */
    const agreed = await call(world.gateway, request({ method: "GET", url: "/workspaces/w-1/members", headers: { ...BEARER, "x-tenant-id": "w-1" } }));
    eq(agreed.statusCode, 200, "while a path and a header that agree with the token are served");
    deepEq(world.argsOf("members")[0], ["u-owner", "w-1"], "and the act is handed the workspace the token is for, not the one the URL spelled");

    /* A workspace that does not exist is not a different answer: whether it
     * exists is exactly what this door is not allowed to say. */
    const nowhere = await call(world.gateway, request({ method: "GET", url: "/workspaces/w-nothing/members", headers: BEARER }));
    eq(nowhere.statusCode, 403, "a workspace nobody has is refused as a mismatch too");
    eq(nowhere.json().code, CODES.TENANT_MISMATCH, "so this door cannot be used to enumerate the others");
    eq(nowhere.json().message, path.json().message, "with the same words as the workspace that does exist");
}

/* ------------------------------------------------------------
 * 6. a tenant pays from its own bucket, and pays after it is known
 * ---------------------------------------------------------- */

async function aTenantPaysFromItsOwnBucket() {
    /* Two callers, two tokens, two workspaces. The second token is the second
     * tenant; the first is `BEARER`. */
    const two = seams({
        identityAnswers: {
            inspect: (token) => (token === "access-2"
                ? accept({ ...OWNER, user: { id: "u-two", email: "two@example.com" }, claims: { wid: "w-2" } })
                : accept(OWNER))
        },
        config: { workspace: { capacity: 1, refillPerSec: 1 } }
    });
    const second = { authorization: "Bearer access-2" };

    const first = await call(two.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(first.statusCode, 200, "the first request of a tenant is served");
    const spent = await call(two.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(spent.statusCode, 429, "the next request from that tenant is refused");
    eq(spent.json().code, CODES.RATE_LIMITED, "with the code for a caller whose budget is spent");
    eq(two.countOf("inspect"), 2, "after the token said which tenant it was: the tenant's budget is spent once the caller is known");
    eq(two.countOf("me"), 1, "and the act ran once, for the request that paid");

    const budget = two.chain.filter((row) => row.action === "gateway-budget").pop();
    eq(budget.meta.scope, "workspace", "the chain says which of the two budgets was spent");
    eq(budget.workspaceId, "w-1", "and which tenant spent it");
    eq(budget.actorUserId, "u-owner", "and which person, which the wire never learns");

    const other = await call(two.gateway, request({ method: "GET", url: "/auth/me", headers: second }));
    eq(other.statusCode, 200, "while the other tenant, whose own bucket is full, is served");
    eq(two.chain.filter((row) => row.action === "gateway-budget").length, 1, "and nothing was written about it: it paid nothing");
    eq(two.gateway.stats().limits.workspace.keys, 2, "two tenants, two buckets, and neither one of them visible to the other");

    /* The tenant's budget is earned back on the same injected clock. */
    two.clock.advance(1000);
    const again = await call(two.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(again.statusCode, 200, "and a tenant that waited is served again");
}

/* ------------------------------------------------------------
 * 7. permission is identity's one door, asked with the route's own word
 * ---------------------------------------------------------- */

async function identityDecidesWhatIsAllowed() {
    const world = seams({
        identityAnswers: {
            authorize: refuse(CODES.FORBIDDEN, "this role may read the roster of the workspace it is in", { meta: "the chain's note" })
        }
    });
    const refused = await call(world.gateway, request({ method: "GET", url: "/workspaces/w-1/members", headers: BEARER }));
    eq(refused.statusCode, 403, "identity's refusal for a permission this role lacks is a 403");
    eq(refused.json().code, CODES.FORBIDDEN, "with identity's own code");
    eq(refused.json().message, "this role may read the roster of the workspace it is in", "and identity's own words, not a second copy of its rules");
    ok(!("meta" in refused.json()), "while the chain's note does not ride out on the wire");
    eq(world.countOf("members"), 0, "the roster is never read for a caller identity refused");

    deepEq(world.argsOf("authorize")[0], ["u-owner", "w-1", PERMISSIONS.MEMBERS_READ],
        "and the question asked is the route's permission, from the same table identity judges by");

    /* The token carries permissions, and this layer must not read them: the
     * authority is the roster, which only identity can see. */
    const stripped = seams({
        identityAnswers: { inspect: accept({ ...OWNER, permissions: Object.freeze([]) }) }
    });
    const allowed = await call(stripped.gateway, request({ method: "GET", url: "/workspaces/w-1/members", headers: BEARER }));
    eq(allowed.statusCode, 200, "a caller whose token names no permission at all is still served if the roster says so");
    eq(stripped.countOf("authorize"), 1, "because the question was asked of identity rather than answered from the token");

    /* A public route asks nobody anything — including who is calling. */
    const open = seams();
    const login = await call(open.gateway, request({ method: "POST", url: "/auth/login", body: { email: "owner@example.com", password: "Correct-Horse-9" } }));
    eq(login.statusCode, 200, "the one route a password is typed at needs no token");
    eq(open.countOf("inspect"), 0, "so identity is never asked who that caller is: they are nobody until the password says otherwise");
    eq(open.countOf("authorize"), 0, "and no permission is asked about a route that has none");
    eq(open.countOf("login"), 1, "while the act runs with what arrived");
    eq(login.json().access, "access-1", "and the pair it answered with travels unchanged");
    eq(open.gateway.stats().limits.workspace.keys, 0, "and a public route spends no tenant's budget, because no tenant has been named yet");

    /* The route table is where a permission is named, and it names the shared
     * table rather than a string spelled by hand. */
    const table = open.gateway.table();
    eq(table.find((entry) => entry.path === "/workspaces/:workspaceId/members").permission, PERMISSIONS.MEMBERS_READ,
        "the roster route names the read permission");
    eq(table.find((entry) => entry.path === "/audit").permission, PERMISSIONS.AUDIT_READ, "the trail route names its own");
    eq(table.find((entry) => entry.path === "/auth/me").permission, null, "and the route that is only about the caller names none");
}

/* ------------------------------------------------------------
 * 8. the body is read last, and only by routes that declare one
 * ---------------------------------------------------------- */

async function theBodyIsReadLast() {
    const world = seams({ config: { maxBodyBytes: 64 } });
    const post = (body, headers = {}) => request({ method: "POST", url: "/auth/login", headers, body });

    const form = await call(world.gateway, post("email=owner@example.com&password=x", { "content-type": "application/x-www-form-urlencoded" }));
    eq(form.statusCode, 400, "a write whose body is not JSON is refused");
    eq(form.json().code, CODES.BAD_REQUEST, "as a bad request, rather than as a wrong password");
    const broken = await call(world.gateway, post("{oops", { "content-type": "application/json" }));
    eq(broken.json().code, CODES.BAD_REQUEST, "a body that is not JSON at all is the same refusal");
    const list = await call(world.gateway, post("[1,2,3]"));
    eq(list.json().code, CODES.BAD_REQUEST, "and a body that is a JSON array is not an object of fields");
    const scalar = await call(world.gateway, post("42"));
    eq(scalar.json().code, CODES.BAD_REQUEST, "nor is a bare number a body");
    eq(world.countOf("login"), 0, "and none of the four ever reached the act");

    const oversize = post({ email: `${"x".repeat(200)}@example.com`, password: "Correct-Horse-9" });
    const big = await call(world.gateway, oversize);
    eq(big.statusCode, 413, "a body past the ceiling is refused rather than buffered");
    eq(big.json().code, CODES.BODY_TOO_LARGE, "with the code that names the ceiling");
    ok(big.json().message.includes("64"), "and the ceiling itself, so the caller knows what to send instead");
    eq(world.countOf("login"), 0, "and it never reached the act either");

    /* The ordering, in one request: this body is not JSON *and* the tenant
     * disagrees. The answer is the tenant's, which can only be true if the body
     * was never read — a closed door is not handed one. */
    const early = await call(world.gateway, request({
        method: "POST",
        url: "/workspaces/w-other/invite",
        headers: { ...BEARER, "content-type": "application/json" },
        body: "{not json at all"
    }));
    eq(early.statusCode, 403, "a request refused before the body step is answered by the earlier step");
    eq(early.json().code, CODES.TENANT_MISMATCH, "so the answer is the tenant's, not the body's");
    eq(world.countOf("invite"), 0, "and the act behind a closed door is never reached");

    /* An empty body is an empty object of fields, and the act is handed that
     * shape rather than an `undefined` it has to remember to guard. */
    const empty = await call(world.gateway, request({ method: "POST", url: "/workspaces/w-1/invite", headers: BEARER }));
    eq(empty.statusCode, 200, "an empty body is an empty object of fields");
    deepEq(world.argsOf("invite")[0], ["u-owner", "w-1", {}], "and the act is handed it rather than an `undefined`");

    /* A route that declares no body never reads one, however much arrives. */
    const unchosen = request({ method: "GET", url: "/health", body: "x".repeat(5000) });
    const ignored = await call(world.gateway, unchosen);
    eq(ignored.statusCode, 200, "a route that declares no body ignores whatever arrives with one");
    ok(unchosen.resumed === true, "while it is drained, so a keep-alive socket stays usable");
    ok(oversize.resumed === true, "and a refused body is drained too, for the same reason");
}

/* ------------------------------------------------------------
 * 9. the act's answer travels with its code and its words
 * ---------------------------------------------------------- */

async function theAnswerTravels() {
    const world = seams();
    const register = { email: "new@example.com", password: "Correct-Horse-9" };
    const created = await call(world.gateway, request({
        method: "POST",
        url: "/auth/register",
        headers: { "user-agent": "cli/1.0" },
        body: register
    }));
    eq(created.statusCode, 201, "the route that makes an account answers `201`, because the route table says so");
    eq(created.json().registered, true, "and the caller is told the account is new rather than left to guess");
    eq(created.json().member.role, "owner", "with the membership row `register` returned riding along, so it need not be asked for again");
    eq(created.json().access, "access-1", "and the pair from the second step, unchanged");
    deepEq(world.names().filter((name) => name !== "inspect"), ["register", "login"],
        "two steps in that order: one decision, one line each");
    deepEq(world.argsOf("register")[0], [register], "identity's `register` is handed exactly what arrived");
    deepEq(world.argsOf("login")[0], [{ email: register.email, password: register.password, userAgent: "cli/1.0" }],
        "and the sign-in that follows names the email and password it just created, and the caller's own device");

    /* identity's refusal is passed on as identity's, word for word, and the
     * second step is not attempted on a first step that failed. */
    const taken = seams({ identityAnswers: { register: refuse(CODES.EMAIL_TAKEN, "that email already has an account") } });
    const refused = await call(taken.gateway, request({ method: "POST", url: "/auth/register", body: register }));
    eq(refused.statusCode, 409, "an account that already exists is a `409`");
    eq(refused.json().code, CODES.EMAIL_TAKEN, "with identity's code");
    eq(refused.json().message, "that email already has an account", "and identity's sentence, which this layer did not write");
    eq(taken.countOf("login"), 0, "and no sign-in is attempted for an account that was never made");
    eq(taken.chain.length, 0, "and this layer wrote nothing: a decision identity made is identity's line to write");

    const login = await call(taken.gateway, request({
        method: "POST",
        url: "/auth/login",
        headers: { "user-agent": "web/2.0" },
        body: { email: "owner@example.com", password: "Correct-Horse-9", remember: true }
    }));
    eq(login.statusCode, 200, "the password route answers `200`");
    deepEq(taken.argsOf("login")[0], [{ email: "owner@example.com", password: "Correct-Horse-9", remember: true, userAgent: "web/2.0" }],
        "with every field the caller sent, and no field it did not: this layer adds the device and nothing else");

    const me = await call(taken.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    deepEq(taken.argsOf("me")[0], ["access-1"], "and `me` is handed the token itself, so identity re-reads it rather than trusting a cached answer");
    eq(me.json().role, "owner", "whose answer is what the tables say now");

    const out = await call(taken.gateway, request({ method: "POST", url: "/auth/logout", body: { refresh: "refresh-1" } }));
    eq(out.statusCode, 200, "ending a session is not a special case");
    deepEq(taken.argsOf("logout")[0], [{ refresh: "refresh-1" }], "it is handed the refresh token and nothing about who is calling");
}

/* ------------------------------------------------------------
 * 9b. what a refusal withholds, and what a query is allowed to add
 * ---------------------------------------------------------- */

async function whatARefusalWithholds() {
    /* A refusal that carries, on purpose, one of every key the wire must never
     * see — plus two it may. The list is checked key by key, because a leak is
     * one key wide. */
    const leaky = seams({
        identityAnswers: {
            trail: refuse(CODES.FORBIDDEN, "not your trail", {
                actorUserId: "u-owner",
                workspaceId: "w-1",
                meta: { note: "internal" },
                value: "plain-text",
                ciphertext: "sealed",
                passwordHash: "hash",
                tokenHash: "hash",
                access: "access-2",
                refresh: "refresh-2",
                allow: Object.freeze(["GET"]),
                entries: Object.freeze([{ action: "someone-else" }])
            })
        }
    });
    const hidden = await call(leaky.gateway, request({ method: "GET", url: "/audit", headers: BEARER }));
    eq(hidden.statusCode, 403, "a refusal identity produced is answered by identity's status");
    const body = hidden.json();
    eq(body.code, CODES.FORBIDDEN, "and its code is on the wire");
    eq(body.message, "not your trail", "and its words are");
    for (const key of ["actorUserId", "workspaceId", "meta", "value", "ciphertext", "passwordHash", "tokenHash", "access", "refresh"]) {
        ok(!(key in body), `while \`${key}\` is not, however gleefully the refusal carried it`);
    }
    ok("entries" in body && "allow" in body, "and a key that is not on the list does ride out, so this is a list and not a habit");
    deepEq(body.entries, [{ action: "someone-else" }], "in the shape it was given");

    /* The same filter, one layer down: a secret the vault refuses to hand over
     * must not arrive by way of the refusal carrying it. */
    const vault = seams({ vaultAnswers: { get: refuse(CODES.SECRET_REVOKED, "this key was closed", { value: "plain-text", ciphertext: "sealed" }) } });
    const revealed = await call(vault.gateway, request({ method: "POST", url: "/secrets/binance/reveal", headers: BEARER, body: { label: "main" } }));
    eq(revealed.statusCode, 409, "a revoked key is a `409` from the vault");
    ok(!("value" in revealed.json()) && !("ciphertext" in revealed.json()), "and neither the clear text nor the sealed bytes are on the wire with it");

    /* Everything above is a refusal. A success is passed on whole — otherwise
     * `access` and `refresh` would never reach the one route that mints them. */
    const handing = seams({ vaultAnswers: {} });
    const print = await call(handing.gateway, request({ method: "POST", url: "/secrets/binance/reveal", headers: BEARER, body: { label: "main" } }));
    eq(print.statusCode, 200, "the one route that returns a value answers it");
    eq(print.json().value, "plain-text", "with the value, which is the point of that route and the reason it is written to the chain");
    deepEq(handing.argsOf("vault.get")[0], ["u-owner", "w-1", "binance", { label: "main" }],
        "and the vault is asked by the caller and the token's workspace, never by the path alone");
}

/* ------------------------------------------------------------
 * 9c. a query string is a request, not an argument
 * ---------------------------------------------------------- */

async function aQueryStringIsARequest() {
    const world = seams({ vaultAnswers: {} });

    const page = await call(world.gateway, request({ method: "GET", url: "/audit?limit=5&since=9", headers: BEARER }));
    eq(page.statusCode, 200, "the trail route answers");
    deepEq(world.argsOf("trail")[0], ["u-owner", { workspaceId: "w-1", limit: 5, sinceSeq: 9 }],
        "and `limit` and `since` are handed on as whole numbers, not as strings");

    const junk = await call(world.gateway, request({ method: "GET", url: "/audit?limit=abc&since=-3&workspaceId=w-other", headers: BEARER }));
    eq(junk.statusCode, 200, "a query that makes no sense is answered rather than refused");
    deepEq(world.argsOf("trail")[1], ["u-owner", { workspaceId: "w-1" }],
        "with the unusable parts left off, so a `NaN` never reaches a prepared statement — and a workspace in the query is not a workspace");

    const filtered = await call(world.gateway, request({ method: "GET", url: "/secrets?provider=binance", headers: BEARER }));
    eq(filtered.statusCode, 200, "the inventory route answers");
    deepEq(world.argsOf("vault.list")[0], ["u-owner", "w-1", { provider: "binance" }], "and names the venue it was asked about");
    await call(world.gateway, request({ method: "GET", url: "/secrets?provider=&limit=1", headers: BEARER }));
    deepEq(world.argsOf("vault.list")[1], ["u-owner", "w-1", {}], "while an empty provider is no provider, and a limit it never asked for is ignored");

    const stored = await call(world.gateway, request({
        method: "PUT",
        url: "/secrets/binance",
        headers: BEARER,
        body: { label: "main", value: "s3cret" }
    }));
    eq(stored.statusCode, 200, "a key is stored");
    deepEq(world.argsOf("vault.put")[0], ["u-owner", "w-1", { provider: "binance", label: "main", value: "s3cret" }],
        "with the venue from the path and the rest from the body, and the caller from the token");

    const closed = await call(world.gateway, request({
        method: "POST",
        url: "/secrets/binance/revoke",
        headers: BEARER,
        body: { label: "main", reason: "rotated" }
    }));
    eq(closed.statusCode, 200, "a key is closed");
    deepEq(world.argsOf("vault.revoke")[0], ["u-owner", "w-1", "binance", { label: "main", reason: "rotated" }], "with the reason it was given");
    await call(world.gateway, request({ method: "POST", url: "/secrets/binance/revoke", headers: BEARER, body: { label: "main", reason: 7 } }));
    deepEq(world.argsOf("vault.revoke")[1], ["u-owner", "w-1", "binance", { label: "main", reason: null }],
        "and a reason that is not a string is no reason, rather than a field the vault has to defend against");

    /* The three things the vault would *throw* on are answered as `400`s here,
     * because a caller's typo is not an operator's outage. */
    const typo = await call(world.gateway, request({ method: "PUT", url: "/secrets/binance", headers: BEARER, body: { label: "MAIN", value: "s3cret" } }));
    eq(typo.statusCode, 400, "a label that is not lower-case is refused");
    eq(typo.json().code, CODES.BAD_ENTRY, "as a caller's mistake");
    ok(typo.json().message.includes("32"), "and the rule it broke is quoted, so the fix is obvious");
    const empty = await call(world.gateway, request({ method: "PUT", url: "/secrets/binance", headers: BEARER, body: { label: "main", value: "" } }));
    eq(empty.statusCode, 400, "an empty value is refused too");
    eq(world.argsOf("vault.put").length, 1, "and neither of them reached the vault, which would have thrown rather than refused");

    /* Two ceilings, and they are not the same one: the body may fit while the
     * secret does not. */
    const wide = seams({ vaultAnswers: {}, config: { maxBodyBytes: 64 * 1024 } });
    const huge = await call(wide.gateway, request({ method: "PUT", url: "/secrets/binance", headers: BEARER, body: { label: "main", value: "x".repeat(20_000) } }));
    eq(huge.statusCode, 400, "a secret past the vault's own ceiling is a `400`");
    ok(huge.json().message.includes("16384"), "naming the vault's ceiling, not the door's");
    eq(wide.argsOf("vault.put").length, 0, "and it is refused before the vault is asked to store what it would not accept");

    /* The engine's seam takes a workspace and no person, so it is not a route —
     * and this layer, handed a vault, must still never reach for it. */
    ok(!world.asked("vault.material"), "the engine's own door is never opened by a request, however the URL is written");
}

/* ------------------------------------------------------------
 * 10. counters, events and the chain carry metadata only
 * ---------------------------------------------------------- */

async function everythingSaidOutLoudIsMetadataOnly() {
    const world = seams();
    const requests = [];
    const allowed = [];
    const refused = [];
    const internal = [];
    world.gateway.on(EVENTS.REQUEST, (payload) => requests.push(payload));
    world.gateway.on(EVENTS.ALLOWED, (payload) => allowed.push(payload));
    world.gateway.on(EVENTS.REFUSED, (payload) => refused.push(payload));
    world.gateway.on(EVENTS.INTERNAL, (payload) => internal.push(payload));

    await call(world.gateway, request({ method: "GET", url: "/health" }));
    await call(world.gateway, request({ method: "GET", url: "/auth/me" }));
    await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: { ...BEARER, "x-tenant-id": "w-other" } }));

    eq(requests.length, 3, "every request is announced once");
    eq(internal.length, 0, "and nothing the door itself failed at is announced, because it failed at nothing");
    deepEq(Object.keys(requests[0]).sort(),
        ["action", "actorUserId", "address", "at", "code", "method", "ms", "path", "recorded", "status", "workspaceId"],
        "and the shape of what is announced is the shape of a fact about the request, with no room in it for a body, a password or a token");
    ok(Object.isFrozen(requests[0]), "frozen, so a listener cannot edit a thing already decided");

    eq(requests[0].action, "health", "the first announcement names the route's action");
    eq(requests[0].path, "/health", "and the path without its query");
    eq(requests[0].status, 200, "and the status that was written");
    eq(requests[0].code, null, "and no code, because nothing was refused");
    eq(requests[0].workspaceId, null, "a liveness probe belongs to no tenant");
    eq(requests[0].actorUserId, null, "and to nobody: it was answered before identity was asked anything");
    eq(requests[0].address, "203.0.113.7", "while the address is there for an operator to count");
    eq(requests[0].ms, 0, "and how long it took is measured on the injected clock, like everything else");
    eq(requests[0].recorded, false, "and nothing was written into the chain about it");
    eq(requests[0].at, world.clock.t, "with the moment taken from the clock the door was handed");

    ok(allowed[0] === requests[0] && refused[0] === requests[1],
        "and the decision event carries the same frozen payload rather than a second, richer copy of it");
    eq(refused[0].code, CODES.TOKEN_MISSING, "a refusal is announced with the code it was refused by");
    eq(refused[0].status, 401, "and the status that code maps to");
    eq(refused[0].recorded, false, "and `false`, because identity's own refusal is identity's line to write");
    eq(refused[1].code, CODES.TENANT_MISMATCH, "while a decision this layer made on its own comes next");
    eq(refused[1].recorded, true, "announced as recorded, which it is: `record` was called for it");
    eq(refused[1].workspaceId, null, "while the tenant the token claimed is not a workspace this request ever ran as, so the event names none");
    eq(refused[1].actorUserId, "u-owner", "and the person is named, for the operator and not for the wire");

    const state = world.gateway.stats();
    eq(state.requests, 3, "three requests were counted");
    eq(state.allowed, 1, "one of them allowed");
    eq(state.refused, 2, "two refused");
    eq(state.internal, 0, "and none of them the door's own fault");
    eq(state.byStatus["2xx"], 1, "the statuses are counted by class, which is what a dashboard wants");
    eq(state.byStatus["4xx"], 2, "and a refusal is a `4xx`");
    eq(state.byCode[CODES.TOKEN_MISSING], 1, "and by code, which is what an operator greps");
    eq(state.byCode[CODES.TENANT_MISMATCH], 1, "for each of them");
    eq(state.byRoute.health, 1, "and by route, named by its action rather than by its path");
    eq(state.byRoute.me, 2, "so the two attempts against one route are one number");
    eq(state.audited, 1, "and the chain says exactly one of the three was written down");
    eq(world.chain.length, 1, "which is the one entry in it");
    eq(world.chain[0].action, "gateway-tenant", "the one this layer had to write itself");
    eq(world.chain[0].workspaceId, "w-1", "naming the tenant the token was for, which is the attribution the wire never carries");
    eq(world.chain[0].actorUserId, "u-owner", "and the caller it was written about");
    eq(world.chain[0].target, "w-other", "and what the wire asked for instead, which is the disagreement itself");
    eq(world.chain[0].code, CODES.TENANT_MISMATCH, "with the one code a reviewer greps the chain for");
}

/* ------------------------------------------------------------
 * 10b. a bug is answered as a bug, and a listener cannot silence one
 * ---------------------------------------------------------- */

async function aThrowCannotTurnAnAnswerIntoNoAnswer() {
    const world = seams({
        identityAnswers: {
            me: () => { throw new Error("the driver closed the socket"); }
        }
    });
    const heard = [];
    world.gateway.on(EVENTS.REQUEST, () => { throw new Error("a listener's own bug"); });
    world.gateway.on(EVENTS.INTERNAL, (payload) => heard.push(payload));
    world.gateway.on(EVENTS.REQUEST, (payload) => heard.push(payload));

    const broken = await call(world.gateway, request({ method: "GET", url: "/auth/me", headers: BEARER }));
    eq(broken.statusCode, 500, "an act that throws is answered, not swallowed: the caller gets a `500` rather than a socket left hanging");
    eq(broken.json().code, CODES.INTERNAL_ERROR, "with the code for the door's own failure");
    ok(!broken.json().message.includes("driver"), "and the message stays in the log and off the wire");
    eq(world.gateway.stats().internal, 1, "counted, because a door failing is something an operator alerts on");
    eq(world.chain[0].action, "gateway-error", "and written into the chain: a failure is a fact, not an absence");
    eq(world.chain[0].meta.action, "me", "naming the act that threw");
    eq(world.chain[0].code, CODES.INTERNAL_ERROR, "with the code");
    ok(world.chain[0].meta.message.includes("driver"), "and what it said, which a log is the place for");

    /* The subscriber that threw was announced to all the same: a listener's bug
     * does not get to silence the others or the answer. */
    eq(heard.length, 2, "both the failure and the decision were still announced");
    eq(heard[0].where, "pipeline", "the failure first, saying where it happened");
    eq(heard[1].status, 500, "and then the decision the caller was given");
    eq(heard[1].recorded, true, "told as recorded, because it was");

    const counted = [];
    const stop = world.gateway.on(EVENTS.ALLOWED, (payload) => counted.push(payload));
    await call(world.gateway, request({ method: "GET", url: "/health" }));
    eq(counted.length, 1, "a subscriber hears the decisions that happen while it is subscribed");
    stop();
    await call(world.gateway, request({ method: "GET", url: "/health" }));
    eq(counted.length, 1, "and stops hearing them the moment it unsubscribes, which is what the returned function is for");

    /* An act that answers with neither a result nor a refusal is a route named
     * with nothing behind it: a bug of this layer, answered as one. */
    const silent = seams({ identityAnswers: { workspacesFor: () => null } });
    const puzzled = await call(silent.gateway, request({ method: "GET", url: "/workspaces", headers: BEARER }));
    eq(puzzled.statusCode, 500, "an act that answers with nothing is a `500`");
    eq(silent.chain[0].action, "gateway-error", "recorded as this layer's own bug rather than passed on as a decision");
    ok(silent.chain[0].meta.message.includes("neither"), "naming what the act failed to answer with");

    /* A path no route claims, and the count that makes it visible. */
    const nowhere = await call(world.gateway, request({ method: "GET", url: "/nope" }));
    eq(nowhere.statusCode, 404, "a path with no route behind it is a `404`");
    eq(nowhere.json().code, CODES.NO_ROUTE, "with the code that says so");
    eq(world.gateway.stats().byRoute.unmatched, 1, "counted against `unmatched`, which is a number worth having before it is a pattern");
}

/* ------------------------------------------------------------
 * The sections, in the order the pipeline runs them
 * ---------------------------------------------------------- */

const SECTIONS = Object.freeze([
    ["1. a door that is not wired completely does not start", aDoorThatIsNotWiredCompletelyDoesNotStart],
    ["2. what this API exposes is data, and `/health` is the door's own", whatThisApiExposesIsData],
    ["3. the address budget is spent before identity is asked anything", aFloodNeverBecomesADatabaseRead],
    ["4. a token that is missing, mis-spelled, or refused by identity", noTokenMeansIdentityIsNeverAsked],
    ["5. the workspace comes from the token, never from the wire", aPathIsNotAnIdentity],
    ["6. a tenant pays from its own bucket, and pays after it is known", aTenantPaysFromItsOwnBucket],
    ["7. permission is identity's one door, asked with the route's own word", identityDecidesWhatIsAllowed],
    ["8. the body is read last, and only by routes that declare one", theBodyIsReadLast],
    ["9. the act's answer travels with its code and its words", theAnswerTravels],
    ["9b. what a refusal withholds, and what a query is allowed to add", whatARefusalWithholds],
    ["9c. a query string is a request, not an argument", aQueryStringIsARequest],
    ["10. counters, events and the chain carry metadata only", everythingSaidOutLoudIsMetadataOnly],
    ["10b. a bug is answered as a bug, and a listener cannot silence one", aThrowCannotTurnAnAnswerIntoNoAnswer]
]);

/* A section that throws stops the run and says which one it was: a failing
 * check is a fact about the layer, so the counter only moves on a pass. The
 * sections are async — a request is driven to its answer on real macrotasks —
 * so the loop awaits one at a time, in order. */
async function run() {
    const started = Date.now();

    for (const [name, section] of SECTIONS) {
        const before = checks;
        try {
            await section();
        } catch (error) {
            const reason = error && error.message ? error.message : String(error);
            console.error(`\nFAIL  ${name}\n      ${reason}`);
            if (error && error.stack) console.error(String(error.stack).split("\n").slice(1, 4).join("\n"));
            console.error(`\n${checks} checks passed before this section`);
            process.exit(1);
        }
        console.log(`  ok  ${name}  (${checks - before})`);
    }

    console.log(`\n${checks} checks passed across ${SECTIONS.length} sections in ${Date.now() - started}ms`);
    process.exit(0);
}

run();

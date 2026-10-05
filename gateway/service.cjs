/* ============================================================
 * File: gateway/service.cjs
 * Section: gateway (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   The door of this repository. It owns no data, decides nothing about who
 *   anyone is, and holds no key: identity says who is calling, the vault says
 *   what is in the box, and this layer decides only **the order those are
 *   asked in, and what a caller is allowed to learn from the answers**.
 *
 *   The order is the design, and it is this:
 *
 *     1. route          — pure, no I/O: does this path exist, and does this
 *                         method work on it;
 *     2. address budget — the cheapest question (arithmetic) before the most
 *                         expensive one (a database read). A flood never
 *                         reaches identity;
 *     3. authenticate   — `Bearer` token, verified online: the session, the
 *                         membership and the role as the tables have them now;
 *     4. tenant         — the workspace comes from the token; the header and
 *                         the path may disagree, and are refused;
 *     5. workspace budget — the tenant pays, and only its own;
 *     6. permission     — the route's permission, asked of identity's one door;
 *     7. body           — read last, so a closed door is never handed a body;
 *     8. the act        — identity or the vault, whose answer is passed on
 *                         with its code, its words, and nothing it withheld.
 *
 *   Nothing here re-implements a decision it can borrow: one error vocabulary
 *   (`identity/core/errors.cjs`), one permission table
 *   (`identity/core/rbac.cjs`), one token verifier, one audit chain. What this
 *   layer adds is one thing only — the translation to HTTP — and that lives in
 *   `gateway/core/http.cjs`, where it can be read in one sitting.
 *
 *   Two refusals are recorded where identity cannot: a spent budget and a
 *   tenant that disagreed. Both go into the same chain everything else is
 *   written into, with the attribution the wire never carries.
 * ============================================================ */

const nodeHttp = require("node:http");

const { CODES, accept, refuse, fail, isRefusal } = require("../identity/core/errors.cjs");
/* The vault's own label rule, borrowed rather than re-spelled: this layer asks a
 * caller for a label, and there must be exactly one answer in the repository to
 * "what is a label", or the same typo is refused twice with two different words. */
const { isLabel } = require("../secrets/core/providers.cjs");
const { compileConfig } = require("./core/config.cjs");
const { publicRefusal, statusFor, pathOf, readJson, drain, send } = require("./core/http.cjs");
const { routesFor, matchRoute, routeTable } = require("./routes.cjs");
const { createAuth } = require("./middleware/auth.cjs");
const { createTenant } = require("./middleware/tenant.cjs");
const { createDoorLimits } = require("./middleware/ratelimit.cjs");

const EVENTS = Object.freeze({
    REQUEST: "request",
    ALLOWED: "allowed",
    REFUSED: "refused",
    INTERNAL: "internal"
});

/* Everything this layer borrows from identity, named once so a missing seam is
 * a wiring bug at construction rather than a 500 under load. */
const IDENTITY_VERBS = Object.freeze([
    "inspect", "authorize", "register", "login", "refresh", "logout", "me",
    "workspacesFor", "members", "invite", "trail"
]);

/* The engine's door takes a workspace and no person, so it is not routed. The
 * vault is asked for these four verbs and no more, which is how the shape of
 * the API is expressed in the code as well as in the route table. */
const VAULT_VERBS = Object.freeze(["list", "put", "get", "revoke"]);

const statusClass = (status) => (status >= 500 ? "5xx" : status >= 400 ? "4xx" : status >= 300 ? "3xx" : "2xx");

function createGateway(options = {}) {
    const { identity, vault = null, audit = null, config: overrides = {} } = options;
    const now = options.now;

    if (typeof now !== "function") {
        fail(CODES.NO_CLOCK, "the door is handed a clock — it never reads one");
    }
    if (!identity || typeof identity !== "object"
        || IDENTITY_VERBS.some((verb) => typeof identity[verb] !== "function")) {
        fail(CODES.NO_DB, "the door is handed identity — the only layer that knows who is calling");
    }
    if (vault !== null && (typeof vault !== "object"
        || VAULT_VERBS.some((verb) => typeof vault[verb] !== "function"))) {
        fail(CODES.NO_VAULT_KEY, "a vault handed to the door lists, puts, gets and revokes");
    }
    if (!audit || typeof audit.append !== "function") {
        fail(CODES.BAD_ENTRY, "the door is handed the audit chain it records on");
    }

    const config = compileConfig(overrides);
    const routes = routesFor({ vault });
    const auth = createAuth({ identity, header: config.authorizationHeader });
    const tenant = createTenant({ header: config.tenantHeader });
    const limits = createDoorLimits({
        now,
        ip: config.ip,
        workspace: config.workspace,
        maxBuckets: config.maxBuckets,
        trustProxy: config.trustProxy
    });

    const startedAt = now();
    const listeners = new Map();
    const counters = {
        requests: 0,
        allowed: 0,
        refused: 0,
        internal: 0,
        byStatus: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
        byCode: {},
        byRoute: {},
        audited: 0
    };

    /* ------------------------------------------------------------
     * The two ways this layer says something happened
     * ---------------------------------------------------------- */

    /** Subscribe to a decision. Returns the unsubscribe. */
    function on(event, handler) {
        if (typeof handler !== "function") {
            fail(CODES.BAD_ENTRY, "a listener is a function");
        }
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event).delete(handler);
    }

    /**
     * Handed over after the answer has been written, frozen, and carrying
     * metadata: which route, which workspace, which code, how long. Never a
     * token, never a body, never a value — a listener is not a place a secret
     * should be able to arrive by accident.
     */
    function emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return 0;
        const frozen = Object.freeze(payload);
        for (const handler of [...set]) {
            try {
                handler(frozen);
            } catch {
                /* A listener that throws is a listener's bug, and it does not
                 * get to turn an answered request into an unanswered one. */
            }
        }
        return set.size;
    }

    /**
     * A decision this layer made on its own — a spent budget, a tenant that
     * disagreed, a body that was not JSON — written into identity's chain,
     * which is the one chain anything verifies. Attribution goes here; the
     * wire gets `publicRefusal` and nothing else.
     */
    function record(action, outcome, fields) {
        const entry = audit.append({
            at: now(),
            action,
            outcome,
            workspaceId: fields.workspaceId ?? null,
            actorUserId: fields.actorUserId ?? null,
            code: fields.code ?? null,
            target: fields.target ?? null,
            meta: fields.meta ?? null
        });
        counters.audited += 1;
        return entry;
    }

    /* ------------------------------------------------------------
     * What a caller sends, checked where it would otherwise throw
     * ---------------------------------------------------------- */

    /**
     * The vault's own label rule, asked *before* the vault would throw on it. A
     * label is a caller's typo, and a typo is a `400` — not an exception that
     * this layer then has to answer as a `500` blaming an operator.
     */
    function labelProblem(label) {
        if (label === undefined || label === null) return null;
        if (!isLabel(label)) return refuse(CODES.BAD_ENTRY, "a label is lower-case, 32 characters or fewer");
        return null;
    }

    /**
     * The two things the vault throws on when it is handed an entry — a value
     * that is not a non-empty string, and one past its ceiling — answered as
     * refusals instead. Everything the vault *refuses* rather than throws on (an
     * unknown venue, a permission, a revoked row) is left to the vault, so this
     * is not a second copy of its rules: it is the small set that must not
     * arrive as a `500`.
     */
    function entryProblem(body) {
        if (typeof body.value !== "string" || body.value.length === 0) {
            return refuse(CODES.BAD_ENTRY, "a secret arrives as a non-empty string in `value`");
        }
        const ceiling = vault.core.MAX_SECRET_BYTES;
        if (Buffer.byteLength(body.value, "utf8") > ceiling) {
            return refuse(CODES.BAD_ENTRY, `a secret is at most ${ceiling} bytes`);
        }
        return labelProblem(body.label);
    }

    /** `?provider=` for the inventory, kept only when it names a venue. */
    function providerOf(query) {
        return typeof query.provider === "string" && query.provider.length > 0
            ? { provider: query.provider }
            : {};
    }

    /** `?limit=` and `?since=` for the trail, kept only when they are usable. */
    function pageOf(query) {
        const page = {};
        const limit = Number(query.limit);
        if (Number.isInteger(limit) && limit > 0) page.limit = limit;
        const since = Number(query.since);
        if (Number.isInteger(since) && since >= 0) page.sinceSeq = since;
        return page;
    }

    /* ------------------------------------------------------------
     * The acts — what a matched route actually does
     * ---------------------------------------------------------- */

    /**
     * One entry per action the route table names, and no entry for anything it
     * does not: the API is the intersection of these two, which is why a test can
     * compare them. Each act is handed the caller as the tables have them and the
     * workspace the token is for — never a workspace a path or a header named.
     */
    const ACTS = Object.freeze({
        /* Liveness says one thing and touches nothing: no database read, no
         * version string, no clock anybody else owns. */
        health: () => accept({
            status: "alive",
            service: "gateway",
            uptimeMs: now() - startedAt,
            routes: routes.length,
            vault: Boolean(vault)
        }),

        /**
         * The one route that makes an account, and it takes two steps because a
         * caller that just registered is a caller that wants in. identity's
         * `register` creates the person, their workspace and the owner row, and
         * deliberately mints no pair; this asks `login` for that, so each decision
         * keeps its own line in the chain — and the membership row `register`
         * returned rides along, because a caller should not have to ask for
         * something it was just handed.
         */
        register: ({ body, userAgent }) => {
            const created = identity.register(body);
            if (!created.ok) return created;
            const entered = identity.login({ email: body.email, password: body.password, userAgent });
            if (!entered.ok) return entered;
            return accept({ ...entered, member: created.member, registered: true });
        },

        login: ({ body, userAgent }) => identity.login({ ...body, userAgent }),
        refresh: ({ body, userAgent }) => identity.refresh({ ...body, userAgent }),
        logout: ({ body }) => identity.logout(body),

        /* The token is re-read online, so this answer is what the tables say
         * now — including a role that changed since the token was signed. */
        me: ({ token }) => identity.me(token),

        workspaces: ({ actor }) => identity.workspacesFor(actor.userId),
        members: ({ actor, workspaceId }) => identity.members(actor.userId, workspaceId),
        invite: ({ actor, workspaceId, body }) => identity.invite(actor.userId, workspaceId, body),

        /* The trail of the workspace this token is for, newest first. `limit` and
         * `since` are passed on only when they are whole numbers: a query string
         * is not allowed to become a `NaN` in a prepared statement. */
        audit: ({ actor, workspaceId, query }) => identity.trail(actor.userId, {
            workspaceId,
            ...pageOf(query)
        }),

        secretsList: ({ actor, workspaceId, query }) => vault.list(actor.userId, workspaceId, providerOf(query)),

        secretPut: ({ actor, workspaceId, params, body }) => {
            const problem = entryProblem(body);
            if (problem) return problem;
            return vault.put(actor.userId, workspaceId, {
                provider: params.provider,
                label: body.label,
                value: body.value
            });
        },

        secretReveal: ({ actor, workspaceId, params, body }) => {
            const problem = labelProblem(body.label);
            if (problem) return problem;
            return vault.get(actor.userId, workspaceId, params.provider, { label: body.label });
        },

        secretRevoke: ({ actor, workspaceId, params, body }) => {
            const problem = labelProblem(body.label);
            if (problem) return problem;
            return vault.revoke(actor.userId, workspaceId, params.provider, {
                label: body.label,
                reason: typeof body.reason === "string" ? body.reason : null
            });
        }
    });

    /* ------------------------------------------------------------
     * The order a request is answered in — the design, in one function
     * ---------------------------------------------------------- */

    /* The body of a route that declares none, so every act is handed the same
     * shape rather than an `undefined` it has to remember to guard against. */
    const EMPTY_BODY = Object.freeze({});

    /** The caller's own device, as far as identity is told about it. */
    function userAgentOf(req) {
        const raw = req.headers["user-agent"];
        return typeof raw === "string" && raw.length > 0 ? raw : null;
    }

    /** What goes on the wire for a decision: the status, and the two headers. */
    function answerOf(result, route) {
        const status = result.ok ? (route ? route.status : 200) : statusFor(result.code);
        const headers = {};

        if (status === 429) {
            /* The one number a caller that must wait is allowed to see, in the
             * unit HTTP promises it in. `retryAfterMs` is computed by the bucket
             * itself, so this is a conversion and not a second guess. */
            const ms = Number.isFinite(result.retryAfterMs) ? result.retryAfterMs : 0;
            headers["retry-after"] = String(Math.max(1, Math.ceil(ms / 1000)));
        }
        if (status === 405 && Array.isArray(result.allow)) {
            /* A caller that guessed the verb gets the list, in the header and in
             * the body both: the body is what a person reads, the header is what
             * a client acts on. */
            headers.allow = result.allow.join(", ");
        }

        return { status, headers };
    }

    /**
     * The steps, in the order the header of this file promises, and nothing else
     * in between. It returns what was decided *and* who it was decided about, so
     * the caller can say so out loud once the answer is on the wire.
     */
    async function run({ req, located, matched, route }) {
        const stop = (result, extra = {}) => ({
            result,
            actor: extra.actor ?? null,
            workspaceId: extra.workspaceId ?? null,
            recorded: Boolean(extra.recorded)
        });

        /* The address budget first: it is arithmetic on an injected clock, and
         * identity is not asked anything until it is paid, so a flood never
         * becomes a database read. A route that opts out — the liveness probe —
         * pays nothing, because a door that rate-limits its own heartbeat reports
         * an outage during one. */
        if (!route || route.limits !== false) {
            const budget = limits.takeAddress(req);
            if (!budget.ok) {
                record("gateway-budget", "deny", {
                    code: budget.code,
                    target: limits.addressOf(req),
                    meta: {
                        scope: budget.scope,
                        retryAfterMs: budget.retryAfterMs,
                        action: route ? route.action : "unmatched"
                    }
                });
                return stop(budget, { recorded: true });
            }
        }

        /* A path nothing answers, or a verb that path does not take. */
        if (!matched.ok) return stop(matched);

        let actor = null;
        let workspaceId = null;
        let token = null;

        if (!route.public) {
            /* Who is calling: a `Bearer` token, verified online, so a revoked
             * session or a removed member stops being accepted before the token
             * would have expired on its own. */
            const who = auth.authenticate(req);
            if (!who.ok) return stop(who);
            actor = who.context;
            token = who.token;

            /* Which workspace: the token's. A header or a path that disagrees is
             * refused before any table is read, and the mismatch is written down
             * here because identity never sees it — and it is exactly the fact a
             * reviewer wants to find later. */
            const bound = tenant.bind(req, actor, matched.params);
            if (!bound.ok) {
                record("gateway-tenant", "deny", {
                    workspaceId: actor.workspaceId,
                    actorUserId: actor.userId,
                    code: bound.code,
                    target: bound.requested ?? null,
                    meta: { action: route.action, tenant: actor.workspaceId }
                });
                return stop(bound, { actor, recorded: true });
            }
            workspaceId = bound.workspaceId;

            /* The tenant pays from its own bucket, once the token said which
             * tenant it is — so one noisy workspace cannot spend another's, and
             * an anonymous caller cannot spend any tenant's. */
            if (route.limits !== false) {
                const paid = limits.takeWorkspace(workspaceId);
                if (!paid.ok) {
                    record("gateway-budget", "deny", {
                        workspaceId,
                        actorUserId: actor.userId,
                        code: paid.code,
                        meta: {
                            scope: paid.scope,
                            retryAfterMs: paid.retryAfterMs,
                            action: route.action
                        }
                    });
                    return stop(paid, { actor, workspaceId, recorded: true });
                }
            }

            /* The route names the permission, and identity's single door judges
             * it: this layer never reads a role, and never trusts the one inside
             * the token over the one in the roster. */
            if (route.permission) {
                const opened = identity.authorize(actor.userId, workspaceId, route.permission);
                if (!opened.ok) return stop(opened, { actor, workspaceId });
            }
        }

        /* The body is read last, so a door that was already closed is never handed
         * one — and a body past the ceiling is answered as too large rather than
         * buffered until the process runs out of room. */
        let body = EMPTY_BODY;
        if (route.body) {
            const read = await readJson(req, { maxBytes: config.maxBodyBytes });
            if (!read.ok) return stop(read, { actor, workspaceId });
            body = read.body;
        }

        /* The act itself: identity's answer or the vault's, passed on with its
         * code and its words. */
        const result = ACTS[route.action]({
            req,
            route,
            params: matched.params,
            query: located.query,
            body,
            actor,
            workspaceId,
            token,
            userAgent: userAgentOf(req)
        });

        /* An act that answers with something that is neither a result nor a
         * refusal is a bug of this layer — a route named with no act behind it —
         * and a bug must not be answered as though it were a decision. */
        if (!result || (result.ok !== true && !isRefusal(result))) {
            fail(CODES.INTERNAL_ERROR, `${route.action} answered with neither a result nor a refusal`);
        }

        return stop(result, { actor, workspaceId });
    }

    /**
     * The answer is on the wire before anything is said about it: counters,
     * events and the trail carry metadata only — a code, an action, an address, a
     * duration — because a listener and an audit table are not places a body, a
     * password or a token is allowed to arrive by accident.
     */
    function settle({ req, route, located, result, status, began, actor, workspaceId, recorded }) {
        const code = result.ok ? null : result.code;
        const action = route ? route.action : "unmatched";
        const at = now();

        counters.byStatus[statusClass(status)] += 1;
        counters.byRoute[action] = (counters.byRoute[action] || 0) + 1;
        if (code) {
            counters.refused += 1;
            counters.byCode[code] = (counters.byCode[code] || 0) + 1;
        } else {
            counters.allowed += 1;
        }

        const payload = Object.freeze({
            at,
            method: req.method,
            path: located.ok ? located.path : "/",
            action,
            status,
            code: code || null,
            workspaceId: workspaceId ?? null,
            actorUserId: actor ? actor.userId : null,
            address: limits.addressOf(req),
            ms: at - began,
            recorded
        });

        emit(EVENTS.REQUEST, payload);
        emit(code ? EVENTS.REFUSED : EVENTS.ALLOWED, payload);
    }

    /**
     * One request, from its first byte to its last. The order is the whole
     * argument of this file, so it is written as one straight line of steps
     * rather than a tree of nested callbacks: a reader who can see the order can
     * check the order.
     */
    async function answer(req, res) {
        counters.requests += 1;
        const began = now();
        const located = pathOf(req.url);
        const matched = located.ok ? matchRoute(routes, req.method, located.path) : located;
        const route = matched.ok ? matched.route : null;

        let outcome;
        try {
            outcome = await run({ req, located, matched, route });
        } catch (error) {
            /* A throw out of an act is a wiring bug or a driver failure, never a
             * caller's mistake: it is answered as `internal-error`, counted,
             * announced and written down — with the message kept for the log and
             * off the wire. */
            const message = String((error && error.message) || error);
            counters.internal += 1;
            emit(EVENTS.INTERNAL, Object.freeze({ at: now(), where: "pipeline", message }));
            record("gateway-error", "deny", {
                code: CODES.INTERNAL_ERROR,
                meta: { action: route ? route.action : "unmatched", message }
            });
            outcome = {
                result: refuse(CODES.INTERNAL_ERROR, "the door could not answer this request"),
                actor: null,
                workspaceId: null,
                recorded: true
            };
        }

        const { status, headers } = answerOf(outcome.result, route);
        drain(req);
        send(res, {
            status,
            headers,
            body: outcome.result.ok ? outcome.result : publicRefusal(outcome.result)
        });
        settle({
            req,
            route,
            located,
            result: outcome.result,
            status,
            began,
            actor: outcome.actor,
            workspaceId: outcome.workspaceId,
            recorded: outcome.recorded
        });
        return res;
    }

    /* ------------------------------------------------------------
     * The door as an object: a socket, or a function
     * ---------------------------------------------------------- */

    /**
     * The pipeline as a plain function, for a caller that already owns a
     * listener — a test, an embedding process, a platform that hands over
     * request/response pairs. Nothing below here is needed for that to work.
     */
    function handle(req, res) {
        /* `answer` already turns every decision into a response; this last catch
         * is for the failure of writing one, which leaves a socket open if
         * nobody closes it. */
        Promise.resolve()
            .then(() => answer(req, res))
            .catch((error) => {
                counters.internal += 1;
                emit(EVENTS.INTERNAL, Object.freeze({
                    at: now(),
                    where: "handle",
                    message: String((error && error.message) || error)
                }));
                if (!res.writableEnded) {
                    send(res, {
                        status: statusFor(CODES.INTERNAL_ERROR),
                        body: publicRefusal(refuse(CODES.INTERNAL_ERROR, "the door could not answer this request"))
                    });
                }
            });
        return res;
    }

    const server = nodeHttp.createServer(handle);

    /* Timeouts from the config rather than from the platform's mood: a caller
     * that opens a socket and then says nothing is not a caller this door waits
     * for. */
    server.requestTimeout = config.requestTimeoutMs;
    server.headersTimeout = config.headersTimeoutMs;
    server.keepAliveTimeout = config.keepAliveTimeoutMs;

    /* A socket error must not become an unhandled `error` event, which would take
     * the process down: it is counted and announced instead, and the listener
     * stays up for the callers that are still being served. */
    server.on("error", (error) => {
        counters.internal += 1;
        emit(EVENTS.INTERNAL, Object.freeze({
            at: now(),
            where: "server",
            message: String((error && error.message) || error)
        }));
    });

    let state = "idle";
    let endpoint = null;
    let listening = null;

    /** Where it is listening, or `null` — the port is worth knowing after `:0`. */
    function address() {
        const bound = server.address();
        if (!bound) return null;
        const host = bound.family === "IPv6" ? `[${bound.address}]` : bound.address;
        return Object.freeze({ host: bound.address, port: bound.port, url: `http://${host}:${bound.port}` });
    }

    /**
     * Start listening. Asking twice returns the same promise, because a second
     * `listen` on one server is an exception and not a second door — and a start
     * that failed forgets itself, so a caller may try again on another port.
     */
    function start() {
        if (listening) return listening;
        state = "starting";
        listening = new Promise((resolve, reject) => {
            const onFail = (error) => {
                listening = null;
                state = "closed";
                reject(error);
            };
            server.once("error", onFail);
            server.listen({ host: config.host, port: config.port }, () => {
                server.removeListener("error", onFail);
                state = "listening";
                endpoint = address();
                resolve(endpoint);
            });
        });
        return listening;
    }

    /**
     * Stop listening and let the callers in flight finish, so a shutdown is
     * something a supervisor can wait for instead of something it has to kill.
     */
    function stop() {
        if (!server.listening) {
            state = "closed";
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) return reject(error);
                state = "closed";
                endpoint = null;
                return resolve();
            });
            /* Idle keep-alive sockets would otherwise hold the close open for the
             * length of their timeout, which is a shutdown nobody wants to wait
             * for. */
            if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
        });
    }

    /** What the door is, what it has answered, and what its budgets hold. */
    function stats() {
        return Object.freeze({
            state,
            endpoint,
            uptimeMs: now() - startedAt,
            requests: counters.requests,
            allowed: counters.allowed,
            refused: counters.refused,
            internal: counters.internal,
            audited: counters.audited,
            byStatus: Object.freeze({ ...counters.byStatus }),
            byCode: Object.freeze({ ...counters.byCode }),
            byRoute: Object.freeze({ ...counters.byRoute }),
            limits: limits.stats(),
            routes: routes.length,
            vault: Boolean(vault)
        });
    }

    return Object.freeze({
        /* the pipeline, and the socket when a deployment wants one */
        handle,
        server,
        start,
        stop,
        address,

        /* this API, and the config it obeys */
        table: () => routeTable(routes),
        config,

        /* what it has answered, and how to hear about the next one */
        on,
        stats,
        events: EVENTS
    });
}

module.exports = { createGateway, EVENTS };


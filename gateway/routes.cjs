/* ============================================================
 * File: gateway/routes.cjs
 * Section: gateway (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   The API surface of this repository, written down once, as data. Every
 *   route names the permission it needs from `identity/core/rbac.cjs` — the
 *   same table identity and the vault judge by — so "what does this API
 *   expose?" and "who may reach it?" have one answer each and neither is
 *   spread through a switch statement.
 *
 *   Three things are missing on purpose, and each is a decision:
 *
 *     * there is no route to `secrets.material`. The engine's door takes a
 *       workspace and no person, so it is not a thing a caller may ask for
 *       over the wire; the execution engine is handed it in-process. A
 *       request for it is a request for a route that does not exist;
 *
 *     * there is no route that takes a workspace from the caller. The path
 *       may name one (`/workspaces/:workspaceId/members`) so the URL reads
 *       like a URL, and the gateway then checks that it is the token's — a
 *       path is not an identity;
 *
 *     * `/health` is the one route with no permission and no budget: a
 *       liveness probe that could be rate-limited would report an outage
 *       during one, and it touches nothing it could leak.
 *
 *   Pure, like the table it borrows: no database, no clock, no side effects.
 * ============================================================ */

const { CODES, accept, refuse } = require("../identity/core/errors.cjs");
const { PERMISSIONS } = require("../identity/core/rbac.cjs");

/** Freeze one route, with the path split the matcher walks. */
function route(spec) {
    const segments = spec.path.split("/").filter((segment) => segment !== "");
    const params = segments.filter((segment) => segment.startsWith(":")).map((segment) => segment.slice(1));
    return Object.freeze({
        permission: null,
        public: false,
        body: false,
        vault: false,
        limits: true,
        status: 200,
        params: Object.freeze(params),
        segments: Object.freeze(segments),
        ...spec
    });
}

/* The order matters only for a path that two routes could both claim; none do. */
const ROUTES = Object.freeze([
    route({
        method: "GET",
        path: "/health",
        action: "health",
        public: true,
        limits: false,
        summary: "this process is up; nothing is read, nothing is limited"
    }),
    route({
        method: "POST",
        path: "/auth/register",
        action: "register",
        public: true,
        body: true,
        status: 201,
        summary: "a person, a workspace of their own, and the pair that enters it"
    }),
    route({
        method: "POST",
        path: "/auth/login",
        action: "login",
        public: true,
        body: true,
        summary: "the one route a password is typed at, and the one that needs no token"
    }),
    route({
        method: "POST",
        path: "/auth/refresh",
        action: "refresh",
        public: true,
        body: true,
        summary: "rotate a refresh token; a spent one ends the whole family"
    }),
    route({
        method: "POST",
        path: "/auth/logout",
        action: "logout",
        public: true,
        body: true,
        summary: "end the family this refresh token belongs to"
    }),
    route({
        method: "GET",
        path: "/auth/me",
        action: "me",
        summary: "who the token says, as the tables have it now"
    }),
    route({
        method: "GET",
        path: "/workspaces",
        action: "workspaces",
        summary: "every workspace this account is in, with the role it holds there"
    }),
    route({
        method: "GET",
        path: "/workspaces/:workspaceId/members",
        action: "members",
        permission: PERMISSIONS.MEMBERS_READ,
        summary: "the roster of one workspace"
    }),
    route({
        method: "POST",
        path: "/workspaces/:workspaceId/invite",
        action: "invite",
        permission: PERMISSIONS.MEMBERS_WRITE,
        body: true,
        summary: "put an email in a workspace with a role"
    }),
    route({
        method: "GET",
        path: "/audit",
        action: "audit",
        permission: PERMISSIONS.AUDIT_READ,
        summary: "what was decided in this workspace, newest first"
    }),
    route({
        method: "GET",
        path: "/secrets",
        action: "secretsList",
        permission: PERMISSIONS.SECRETS_READ,
        vault: true,
        summary: "which venue keys exist; never a value, never sealed text"
    }),
    route({
        method: "PUT",
        path: "/secrets/:provider",
        action: "secretPut",
        permission: PERMISSIONS.SECRETS_WRITE,
        vault: true,
        body: true,
        summary: "store or rotate one venue key, addressed as provider:label"
    }),
    route({
        method: "POST",
        path: "/secrets/:provider/reveal",
        action: "secretReveal",
        permission: PERMISSIONS.SECRETS_READ,
        vault: true,
        body: true,
        summary: "the one route that returns a value, and it is written to the chain"
    }),
    route({
        method: "POST",
        path: "/secrets/:provider/revoke",
        action: "secretRevoke",
        permission: PERMISSIONS.SECRETS_WRITE,
        vault: true,
        body: true,
        summary: "close a key without deleting the row that says it was closed"
    })
]);

/** A deployment with no vault has no vault routes, rather than routes that fail. */
function routesFor({ vault = null } = {}) {
    return Object.freeze(ROUTES.filter((entry) => !entry.vault || Boolean(vault)));
}

/** The params a path fills in, or `false` when this route is not that path. */
function fill(entry, segments) {
    if (entry.segments.length !== segments.length) return false;
    const params = {};
    for (let index = 0; index < entry.segments.length; index += 1) {
        const wanted = entry.segments[index];
        if (wanted.startsWith(":")) params[wanted.slice(1)] = segments[index];
        else if (wanted !== segments[index]) return false;
    }
    return params;
}

/**
 * The one route for a method and a path — or a refusal that says which of the
 * two was wrong. `405` carries the methods that would have worked, because a
 * caller that guessed the verb deserves the list rather than a shrug.
 */
function matchRoute(list, method, path) {
    const segments = path === "/" ? [] : path.slice(1).split("/");
    const methods = [];

    for (const entry of list) {
        const params = fill(entry, segments);
        if (params === false) continue;
        if (entry.method !== method) {
            if (!methods.includes(entry.method)) methods.push(entry.method);
            continue;
        }
        return accept({ route: entry, params: Object.freeze(params) });
    }

    if (methods.length > 0) {
        return refuse(CODES.WRONG_METHOD, `${method} is not a method of ${path}`, {
            allow: Object.freeze(methods.sort())
        });
    }
    return refuse(CODES.NO_ROUTE, `there is no route at ${path}`, { path });
}

/** What this API exposes, for a reader — a file, a test or a handover. */
function routeTable(list = ROUTES) {
    return Object.freeze(list.map((entry) => Object.freeze({
        method: entry.method,
        path: entry.path,
        permission: entry.permission,
        public: entry.public,
        body: entry.body,
        vault: entry.vault,
        limits: entry.limits,
        summary: entry.summary
    })));
}

module.exports = { ROUTES, routesFor, matchRoute, routeTable, route };


/* ============================================================
 * File: identity/core/rbac.cjs
 * Section: identity/core
 * Version: 1.0.0
 *
 * Role:
 *   Four roles, one flat list of permissions, and one function that decides.
 *   Pure: no database, no clock, no side effects — `can(role, permission)`
 *   answers from constants only, so the same question always gets the same
 *   answer and a route can be reasoned about without running it.
 *
 *   The table is written so the lines between roles are the SECURITY lines
 *   and not the convenience ones:
 *
 *     owner     everything, including `secrets:write` and managing members
 *     admin     builds strategies and moves risk limits; never sees a venue key
 *     operator  runs the bots that already exist; changes nothing but their state
 *     viewer    reads dashboards, positions and logs; writes nothing
 *
 *   The permission a role does NOT have is the interesting half of each row,
 *   so the set of every permission that grants access to a secret lives in
 *   `SECRET_PERMISSIONS` and is asserted in the tests.
 * ============================================================ */

const ROLES = Object.freeze({
    OWNER: "owner",
    ADMIN: "admin",
    OPERATOR: "operator",
    VIEWER: "viewer"
});

const PERMISSIONS = Object.freeze({
    WORKSPACE_READ: "workspace:read",
    WORKSPACE_WRITE: "workspace:write",
    MEMBERS_READ: "members:read",
    MEMBERS_WRITE: "members:write",
    STRATEGY_READ: "strategy:read",
    STRATEGY_WRITE: "strategy:write",
    RISK_READ: "risk:read",
    RISK_WRITE: "risk:write",
    BOT_READ: "bot:read",
    BOT_CONTROL: "bot:control",
    ORDERS_READ: "orders:read",
    SECRETS_READ: "secrets:read",
    SECRETS_WRITE: "secrets:write",
    AUDIT_READ: "audit:read"
});

const PERMISSION_LIST = Object.freeze(Object.values(PERMISSIONS));

/** Every role may read these; no role is read-only except the viewer. */
const READ_PERMISSIONS = Object.freeze([
    PERMISSIONS.WORKSPACE_READ,
    PERMISSIONS.MEMBERS_READ,
    PERMISSIONS.STRATEGY_READ,
    PERMISSIONS.RISK_READ,
    PERMISSIONS.BOT_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.AUDIT_READ
]);

/** The only permissions that reach a venue key. Two, and both are owner-only. */
const SECRET_PERMISSIONS = Object.freeze([PERMISSIONS.SECRETS_READ, PERMISSIONS.SECRETS_WRITE]);

/** The only permission that changes a live bot without a strategy edit. */
const CONTROL_PERMISSIONS = Object.freeze([PERMISSIONS.BOT_CONTROL]);

const ROLE_PERMISSIONS = Object.freeze({
    owner: Object.freeze([...READ_PERMISSIONS, PERMISSIONS.SECRETS_READ, PERMISSIONS.SECRETS_WRITE,
        PERMISSIONS.WORKSPACE_WRITE, PERMISSIONS.MEMBERS_WRITE, PERMISSIONS.STRATEGY_WRITE,
        PERMISSIONS.RISK_WRITE, PERMISSIONS.BOT_CONTROL]),
    admin: Object.freeze([...READ_PERMISSIONS, PERMISSIONS.STRATEGY_WRITE, PERMISSIONS.RISK_WRITE,
        PERMISSIONS.BOT_CONTROL]),
    operator: Object.freeze([...READ_PERMISSIONS, PERMISSIONS.BOT_CONTROL]),
    viewer: Object.freeze([...READ_PERMISSIONS])
});

const RANKS = Object.freeze({ owner: 4, admin: 3, operator: 2, viewer: 1 });

const EMPTY = Object.freeze([]);

function isRole(role) {
    return typeof role === "string" && Object.prototype.hasOwnProperty.call(RANKS, role);
}

function isPermission(permission) {
    return typeof permission === "string" && PERMISSION_LIST.includes(permission);
}

function permissionsOf(role) {
    return isRole(role) ? ROLE_PERMISSIONS[role] : EMPTY;
}

/** The one question every route asks. An unknown role or permission is `false`. */
function can(role, permission) {
    if (!isRole(role) || !isPermission(permission)) return false;
    return ROLE_PERMISSIONS[role].includes(permission);
}

function rankOf(role) {
    return isRole(role) ? RANKS[role] : 0;
}

/** Strictly above — a member may never hand out or edit the rank they hold. */
function outranks(actorRole, targetRole) {
    if (!isRole(actorRole) || !isRole(targetRole)) return false;
    return RANKS[actorRole] > RANKS[targetRole];
}

function roles() {
    return Object.freeze(Object.values(ROLES));
}

module.exports = {
    ROLES,
    PERMISSIONS,
    PERMISSION_LIST,
    READ_PERMISSIONS,
    SECRET_PERMISSIONS,
    CONTROL_PERMISSIONS,
    ROLE_PERMISSIONS,
    RANKS,
    isRole,
    isPermission,
    permissionsOf,
    can,
    rankOf,
    outranks,
    roles
};

/* ============================================================
 * File: identity/core/errors.cjs
 * Section: identity/core
 * Version: 1.0.0
 *
 * Role:
 *   The one place a refusal gets its name — the same job `CODES` does for
 *   `execution-engine/risk/guardrails.cjs`, for the identity layer.
 *
 *   Two kinds of "no" live here and they are never mixed:
 *
 *     refuse(code, ...)  an ANSWER. The caller asked for something the rules
 *                        do not allow; the caller gets `{ ok: false, code,
 *                        message }` and the layer keeps running. Nothing is
 *                        thrown, so nothing is swallowed.
 *     fail(code, ...)    a BUG. A missing database, a secret too short, a
 *                        clock that was not injected — the caller wired the
 *                        layer wrong, and a wrong wiring must not run.
 *
 *   `SECURITY_CODES` is the short list of refusals that must also leave a
 *   trace: a refusal a reviewer would want to see later is not allowed to be
 *   quieter than a success. Everything else is counted, not audited.
 * ============================================================ */

/** Every way this layer says no. One list, one meaning each. */
const CODES = Object.freeze({
    /* --- misuse: thrown, never returned --- */
    NO_DB: "no-db",
    NO_CLOCK: "no-clock",
    NO_SECRET: "no-secret",
    SECRET_TOO_SHORT: "secret-too-short",
    NO_KEY: "no-key",
    UNKNOWN_PERMISSION: "unknown-permission",
    BAD_ENTRY: "bad-entry",

    /* --- registration / login --- */
    INVALID_EMAIL: "invalid-email",
    WEAK_PASSWORD: "weak-password",
    EMAIL_TAKEN: "email-taken",
    USER_NOT_FOUND: "user-not-found",
    INVALID_CREDENTIALS: "invalid-credentials",
    USER_DISABLED: "user-disabled",

    /* --- tokens --- */
    TOKEN_MISSING: "token-missing",
    TOKEN_INVALID: "token-invalid",
    TOKEN_EXPIRED: "token-expired",
    REFRESH_MISSING: "refresh-missing",
    REFRESH_INVALID: "refresh-invalid",
    REFRESH_EXPIRED: "refresh-expired",
    REFRESH_REUSE: "refresh-reuse",

    /* --- tenancy & access --- */
    WORKSPACE_NOT_FOUND: "workspace-not-found",
    NO_MEMBERSHIP: "no-membership",
    TENANT_MISMATCH: "tenant-mismatch",
    FORBIDDEN: "forbidden",
    UNKNOWN_ROLE: "unknown-role",
    OUTRANKED: "outranked",
    LAST_OWNER: "last-owner",
    ALREADY_MEMBER: "already-member",
    NOT_A_MEMBER: "not-a-member",
    MEMBER_LIMIT: "member-limit",

    /* --- the vault (phase 5, step 3 — the same list, on purpose) --- */
    NO_VAULT_KEY: "no-vault-key",
    BAD_KEY: "bad-key",
    SECRET_NOT_FOUND: "secret-not-found",
    SECRET_REVOKED: "secret-revoked",
    PROVIDER_UNKNOWN: "provider-unknown",

    /* --- the gateway (phase 5, step 4 — the same list a third time) ---
     * A door refuses for reasons identity never sees: the route does not
     * exist, the body was not JSON, the tenant on the wire disagreed with
     * the token, the budget is spent. Those are this layer's own refusals,
     * so they are named here, next to the rest — a second vocabulary for
     * "no" would be a second place to look for one. */
    BAD_REQUEST: "bad-request",
    BODY_TOO_LARGE: "body-too-large",
    RATE_LIMITED: "rate-limited",
    NO_ROUTE: "no-route",
    WRONG_METHOD: "wrong-method",
    INTERNAL_ERROR: "internal-error"
});

/**
 * Refusals a reviewer must be able to find later. A failed login, a replayed
 * refresh token or a cross-tenant attempt is never only a counter.
 */
const SECURITY_CODES = Object.freeze([
    CODES.INVALID_CREDENTIALS,
    CODES.USER_DISABLED,
    CODES.EMAIL_TAKEN,
    CODES.WEAK_PASSWORD,
    CODES.TOKEN_INVALID,
    CODES.TOKEN_EXPIRED,
    CODES.REFRESH_INVALID,
    CODES.REFRESH_EXPIRED,
    CODES.REFRESH_REUSE,
    CODES.NO_MEMBERSHIP,
    CODES.TENANT_MISMATCH,
    CODES.FORBIDDEN,
    CODES.OUTRANKED,
    CODES.LAST_OWNER
]);

/** An answer that says no. Frozen: a refusal is a fact, not a draft. */
function refuse(code, message, extra) {
    return Object.freeze({ ok: false, code, message: message || "", ...(extra || {}) });
}

/** An answer that says yes. */
function accept(fields) {
    return Object.freeze({ ok: true, ...(fields || {}) });
}

function isRefusal(value) {
    return Boolean(value) && value.ok === false && typeof value.code === "string";
}

function isSecurityCode(code) {
    return SECURITY_CODES.includes(code);
}

/** A wiring bug. Thrown on purpose — there is no `{ ok: false }` for a bug. */
function fail(code, message) {
    const error = new Error(message || code);
    error.code = code;
    throw error;
}

module.exports = { CODES, SECURITY_CODES, refuse, accept, isRefusal, isSecurityCode, fail };

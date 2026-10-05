/* ============================================================
 * File: identity/store/sessions.cjs
 * Section: identity/store
 * Version: 1.0.0
 *
 * Role:
 *   Where a refresh token is recognised — by its SHA-256, never by the token
 *   itself, because a database that holds the tokens holds a login for every
 *   row. One row is one refresh token, and each row remembers the family it
 *   was born into:
 *
 *     rotate   the old row is marked `rotated_at`, a new row joins the family
 *     reuse    a row already rotated or revoked is being presented again, so
 *              the whole family is revoked — that is a stolen token, and the
 *              only safe answer is to end every session it could have become
 *
 *   `stateOf(row, at)` is pure and takes the clock, so "is this row usable"
 *   is answered the same way in a test and in production.
 * ============================================================ */

const { CODES, fail } = require("../core/errors.cjs");

const STATE = Object.freeze({ OPEN: "open", ROTATED: "rotated", REVOKED: "revoked", EXPIRED: "expired" });
const REASONS = Object.freeze({
    LOGOUT: "logout",
    ROTATED: "rotated",
    REUSE_DETECTED: "reuse-detected",
    MEMBERSHIP_REMOVED: "membership-removed",
    USER_DISABLED: "user-disabled"
});

function createSessionStore(options = {}) {
    const { db } = options;
    if (!db || typeof db.prepare !== "function") {
        fail(CODES.NO_DB, "the session store needs an open database");
    }

    const insert = db.prepare(`INSERT INTO sessions
        (id, user_id, workspace_id, family_id, token_hash, issued_at, expires_at, user_agent, ip)
        VALUES (@id, @userId, @workspaceId, @familyId, @tokenHash, @issuedAt, @expiresAt, @userAgent, @ip)`);
    const byId = db.prepare("SELECT * FROM sessions WHERE id = ?");
    const byHash = db.prepare("SELECT * FROM sessions WHERE token_hash = ?");
    const markRotated = db.prepare("UPDATE sessions SET rotated_at = @at WHERE id = @id AND rotated_at IS NULL");
    const markRevoked = db.prepare(`UPDATE sessions SET revoked_at = @at, revoked_reason = @reason
        WHERE id = @id AND revoked_at IS NULL`);
    const revokeFamilyRows = db.prepare(`UPDATE sessions SET revoked_at = @at, revoked_reason = @reason
        WHERE family_id = @familyId AND revoked_at IS NULL`);
    const byUser = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY issued_at DESC");
    const drop = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
    const countAll = db.prepare("SELECT COUNT(*) AS n FROM sessions");

    function shape(row) {
        if (!row) return null;
        return Object.freeze({
            id: row.id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            familyId: row.family_id,
            tokenHash: row.token_hash,
            issuedAt: row.issued_at,
            expiresAt: row.expires_at,
            rotatedAt: row.rotated_at,
            revokedAt: row.revoked_at,
            revokedReason: row.revoked_reason,
            userAgent: row.user_agent,
            ip: row.ip
        });
    }

    function create(entry = {}) {
        insert.run({
            id: entry.id,
            userId: entry.userId,
            workspaceId: entry.workspaceId,
            familyId: entry.familyId,
            tokenHash: entry.tokenHash,
            issuedAt: entry.issuedAt,
            expiresAt: entry.expiresAt,
            userAgent: entry.userAgent ?? null,
            ip: entry.ip ?? null
        });
        return shape(byId.get(entry.id));
    }

    function findById(id) {
        return shape(id ? byId.get(id) : null);
    }

    function findByTokenHash(tokenHash) {
        return shape(tokenHash ? byHash.get(tokenHash) : null);
    }

    function rotate(id, at) {
        markRotated.run({ id, at });
        return shape(byId.get(id));
    }

    function revoke(id, at, reason = REASONS.LOGOUT) {
        markRevoked.run({ id, at, reason });
        return shape(byId.get(id));
    }

    function revokeFamily(familyId, at, reason = REASONS.REUSE_DETECTED) {
        return revokeFamilyRows.run({ familyId, at, reason }).changes;
    }

    function listForUser(userId) {
        return userId ? Object.freeze(byUser.all(userId).map(shape)) : Object.freeze([]);
    }

    /** Housekeeping only — an expired row is already refused by `stateOf`. */
    function purgeExpired(at) {
        return drop.run(at).changes;
    }

    function count() {
        return countAll.get().n;
    }

    return Object.freeze({
        create,
        findById,
        findByTokenHash,
        rotate,
        revoke,
        revokeFamily,
        listForUser,
        purgeExpired,
        count,
        STATE,
        REASONS
    });
}

/** The one place a session row's usability is decided. Pure, clock passed in. */
function stateOf(row, at) {
    if (!row) return STATE.REVOKED;
    if (row.revokedAt !== null && row.revokedAt !== undefined) return STATE.REVOKED;
    if (row.rotatedAt !== null && row.rotatedAt !== undefined) return STATE.ROTATED;
    if (Number.isFinite(row.expiresAt) && at >= row.expiresAt) return STATE.EXPIRED;
    return STATE.OPEN;
}

module.exports = { createSessionStore, stateOf, STATE, REASONS };

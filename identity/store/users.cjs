/* ============================================================
 * File: identity/store/users.cjs
 * Section: identity/store
 * Version: 1.0.0
 *
 * Role:
 *   One table, one row per person, and the row is the only place a password
 *   hash lives. The store hands the hash back because the auth path needs it
 *   — nothing else may: `publicUser()` (in service.cjs) is what leaves the
 *   layer, and a test pins that the hash is not in it.
 *
 *   `email` is what was typed; `email_normalized` is what the UNIQUE index
 *   holds, so the address is unique as a mailbox and not as a spelling.
 * ============================================================ */

const { CODES, fail } = require("../core/errors.cjs");

const STATUS = Object.freeze({ ACTIVE: "active", DISABLED: "disabled", INVITED: "invited" });

function createUserStore(options = {}) {
    const { db } = options;
    if (!db || typeof db.prepare !== "function") {
        fail(CODES.NO_DB, "the user store needs an open database");
    }

    const insert = db.prepare(`INSERT INTO users
        (id, email, email_normalized, password_hash, status, created_at, updated_at)
        VALUES (@id, @email, @emailNormalized, @passwordHash, @status, @at, @at)`);
    const byId = db.prepare("SELECT * FROM users WHERE id = ?");
    const byEmail = db.prepare("SELECT * FROM users WHERE email_normalized = ?");
    const setStatus = db.prepare("UPDATE users SET status = @status, updated_at = @at WHERE id = @id");
    const setHash = db.prepare("UPDATE users SET password_hash = @passwordHash, updated_at = @at WHERE id = @id");
    const touch = db.prepare("UPDATE users SET last_login_at = @at, updated_at = @at WHERE id = @id");
    const countAll = db.prepare("SELECT COUNT(*) AS n FROM users");

    function shape(row) {
        if (!row) return null;
        return Object.freeze({
            id: row.id,
            email: row.email,
            emailNormalized: row.email_normalized,
            passwordHash: row.password_hash,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastLoginAt: row.last_login_at
        });
    }

    function create(entry = {}) {
        insert.run({
            id: entry.id,
            email: entry.email,
            emailNormalized: entry.emailNormalized,
            passwordHash: entry.passwordHash,
            status: entry.status || STATUS.ACTIVE,
            at: entry.at
        });
        return shape(byId.get(entry.id));
    }

    function findById(id) {
        return shape(id ? byId.get(id) : null);
    }

    function findByEmail(emailNormalized) {
        return shape(emailNormalized ? byEmail.get(emailNormalized) : null);
    }

    function isTaken(emailNormalized) {
        return Boolean(emailNormalized) && Boolean(byEmail.get(emailNormalized));
    }

    function updateStatus(id, status, at) {
        setStatus.run({ id, status, at });
        return shape(byId.get(id));
    }

    function updatePasswordHash(id, passwordHash, at) {
        setHash.run({ id, passwordHash, at });
        return shape(byId.get(id));
    }

    function touchLogin(id, at) {
        touch.run({ id, at });
        return shape(byId.get(id));
    }

    function count() {
        return countAll.get().n;
    }

    return Object.freeze({
        create,
        findById,
        findByEmail,
        isTaken,
        updateStatus,
        updatePasswordHash,
        touchLogin,
        count,
        STATUS
    });
}

module.exports = { createUserStore, STATUS };

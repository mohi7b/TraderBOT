/* ============================================================
 * File: identity/store/schema.cjs
 * Section: identity/store
 * Version: 1.0.0
 *
 * Role:
 *   The shape of the identity database, in one place, versioned by SQLite's
 *   own `user_version` — so a database that is already open can be asked what
 *   it is and upgraded without a migration framework and without a library.
 *
 *   Five tables, and the relationships between them are the tenancy model:
 *
 *     users        who a person is (an address, and the cost of their password)
 *     workspaces   a tenant: the unit of isolation, and of everything else
 *     memberships  a user's role IN a workspace — never a role on the user,
 *                  because the same person is an owner in one tenant and a
 *                  viewer in another, and that is the point of the layer
 *     sessions     refresh tokens, hashed, with the family that made them
 *     audit        every allow/deny that matters, chained by hash
 *
 *   `db` is always injected: the tests open `:memory:`, a deployment opens a
 *   file. Nothing here reads a path or an environment variable.
 * ============================================================ */

const { CODES, fail } = require("../core/errors.cjs");

const SCHEMA_VERSION = 1;

const V1 = `
CREATE TABLE IF NOT EXISTS users (
    id               TEXT PRIMARY KEY,
    email            TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active',
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    last_login_at    INTEGER
);

CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL REFERENCES users(id),
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user ON memberships (user_id);

CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    family_id    TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    issued_at    INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    rotated_at   INTEGER,
    revoked_at   INTEGER,
    revoked_reason TEXT,
    user_agent   TEXT,
    ip           TEXT
);
CREATE INDEX IF NOT EXISTS sessions_family ON sessions (family_id);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS audit (
    seq           INTEGER PRIMARY KEY AUTOINCREMENT,
    at            INTEGER NOT NULL,
    workspace_id  TEXT,
    actor_user_id TEXT,
    action        TEXT NOT NULL,
    outcome       TEXT NOT NULL,
    code          TEXT,
    target        TEXT,
    meta          TEXT,
    prev_hash     TEXT NOT NULL,
    hash          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_workspace_at ON audit (workspace_id, at);
`;

const MIGRATIONS = Object.freeze([Object.freeze({ version: 1, name: "identity-core", sql: V1 })]);

function requireDb(db) {
    if (!db || typeof db.prepare !== "function" || typeof db.exec !== "function") {
        fail(CODES.NO_DB, "an open better-sqlite3 database is injected, never opened here");
    }
    return db;
}

function version(db) {
    return requireDb(db).pragma("user_version", { simple: true });
}

/**
 * Bring a database up to `SCHEMA_VERSION`. Safe to call twice: each step runs
 * at most once, and each step runs inside its own transaction, so a failure
 * leaves the database at the last version that completed.
 */
function migrate(db) {
    requireDb(db);
    db.pragma("foreign_keys = ON");

    const from = version(db);
    const applied = [];

    for (const step of MIGRATIONS) {
        if (step.version <= from) continue;
        db.transaction(() => {
            db.exec(step.sql);
            db.pragma(`user_version = ${step.version}`);
        })();
        applied.push(step.version);
    }

    return Object.freeze({ from, to: version(db), applied: Object.freeze(applied) });
}

function tables(db) {
    return Object.freeze(
        requireDb(db)
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            .all()
            .map((row) => row.name)
    );
}

module.exports = { SCHEMA_VERSION, MIGRATIONS, migrate, version, tables, requireDb };

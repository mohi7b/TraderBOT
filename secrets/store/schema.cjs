/* ============================================================
 * File: secrets/store/schema.cjs
 * Section: secrets/store (Phase 5 — the vault)
 * Version: 1.0.0
 *
 * Role:
 *   The shape of the vault, and the reason it is a SECOND table in the SAME
 *   database as the identity layer: a secret belongs to a workspace, so the day
 *   a workspace is deleted the rows that hold its keys go with it, and nobody
 *   has to remember to run a second cleanup.
 *
 *   One table that matters, and one that only remembers:
 *
 *     secrets     one row per `provider:label` in a workspace: the sealed
 *                 value, the fingerprint of the key that sealed it, and the
 *                 bookkeeping a review needs (who wrote it, when it was last
 *                 handed to an adapter, whether it was revoked)
 *     vault_meta  the version of THIS schema
 *
 *   `vault_meta` exists because `user_version` belongs to the identity schema
 *   and the vault does not get to overwrite another layer's number. Two
 *   migrations in one database, each with its own ledger, and neither can
 *   silently mark the other as done.
 *
 *   `db` is always injected, and the identity schema is migrated FIRST on a
 *   shared database: `secrets` references `workspaces(id)` and `users(id)` on
 *   purpose, because a key that is not attached to a tenant is a key nobody
 *   owns. `migrate` is safe to call twice and every step runs in its own
 *   transaction, so a failure leaves the database at the last version that
 *   completed.
 * ============================================================ */

const { CODES, fail } = require("../../identity/core/errors.cjs");

const SCHEMA_VERSION = 1;
const META_TABLE = "vault_meta";

const V1 = `
CREATE TABLE IF NOT EXISTS vault_meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS secrets (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider       TEXT NOT NULL,
    label          TEXT NOT NULL,
    key_id         TEXT NOT NULL,
    algorithm      TEXT NOT NULL,
    ciphertext     TEXT NOT NULL,
    created_by     TEXT NOT NULL REFERENCES users(id),
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    last_used_at   INTEGER,
    use_count      INTEGER NOT NULL DEFAULT 0,
    revoked_at     INTEGER,
    revoked_reason TEXT,
    revoked_by     TEXT,
    UNIQUE (workspace_id, provider, label)
);

CREATE INDEX IF NOT EXISTS secrets_workspace_provider ON secrets (workspace_id, provider, label);
CREATE INDEX IF NOT EXISTS secrets_workspace_updated ON secrets (workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS secrets_key ON secrets (key_id);
`;

const MIGRATIONS = Object.freeze([Object.freeze({ version: 1, name: "vault-core", sql: V1 })]);

function requireDb(db) {
    if (!db || typeof db.prepare !== "function" || typeof db.exec !== "function") {
        fail(CODES.NO_DB, "an open better-sqlite3 database is injected, never opened here");
    }
    return db;
}

/** The vault's own ledger, so `user_version` stays the identity layer's. */
function version(db) {
    requireDb(db);
    const exists = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(META_TABLE);
    if (!exists) return 0;

    const row = db.prepare(`SELECT v FROM ${META_TABLE} WHERE k = 'schema_version'`).get();
    return row ? Number(row.v) : 0;
}

function migrate(db) {
    requireDb(db);
    db.pragma("foreign_keys = ON");

    const from = version(db);
    const applied = [];

    for (const step of MIGRATIONS) {
        if (step.version <= from) continue;
        db.transaction(() => {
            db.exec(step.sql);
            db.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (k, v) VALUES ('schema_version', ?)`)
                .run(String(step.version));
        })();
        applied.push(step.version);
    }

    return Object.freeze({ from, to: version(db), applied: Object.freeze(applied) });
}

function tables(db) {
    return Object.freeze(
        requireDb(db)
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all()
            .map((row) => row.name)
    );
}

module.exports = { SCHEMA_VERSION, META_TABLE, MIGRATIONS, migrate, version, tables, requireDb };

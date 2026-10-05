/* ============================================================
 * File: secrets/store/records.cjs
 * Section: secrets/store (Phase 5 — the vault)
 * Version: 1.0.0
 *
 * Role:
 *   The rows, and nothing but the rows. This file never sees a key, never sees
 *   a plaintext and never decides who may do what — that is the service's job.
 *   Its one opinion is the shape it hands back:
 *
 *     `shape(row)`         what a caller may see: metadata, no ciphertext
 *     `rawByKey/rawById`   the row itself, ciphertext included, and the only
 *                          places a ciphertext can come out of. The service is
 *                          the only caller, and it hands the result straight to
 *                          the cipher instead of to a response.
 *
 *   The line between those two is the whole point: `listForWorkspace` maps
 *   through `shape`, so a route that lists secrets cannot leak a sealed value
 *   even by accident, and a test asserts exactly that.
 *
 *   A `(workspace, provider, label)` is unique, so `save` is an upsert: writing
 *   a key again rotates the value in place, keeps the original id, and clears a
 *   previous revocation — re-provisioning a venue is a `put`, not a delete
 *   followed by an add.
 * ============================================================ */

const { CODES, fail } = require("../../identity/core/errors.cjs");

function createSecretStore(options = {}) {
    const { db } = options;
    if (!db || typeof db.prepare !== "function") {
        fail(CODES.NO_DB, "the secret store needs an open database");
    }

    const upsert = db.prepare(`INSERT INTO secrets
            (id, workspace_id, provider, label, key_id, algorithm, ciphertext, created_by, created_at, updated_at, use_count)
        VALUES (@id, @workspaceId, @provider, @label, @keyId, @algorithm, @ciphertext, @createdBy, @at, @at, 0)
        ON CONFLICT (workspace_id, provider, label) DO UPDATE SET
            key_id         = excluded.key_id,
            algorithm      = excluded.algorithm,
            ciphertext     = excluded.ciphertext,
            updated_at     = excluded.updated_at,
            use_count      = 0,
            revoked_at     = NULL,
            revoked_reason = NULL,
            revoked_by     = NULL`);

    const byKey = db.prepare("SELECT * FROM secrets WHERE workspace_id = ? AND provider = ? AND label = ?");
    const byId = db.prepare("SELECT * FROM secrets WHERE id = ?");
    const listAll = db.prepare("SELECT * FROM secrets WHERE workspace_id = ? ORDER BY provider, label");
    const listProvider = db.prepare("SELECT * FROM secrets WHERE workspace_id = ? AND provider = ? ORDER BY label");
    const revokeStmt = db.prepare(`UPDATE secrets SET revoked_at = @at, revoked_reason = @reason, revoked_by = @by
        WHERE id = @id`);
    const touchStmt = db.prepare("UPDATE secrets SET last_used_at = @at, use_count = use_count + 1 WHERE id = @id");
    const counts = db.prepare(`SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
        FROM secrets WHERE workspace_id = ?`);
    const perProvider = db.prepare(`SELECT provider, COUNT(*) AS n FROM secrets
        WHERE workspace_id = ? GROUP BY provider ORDER BY provider`);

    /**
     * The public face of a row: what exists, who wrote it, when it was last
     * handed out — and never the sealed value or the key that sealed it.
     */
    function shape(row) {
        if (!row) return null;
        return Object.freeze({
            id: row.id,
            workspaceId: row.workspace_id,
            provider: row.provider,
            label: row.label,
            keyId: row.key_id,
            algorithm: row.algorithm,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastUsedAt: row.last_used_at,
            useCount: row.use_count,
            revoked: row.revoked_at !== null,
            revokedAt: row.revoked_at,
            revokedReason: row.revoked_reason,
            revokedBy: row.revoked_by
        });
    }

    function save(entry = {}) {
        upsert.run({
            id: entry.id,
            workspaceId: entry.workspaceId,
            provider: entry.provider,
            label: entry.label,
            keyId: entry.keyId,
            algorithm: entry.algorithm,
            ciphertext: entry.ciphertext,
            createdBy: entry.createdBy,
            at: entry.at
        });
        return shape(byKey.get(entry.workspaceId, entry.provider, entry.label));
    }

    /* The only two doors out of this file that carry a ciphertext. */
    function rawByKey(workspaceId, provider, label) {
        return byKey.get(workspaceId, provider, label) || null;
    }

    function rawById(id) {
        return byId.get(id) || null;
    }

    function findByKey(workspaceId, provider, label) {
        return shape(rawByKey(workspaceId, provider, label));
    }

    function listForWorkspace(workspaceId, options = {}) {
        const rows = options.provider ? listProvider.all(workspaceId, options.provider) : listAll.all(workspaceId);
        return Object.freeze(rows.map(shape));
    }

    function markRevoked(id, entry = {}) {
        return revokeStmt.run({ id, at: entry.at, reason: entry.reason ?? null, by: entry.by ?? null }).changes;
    }

    function touch(id, at) {
        return touchStmt.run({ id, at }).changes;
    }

    function countsFor(workspaceId) {
        const row = counts.get(workspaceId);
        return Object.freeze({
            total: row.total,
            active: row.active || 0,
            revoked: row.revoked || 0,
            byProvider: Object.freeze(
                perProvider.all(workspaceId).map((entry) => Object.freeze({ provider: entry.provider, n: entry.n }))
            )
        });
    }

    return Object.freeze({
        shape,
        save,
        rawByKey,
        rawById,
        findByKey,
        listForWorkspace,
        markRevoked,
        touch,
        countsFor
    });
}

module.exports = { createSecretStore };

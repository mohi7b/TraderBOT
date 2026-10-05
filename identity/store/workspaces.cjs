/* ============================================================
 * File: identity/store/workspaces.cjs
 * Section: identity/store
 * Version: 1.0.0
 *
 * Role:
 *   A workspace is a tenant: the unit everything else is isolated by. The
 *   store keeps a name for people and a slug for machines, and the slug is
 *   unique the same way an address is — by asking, never by guessing, and
 *   never by letting two tenants share a namespace by accident.
 * ============================================================ */

const crypto = require("node:crypto");

const { CODES, fail } = require("../core/errors.cjs");

const { randomUUID } = crypto;

function createWorkspaceStore(options = {}) {
    const { db } = options;
    if (!db || typeof db.prepare !== "function") {
        fail(CODES.NO_DB, "the workspace store needs an open database");
    }

    const insert = db.prepare(`INSERT INTO workspaces
        (id, name, slug, owner_user_id, created_at, updated_at)
        VALUES (@id, @name, @slug, @ownerUserId, @at, @at)`);
    const byId = db.prepare("SELECT * FROM workspaces WHERE id = ?");
    const bySlug = db.prepare("SELECT * FROM workspaces WHERE slug = ?");
    const rename = db.prepare("UPDATE workspaces SET name = @name, updated_at = @at WHERE id = @id");
    const countAll = db.prepare("SELECT COUNT(*) AS n FROM workspaces");

    function shape(row) {
        if (!row) return null;
        return Object.freeze({
            id: row.id,
            name: row.name,
            slug: row.slug,
            ownerUserId: row.owner_user_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    }

    function create(entry = {}) {
        insert.run({
            id: entry.id,
            name: entry.name,
            slug: entry.slug,
            ownerUserId: entry.ownerUserId,
            at: entry.at
        });
        return shape(byId.get(entry.id));
    }

    function findById(id) {
        return shape(id ? byId.get(id) : null);
    }

    function findBySlug(slug) {
        return shape(slug ? bySlug.get(slug) : null);
    }

    /** `alpha`, `alpha-2`, `alpha-3` — a slug is never taken twice. */
    function uniqueSlug(base) {
        const wanted = base || "workspace";
        if (!findBySlug(wanted)) return wanted;

        for (let suffix = 2; suffix < 1000; suffix += 1) {
            const candidate = `${wanted}-${suffix}`;
            if (!findBySlug(candidate)) return candidate;
        }
        return `${wanted}-${randomUUID().slice(0, 8)}`;
    }

    function updateName(id, name, at) {
        rename.run({ id, name, at });
        return shape(byId.get(id));
    }

    function count() {
        return countAll.get().n;
    }

    return Object.freeze({ create, findById, findBySlug, uniqueSlug, updateName, count });
}

module.exports = { createWorkspaceStore };

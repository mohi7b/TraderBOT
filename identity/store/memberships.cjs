/* ============================================================
 * File: identity/store/memberships.cjs
 * Section: identity/store
 * Version: 1.0.0
 *
 * Role:
 *   A role belongs to a (workspace, user) pair and to nothing else — that is
 *   the whole tenancy model in one sentence. `role(workspaceId, userId)` is
 *   the authority every request is judged against: an access token carries a
 *   role as a claim, but this table is what decides, so removing a member
 *   stops their next request even though their token has not expired yet.
 * ============================================================ */

const { CODES, fail } = require("../core/errors.cjs");

function createMembershipStore(options = {}) {
    const { db } = options;
    if (!db || typeof db.prepare !== "function") {
        fail(CODES.NO_DB, "the membership store needs an open database");
    }

    const insert = db.prepare(`INSERT INTO memberships (workspace_id, user_id, role, created_at, updated_at)
        VALUES (@workspaceId, @userId, @role, @at, @at)`);
    const byId = db.prepare("SELECT * FROM memberships WHERE workspace_id = ? AND user_id = ?");
    const forWorkspace = db.prepare(`SELECT m.workspace_id, m.user_id, m.role, m.created_at, m.updated_at, u.email, u.status
        FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ? ORDER BY m.created_at, u.email`);
    const forUser = db.prepare(`SELECT m.workspace_id, m.role, m.created_at, w.name, w.slug
        FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = ? ORDER BY m.created_at`);
    const setRole = db.prepare(`UPDATE memberships SET role = @role, updated_at = @at
        WHERE workspace_id = @workspaceId AND user_id = @userId`);
    const drop = db.prepare("DELETE FROM memberships WHERE workspace_id = ? AND user_id = ?");
    const countRole = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ? AND role = ?");
    const countAll = db.prepare("SELECT COUNT(*) AS n FROM memberships");

    function shape(row) {
        if (!row) return null;
        return Object.freeze({
            workspaceId: row.workspace_id,
            userId: row.user_id,
            role: row.role,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            email: row.email ?? null,
            status: row.status ?? null
        });
    }

    function add(entry = {}) {
        insert.run({
            workspaceId: entry.workspaceId,
            userId: entry.userId,
            role: entry.role,
            at: entry.at
        });
        return shape(byId.get(entry.workspaceId, entry.userId));
    }

    function find(workspaceId, userId) {
        if (!workspaceId || !userId) return null;
        return shape(byId.get(workspaceId, userId));
    }

    /** The single authority: this role, in this workspace, right now. */
    function role(workspaceId, userId) {
        const row = find(workspaceId, userId);
        return row ? row.role : null;
    }

    function isMember(workspaceId, userId) {
        return isString(workspaceId) && isString(userId) && Boolean(byId.get(workspaceId, userId));
    }

    function listForWorkspace(workspaceId) {
        return isString(workspaceId) ? Object.freeze(forWorkspace.all(workspaceId).map(shape)) : Object.freeze([]);
    }

    function listForUser(userId) {
        if (!isString(userId)) return Object.freeze([]);
        return Object.freeze(
            forUser.all(userId).map((row) => Object.freeze({
                workspaceId: row.workspace_id,
                role: row.role,
                createdAt: row.created_at,
                name: row.name,
                slug: row.slug
            }))
        );
    }

    function updateRole(workspaceId, userId, role, at) {
        setRole.run({ workspaceId, userId, role, at });
        return find(workspaceId, userId);
    }

    function remove(workspaceId, userId) {
        return drop.run(workspaceId, userId).changes;
    }

    function countOfRole(workspaceId, role) {
        return isString(workspaceId) ? countRole.get(workspaceId, role).n : 0;
    }

    function count() {
        return countAll.get().n;
    }

    return Object.freeze({
        add,
        find,
        role,
        isMember,
        listForWorkspace,
        listForUser,
        updateRole,
        remove,
        countOfRole,
        count
    });
}

function isString(value) {
    return typeof value === "string" && value.length > 0;
}

module.exports = { createMembershipStore };

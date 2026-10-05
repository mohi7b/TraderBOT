/* ============================================================
 * File: gateway/middleware/tenant.cjs
 * Section: gateway/middleware (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   Which workspace this request is about — decided by the token, never by the
 *   caller. The header and the path are allowed to NAME a workspace, and their
 *   only power is to disagree: when they do, the request is refused as
 *   `tenant-mismatch` before any table is read, because a workspace is not
 *   something a URL gets to choose.
 *
 *   Both directions of disagreement are the same refusal. A path that names
 *   another workspace, an `X-Tenant-Id` that names one, a workspace that does
 *   not exist: all of them are "the workspace on the wire is not the workspace
 *   this token is for", and none of them say whether the workspace exists —
 *   which is the point. Someone holding a token for one tenant must not be able
 *   to use this door to enumerate the others.
 * ============================================================ */

const { CODES, accept, refuse } = require("../../identity/core/errors.cjs");

/** A header value that is a usable id, or `null` — blank is absent, not empty. */
function announced(req, header) {
    const raw = req.headers[header];
    if (raw === undefined || raw === null) return null;
    const value = Array.isArray(raw) ? raw[0] : String(raw);
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function createTenant({ header = "x-tenant-id" } = {}) {
    /**
     * The tenant of this request, or a refusal. `via` says which of the three
     * told us, which is what makes a header that agrees visibly harmless rather
     * than silently ignored.
     */
    function bind(req, context, params = {}) {
        const onPath = typeof params.workspaceId === "string" && params.workspaceId.length > 0
            ? params.workspaceId
            : null;
        if (onPath && onPath !== context.workspaceId) {
            return refuse(CODES.TENANT_MISMATCH, "the workspace in the path is not the workspace this token is for", {
                requested: onPath,
                tenant: context.workspaceId
            });
        }

        const onWire = announced(req, header);
        if (onWire && onWire !== context.workspaceId) {
            return refuse(CODES.TENANT_MISMATCH, "the workspace on the wire is not the workspace this token is for", {
                requested: onWire,
                tenant: context.workspaceId
            });
        }

        return accept({
            workspaceId: context.workspaceId,
            via: onPath ? "path" : onWire ? "header" : "token"
        });
    }

    return Object.freeze({ bind, header, announced: (req) => announced(req, header) });
}

module.exports = { createTenant, announced };

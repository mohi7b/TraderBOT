/* ============================================================
 * File: gateway/middleware/auth.cjs
 * Section: gateway/middleware (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   Turn an `Authorization: Bearer …` header into a caller, and nothing else:
 *   the signature is identity's to check, the session is identity's to look up,
 *   the role is identity's table to read. This file's whole job is to decide
 *   *when* to ask and what to do with a missing header — and the answer to a
 *   missing header is a refusal, not a default caller.
 *
 *   `online: true` is the important word. An access token is a claim about a
 *   session, a membership and a role; between the moment it was signed and the
 *   moment it is used, any of the three may have been revoked. Anything that
 *   can change the database is judged online, so a removed member stops being
 *   accepted before the token would have expired on its own — and the gateway
 *   never trusts the `role` inside the token over the role in the roster.
 * ============================================================ */

const { CODES, accept, refuse, fail } = require("../../identity/core/errors.cjs");
const { credentialsOf } = require("../core/http.cjs");

function createAuth({ identity, header = "authorization" } = {}) {
    if (!identity || typeof identity.inspect !== "function") {
        fail(CODES.NO_DB, "the door is handed identity — the only layer that knows who is calling");
    }

    /**
     * A refusal here is final: it comes from identity, with identity's code and
     * identity's words, and this layer does not re-word it. The context it
     * builds is the caller as the tables have them, never as the token claims.
     */
    function authenticate(req) {
        const presented = credentialsOf(req, header);
        if (!presented.present) {
            return refuse(CODES.TOKEN_MISSING, "an access token is required");
        }
        if (!presented.token) {
            return refuse(CODES.TOKEN_INVALID, `the ${header} header is \`Bearer <access token>\``);
        }

        const seen = identity.inspect(presented.token, { online: true });
        if (!seen.ok) return seen;

        return accept({
            token: presented.token,
            context: Object.freeze({
                userId: seen.user.id,
                email: seen.user.email,
                workspaceId: seen.claims.wid,
                role: seen.role,
                permissions: seen.permissions,
                sessionId: seen.session.id,
                familyId: seen.session.familyId,
                roleChanged: seen.roleChanged,
                claims: seen.claims
            })
        });
    }

    return Object.freeze({ authenticate, header });
}

module.exports = { createAuth };

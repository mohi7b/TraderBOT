/* ============================================================
 * File: identity/service.cjs
 * Section: identity (Phase 5 — Identity & Gateway, seam D1)
 * Version: 1.0.0
 *
 * Role:
 *   The façade: core rules that know nothing about a database and stores that
 *   know nothing about a person are put together here into the five things a
 *   person actually does — register, login, refresh, logout, me.
 *
 *   Two decisions shape every line. The time comes in (`now`), so a token can
 *   expire in a test without waiting. And every refusal a reviewer would want
 *   later is audited where it happened, with the code that names it:
 *   SECURITY_CODES is exactly that list, everything else moves a counter.
 *
 * Run: node identity/tests/service.test.cjs
 * ============================================================ */

const crypto = require("node:crypto");

const { CODES, refuse, accept, fail, isSecurityCode } = require("./core/errors.cjs");
const { canonicalEmail, isEmail, slugify } = require("./core/email.cjs");
const { checkPassword, hashPassword, verifyPassword, needsRehash, dummyHash } = require("./core/password.cjs");
const { createSigner, createOpaqueToken, hashToken } = require("./core/tokens.cjs");
const { ROLES, PERMISSIONS, can, isRole, rankOf, outranks, permissionsOf } = require("./core/rbac.cjs");
const { requireDb, migrate } = require("./store/schema.cjs");
const { createUserStore } = require("./store/users.cjs");
const { createWorkspaceStore } = require("./store/workspaces.cjs");
const { createMembershipStore } = require("./store/memberships.cjs");
const { createSessionStore, stateOf, STATE, REASONS } = require("./store/sessions.cjs");
const { createAuditStore } = require("./store/audit.cjs");

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
const MAX_MEMBERS = 50;
const REUSE_EVENT = "reuse-detected";

function createIdentity(options = {}) {
    const {
        db,
        now,
        secret,
        accessTtlSec = ACCESS_TTL_SEC,
        refreshTtlSec = REFRESH_TTL_SEC,
        keyId = "k1",
        issuer = "traderbot",
        maxMembers = MAX_MEMBERS
    } = options;

    requireDb(db);
    if (typeof now !== "function") {
        fail(CODES.NO_CLOCK, "the identity layer is given a clock, never reads one");
    }

    const users = createUserStore({ db });
    const workspaces = createWorkspaceStore({ db });
    const memberships = createMembershipStore({ db });
    const sessions = createSessionStore({ db });
    const audit = createAuditStore({ db });
    const signer = createSigner({ secret, now, ttlSec: accessTtlSec, keyId, issuer });

    const counters = {
        registrations: 0, logins: 0, refreshes: 0, logouts: 0, refusals: 0, reuseDetected: 0, invited: 0
    };
    const listeners = new Map();

    /* ------------------------------------------------------------
     * The trail, and the one way to say no
     * ---------------------------------------------------------- */

    function trace(action, outcome, fields = {}) {
        return audit.append({ at: now(), action, outcome, ...fields });
    }

    function deny(code, action, message, fields = {}) {
        counters.refusals += 1;
        if (isSecurityCode(code)) trace(action, "deny", { ...fields, code });
        return refuse(code, message, fields);
    }

    /* ------------------------------------------------------------
     * What leaves the layer
     * ---------------------------------------------------------- */

    /** The password hash never leaves: a test pins that, on purpose. */
    function publicUser(user) {
        if (!user) return null;
        return Object.freeze({
            id: user.id,
            email: user.email,
            status: user.status,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt
        });
    }

    function publicWorkspace(workspace) {
        if (!workspace) return null;
        return Object.freeze({
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            ownerUserId: workspace.ownerUserId,
            createdAt: workspace.createdAt
        });
    }

    function publicMember(membership) {
        return Object.freeze({
            userId: membership.userId,
            email: membership.email ?? null,
            status: membership.status ?? null,
            role: membership.role,
            createdAt: membership.createdAt ?? null,
            permissions: permissionsOf(membership.role)
        });
    }

    function on(event, handler) {
        if (typeof handler !== "function") {
            fail(CODES.BAD_ENTRY, "a listener is a function");
        }
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event).delete(handler);
    }

    /**
     * An event is handed over after the state change it describes has already
     * happened, so a listener that throws cannot undo anything — and is not
     * hidden either: a throwing listener is a bug in the listener.
     */
    function emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return 0;
        const frozen = Object.freeze(payload);
        for (const handler of [...set]) handler(frozen);
        return set.size;
    }

    /** A role is only ever a role IN a workspace, so this is one question
     *  asked in one place — and the answer is `rbac`'s, never this file's. */
    function allows(role, permission) {
        return can(role, permission);
    }

    /**
     * The one question a gateway or a vault asks before it acts on a workspace:
     * is this account a member here, and does the role it holds in this workspace
     * carry this permission? It is `guard` with no member in its sights — the
     * answer to "may this person?", never "may this person touch that member?".
     */
    function authorize(actorUserId, workspaceId, permission) {
        return guard(actorUserId, workspaceId, permission);
    }

    /* ------------------------------------------------------------
     * Registration — one address, one password, one workspace of one's own
     * ---------------------------------------------------------- */

    function register(input = {}) {
        const typed = typeof input.email === "string" ? input.email : "";
        const email = canonicalEmail(typed);

        if (!isEmail(typed)) {
            return deny(CODES.INVALID_EMAIL, "register", "that is not an email address", {
                target: email || null,
                meta: { detail: "format" }
            });
        }
        if (users.isTaken(email)) {
            return deny(CODES.EMAIL_TAKEN, "register", "that address is already registered", {
                target: email,
                meta: { detail: "taken" }
            });
        }

        const weak = checkPassword(input.password);
        if (weak) {
            return deny(weak.code, "register", weak.message, {
                target: email,
                meta: { detail: weak.detail ?? null }
            });
        }

        const at = now();
        const userId = crypto.randomUUID();
        const user = users.create({
            id: userId,
            email: typed.trim(),
            emailNormalized: email,
            passwordHash: hashPassword(input.password).encoded,
            at
        });

        const named = typeof input.workspaceName === "string" && input.workspaceName.trim().length;
        const name = named ? input.workspaceName.trim() : `${email.split("@")[0]}'s workspace`;
        const workspace = workspaces.create({
            id: crypto.randomUUID(),
            name,
            slug: workspaces.uniqueSlug(slugify(name)),
            ownerUserId: userId,
            at
        });
        const membership = memberships.add({
            workspaceId: workspace.id,
            userId,
            role: ROLES.OWNER,
            at
        });

        counters.registrations += 1;
        trace("register", "allow", { workspaceId: workspace.id, actorUserId: userId, target: email });

        return accept({
            user: publicUser(user),
            workspace: publicWorkspace(workspace),
            member: publicMember({ ...membership, email: user.email, status: user.status })
        });
    }

    function stats() {
        return Object.freeze({
            ...counters,
            users: users.count(),
            workspaces: workspaces.count(),
            memberships: memberships.count(),
            sessions: sessions.count(),
            audit: audit.counts(),
            signer: signer.counts()
        });
    }

    /* ------------------------------------------------------------
     * Login — the one place a password is checked, and the pair is minted
     * ---------------------------------------------------------- */

    /**
     * The workspace a login lands in: the one that was asked for, or the first
     * one the person belongs to. Someone else's workspace is not something a
     * caller gets to learn about, so the answer is the same `no-membership`
     * a stranger would get.
     */
    function pickWorkspace(userId, wantedId) {
        const mine = memberships.listForUser(userId);
        if (!mine.length) {
            return refuse(CODES.NO_MEMBERSHIP, "this account does not belong to a workspace");
        }

        const chosen = wantedId ? mine.find((entry) => entry.workspaceId === wantedId) : mine[0];
        if (!chosen) {
            return refuse(CODES.NO_MEMBERSHIP, "this account is not a member of that workspace");
        }

        const workspace = workspaces.findById(chosen.workspaceId);
        if (!workspace) {
            return refuse(CODES.WORKSPACE_NOT_FOUND, "that workspace does not exist");
        }

        return accept({ workspace, role: chosen.role });
    }

    /** One session row, and the pair of tokens that point at it. */
    function issue(userId, workspace, role, details = {}) {
        const at = now();
        const refresh = createOpaqueToken();
        const session = sessions.create({
            id: crypto.randomUUID(),
            userId,
            workspaceId: workspace.id,
            familyId: details.familyId || crypto.randomUUID(),
            tokenHash: hashToken(refresh),
            issuedAt: at,
            expiresAt: at + refreshTtlSec * 1000,
            userAgent: details.userAgent ?? null,
            ip: details.ip ?? null
        });

        return Object.freeze({
            access: signer.sign({ sub: userId, wid: workspace.id, role, sid: session.id }),
            refresh,
            accessExpiresAt: signer.expiresAt(),
            refreshExpiresAt: session.expiresAt,
            sessionId: session.id,
            familyId: session.familyId
        });
    }

    /** The answer every successful entry into the system shares. */
    function handedOver(row, workspace, role, pair) {
        return accept({
            user: publicUser(row),
            workspace: publicWorkspace(workspace),
            role,
            permissions: permissionsOf(role),
            access: pair.access,
            refresh: pair.refresh,
            accessExpiresAt: pair.accessExpiresAt,
            refreshExpiresAt: pair.refreshExpiresAt,
            sessionId: pair.sessionId,
            familyId: pair.familyId
        });
    }

    function login(input = {}) {
        const typed = typeof input.email === "string" ? input.email : "";
        const email = canonicalEmail(typed);
        const password = typeof input.password === "string" ? input.password : "";
        const at = now();
        const row = email ? users.findByEmail(email) : null;

        /*
         * A missing account costs the same work as a wrong password, so how
         * long the answer takes cannot be used to sort registered addresses
         * from unregistered ones.
         */
        const good = row ? verifyPassword(password, row.passwordHash) : (verifyPassword(password, dummyHash()), false);
        if (!row || !good) {
            /* The refusal reads the same either way, so the door still cannot be
             * used to ask who exists — but the trail is read by the reviewer of a
             * workspace, and a failed attempt against a known member is exactly
             * the fact that reviewer needs to find. So the row is attributed to
             * the workspace it belongs to, and that attribution stays internal:
             * it changes the audit entry, never the answer on the wire. */
            const home = row ? memberships.listForUser(row.id)[0] : null;
            return deny(CODES.INVALID_CREDENTIALS, "login", "the address or the password is wrong", {
                actorUserId: row ? row.id : null,
                workspaceId: home ? home.workspaceId : null,
                target: email || null,
                meta: { detail: row ? "bad-password" : "no-user" }
            });
        }
        if (row.status !== users.STATUS.ACTIVE) {
            return deny(CODES.USER_DISABLED, "login", "this account cannot log in yet", {
                actorUserId: row.id,
                target: email,
                meta: { status: row.status }
            });
        }

        const picked = pickWorkspace(row.id, input.workspaceId);
        if (!picked.ok) {
            return deny(picked.code, "login", picked.message, {
                actorUserId: row.id,
                target: email,
                meta: { workspaceId: input.workspaceId ?? null }
            });
        }

        if (needsRehash(row.passwordHash)) {
            const upgraded = hashPassword(password);
            if (upgraded.ok) users.updatePasswordHash(row.id, upgraded.encoded, at);
        }
        users.touchLogin(row.id, at);

        const pair = issue(row.id, picked.workspace, picked.role, input);
        counters.logins += 1;
        trace("login", "allow", {
            workspaceId: picked.workspace.id,
            actorUserId: row.id,
            target: email
        });

        return handedOver(users.findById(row.id), picked.workspace, picked.role, pair);
    }

    /* ------------------------------------------------------------
     * What a token means — stateless by default, and checked when asked
     * ---------------------------------------------------------- */

    /**
     * Read an access token. Offline is the default, because that is what makes
     * the token useful at the edge: the signature alone says who, in which
     * workspace, with which role, until when — and no database is touched.
     *
     * `online: true` also asks the tables, so the session must still be open,
     * the membership must still exist and the account must still be active. A
     * revoked family or a removed member therefore stops being accepted before
     * the access token would have expired on its own. Anything that changes
     * something is judged this way.
     */
    function inspect(token, options = {}) {
        const verified = signer.verify(token);
        if (!verified.ok) return verified;

        const claims = verified.claims;
        if (!options.online) {
            return accept({ claims, online: false, user: null, role: claims.role ?? null, session: null });
        }

        const at = now();
        const session = claims.sid ? sessions.findById(claims.sid) : null;
        const life = stateOf(session, at);
        if (!session || life !== STATE.OPEN) {
            return deny(CODES.TOKEN_INVALID, "inspect", "this session is no longer open", {
                actorUserId: claims.sub ?? null,
                workspaceId: claims.wid ?? null,
                meta: { state: life }
            });
        }

        const role = memberships.role(claims.wid, claims.sub);
        if (!role) {
            return deny(CODES.NO_MEMBERSHIP, "inspect", "this account is no longer a member of that workspace", {
                actorUserId: claims.sub ?? null,
                workspaceId: claims.wid ?? null
            });
        }

        const row = users.findById(claims.sub);
        if (!row || row.status !== users.STATUS.ACTIVE) {
            return deny(CODES.USER_DISABLED, "inspect", "this account is not active", {
                actorUserId: claims.sub ?? null,
                workspaceId: claims.wid ?? null,
                meta: { status: row ? row.status : null }
            });
        }

        return accept({
            claims,
            online: true,
            user: publicUser(row),
            role,
            permissions: permissionsOf(role),
            session,
            roleChanged: role !== claims.role
        });
    }

    /**
     * Who am I, here. The token is what is asked; the tables are what answers.
     * A role that changed after the token was signed is said out loud rather
     * than hidden, and the answer carries a token that matches the tables as
     * they are now — role changes take effect without waiting for a refresh.
     */
    function me(token) {
        const seen = inspect(token, { online: true });
        if (!seen.ok) return seen;

        const fresh = signer.sign({
            sub: seen.user.id,
            wid: seen.claims.wid,
            role: seen.role,
            sid: seen.session.id
        });

        return accept({
            user: seen.user,
            workspace: publicWorkspace(workspaces.findById(seen.claims.wid)),
            role: seen.role,
            permissions: seen.permissions,
            claims: seen.claims,
            roleChanged: seen.roleChanged,
            access: fresh,
            accessExpiresAt: signer.expiresAt(),
            sessionId: seen.session.id,
            familyId: seen.session.familyId
        });
    }

    /* ------------------------------------------------------------
     * Rotation, replay and logout — the family is the unit of trust
     * ---------------------------------------------------------- */

    /**
     * A refresh token that was already spent is not noise to shrug off: it
     * means the token exists in two places, so the whole family ends here — and
     * the fact is announced after the revocation has already happened.
     */
    function replay(row, life, action = "refresh") {
        const at = now();
        const revoked = sessions.revokeFamily(row.familyId, at, REASONS.REUSE_DETECTED);
        counters.reuseDetected += 1;
        trace(action, "deny", {
            workspaceId: row.workspaceId,
            actorUserId: row.userId,
            code: CODES.REFRESH_REUSE,
            meta: { familyId: row.familyId, state: life, revoked }
        });
        const seen = emit(REUSE_EVENT, {
            userId: row.userId,
            workspaceId: row.workspaceId,
            familyId: row.familyId,
            revoked,
            state: life,
            at
        });

        return Object.freeze({
            ...refuse(CODES.REFRESH_REUSE, "this refresh token was already used, so its family is revoked", {
                familyId: row.familyId,
                revoked,
                state: life
            }),
            event: REUSE_EVENT,
            listeners: seen
        });
    }

    /**
     * Trade a refresh token for a new pair: the old row is marked rotated and
     * the new one is born into the same family, so every token issued for one
     * login can be recognised — and ended — as one thing.
     */
    function refresh(input = {}) {
        const presented = typeof input.refresh === "string" ? input.refresh.trim() : "";
        if (!presented) {
            return deny(CODES.REFRESH_MISSING, "refresh", "a refresh token is required", {});
        }

        const at = now();
        const row = sessions.findByTokenHash(hashToken(presented));
        if (!row) {
            return deny(CODES.REFRESH_INVALID, "refresh", "this refresh token is not recognised", {});
        }

        const life = stateOf(row, at);
        if (life === STATE.ROTATED || life === STATE.REVOKED) return replay(row, life);
        if (life === STATE.EXPIRED) {
            return deny(CODES.REFRESH_EXPIRED, "refresh", "this refresh token has expired", {
                workspaceId: row.workspaceId,
                actorUserId: row.userId
            });
        }

        const user = users.findById(row.userId);
        if (!user || user.status !== users.STATUS.ACTIVE) {
            return deny(CODES.USER_DISABLED, "refresh", "this account cannot refresh its tokens", {
                workspaceId: row.workspaceId,
                actorUserId: row.userId,
                meta: { status: user ? user.status : null }
            });
        }

        const workspaceId = input.workspaceId || row.workspaceId;
        const role = memberships.role(workspaceId, row.userId);
        if (!role) {
            sessions.revokeFamily(row.familyId, at, REASONS.MEMBERSHIP_REMOVED);
            return deny(CODES.NO_MEMBERSHIP, "refresh", "this account is no longer a member of that workspace", {
                workspaceId,
                actorUserId: row.userId
            });
        }

        const workspace = workspaces.findById(workspaceId);
        if (!workspace) {
            return deny(CODES.WORKSPACE_NOT_FOUND, "refresh", "that workspace does not exist", {
                workspaceId,
                actorUserId: row.userId
            });
        }

        const pair = issue(row.userId, workspace, role, { ...input, familyId: row.familyId });
        const rotated = sessions.rotate(row.id, at);
        if (!rotated || rotated.rotatedAt !== at) {
            /* Another refresh won the race for this row. Two live pairs from one
             * token is exactly the state replay detection exists to prevent. */
            return replay(row, STATE.ROTATED);
        }

        counters.refreshes += 1;
        trace("refresh", "allow", {
            workspaceId,
            actorUserId: row.userId,
            meta: { familyId: row.familyId, sessionId: pair.sessionId }
        });

        return handedOver(users.findById(row.userId), workspace, role, pair);
    }

    /**
     * End the family this refresh token belongs to. Logout takes the whole
     * chain rather than the one row: every token along it was issued to the
     * same person for the same device, and leaving a rotated sibling alive
     * would leave a working key behind.
     */
    function logout(input = {}) {
        const presented = typeof input.refresh === "string" ? input.refresh.trim() : "";
        const row = presented ? sessions.findByTokenHash(hashToken(presented)) : null;
        if (!row) {
            return deny(CODES.REFRESH_INVALID, "logout", "this refresh token is not recognised", {});
        }

        const at = now();
        /* A spent row is not a sign-out. A token that was already rotated or
         * revoked is the very fact replay detection exists for — the token
         * exists in two places — so it is answered here exactly as `refresh`
         * answers it, rather than quietly ending the same family again. */
        const life = stateOf(row, at);
        if (life !== STATE.OPEN) return replay(row, life, "logout");

        const revoked = sessions.revokeFamily(row.familyId, at, REASONS.LOGOUT);
        counters.logouts += 1;
        trace("logout", "allow", {
            workspaceId: row.workspaceId,
            actorUserId: row.userId,
            meta: { familyId: row.familyId, revoked }
        });

        return accept({ revoked, familyId: row.familyId });
    }

    /* ------------------------------------------------------------
     * Tenancy — a role is what someone may do IN a workspace, nothing else
     * ---------------------------------------------------------- */

    /**
     * The one door every membership change walks through.
     *
     *   permission  comes from `rbac` — and the table is the authority. Today
     *               only `owner` holds `members:write`, so member management is
     *               an owner's job; an admin reads the roster, never writes it.
     *   rank        is the second half of the same rule: a role may never edit a
     *               member who outranks it, which is what keeps widening that
     *               table from silently handing a lesser role the right to edit
     *               a greater one.
     *
     * Acting on yourself is the one exception, and it is not a hole: you cannot
     * outrank yourself, and nothing you do to your own row can raise you above
     * the role you already hold. That is what makes leaving a workspace and
     * stepping down from ownership reachable at all.
     */
    function guard(actorUserId, workspaceId, permission, targetRole, targetUserId) {
        const actorRole = memberships.role(workspaceId, actorUserId);
        if (!actorRole) {
            return deny(CODES.NO_MEMBERSHIP, "members", "this account is not a member of that workspace", {
                workspaceId,
                actorUserId
            });
        }
        if (!allows(actorRole, permission)) {
            return deny(CODES.FORBIDDEN, "members", `this role may not ${permission}`, {
                workspaceId,
                actorUserId,
                meta: { role: actorRole, permission }
            });
        }

        const onSelf = typeof targetUserId === "string" && targetUserId === actorUserId;
        if (!onSelf && targetRole !== undefined && targetRole !== null && !outranks(actorRole, targetRole)) {
            return deny(CODES.OUTRANKED, "members", "this role does not outrank the one it is reaching for", {
                workspaceId,
                actorUserId,
                meta: { role: actorRole, target: targetRole }
            });
        }

        return accept({ role: actorRole });
    }

    /** Every workspace a person is in, with the role they are in it with. */
    function workspacesFor(userId) {
        const row = users.findById(userId);
        if (!row) {
            return deny(CODES.USER_NOT_FOUND, "workspaces", "no such account", { actorUserId: userId });
        }

        const list = memberships.listForUser(userId).map((entry) => Object.freeze({
            ...publicWorkspace(workspaces.findById(entry.workspaceId)),
            role: entry.role,
            permissions: permissionsOf(entry.role),
            joinedAt: entry.createdAt
        }));

        return accept({ user: publicUser(row), workspaces: Object.freeze(list) });
    }

    function members(actorUserId, workspaceId) {
        const opened = guard(actorUserId, workspaceId, PERMISSIONS.MEMBERS_READ);
        if (!opened.ok) return opened;

        return accept({
            workspace: publicWorkspace(workspaces.findById(workspaceId)),
            members: Object.freeze(memberships.listForWorkspace(workspaceId).map(publicMember))
        });
    }

    /**
     * End every open session a person has in one workspace. A role is a claim
     * inside an access token, so when it changes the tokens that carry the old
     * claim are closed: the next refresh re-reads the tables instead of
     * trusting what was signed minutes ago.
     */
    function closeSessions(userId, workspaceId, reason) {
        const at = now();
        let closed = 0;

        for (const row of sessions.listForUser(userId)) {
            if (row.workspaceId === workspaceId && stateOf(row, at) === STATE.OPEN) {
                sessions.revoke(row.id, at, reason);
                closed += 1;
            }
        }

        return closed;
    }

    /** The last owner is not a role change; it is a tenant nobody can enter. */
    function ownerCount(workspaceId) {
        return memberships.countOfRole(workspaceId, ROLES.OWNER);
    }

    /**
     * Bring someone into a workspace. An address that already has an account
     * simply joins; a new address becomes an account that cannot log in yet —
     * `invited`, holding a hash of a password nobody knows — until an owner
     * sets one through `setPassword`, which is the point of that state.
     */
    function invite(actorUserId, workspaceId, input = {}) {
        const wantedRole = typeof input.role === "string" ? input.role : ROLES.VIEWER;
        if (!isRole(wantedRole)) {
            return deny(CODES.UNKNOWN_ROLE, "invite", `no such role: ${wantedRole}`, {
                workspaceId,
                actorUserId,
                meta: { role: wantedRole }
            });
        }

        const opened = guard(actorUserId, workspaceId, PERMISSIONS.MEMBERS_WRITE, wantedRole);
        if (!opened.ok) return opened;

        if (!workspaces.findById(workspaceId)) {
            return deny(CODES.WORKSPACE_NOT_FOUND, "invite", "that workspace does not exist", {
                workspaceId,
                actorUserId
            });
        }
        if (memberships.listForWorkspace(workspaceId).length >= maxMembers) {
            return deny(CODES.MEMBER_LIMIT, "invite", `a workspace holds at most ${maxMembers} members`, {
                workspaceId,
                actorUserId,
                meta: { maxMembers }
            });
        }

        const typed = typeof input.email === "string" ? input.email : "";
        const email = canonicalEmail(typed);
        if (!isEmail(typed)) {
            return deny(CODES.INVALID_EMAIL, "invite", "that is not an email address", {
                workspaceId,
                actorUserId,
                target: email || null
            });
        }

        const existing = users.findByEmail(email);
        if (existing && memberships.isMember(workspaceId, existing.id)) {
            return deny(CODES.ALREADY_MEMBER, "invite", "this account is already in the workspace", {
                workspaceId,
                actorUserId,
                target: email
            });
        }

        const at = now();
        const invited = existing || users.create({
            id: crypto.randomUUID(),
            email: typed.trim(),
            emailNormalized: email,
            passwordHash: dummyHash(),
            status: users.STATUS.INVITED,
            at
        });

        const membership = memberships.add({ workspaceId, userId: invited.id, role: wantedRole, at });
        counters.invited += 1;
        trace("invite", "allow", {
            workspaceId,
            actorUserId,
            target: email,
            meta: { role: wantedRole, accountCreated: !existing }
        });

        return accept({
            created: !existing,
            member: publicMember({ ...membership, email: invited.email, status: invited.status })
        });
    }

    function changeRole(actorUserId, workspaceId, targetUserId, role) {
        if (!isRole(role)) {
            return deny(CODES.UNKNOWN_ROLE, "change-role", `no such role: ${role}`, {
                workspaceId,
                actorUserId,
                meta: { role }
            });
        }

        const current = memberships.find(workspaceId, targetUserId);
        if (!current) {
            return deny(CODES.NOT_A_MEMBER, "change-role", "this account is not in the workspace", {
                workspaceId,
                actorUserId,
                target: targetUserId
            });
        }

        const opened = guard(actorUserId, workspaceId, PERMISSIONS.MEMBERS_WRITE, current.role, targetUserId);
        if (!opened.ok) return opened;

        /* Asking for the role that is already there grants nothing, so it is not
         * judged as a grant: it is a no-op, and saying so is more honest than a
         * refusal that would read like a failed escalation. */
        if (current.role === role) {
            return accept({ member: publicMember(current), changed: false, closedSessions: 0 });
        }
        /* A role may hand out any rank up to and including its own. The guard
         * above already refused editing anybody who outranks the caller, so the
         * one equal case left is the second owner — which is exactly what makes
         * stepping down from ownership reachable at all. */
        if (rankOf(role) > rankOf(opened.role)) {
            return deny(CODES.OUTRANKED, "change-role", "this role cannot hand out one above its own", {
                workspaceId,
                actorUserId,
                target: targetUserId,
                meta: { role: opened.role, to: role }
            });
        }
        if (current.role === ROLES.OWNER && ownerCount(workspaceId) <= 1) {
            return deny(CODES.LAST_OWNER, "change-role", "the last owner cannot be demoted", {
                workspaceId,
                actorUserId,
                target: targetUserId,
                meta: { from: current.role, to: role }
            });
        }

        const updated = memberships.updateRole(workspaceId, targetUserId, role, now());
        const closed = closeSessions(targetUserId, workspaceId, REASONS.MEMBERSHIP_REMOVED);
        trace("change-role", "allow", {
            workspaceId,
            actorUserId,
            target: targetUserId,
            meta: { from: current.role, to: role, closedSessions: closed }
        });

        return accept({ member: publicMember(updated), changed: true, closedSessions: closed });
    }

    function removeMember(actorUserId, workspaceId, targetUserId) {
        const current = memberships.find(workspaceId, targetUserId);
        if (!current) {
            return deny(CODES.NOT_A_MEMBER, "remove-member", "this account is not in the workspace", {
                workspaceId,
                actorUserId,
                target: targetUserId
            });
        }

        /* Leaving is not a privilege: anyone may end their own membership. It is
         * still bounded — the last owner may not, or the workspace would be left
         * with nobody who could ever let anyone back in. */
        const leaving = actorUserId === targetUserId;
        if (!leaving) {
            const opened = guard(actorUserId, workspaceId, PERMISSIONS.MEMBERS_WRITE, current.role, targetUserId);
            if (!opened.ok) return opened;
        }
        if (current.role === ROLES.OWNER && ownerCount(workspaceId) <= 1) {
            return deny(CODES.LAST_OWNER, "remove-member", "the last owner cannot be removed", {
                workspaceId,
                actorUserId,
                target: targetUserId,
                meta: { role: current.role }
            });
        }

        const removed = memberships.remove(workspaceId, targetUserId);
        const closed = closeSessions(targetUserId, workspaceId, REASONS.MEMBERSHIP_REMOVED);
        trace("remove-member", "allow", {
            workspaceId,
            actorUserId,
            target: targetUserId,
            meta: { role: current.role, closedSessions: closed }
        });

        return accept({ removed: removed === 1, closedSessions: closed });
    }

    /**
     * Give an account a password. This is how an `invited` account becomes
     * usable, which is why the state exists at all: an owner sets it, and the
     * person it belongs to never has to be told a secret out of band. The
     * target's sessions in that workspace end afterwards — whoever
     * they are, the key just changed.
     */
    function setPassword(actorUserId, workspaceId, targetUserId, password) {
        const current = memberships.find(workspaceId, targetUserId);
        if (!current) {
            return deny(CODES.NOT_A_MEMBER, "set-password", "this account is not in the workspace", {
                workspaceId,
                actorUserId,
                target: targetUserId
            });
        }

        const opened = guard(actorUserId, workspaceId, PERMISSIONS.MEMBERS_WRITE, current.role, targetUserId);
        if (!opened.ok) return opened;

        const weak = checkPassword(password);
        if (weak) {
            return deny(weak.code, "set-password", weak.message, {
                workspaceId,
                actorUserId,
                target: targetUserId,
                meta: { detail: weak.detail ?? null }
            });
        }

        const row = users.findById(targetUserId);
        if (!row) {
            return deny(CODES.USER_NOT_FOUND, "set-password", "no such account", {
                workspaceId,
                actorUserId,
                target: targetUserId
            });
        }

        const at = now();
        const activated = row.status === users.STATUS.INVITED;
        users.updatePasswordHash(targetUserId, hashPassword(password).encoded, at);
        if (activated) users.updateStatus(targetUserId, users.STATUS.ACTIVE, at);

        const closed = closeSessions(targetUserId, workspaceId, REASONS.LOGOUT);
        trace("set-password", "allow", {
            workspaceId,
            actorUserId,
            target: targetUserId,
            meta: { activated, closedSessions: closed }
        });

        return accept({
            user: publicUser(users.findById(targetUserId)),
            activated,
            closedSessions: closed
        });
    }

    /**
     * Changing one's own password ends every session one had, including the one
     * that asked: a password is what a session is rebuilt from, so leaving the
     * old ones alive would defeat the point of changing it. The caller logs in
     * again with the new password.
     */
    function changeOwnPassword(userId, currentPassword, nextPassword) {
        const row = users.findById(userId);
        if (!row) {
            return deny(CODES.USER_NOT_FOUND, "change-password", "no such account", { actorUserId: userId });
        }

        const good = verifyPassword(typeof currentPassword === "string" ? currentPassword : "", row.passwordHash);
        if (!good) {
            return deny(CODES.INVALID_CREDENTIALS, "change-password", "the current password is wrong", {
                actorUserId: userId,
                target: row.email
            });
        }

        const weak = checkPassword(nextPassword);
        if (weak) {
            return deny(weak.code, "change-password", weak.message, {
                actorUserId: userId,
                target: row.email,
                meta: { detail: weak.detail ?? null }
            });
        }

        const at = now();
        users.updatePasswordHash(userId, hashPassword(nextPassword).encoded, at);

        let closed = 0;
        for (const mine of memberships.listForUser(userId)) {
            closed += closeSessions(userId, mine.workspaceId, REASONS.LOGOUT);
        }

        trace("change-password", "allow", {
            actorUserId: userId,
            target: row.email,
            meta: { closedSessions: closed }
        });

        return accept({ user: publicUser(users.findById(userId)), closedSessions: closed });
    }

    /* ------------------------------------------------------------
     * What was decided, and the proof that it was not edited since
     * ---------------------------------------------------------- */

    /** Newest first, one workspace or the whole system. Reading is a right. */
    function trail(actorUserId, options = {}) {
        const wanted = options.workspaceId ?? null;
        if (wanted) {
            const opened = guard(actorUserId, wanted, PERMISSIONS.AUDIT_READ);
            if (!opened.ok) return opened;
        } else if (options.anyWorkspace) {
            const row = users.findById(actorUserId);
            if (!row || row.status !== users.STATUS.ACTIVE) {
                return deny(CODES.USER_DISABLED, "trail", "this account may not read the whole trail", {
                    actorUserId
                });
            }
        } else {
            return deny(CODES.FORBIDDEN, "trail", "reading the trail needs a workspace, or anyWorkspace", {
                actorUserId
            });
        }

        return accept({ entries: audit.trail(options), counts: audit.counts() });
    }

    /** Walk the hash chain: `ok: false` names the first row that does not fit. */
    function verifyAudit() {
        return accept({ audit: audit.verify() });
    }

    /* ------------------------------------------------------------
     * The layer, as one object
     * ---------------------------------------------------------- */

    return Object.freeze({
        /* who is in the system, and how they get in */
        register,
        login,
        refresh,
        logout,
        me,
        inspect,
        allows,

        /* the one door a gateway or a vault asks before it acts */
        authorize,

        /* who is in a workspace, and what they may do there */
        workspacesFor,
        members,
        invite,
        changeRole,
        removeMember,
        setPassword,
        changeOwnPassword,

        /* the trail, and it is not taken on trust */
        trail,
        verifyAudit,

        /* the seams a gateway and a test both need */
        on,
        stats,
        events: Object.freeze({ REUSE_EVENT }),
        core: Object.freeze({ CODES, ROLES, PERMISSIONS, STATE, REASONS }),
        stores: Object.freeze({ users, workspaces, memberships, sessions, audit, signer })
    });
}

module.exports = { createIdentity, ACCESS_TTL_SEC, REFRESH_TTL_SEC, MAX_MEMBERS, REUSE_EVENT };

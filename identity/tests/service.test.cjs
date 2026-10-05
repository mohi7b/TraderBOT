/**
 * D1 — Identity: the core, the stores, and every decision the service makes
 * identity/core/email.cjs      (what an address is, and is not)
 * identity/core/password.cjs   (what a password is, and what is kept of it)
 * identity/core/rbac.cjs       (who may do what, ranked)
 * identity/core/errors.cjs     (one vocabulary of refusals)
 * identity/core/tokens.cjs     (an access token, signed and read back)
 * identity/store/*.cjs         (five tables, and the schema that holds them)
 * identity/service.cjs         (every decision an identity layer makes)
 * ============================================================
 * The seam test next door (gateway/tests/seam-identity-gateway.test.cjs) asks
 * whether a request that arrived over HTTP ended up in these tables. This file
 * asks the question underneath it: does the identity layer keep its own
 * promises, with no socket anywhere near it? They are short enough to write
 * down, so this file does, one section at a time, with nothing but `assert`
 * and a counter:
 *
 *   1. an account is made once — one mailbox, one row, one hash, and the hash
 *      never leaves — and registering is also a workspace with an owner in it;
 *   2. signing in says the same thing for a wrong password and for an address
 *      nobody has, so the door cannot be used to ask who exists;
 *   3. an access token is a claim, not a trust: a tampered payload, a foreign
 *      key and an expired clock are refused before a single table is read, and
 *      the offline reader is exactly that — offline;
 *   4. a refresh rotates, a rotated token used twice ends its whole family,
 *      and that is published as an event rather than swallowed;
 *   5. roles are ranked, nobody outranks themselves, and that exception is the
 *      only reason stepping down and walking away are reachable at all;
 *   6. the last owner cannot leave the workspace ownerless, and that refusal is
 *      written down like every other decision;
 *   7. an invitation is a wait, not a weak password: an invited account cannot
 *      sign in until an owner gives it a password of its own;
 *   8. the roster belongs to the tenant: a member of one workspace reads
 *      nothing of another, and no hash rides out with the list;
 *   9. every decision — allow and deny alike — lands in a hash-chained trail
 *      that notices when a row is edited underneath it;
 *  10. a password can be changed by the person it belongs to, and the sessions
 *      opened with the old one end when it does.
 *
 * Run: node identity/tests/service.test.cjs
 *      node identity/tests/run-all.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const { migrate } = require(path.join(ROOT, "store", "schema.cjs"));
const { CODES } = require(path.join(ROOT, "core", "errors.cjs"));
const { canonicalEmail } = require(path.join(ROOT, "core", "email.cjs"));
const { createIdentity, ACCESS_TTL_SEC, REFRESH_TTL_SEC, REUSE_EVENT } = require(path.join(ROOT, "service.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `D1: ${msg}`);
    checks += 1;
};

/* ------------------------------------------------------------
 * A layer per section, over a clock this file owns
 * ---------------------------------------------------------- */

/**
 * Each section gets its own in-memory database and its own clock, so nothing
 * here depends on the order the sections run in — or on how long a scrypt hash
 * takes on the box it runs on. `advance` moves that clock, which is how "an
 * hour later" and "the token expired" cost nothing.
 */
function harness(start = 1_700_000_000_000, options = {}) {
    const db = new Database(":memory:");
    migrate(db);
    const clock = { t: start, advance(ms) { this.t += ms; return this.t; } };
    const identity = createIdentity({ db, now: () => clock.t, secret: "s".repeat(32), ...options });
    return { db, clock, identity };
}

/** Rows in a table, counted the one way this file counts them. */
const rows = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

/** The refusal a call produced, or `null` when it succeeded. The whole refusal
 *  comes through, not just its code, because some refusals carry more than a
 *  verdict — a replayed refresh names the family it ended, for instance. */
const refusal = (result) => (result.ok ? null : result);

/* ------------------------------------------------------------
 * 1. One address, one account, one hash that stays in
 * ---------------------------------------------------------- */

function oneAddressOneAccount() {
    const { identity, db } = harness();

    const reg = identity.register({ email: " Owner@Example.COM ", password: "Correct-Horse-9" });
    ok(reg.ok, "an address nobody has used registers");
    ok(reg.user.email === "Owner@Example.COM", "the address is kept as it was typed, minus the space around it");
    ok(reg.user.status === "active", "a registration is an active account");
    ok(reg.user.lastLoginAt === null, "one that has never signed in");
    ok(!("passwordHash" in reg.user) && !("emailNormalized" in reg.user), "what leaves the layer is the public person, never the hash");
    ok(typeof reg.user.id === "string" && reg.user.id.length === 36, "the account has an id of its own");

    const row = identity.stores.users.findByEmail("owner@example.com");
    ok(row !== null && /^scrypt\$/.test(row.passwordHash), "the table holds a scrypt hash, not the password");
    ok(row.passwordHash !== "Correct-Horse-9" && !row.passwordHash.includes("Correct-Horse-9"), "and the password is nowhere inside it");
    ok(row.emailNormalized === "owner@example.com", "the mailbox is what is unique, so the row is found by the normalised spelling");

    ok(reg.member.role === "owner", "registering is also a workspace with someone in it");
    ok(reg.member.userId === reg.user.id, "and that someone is the person who registered");
    ok(reg.workspace.ownerUserId === reg.user.id, "named as the owner of it");
    ok(reg.workspace.slug === "owner-s-workspace", "with a slug derived from the address, so the workspace has a name a URL can carry");
    ok(identity.stores.memberships.countOfRole(reg.workspace.id, "owner") === 1, "exactly one owner, which is what the last-owner rule has to protect");
    ok(reg.member.permissions.includes("members:write"), "and the owner may write the roster, which no other role may");

    ok(refusal(identity.register({ email: "owner@example.com", password: "Correct-Horse-9" })).code === CODES.EMAIL_TAKEN,
        "the same mailbox in another spelling is taken");
    ok(refusal(identity.register({ email: "other@example.com", password: "short" })).code === CODES.WEAK_PASSWORD,
        "a password too short to be worth hashing is refused");
    ok(refusal(identity.register({ email: "other@example.com", password: "        " })).code === CODES.WEAK_PASSWORD,
        "and one that is only spaces");
    ok(refusal(identity.register({ email: "not-an-address", password: "Correct-Horse-9" })).code === CODES.INVALID_EMAIL,
        "an address that is not an address is refused before anything is written");
    ok(refusal(identity.register({})).code === CODES.INVALID_EMAIL, "a registration with nothing in it is refused the same way");

    ok(rows(db, "users") === 1 && rows(db, "workspaces") === 1, "every refusal above wrote nothing at all");
    ok(identity.stats().registrations === 1, "one registration was counted, not five");
    ok(identity.stores.users.isTaken(canonicalEmail(" OWNER@example.COM ")) === true,
        "the index answers by mailbox rather than by spelling, once the address has been made canonical");
    ok(identity.stores.users.isTaken("OWNER@example.com") === false,
        "and the store normalises nothing itself: that rule lives in one place, and it is not this table");
}

/* ------------------------------------------------------------
 * 2. The door says nothing about who exists
 * ---------------------------------------------------------- */

function theDoorSaysNothingAboutWhoExists() {
    const { identity, clock } = harness();
    const reg = identity.register({ email: "trader@example.com", password: "Correct-Horse-9" });

    const wrong = refusal(identity.login({ email: "trader@example.com", password: "Correct-Horse-8" }));
    const missing = refusal(identity.login({ email: "nobody@example.com", password: "Correct-Horse-9" }));
    ok(wrong !== null && missing !== null, "a wrong password and an address nobody has are both refused");
    ok(wrong.code === CODES.INVALID_CREDENTIALS && missing.code === CODES.INVALID_CREDENTIALS, "with the same code");
    ok(wrong.message === missing.message, "and the same words, so the door cannot be used to ask who exists");
    ok(identity.stats().logins === 0, "neither of them counted as a sign-in");

    const login = identity.login({ email: " TRAder@Example.Com ", password: "Correct-Horse-9" });
    ok(login.ok, "the address signs in whatever its spacing and case");
    ok(login.user.id === reg.user.id, "as the account that owns it");
    ok(login.role === "owner" && login.permissions.includes("members:write"), "carrying the role, and what that role may do");
    ok(login.workspace.id === reg.workspace.id, "inside the workspace that registration made");
    ok(typeof login.access === "string" && typeof login.refresh === "string" && login.access !== login.refresh, "handing back two secrets: an access token and a refresh token");
    ok(login.accessExpiresAt === clock.t + ACCESS_TTL_SEC * 1000, "the access token lives for the access lifetime and no longer");
    ok(login.refreshExpiresAt === clock.t + REFRESH_TTL_SEC * 1000, "the refresh token for the refresh lifetime");
    ok(login.user.lastLoginAt === clock.t, "the sign-in is stamped on the account");
    ok(identity.stores.users.findById(reg.user.id).lastLoginAt === clock.t, "in the table, not only in the answer");
    ok(identity.stats().logins === 1, "and counted once");

    const me = identity.me(login.access);
    ok(me.ok, "the access token reads back as the person it was issued to");
    ok(me.user.id === reg.user.id && me.role === "owner", "with the same account and the same role");
    ok(me.roleChanged === false, "because the role the token claims is still the role in the table");
    ok(me.sessionId === login.sessionId && me.familyId === login.familyId, "the session is the one that signing in opened");
    ok(me.access !== login.access, "reading it back hands out a fresh access token rather than the same one");
    ok(me.claims && me.claims.typ === "access" && me.claims.sub === reg.user.id, "and its claims say what kind of token it is and who it is for");

    /* The offline reader is the one an edge can afford: it verifies the
     * signature and nothing else, which is exactly why it may never be believed
     * about whether a session is still open. */
    const offline = identity.inspect(login.access);
    ok(offline.ok && offline.online === false && offline.user === null, "the offline reader answers without reading a single table");
    ok(offline.claims.jti === me.claims.jti && offline.claims.wid === reg.workspace.id, "and says what the token was signed with, including which workspace it is for");

    const online = identity.inspect(login.access, { online: true });
    ok(online.ok && online.online === true, "the online reader answers with the tables");
    ok(online.user.id === reg.user.id && online.role === "owner", "which is where the person and their role come from");
    ok(online.roleChanged === false && online.session !== null, "the session it names is open, and the role has not moved under it");

    ok(refusal(identity.inspect("not-a-token")).code === CODES.TOKEN_INVALID, "a string that is not a token is refused as one");
    ok(refusal(identity.me("a.b.c")).code === CODES.TOKEN_INVALID, "and so is anything merely shaped like one");
}

/* ------------------------------------------------------------
 * 3. An access token is a claim, not a trust
 * ---------------------------------------------------------- */

function anAccessTokenIsAClaimNotATrust() {
    const { identity, clock, db } = harness();
    const reg = identity.register({ email: "trader@example.com", password: "Correct-Horse-9" });
    const login = identity.login({ email: "trader@example.com", password: "Correct-Horse-9" });
    const [header, payload, signature] = login.access.split(".");

    /* A payload edited in flight, and a signature edited in flight: the first
     * changes what the token says, the second changes who said it. Neither is
     * a token here, and neither is refused politely — they are refused. */
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const rewritten = Buffer.from(JSON.stringify({ ...claims, sub: "someone-else" })).toString("base64url");
    ok(refusal(identity.inspect(`${header}.${rewritten}.${signature}`)).code === CODES.TOKEN_INVALID,
        "a payload edited in flight is refused, however plausible it now reads");
    ok(refusal(identity.me(`${header}.${rewritten}.${signature}`)).code === CODES.TOKEN_INVALID,
        "and the reader that has the tables refuses it too");
    ok(refusal(identity.inspect(`${header}.${payload}.${signature.slice(0, -2)}xy`)).code === CODES.TOKEN_INVALID,
        "a signature edited in flight is refused");
    ok(refusal(identity.inspect(`${header}.${payload}`)).code === CODES.TOKEN_INVALID, "and so is a token with a piece missing");

    const stranger = createIdentity({ db, now: () => clock.t, secret: "x".repeat(32) });
    ok(stranger.ok === undefined && refusal(stranger.inspect(login.access)).code === CODES.TOKEN_INVALID,
        "a token signed under another key is not a token here: that verdict belongs to the key, not to the caller");
    ok(refusal(stranger.me(login.access)).code === CODES.TOKEN_INVALID, "the reader with the tables agrees, for the same reason");

    /* Signing out ends the family, and the offline reader is allowed to be
     * wrong about it: it holds no tables, so it cannot know. What it must never
     * do is claim otherwise to the layer that does. */
    const out = identity.logout({ refresh: login.refresh });
    ok(out.ok && out.familyId === login.familyId, "signing out names the family it ended");
    ok(identity.inspect(login.access).ok, "the offline reader still decodes that token — it has no tables to ask");
    ok(refusal(identity.me(login.access)).code === CODES.TOKEN_INVALID, "while the online reader knows the session is closed");

    const second = identity.login({ email: "trader@example.com", password: "Correct-Horse-9" });
    /* Past the lifetime, and past the thirty seconds of clock skew the verifier
     * forgives, so this is the expiry talking and not a boundary. */
    clock.advance((ACCESS_TTL_SEC + 60) * 1000);
    ok(refusal(identity.me(second.access)).code === CODES.TOKEN_EXPIRED, "an access token whose lifetime is up says expired, not invalid");
    const rotated = identity.refresh({ refresh: second.refresh });
    ok(rotated.ok, "while its refresh token, which lives far longer, still opens a new session");
    ok(rotated.sessionId !== second.sessionId, "and that new session is a different one");

    /* An account that is switched off stops working at the next online read,
     * without waiting for anything to expire. */
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(reg.user.id);
    ok(refusal(identity.login({ email: "trader@example.com", password: "Correct-Horse-9" })).code === CODES.USER_DISABLED,
        "a disabled account cannot sign in, even with the right password");
    ok(refusal(identity.inspect(rotated.access, { online: true })).code === CODES.USER_DISABLED,
        "and a token it already holds stops working at the next online read");
    ok(identity.inspect(rotated.access).ok, "though offline there is still nothing to tell but the signature");

    clock.advance(REFRESH_TTL_SEC * 1000);
    ok(refusal(identity.refresh({ refresh: rotated.refresh })).code === CODES.REFRESH_EXPIRED,
        "and a refresh token whose thirty days are up says expired rather than invalid");
}

/* ------------------------------------------------------------
 * 4. A refresh rotates, and reuse ends the family
 * ---------------------------------------------------------- */

function aRefreshRotatesAndReuseEndsTheFamily() {
    const { identity, clock } = harness();
    identity.register({ email: "trader@example.com", password: "Correct-Horse-9" });
    const login = identity.login({ email: "trader@example.com", password: "Correct-Horse-9" });
    const published = [];
    identity.on(REUSE_EVENT, (event) => published.push(event));

    ok(refusal(identity.refresh({})).code === CODES.REFRESH_MISSING, "a refresh with no token is refused as missing");
    ok(refusal(identity.refresh({ refresh: "not-a-refresh-token" })).code === CODES.REFRESH_INVALID,
        "a token nobody has ever seen is refused as invalid, which is not the same thing");

    const rotated = identity.refresh({ refresh: login.refresh });
    ok(rotated.ok, "a refresh token opens a new session");
    ok(rotated.refresh !== login.refresh, "and hands back a new refresh token rather than the same one");
    ok(rotated.access !== login.access && rotated.sessionId !== login.sessionId, "with a new access token, pointing at a new session");
    ok(rotated.user.id === login.user.id && rotated.role === "owner", "for the same person, in the same role, in the same workspace");
    ok(rotated.workspace.id === login.workspace.id, "and no other workspace can be named into existence by a token");
    ok(rotated.permissions.length === login.permissions.length, "carrying what the role may do, the way every entrance does");
    ok(identity.stores.sessions.findById(login.sessionId).rotatedAt === clock.t,
        "the token that was spent is marked as spent, so a second use is a fact and not a mystery");

    /* The same token twice is the one signal that cannot be explained away: it
     * means the token exists in two places. The family is the unit of trust, so
     * the family is what ends — including the session the rotation just opened,
     * because a thief and their victim are not told apart. */
    const replay = refusal(identity.refresh({ refresh: login.refresh }));
    ok(replay.code === CODES.REFRESH_REUSE, "using it a second time is refused as reuse");
    ok(replay.familyId === login.familyId, "naming the family");
    ok(replay.state === "rotated", "and saying which state the spent row was in");
    ok(replay.revoked === 2, "and that both rows of the family were revoked");
    ok(published.length === 1 && published[0].familyId === login.familyId, "the fact is published to whoever is watching, once");
    ok(published[0].revoked === 2 && published[0].state === "rotated" && published[0].userId === login.user.id,
        "with enough in the event for a monitor to count it without reading the tables");
    ok(identity.stats().reuseDetected === 1, "and the counter agrees with the event");
    ok(identity.stats().refusals >= 1, "while a refusal that is not one of the audited few is still counted");
    ok(refusal(identity.me(rotated.access)).code === CODES.TOKEN_INVALID, "so the fresh token the rotation handed out is dead too");
    ok(refusal(identity.refresh({ refresh: rotated.refresh })).code === CODES.REFRESH_REUSE, "and its refresh token replays rather than being merely invalid");

    /* Signing out is the same machinery, pointed at the peaceful case. */
    const third = identity.login({ email: "trader@example.com", password: "Correct-Horse-9" });
    const out = identity.logout({ refresh: third.refresh });
    ok(out.ok && out.revoked === 1 && out.familyId === third.familyId, "signing out ends the family the token names");
    ok(published.length === 2, "and is not a reuse, so it is not published: a sign-out is not news");

    const again = refusal(identity.logout({ refresh: third.refresh }));
    ok(again.code === CODES.REFRESH_REUSE && again.state === "revoked",
        "while the same token afterwards is a replay, because a revoked family is not a second chance");
    ok(again.familyId === third.familyId && again.revoked === 0,
        "naming the family it was already in, with nothing left in it to end");
    ok(published.length === 3 && published[2].familyId === third.familyId,
        "published where every other replay is published — one rule for a spent token, whichever door it arrives at");
    ok(refusal(identity.logout({})).code === CODES.REFRESH_INVALID, "signing out with nothing is refused like any unknown token");
    ok(identity.stats().logouts === 1, "and one sign-out was counted, not three: a replay is not a sign-out");
}

/* ------------------------------------------------------------
 * 5. Roles are ranked, and nobody outranks themselves
 * ---------------------------------------------------------- */

function rolesAreRankedAndNobodyOutranksThemselves() {
    const { identity } = harness();
    const reg = identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "The Desk" });
    const ws = reg.workspace.id;
    const boss = reg.user.id;

    ok(identity.allows("owner", "secrets:write") && !identity.allows("admin", "secrets:write"),
        "an owner holds what reaches a venue key, and an admin never does");
    ok(identity.allows("admin", "strategy:write") && !identity.allows("viewer", "strategy:write"),
        "an admin builds strategies, and a viewer reads them");
    ok(identity.allows("operator", "bot:control") && !identity.allows("viewer", "bot:control"),
        "an operator runs the bots that exist, and a viewer starts nothing");
    ok(!identity.allows("nobody", "workspace:read") && !identity.allows("owner", "nonsense:read"),
        "an unknown role, or a permission that does not exist, is not a permission");

    const admin = identity.invite(boss, ws, { email: "admin@example.com", role: "admin" });
    ok(admin.ok && admin.created && admin.member.role === "admin", "an owner brings an admin in");
    const person = admin.member.userId;
    const activated = identity.setPassword(boss, ws, person, "Correct-Horse-9");
    ok(activated.ok && activated.activated, "and gives the invitation a password, which is the only thing that makes it usable");

    const adminLogin = identity.login({ email: "admin@example.com", password: "Correct-Horse-9", workspaceId: ws });
    ok(adminLogin.ok && adminLogin.role === "admin", "who can now sign in, as an admin");

    ok(refusal(identity.invite(boss, ws, { email: "ghost@example.com", role: "wizard" })).code === CODES.UNKNOWN_ROLE,
        "a role nobody has cannot be handed out");
    ok(refusal(identity.changeRole(boss, ws, person, "wizard")).code === CODES.UNKNOWN_ROLE,
        "and cannot be moved to, either");

    /* The permission table, not this file, is the authority: only an owner
     * holds `members:write`, so an admin reads the roster and writes nothing. */
    ok(identity.members(person, ws).ok, "an admin reads the roster");
    ok(refusal(identity.invite(person, ws, { email: "another@example.com", role: "viewer" })).code === CODES.FORBIDDEN,
        "and cannot invite, because that is members:write");
    ok(refusal(identity.changeRole(person, ws, person, "owner")).code === CODES.FORBIDDEN,
        "which is also why nobody promotes themselves");

    const promoted = identity.changeRole(boss, ws, person, "owner");
    ok(promoted.ok && promoted.changed && promoted.member.role === "owner", "an owner hands out ownership");
    ok(promoted.closedSessions === 1, "and the sessions opened with the old role end with it");
    ok(refusal(identity.me(adminLogin.access)).code === CODES.TOKEN_INVALID,
        "so a token carrying the role that was taken away is not a token to be spent");

    /* Rank is strict: equal roles are not outranked, so two owners can neither
     * edit nor demote each other — the second owner is what makes stepping down
     * possible in the first place. */
    ok(refusal(identity.changeRole(person, ws, boss, "admin")).code === CODES.OUTRANKED,
        "an owner does not outrank an owner, so one cannot edit the other");
    ok(identity.changeRole(person, ws, person, "owner").changed === false,
        "while asking for the role one already holds is a no-op, not a refusal");

    const stepped = identity.changeRole(boss, ws, boss, "viewer");
    ok(stepped.ok && stepped.changed && stepped.member.role === "viewer",
        "an owner may step down, because that exception is the only reason stepping down is reachable");
    ok(refusal(identity.changeRole(boss, ws, person, "viewer")).code === CODES.FORBIDDEN,
        "and having stepped down cannot touch anyone else");
    ok(refusal(identity.changeRole(boss, ws, boss, "owner")).code === CODES.FORBIDDEN,
        "least of all climb back up");

    const outsider = identity.register({ email: "outsider@example.com", password: "Correct-Horse-9" });
    ok(refusal(identity.members(outsider.user.id, ws)).code === CODES.NO_MEMBERSHIP,
        "someone who is only in another workspace is not a member of this one");
    ok(refusal(identity.removeMember(outsider.user.id, ws, person)).code === CODES.NO_MEMBERSHIP,
        "and cannot reach in to remove anybody");

    const left = identity.removeMember(boss, ws, boss);
    ok(left.ok && left.removed === true, "anyone may walk away from their own membership");
    ok(refusal(identity.removeMember(boss, ws, boss)).code === CODES.NOT_A_MEMBER, "once, not twice");
}

/* ------------------------------------------------------------
 * 6. The last owner cannot be removed
 * ---------------------------------------------------------- */

function theLastOwnerCannotBeRemoved() {
    const { identity } = harness();
    const reg = identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "The Desk" });
    const ws = reg.workspace.id;
    const boss = reg.user.id;

    ok(refusal(identity.changeRole(boss, ws, boss, "admin")).code === CODES.LAST_OWNER,
        "the only owner cannot be demoted: the workspace would be left with nobody who could ever let anyone back in");
    ok(refusal(identity.removeMember(boss, ws, boss)).code === CODES.LAST_OWNER,
        "and cannot walk away for the same reason, which is the one bound on leaving");
    ok(identity.members(boss, ws).members.filter((entry) => entry.role === "owner").length === 1,
        "so after both refusals the workspace still holds the owner it started with");

    /* A refusal is a decision like any other: it is written down where it was
     * made, with the code that names it — the last owner is not protected by a
     * check nobody can audit. */
    const denied = identity.trail(boss, { workspaceId: ws }).entries.filter((entry) => entry.outcome === "deny");
    ok(denied.length === 2, "both refusals are in the trail, and nothing else in this section was refused");
    const demotion = denied.find((entry) => entry.action === "change-role");
    ok(demotion && demotion.code === CODES.LAST_OWNER && demotion.actorUserId === boss && demotion.target === boss,
        "naming the caller, the workspace and the code that stopped it");
    ok(denied.every((entry) => entry.workspaceId === ws && entry.hash && entry.prevHash), "each row carrying its own hash and the one before");
    ok(identity.verifyAudit().audit.ok, "so the chain still holds after a refusal was added to it");

    /* With a second owner the workspace is no longer a hostage, and the
     * protection moves to whoever is left holding the keys. */
    const admin = identity.invite(boss, ws, { email: "admin@example.com", role: "admin" });
    identity.setPassword(boss, ws, admin.member.userId, "Correct-Horse-9");
    ok(identity.changeRole(boss, ws, admin.member.userId, "owner").ok, "a second owner can be made");
    ok(identity.changeRole(boss, ws, boss, "admin").ok, "which is what lets the first one step down");

    const person = admin.member.userId;
    ok(refusal(identity.changeRole(person, ws, person, "viewer")).code === CODES.LAST_OWNER,
        "and the last owner standing is protected in turn");
    ok(refusal(identity.removeMember(person, ws, person)).code === CODES.LAST_OWNER, "by demotion or by leaving, alike");
    ok(refusal(identity.removeMember(boss, ws, person)).code === CODES.FORBIDDEN,
        "while the admin they left behind still cannot remove an owner");
}

/* ------------------------------------------------------------
 * 7. An invitation is a wait, not a weak password
 * ---------------------------------------------------------- */

function anInvitationIsAWaitNotAWeakPassword() {
    const { identity } = harness();
    const reg = identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "The Desk" });
    const ws = reg.workspace.id;
    const boss = reg.user.id;

    const inv = identity.invite(boss, ws, { email: "trader@example.com", role: "operator" });
    ok(inv.ok && inv.created === true && inv.member.status === "invited", "an address nobody has is invited, not registered");
    const person = inv.member.userId;

    const row = identity.stores.users.findById(person);
    ok(row.status === "invited" && row.passwordHash.length > 0,
        "the account exists already, holding a hash of a password nobody knows");
    ok(refusal(identity.login({ email: "trader@example.com", password: "Correct-Horse-9" })).code === CODES.INVALID_CREDENTIALS,
        "so signing in as the invitation is refused — the right password is not a thing yet");
    ok(refusal(identity.login({ email: "trader@example.com", password: "" })).code === CODES.INVALID_CREDENTIALS,
        "and neither is the wrong one, which at this point is every one");
    ok(refusal(identity.me(identity.stores.signer.sign({ sub: person, wid: ws, role: "operator", sid: "made-up" }))).code === CODES.TOKEN_INVALID,
        "a token about an invitation is not a way in either"); 

    /* An owner holds the pen: only `members:write` may set a password, and the
     * password has to be one the layer would have accepted at registration. */
    const admin = identity.invite(boss, ws, { email: "admin@example.com", role: "admin" });
    identity.setPassword(boss, ws, admin.member.userId, "Correct-Horse-9");
    ok(refusal(identity.setPassword(admin.member.userId, ws, person, "Correct-Horse-9")).code === CODES.FORBIDDEN,
        "an admin may not set one for anyone, and cannot even set one for themselves");
    ok(refusal(identity.setPassword(boss, ws, person, "short")).code === CODES.WEAK_PASSWORD,
        "a weak password is refused where it is set, exactly as at registration");
    ok(refusal(identity.setPassword(boss, ws, person, " ".repeat(12))).code === CODES.WEAK_PASSWORD,
        "including one that is only spaces");
    ok(refusal(identity.setPassword(boss, ws, "nobody-at-all", "Correct-Horse-9")).code === CODES.NOT_A_MEMBER,
        "and only for someone in this workspace");
    ok(identity.stores.users.findById(person).status === "invited", "so after all of those the invitation is still waiting");

    const given = identity.setPassword(boss, ws, person, "Correct-Horse-9");
    ok(given.ok && given.activated === true, "the password an owner sets is what activates the account");
    ok(given.user.status === "active" && given.user.lastLoginAt === null, "which is now active, and has still never signed in");
    const trader = identity.login({ email: "trader@example.com", password: "Correct-Horse-9", workspaceId: ws });
    ok(trader.ok && trader.role === "operator", "who signs in as the operator they were invited to be");

    const rekeyed = identity.setPassword(boss, ws, person, "Another-Horse-9");
    ok(rekeyed.ok && rekeyed.activated === false && rekeyed.closedSessions === 1,
        "re-keying an account that already logs in is not an activation, and it ends the session opened with the old key");
    ok(refusal(identity.me(trader.access)).code === CODES.TOKEN_INVALID, "so that token is not worth spending");
    ok(refusal(identity.login({ email: "trader@example.com", password: "Correct-Horse-9" })).code === CODES.INVALID_CREDENTIALS,
        "the password it was given is gone with it");
    ok(identity.login({ email: "trader@example.com", password: "Another-Horse-9" }).ok, "and the new one signs in");
}

/* ------------------------------------------------------------
 * 8. The roster belongs to the tenant
 * ---------------------------------------------------------- */

function theRosterBelongsToTheTenant() {
    const { identity } = harness();
    const alpha = identity.register({ email: "alpha@example.com", password: "Correct-Horse-9", workspaceName: "Alpha" });
    const beta = identity.register({ email: "beta@example.com", password: "Correct-Horse-9", workspaceName: "Alpha" });
    const mine = alpha.workspace.id;

    ok(beta.workspace.slug === "alpha-2", "two workspaces may share a name without ever sharing a slug");
    ok(refusal(identity.invite(alpha.user.id, beta.workspace.id, { email: "carol@example.com", role: "viewer" })).code === CODES.NO_MEMBERSHIP,
        "and a member of one tenant is nothing at all in another — not even a viewer to invite");

    const joined = identity.invite(alpha.user.id, mine, { email: "beta@example.com", role: "viewer" });
    ok(joined.ok && joined.created === false, "an address that already has an account joins rather than being made again");
    ok(joined.member.userId === beta.user.id && joined.member.status === "active", "and it is the same person, already active");
    ok(refusal(identity.invite(alpha.user.id, mine, { email: "ALPHA@example.com", role: "viewer" })).code === CODES.ALREADY_MEMBER,
        "while someone already in the workspace is refused as already there, however the address is spelled");
    ok(refusal(identity.invite(alpha.user.id, mine, { email: "not-an-address", role: "viewer" })).code === CODES.INVALID_EMAIL,
        "and an address that is not one is refused before anybody is created for it");

    const roster = identity.members(alpha.user.id, mine);
    ok(roster.ok && roster.members.length === 2, "the owner reads the roster");
    ok(roster.workspace.id === mine, "named with the workspace it belongs to");
    ok(roster.members.every((entry) => !("passwordHash" in entry) && !("emailNormalized" in entry)),
        "and no hash rides out with the list — a roster is about people, not keys");
    ok(roster.members.every((entry) => typeof entry.email === "string" && entry.permissions.length > 0),
        "each with the address a human recognises and the permissions the role carries");

    const stranger = identity.register({ email: "stranger@example.com", password: "Correct-Horse-9" });
    ok(refusal(identity.members(stranger.user.id, mine)).code === CODES.NO_MEMBERSHIP, "a stranger reads nothing of it");
    ok(refusal(identity.trail(stranger.user.id, { workspaceId: mine })).code === CODES.NO_MEMBERSHIP,
        "and cannot read the decisions taken in it either");
    ok(refusal(identity.trail(alpha.user.id, {})).code === CODES.FORBIDDEN,
        "reading the trail needs a workspace, or `anyWorkspace` — not simply a name");
    ok(identity.trail(alpha.user.id, { anyWorkspace: true }).ok, "while an account in good standing may ask for the whole system's trail");

    const theirs = identity.workspacesFor(beta.user.id);
    ok(theirs.ok && theirs.workspaces.length === 2, "a person's workspaces are theirs, listed with the role in each");
    ok(theirs.workspaces.some((entry) => entry.slug === "alpha" && entry.role === "viewer")
        && theirs.workspaces.some((entry) => entry.slug === "alpha-2" && entry.role === "owner"),
        "the same person, an owner in one and a viewer in the other: a role is a fact about a workspace");
    ok(refusal(identity.workspacesFor("nobody-at-all")).code === CODES.USER_NOT_FOUND, "and an account that does not exist has none");
}

/* ------------------------------------------------------------
 * 8b. A workspace holds only so many people
 * ---------------------------------------------------------- */

function aWorkspaceHoldsOnlySoManyPeople() {
    const { identity } = harness(1_700_000_000_000, { maxMembers: 2 });
    const reg = identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "Small" });
    const ws = reg.workspace.id;

    ok(identity.invite(reg.user.id, ws, { email: "second@example.com", role: "viewer" }).ok, "the second seat is taken");
    ok(refusal(identity.invite(reg.user.id, ws, { email: "third@example.com", role: "viewer" })).code === CODES.MEMBER_LIMIT,
        "and the third is refused, because a workspace is bounded and that bound is not a surprise");
    ok(identity.stats().memberships === 2 && identity.stores.users.findByEmail("third@example.com") === null,
        "the refusal left no account behind either: a limit that keeps the row it refused is not a limit");
}

/* ------------------------------------------------------------
 * 9. Every decision lands in a chain that can be checked
 * ---------------------------------------------------------- */

function everyDecisionIsHashChained() {
    const { identity } = harness();
    const reg = identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "The Desk" });
    const ws = reg.workspace.id;
    const boss = reg.user.id;

    identity.login({ email: "owner@example.com", password: "Correct-Horse-9" });
    identity.login({ email: "owner@example.com", password: "Wrong-Horse-99" });
    identity.invite(boss, ws, { email: "viewer@example.com", role: "viewer" });

    const page = identity.trail(boss, { workspaceId: ws });
    ok(page.ok && page.entries.length === 4, "the trail holds the decisions taken in this workspace, and only those");
    ok(page.entries[0].seq > page.entries[1].seq, "newest first");
    ok(page.entries.some((entry) => entry.outcome === "allow") && page.entries.some((entry) => entry.outcome === "deny"),
        "an allow and a deny alike — a refusal a reviewer wants is never quieter than a success");
    ok(page.entries.every((entry) => entry.workspaceId === ws && entry.action.length > 0), "each naming its workspace and its action");

    const refused = page.entries.find((entry) => entry.outcome === "deny");
    ok(refused.code === CODES.INVALID_CREDENTIALS && refused.meta.includes("bad-password"),
        "the refusal carries the code that names it, and what was wrong, folded in as text rather than an object");
    ok(page.entries.find((entry) => entry.action === "login" && entry.outcome === "allow").target === "owner@example.com",
        "and a success names what it was about, so the two can be read side by side");

    const chain = [...page.entries].reverse();
    ok(chain[0].prevHash === "0".repeat(64), "the first row starts from a genesis that is not a row");
    ok(chain.every((entry, index) => index === 0 || entry.prevHash === chain[index - 1].hash),
        "and every row below it links to the one before");
    ok(chain.every((entry) => entry.hash.length === 64 && entry.hash !== entry.prevHash), "each link is a hash of its own");
    ok(page.counts.entries === identity.stats().audit.entries && page.counts.denials === 1, "the counts agree: four decisions, one refusal");

    const walked = identity.verifyAudit().audit;
    ok(walked.ok && walked.checked === identity.stats().audit.entries && walked.head === chain[chain.length - 1].hash,
        "so walking the whole chain agrees, checks every row, and names the head it ended on");
    ok(!("update" in identity.stores.audit) && !("remove" in identity.stores.audit) && !("delete" in identity.stores.audit),
        "and the store that writes it has no way to rewrite it: append-only is a shape, not a promise");

    /* A change that is not a security decision moves a counter and not the
     * trail — the trail is for what a reviewer must be able to find. */
    const before = identity.stats().audit.entries;
    const refusals = identity.stats().refusals;
    ok(refusal(identity.invite(boss, ws, { email: "owner@example.com", role: "viewer" })).code === CODES.ALREADY_MEMBER,
        "inviting somebody who is already in the workspace is refused");
    ok(identity.stats().refusals === refusals + 1 && identity.stats().audit.entries === before,
        "which is counted and not audited, because nothing was attempted that a reviewer needs to see");
}

function tamperingWithTheTrailIsCaught() {
    const edited = harness();
    const reg = edited.identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "The Desk" });
    edited.identity.login({ email: "owner@example.com", password: "Correct-Horse-9" });
    const seqs = edited.identity.trail(reg.user.id, { workspaceId: reg.workspace.id }).entries.map((entry) => entry.seq);
    const newest = Math.max(...seqs);

    edited.db.prepare("UPDATE audit SET outcome = 'deny' WHERE seq = ?").run(newest);
    const afterEdit = edited.identity.verifyAudit().audit;
    ok(afterEdit.ok === false && afterEdit.brokenAt === newest, "a row rewritten underneath the chain is caught at the row it was done to");
    ok(afterEdit.checked < edited.identity.stats().audit.entries, "and it says how far it walked before the first row that did not fit");

    const dropped = harness();
    const reg2 = dropped.identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "The Desk" });
    dropped.identity.login({ email: "owner@example.com", password: "Correct-Horse-9" });
    const all = dropped.identity.trail(reg2.user.id, { workspaceId: reg2.workspace.id }).entries.map((entry) => entry.seq);
    const ordered = [...all].sort((a, b) => a - b);

    dropped.db.prepare("DELETE FROM audit WHERE seq = ?").run(ordered[0]);
    const afterDelete = dropped.identity.verifyAudit().audit;
    ok(afterDelete.ok === false && afterDelete.brokenAt === ordered[1],
        "and a row taken out of the middle is caught by the row that used to point at it");
    ok(identity_verify_still_reads_an_empty_trail(), "while a trail nobody wrote to yet verifies trivially, from genesis");
}

/** The empty case, and it is not an exception: no rows, nothing to break. */
function identity_verify_still_reads_an_empty_trail() {
    const empty = harness();
    const walked = empty.identity.verifyAudit().audit;
    return walked.ok && walked.checked === 0 && walked.brokenAt === null && walked.head === "0".repeat(64);
}

/* ------------------------------------------------------------
 * 10. A password changes only with the old one, and the sessions
 *     opened with the old one end when it does
 * ---------------------------------------------------------- */

function changingAPasswordEndsTheOldSessions() {
    const { identity } = harness();
    const reg = identity.register({ email: "owner@example.com", password: "Correct-Horse-9", workspaceName: "The Desk" });
    const ws = reg.workspace.id;
    const boss = reg.user.id;

    /* A plain member, in the one sense this layer has: an `operator`. (The word
     * "member" in this file means a person in a workspace, never a role — the
     * role table holds four, and this is the ordinary activated one.) */
    const inv = identity.invite(boss, ws, { email: "mate@example.com", role: "operator" });
    identity.setPassword(boss, ws, inv.member.userId, "Correct-Horse-9");
    const mate = inv.member.userId;

    const first = identity.login({ email: "mate@example.com", password: "Correct-Horse-9" });
    const second = identity.login({ email: "mate@example.com", password: "Correct-Horse-9" });
    ok(first.ok && second.ok && first.familyId !== second.familyId,
        "one person, signed in from two devices: two families, neither aware of the other");

    const hashBefore = identity.stores.users.findById(mate).passwordHash;
    ok(refusal(identity.changeOwnPassword(mate, "Wrong-Horse-99", "Better-Horse-77")).code === CODES.INVALID_CREDENTIALS,
        "changing a password asks for the one in use, and a wrong one is refused");
    ok(refusal(identity.changeOwnPassword("nobody-at-all", "Correct-Horse-9", "Better-Horse-77")).code === CODES.USER_NOT_FOUND,
        "an account that does not exist is refused before anything is checked against it");
    ok(refusal(identity.changeOwnPassword(mate, "Correct-Horse-9", "short")).code === CODES.WEAK_PASSWORD,
        "and the new password is judged by the rule registration uses, before anything is written");
    ok(identity.stores.users.findById(mate).passwordHash === hashBefore,
        "so after every refusal above the hash in the table is the one it was");

    const changed = identity.changeOwnPassword(mate, "Correct-Horse-9", "Better-Horse-77");
    ok(changed.ok && changed.closedSessions === 2, "the change goes through, and says how many sessions it ended");
    ok(changed.user.id === mate && !("passwordHash" in changed.user), "handing back the same public person the door hands back");
    ok(identity.stores.users.findById(mate).passwordHash !== hashBefore, "the table holds a new hash, and the old one is gone");

    ok(refusal(identity.me(first.access)).code === CODES.TOKEN_INVALID && refusal(identity.me(second.access)).code === CODES.TOKEN_INVALID,
        "neither access token opens anything again, long before either would have expired on its own");
    const spent = refusal(identity.refresh({ refresh: first.refresh }));
    ok(spent.code === CODES.REFRESH_REUSE && spent.state === "revoked",
        "and a refresh token from those sessions is a reuse, not a rotation — an ended family is not a second chance");
    ok(refusal(identity.refresh({ refresh: second.refresh })).code === CODES.REFRESH_REUSE,
        "the other device is in the same position, for the same reason");

    ok(refusal(identity.login({ email: "mate@example.com", password: "Correct-Horse-9" })).code === CODES.INVALID_CREDENTIALS,
        "the password that was in use no longer signs in");
    const again = identity.login({ email: "mate@example.com", password: "Better-Horse-77" });
    ok(again.ok && again.user.id === mate && again.role === "operator", "while the new one does, as the same account in the same role");

    const entry = identity.trail(boss, { anyWorkspace: true }).entries
        .find((row) => row.action === "change-password" && row.outcome === "allow");
    ok(entry && entry.target === "mate@example.com" && entry.meta.includes("closedSessions"),
        "and the change is in the trail, naming whose password it was and what it cost");
}

/* ------------------------------------------------------------
 * The sections, in the order they were written
 * ---------------------------------------------------------- */

const SECTIONS = Object.freeze([
    ["1. one address, one account, one hash that stays in", oneAddressOneAccount],
    ["2. the door says nothing about who exists", theDoorSaysNothingAboutWhoExists],
    ["3. an access token is a claim, not a trust", anAccessTokenIsAClaimNotATrust],
    ["4. a refresh rotates, and reuse ends the family", aRefreshRotatesAndReuseEndsTheFamily],
    ["5. roles are ranked, and nobody outranks themselves", rolesAreRankedAndNobodyOutranksThemselves],
    ["6. the last owner cannot be removed", theLastOwnerCannotBeRemoved],
    ["7. an invitation is a wait, not a weak password", anInvitationIsAWaitNotAWeakPassword],
    ["8. the roster belongs to the tenant", theRosterBelongsToTheTenant],
    ["8b. a workspace holds only so many people", aWorkspaceHoldsOnlySoManyPeople],
    ["9. every decision is hash-chained", everyDecisionIsHashChained],
    ["9b. tampering with the trail is caught", tamperingWithTheTrailIsCaught],
    ["10. changing a password ends the old sessions", changingAPasswordEndsTheOldSessions]
]);

/* A section that throws stops the run and says which one it was: a failing
 * check is a fact about the layer, so the counter only moves on a pass. */
function run() {
    const started = Date.now();

    for (const [name, section] of SECTIONS) {
        const before = checks;
        try {
            section();
        } catch (error) {
            const reason = error && error.message ? error.message : String(error);
            console.error(`\nFAIL  ${name}\n      ${reason}`);
            if (error && error.stack) console.error(String(error.stack).split("\n").slice(1, 4).join("\n"));
            console.error(`\n${checks} checks passed before this section`);
            process.exit(1);
        }
        console.log(`  ok  ${name}  (${checks - before})`);
    }

    console.log(`\n${checks} checks passed across ${SECTIONS.length} sections in ${Date.now() - started}ms`);
    process.exit(0);
}

run();










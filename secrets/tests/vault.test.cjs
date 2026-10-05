/* ============================================================
 * D2 — The vault: keys at rest, and the two doors that hand one out
 * secrets/core/providers.cjs   (which venues may hold a key)
 * secrets/core/cipher.cjs      (one room, one lock: seal/open)
 * secrets/store/schema.cjs     (two tables, in identity's database)
 * secrets/store/records.cjs    (the rows, and the shape a caller may see)
 * secrets/service.cjs          (put/get/list/revoke, and the engine's door)
 * ============================================================
 * The identity suite next door asks whether the identity layer keeps its own
 * promises. This file asks the question about a key instead, and the promises
 * are harder to keep:
 *
 *  1. a value goes in as plaintext and comes to rest sealed — the whole database
 *     file does not contain it — and `list` cannot leak it even by accident;
 *  2. the vault is owner-shaped, because `secrets:read` is: an operator is
 *     refused, a stranger is told they are not a member, and a stranger learns
 *     nothing about which secrets exist;
 *  3. writing a key again rotates it in place, revoking closes the door without
 *     deleting the row, and putting a key back is a revival rather than a
 *     resurrection of the old value;
 *  4. a venue that is not on the allow-list is refused rather than stored, so a
 *     typo cannot create an unreachable second copy of a live key;
 *  5. an edited row, a foreign key and a value from another vault all refuse the
 *     same way, with the same words: the format is not an oracle;
 *  6. every vault decision is appended to identity's hash-chained trail, and no
 *     entry in that chain contains a value;
 *  7. the execution engine's door (`material`) works without a person, still
 *     respects revocation, and cannot see another workspace's secret;
 *  8. nothing that leaves this layer — event, refusal, stats, trail — carries a
 *     plaintext;
 *  9. a missing database, clock, door or key is a wiring bug and is thrown, not
 *     returned as a refusal.
 *
 * Run: node secrets/tests/vault.test.cjs
 *      node secrets/tests/run-all.cjs
 * ============================================================
 */

const assert = require("assert");
const path = require("node:path");

const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const IDENTITY = path.join(ROOT, "..", "identity");

const { CODES, isRefusal } = require(path.join(IDENTITY, "core", "errors.cjs"));
const { migrate } = require(path.join(IDENTITY, "store", "schema.cjs"));
const { migrate: migrateVault } = require(path.join(ROOT, "store", "schema.cjs"));
const { createIdentity } = require(path.join(IDENTITY, "service.cjs"));
const { createVault, EVENTS } = require(path.join(ROOT, "service.cjs"));
const { createCipher } = require(path.join(ROOT, "core", "cipher.cjs"));
const { DEFAULT_LABEL, PROVIDERS } = require(path.join(ROOT, "core", "providers.cjs"));

const START = 1_700_000_000_000;
const KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const OTHER_KEY = Buffer.from("fedcba9876543210fedcba9876543210", "utf8");
const PASSPHRASE = "a-passphrase-that-is-longer-than-thirty-two";
const SALT = Buffer.alloc(16, 7);
const SECRET = "sk-live-2f9c1b7a4e6d8f0a1c3e5b7d9f1a3c5e";
const SECRET_TWO = "sk-live-aa11bb22cc33dd44ee55ff6677889900";

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `D2: ${msg}`);
    checks += 1;
};

const rows = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const refusal = (result) => (result.ok ? null : result);

/**
 * One database, one clock, one identity layer and one vault — which is already
 * the small picture of a deployment: the vault is a tenant of the identity
 * schema rather than a database of its own, so a workspace that goes away takes
 * its keys with it.
 */
function harness(options = {}) {
    const db = new Database(":memory:");
    migrate(db);          /* identity first: `secrets` references its tables */
    migrateVault(db);     /* then the vault's own second ledger, in the same file */
    const clock = {
        t: START,
        advance(ms) {
            this.t += ms;
            return this.t;
        }
    };
    const identity = createIdentity({ db, now: () => clock.t, secret: "s".repeat(32) });
    const vault = createVault({
        db,
        now: () => clock.t,
        key: KEY,
        authorize: identity.authorize,
        audit: identity.stores.audit,
        ...options
    });
    return { db, clock, identity, vault };
}

/** An owner with a workspace of their own, and the ids the vault is asked for. */
function signedIn(identity, email = "owner@example.com") {
    const reg = identity.register({ email, password: "Correct-Horse-9" });
    assert.ok(reg.ok, `D2: ${email} should register`);
    return { userId: reg.user.id, workspaceId: reg.workspace.id };
}

/** An invited, active member holding `role` in a workspace. */
function joined(identity, owner, workspaceId, email, role) {
    const invited = identity.invite(owner, workspaceId, { email, role });
    assert.ok(invited.ok && invited.member, `D2: ${email} should be invited`);
    const given = identity.setPassword(owner, workspaceId, invited.member.userId, "Correct-Horse-9");
    assert.ok(given.ok, `D2: ${email} should be given a password`);
    return invited.member.userId;
}

/* ------------------------------------------------------------
 * 1. A key goes in as plaintext and comes to rest sealed
 * ---------------------------------------------------------- */

function aKeyGoesInSealedAndComesBackWhole() {
    const { db, clock, identity, vault } = harness();
    const { userId, workspaceId } = signedIn(identity);

    const put = vault.put(userId, workspaceId, { provider: "binance", value: SECRET });
    ok(put.ok, "an owner stores a key for a venue the allow-list knows");
    ok(put.created && !put.revived, "which is a first write, not a rotation and not a revival");
    ok(put.bytes === Buffer.byteLength(SECRET), "the answer says how large the value was, in bytes");
    ok(put.secret.label === DEFAULT_LABEL, "a key with no label of its own is the default one");
    ok(!("ciphertext" in put.secret) && !("value" in put.secret),
        "and what comes back is metadata: no sealed text, no plaintext");

    const row = vault.stores.secrets.rawByKey(workspaceId, "binance", DEFAULT_LABEL);
    ok(/^v1\$/.test(row.ciphertext), "at rest it is a sealed value in the vault's own format");
    ok(row.ciphertext.split("$").length === 4, "with its header, iv, tag and body kept apart");
    ok(row.key_id === vault.stats().keyId && vault.stats().algorithm === "aes-256-gcm",
        "the row records the fingerprint of the key that sealed it, and the algorithm");
    ok(!row.ciphertext.includes(SECRET), "the sealed value does not contain the value");
    ok(!db.serialize().includes(SECRET), "and neither does the whole database file, read end to end");

    const got = vault.get(userId, workspaceId, "binance");
    ok(got.ok && got.value === SECRET, "an owner reads back exactly what was stored");
    ok(got.keyId === vault.stats().keyId && got.secret.workspaceId === workspaceId,
        "the answer names the key that sealed it and the workspace it belongs to");
    ok(got.secret.useCount === 1 && got.secret.lastUsedAt === clock.t,
        "and reading it is recorded on the row: how often, and when");

    vault.get(userId, workspaceId, "binance");
    ok(vault.stores.secrets.findByKey(workspaceId, "binance", DEFAULT_LABEL).useCount === 2,
        "a second read counts as a second read");

    const listed = vault.list(userId, workspaceId);
    ok(listed.ok && listed.secrets.length === 1, "the inventory holds the one key");
    ok(JSON.stringify(listed).includes(SECRET) === false, "and the inventory does not carry the value");
    ok(!("ciphertext" in listed.secrets[0]), "nor the sealed text: `list` maps through a shape that has neither");
    ok(listed.counts.total === 1 && listed.counts.active === 1 && listed.counts.revoked === 0,
        "with a count that says one is live and none are revoked");
    ok(listed.counts.byProvider.length === 1 && listed.counts.byProvider[0].provider === "binance",
        "grouped by the venue the keys belong to");

    /* Writing the same venue and label again is a rotation, in place. */
    const firstCipher = row.ciphertext;
    clock.advance(60_000);
    const rotated = vault.put(userId, workspaceId, { provider: "binance", value: SECRET_TWO });
    ok(rotated.ok && rotated.created === false && rotated.revived === false,
        "writing the same key again is a rotation, and says so");
    ok(rotated.secret.id === put.secret.id, "the row keeps its id: this is one key, not a second one");
    ok(rows(db, "secrets") === 1, "so the table still holds one row");
    const after = vault.stores.secrets.rawByKey(workspaceId, "binance", DEFAULT_LABEL);
    ok(after.ciphertext !== firstCipher, "the sealed text is not the one that was there before");
    ok(after.updated_at === clock.t && after.use_count === 0,
        "the row moves to now, and the count of reads starts again");
    ok(vault.get(userId, workspaceId, "binance").value === SECRET_TWO, "and the new value is what comes back");

    /* Labels are namespaced inside a venue, so one venue can hold two keys. */
    const paper = vault.put(userId, workspaceId, { provider: "binance", label: "paper", value: "paper-key-0001" });
    ok(paper.ok && paper.secret.label === "paper", "a labelled key lives beside the default one");
    ok(vault.list(userId, workspaceId).secrets.length === 2, "and the inventory holds both");
    ok(vault.list(userId, workspaceId, { provider: "binance" }).secrets.length === 2, "filtered by venue, both are binance");
    ok(vault.list(userId, workspaceId, { provider: "okx" }).secrets.length === 0, "while another venue has none yet");

    const explicit = vault.put(userId, workspaceId, { provider: "okx", label: DEFAULT_LABEL, value: "okx-default-0001" });
    ok(explicit.ok && explicit.secret.label === DEFAULT_LABEL, "naming the default label out loud is the same as leaving it out");
    ok(vault.get(userId, workspaceId, "okx", { label: DEFAULT_LABEL }).value === "okx-default-0001",
        "and it is read back with the same name it was stored under");
}

/* ------------------------------------------------------------
 * 2. The vault is owner-shaped, and the refusal is not a hint
 * ---------------------------------------------------------- */

function theVaultIsOwnerShaped() {
    const { db, identity, vault } = harness();
    const { userId: owner, workspaceId } = signedIn(identity);
    const operator = joined(identity, owner, workspaceId, "operator@example.com", "operator");
    const viewer = joined(identity, owner, workspaceId, "viewer@example.com", "viewer");
    const { userId: stranger } = signedIn(identity, "stranger@example.com");

    ok(!identity.allows("operator", "secrets:read") && identity.allows("owner", "secrets:read"),
        "holding a key is not a permission a role is given on the way up: `secrets:read` belongs to the owner alone");
    ok(vault.put(owner, workspaceId, { provider: "bybit", value: SECRET }).ok, "so the owner writes one");

    ok(refusal(vault.get(operator, workspaceId, "bybit")).code === CODES.FORBIDDEN,
        "an operator may not read a key, whatever else the role may do");
    ok(refusal(vault.get(viewer, workspaceId, "bybit")).code === CODES.FORBIDDEN, "and neither may a viewer");
    ok(refusal(vault.put(operator, workspaceId, { provider: "okx", value: "an-operator-typed-this" })).code === CODES.FORBIDDEN,
        "an operator may not write one either");
    ok(refusal(vault.list(operator, workspaceId)).code === CODES.FORBIDDEN, "nor list what is there");
    ok(refusal(vault.revoke(operator, workspaceId, "bybit")).code === CODES.FORBIDDEN, "nor pull one");
    ok(rows(db, "secrets") === 1, "and nothing an operator attempted reached the table");

    ok(refusal(vault.get(stranger, workspaceId, "bybit")).code === CODES.NO_MEMBERSHIP,
        "someone who is not a member is told exactly that, not that they lack a role");
    ok(refusal(vault.get(stranger, workspaceId, "bitget")).code === CODES.NO_MEMBERSHIP,
        "and the answer is the same for a venue this workspace holds no key for: the door is asked before the table");
    ok(refusal(vault.list(stranger, workspaceId)).code === CODES.NO_MEMBERSHIP, "a stranger cannot inventory a workspace");
    ok(refusal(vault.revoke(stranger, workspaceId, "bybit")).code === CODES.NO_MEMBERSHIP, "nor pull a key out of it");

    ok(vault.get(owner, workspaceId, "bybit").value === SECRET, "while the owner reads it back");
    ok(vault.stats().decisions.denied >= 8, "and every one of those refusals moved the count of denials");
}

/* ------------------------------------------------------------
 * 3. Revoking closes the door; the row stays behind
 * ---------------------------------------------------------- */

function revokingClosesTheDoorWithoutDeletingTheRow() {
    const { db, clock, identity, vault } = harness();
    const { userId, workspaceId } = signedIn(identity);

    vault.put(userId, workspaceId, { provider: "binance", value: SECRET });
    const sealedBefore = vault.stores.secrets.rawByKey(workspaceId, "binance", DEFAULT_LABEL).ciphertext;

    clock.advance(1_000);
    const revoked = vault.revoke(userId, workspaceId, "binance", { reason: "leaked in a screenshot" });
    ok(revoked.ok && revoked.secret.revoked, "an owner pulls a key, and the row says so");
    ok(revoked.secret.revokedAt === clock.t && revoked.secret.revokedBy === userId,
        "the time it happened and the person who did it are on the row");
    ok(revoked.secret.revokedReason === "leaked in a screenshot", "and the reason is kept, because a reviewer will ask");
    ok(rows(db, "secrets") === 1, "the row is still there: revocation is not deletion");
    ok(vault.stores.secrets.rawByKey(workspaceId, "binance", DEFAULT_LABEL).ciphertext === sealedBefore,
        "with the sealed value it was holding, so what was pulled can be told from what never existed");

    ok(refusal(vault.get(userId, workspaceId, "binance")).code === CODES.SECRET_REVOKED,
        "the owner cannot read it either, and the refusal is not `forbidden`");
    ok(refusal(vault.material(workspaceId, "binance")).code === CODES.SECRET_REVOKED,
        "nor can the execution engine, which is the point of pulling a key at all");
    ok(refusal(vault.revoke(userId, workspaceId, "binance")).code === CODES.SECRET_REVOKED,
        "pulling it twice is refused rather than repeated");
    const listed = vault.list(userId, workspaceId);
    ok(listed.counts.revoked === 1 && listed.counts.active === 0, "the inventory counts it as revoked and not as live");
    ok(listed.secrets[0].revoked && listed.secrets[0].revokedAt === clock.t, "and each row carries its own verdict");

    /* Putting a key back is a revival of the NAME, not of the old value. */
    clock.advance(1_000);
    const revived = vault.put(userId, workspaceId, { provider: "binance", value: SECRET_TWO });
    ok(revived.ok && revived.created === false && revived.revived === true, "putting a key back is a revival, and says so");
    ok(revived.secret.revoked === false && revived.secret.revokedAt === null && revived.secret.revokedBy === null,
        "the revocation is cleared along with the value it belonged to");
    ok(vault.stores.secrets.rawByKey(workspaceId, "binance", DEFAULT_LABEL).ciphertext !== sealedBefore,
        "the row holds a new sealed value: the pulled one is not kept in a live row");
    ok(vault.get(userId, workspaceId, "binance").value === SECRET_TWO,
        "and what comes back is the new key, never the one that was revoked");
}

/* ------------------------------------------------------------
 * 4. A venue nobody has an adapter for is refused, not stored
 * ---------------------------------------------------------- */

function aVenueOffTheListIsRefusedRatherThanStored() {
    const { db, identity, vault } = harness();
    const { userId, workspaceId } = signedIn(identity);

    const unknown = refusal(vault.put(userId, workspaceId, { provider: "kraken", value: SECRET }));
    ok(unknown.code === CODES.PROVIDER_UNKNOWN, "a venue nobody has an adapter for is refused, not stored");
    ok(unknown.provider === "kraken", "the refusal repeats the venue that was asked for");
    ok(unknown.known.length === PROVIDERS.length && unknown.known.includes("binance") && unknown.known.includes("okx"),
        "and names the ones that exist, because neither the list nor the question is a secret");
    ok(rows(db, "secrets") === 0, "and nothing reached the table");
    ok(PROVIDERS.length === 5 && PROVIDERS.includes("bitget") && PROVIDERS.includes("kucoin"),
        "the list is the five venues this repository already publishes adapters for");

    ok(refusal(vault.get(userId, workspaceId, "kraken")).code === CODES.PROVIDER_UNKNOWN,
        "reading from an unknown venue is refused the same way");
    ok(refusal(vault.list(userId, workspaceId, { provider: "kraken" })).code === CODES.PROVIDER_UNKNOWN,
        "and so is filtering the inventory by one");
    ok(refusal(vault.revoke(userId, workspaceId, "kraken")).code === CODES.PROVIDER_UNKNOWN,
        "and pulling a key out of one");
    ok(refusal(vault.material(workspaceId, "kraken")).code === CODES.PROVIDER_UNKNOWN, "and the engine's door");

    /* A request that was never understood is a bug in the caller, and is thrown
     * at the call rather than answered with a code to branch on. */
    const throws = (fn) => { try { fn(); return null; } catch (error) { return error; } };

    ok(throws(() => vault.put(userId, workspaceId, { provider: "binance", value: "" })).code === CODES.BAD_ENTRY,
        "an empty value is a caller bug and is thrown");
    ok(throws(() => vault.put(userId, workspaceId, { provider: "binance", label: "MAIN", value: SECRET })).code === CODES.BAD_ENTRY,
        "so is a label in capitals");
    ok(throws(() => vault.put(userId, workspaceId, { provider: "binance", label: "x".repeat(33), value: SECRET })).code === CODES.BAD_ENTRY,
        "and a label longer than thirty-two characters");
    ok(throws(() => vault.put(userId, workspaceId, null)).code === CODES.BAD_ENTRY,
        "and an entry that is not an object at all");
    ok(throws(() => vault.put(userId, workspaceId, { value: SECRET })).code === CODES.BAD_ENTRY,
        "and one that names no venue");
    ok(throws(() => vault.get(userId, workspaceId, "binance", { label: "bad label" })).code === CODES.BAD_ENTRY,
        "a label that could never name anything is thrown wherever it is asked for");
    ok(throws(() => vault.put(userId, workspaceId, { provider: "binance", value: "x".repeat(16 * 1024 + 1) })).code === CODES.BAD_ENTRY,
        "and a value past the ceiling, because a sixty-kilobyte key is a mistake and not a key");
    ok(vault.put(userId, workspaceId, { provider: "binance", value: "x".repeat(16 * 1024) }).ok,
        "while one exactly at the ceiling is stored, so the ceiling is a limit and not a guess");
    ok(vault.stats().maxSecretBytes === 16 * 1024, "and the ceiling is published rather than hidden in the code");
    ok(rows(db, "secrets") === 1, "after all of that, exactly one row exists: every other attempt died before the table");

    /* The list is a default, not a law: the deployment names its own venues. */
    const narrow = harness({ providers: ["kraken"] });
    const who = signedIn(narrow.identity, "narrow@example.com");
    ok(narrow.vault.put(who.userId, who.workspaceId, { provider: "kraken", value: SECRET }).ok,
        "a deployment may hold keys for a venue the default list does not know");
    ok(refusal(narrow.vault.put(who.userId, who.workspaceId, { provider: "binance", value: SECRET })).code === CODES.PROVIDER_UNKNOWN,
        "and then a venue that is not on ITS list is refused: the same rule, seen from the other side");
    ok(narrow.vault.stats().providers.length === 1, "the layer can say which list it is holding");
}



/* ------------------------------------------------------------
 * 5. Every way of failing to open refuses in the same words
 * ---------------------------------------------------------- */

function everyWayOfFailingToOpenRefusesTheSameWay() {
    const { db, clock, identity, vault } = harness();
    const { userId, workspaceId } = signedIn(identity);
    vault.put(userId, workspaceId, { provider: "binance", value: SECRET });

    const row = () => vault.stores.secrets.rawByKey(workspaceId, "binance", DEFAULT_LABEL);
    const restore = (ciphertext, keyId) =>
        db.prepare("UPDATE secrets SET ciphertext = ?, key_id = ? WHERE id = ?").run(ciphertext, keyId, row().id);
    const sealed = row().ciphertext;

    /* 1. one byte flipped in the database */
    const flipped = sealed.slice(0, -1) + (sealed.endsWith("A") ? "B" : "A");
    restore(flipped, vault.stats().keyId);
    const edited = refusal(vault.get(userId, workspaceId, "binance"));
    ok(edited.code === CODES.BAD_KEY, "a sealed value edited in the database does not come back wrong: it does not come back");
    ok(edited.keyId === vault.stats().keyId, "and the refusal names the fingerprint on the row, not what the row said");
    ok(!("value" in edited), "with no value field at all, so a caller cannot read a partial answer by mistake");

    /* 2. a row that is not even in the format */
    restore("v1$not-base64$%%%$abcd", vault.stats().keyId);
    const malformed = refusal(vault.get(userId, workspaceId, "binance"));
    ok(malformed.code === CODES.BAD_KEY, "a row that is not in the format at all is refused as the same failure");

    /* 3. the same row, opened by a vault holding a different key */
    restore(sealed, vault.stats().keyId);
    const foreign = createVault({ db, now: () => clock.t, key: OTHER_KEY, authorize: identity.authorize });
    const wrongKey = refusal(foreign.get(userId, workspaceId, "binance"));
    ok(wrongKey.code === CODES.BAD_KEY, "a vault holding another key refuses that row the same way");

    /* 4. a value sealed by a vault that does not live here */
    const elsewhere = createCipher({ key: OTHER_KEY });
    restore(elsewhere.seal(SECRET), elsewhere.id);
    const stranger = refusal(vault.get(userId, workspaceId, "binance"));
    ok(stranger.code === CODES.BAD_KEY, "and so does a value that was sealed by another vault entirely");

    ok(new Set([edited.code, malformed.code, wrongKey.code, stranger.code]).size === 1, "one code for four causes");
    ok(new Set([edited.message, malformed.message, wrongKey.message, stranger.message]).size === 1,
        "one message for four causes: this layer is not an oracle about which way it failed");

    /* The row as it was written still opens, so none of the above was a false
     * alarm about every row. */
    restore(sealed, vault.stats().keyId);
    ok(vault.get(userId, workspaceId, "binance").value === SECRET, "while the row as it was written opens, untouched");
    ok(db.serialize().includes(SECRET) === false, "and even after four refusals the file still holds no plaintext");
}

/* ------------------------------------------------------------
 * 6. Every decision lands in identity's chain, and none of them
 *    carries a value
 * ---------------------------------------------------------- */

function everyDecisionLandsInIdentitysOwnChain() {
    const { identity, vault } = harness();
    const { userId, workspaceId } = signedIn(identity);
    const operator = joined(identity, userId, workspaceId, "operator@example.com", "operator");

    vault.put(userId, workspaceId, { provider: "binance", value: SECRET });
    vault.get(userId, workspaceId, "binance");
    vault.list(userId, workspaceId);
    vault.material(workspaceId, "binance");
    vault.revoke(userId, workspaceId, "binance", { reason: "rotating after a leak" });
    vault.get(operator, workspaceId, "binance");
    vault.material(workspaceId, "bybit");

    const verified = identity.verifyAudit();
    ok(verified.ok && verified.audit.ok, "the chain still verifies with seven vault decisions folded into it");
    ok(verified.audit.checked >= 7, "and it checked every entry in it rather than a sample");

    const trail = identity.trail(userId, { workspaceId });
    const actions = new Set(trail.entries.map((entry) => entry.action));
    ok(actions.has("secret-put") && actions.has("secret-get") && actions.has("secret-list"),
        "the write, the read and the inventory are in the same trail a login goes into");
    ok(actions.has("secret-revoke") && actions.has("secret-inject"),
        "and so are the revocation and the injection the execution engine asked for");

    const denied = trail.entries.find((entry) => entry.outcome === "deny" && entry.action === "secret-get");
    ok(denied && denied.code === CODES.FORBIDDEN && denied.actorUserId === operator,
        "a refusal of a person is recorded with its code and with whose request it was");
    ok(denied.target === "binance:default", "and it names the secret the way this layer does, `provider:label`");

    const missed = trail.entries.find((entry) => entry.code === CODES.SECRET_NOT_FOUND);
    ok(missed && missed.actorUserId === null && missed.outcome === "deny",
        "while a miss at the engine's door has no actor at all — which is exactly why that door is not a route");

    ok(JSON.stringify(trail).includes(SECRET) === false, "nothing in the trail is a value");
    ok(trail.entries.every((entry) => entry.hash.length === 64 && entry.prevHash.length === 64),
        "every vault decision was hashed into the chain rather than written beside it");

    /* A vault with no trail is a supported wiring: it decides, it just cannot be
     * asked afterwards — and it says so. */
    const silent = harness({ audit: null });
    const who = signedIn(silent.identity, "silent@example.com");
    ok(silent.vault.put(who.userId, who.workspaceId, { provider: "binance", value: SECRET }).ok,
        "a vault with no trail still stores keys");
    ok(silent.vault.get(who.userId, who.workspaceId, "binance").value === SECRET, "and hands them back");
    ok(silent.vault.stats().audited === false && vault.stats().audited === true,
        "and both say out loud whether there is a trail to write to");
}


/* ------------------------------------------------------------
 * 7. The engine's door is not a route, and it is still a door
 * ---------------------------------------------------------- */

function theEnginesDoorIsNotARouteButIsStillADoor() {
    const { db, identity, vault } = harness();
    const desk = signedIn(identity, "desk@example.com");
    const other = signedIn(identity, "other@example.com");
    vault.put(desk.userId, desk.workspaceId, { provider: "binance", value: SECRET });

    const injected = vault.material(desk.workspaceId, "binance");
    ok(injected.ok && injected.value === SECRET,
        "the engine is handed the key of the workspace it was told to trade for");
    ok(injected.secret.workspaceId === desk.workspaceId && injected.label === DEFAULT_LABEL,
        "and the answer says which workspace and which of that workspace's keys it was");
    ok(vault.stores.secrets.findByKey(desk.workspaceId, "binance", DEFAULT_LABEL).useCount === 1,
        "and the injection is stamped on the row like any other read, so `last used` means what it says");

    ok(refusal(vault.material(other.workspaceId, "binance")).code === CODES.SECRET_NOT_FOUND,
        "the same venue in a workspace that never stored it finds nothing: a key belongs to a tenant, not to a venue");
    ok(rows(db, "secrets") === 1, "and there is still exactly one row: one workspace's key is not visible from another's");
    ok(refusal(vault.material(null, "binance")).code === CODES.SECRET_NOT_FOUND,
        "and with no workspace it finds nothing, rather than failing in a second, different way");

    /* It asks nobody for permission, because there is nobody here to ask about.
     * That is the design — and the reason the gateway must never map it. */
    const before = vault.stats().decisions;
    ok(vault.material(desk.workspaceId, "binance").ok, "the engine's door opens again for the same workspace");
    const after = vault.stats().decisions;
    ok(after.allowed === before.allowed && after.denied === before.denied,
        "without either counter moving: it did not ask a door it has no business asking");

    vault.revoke(desk.userId, desk.workspaceId, "binance", { reason: "pulled by the desk" });
    ok(refusal(vault.material(desk.workspaceId, "binance")).code === CODES.SECRET_REVOKED,
        "but once the owner pulls the key, the engine's door is shut in the same breath as the person's");
    ok(vault.stats().decisions.refused === before.refused + 1, "and that refusal was counted, not swallowed");
}

/* ------------------------------------------------------------
 * 8. Nothing that leaves this layer carries a plaintext
 * ---------------------------------------------------------- */

function nothingThatLeavesThisLayerCarriesAPlaintext() {
    const { identity, vault } = harness();
    const { userId, workspaceId } = signedIn(identity);
    const operator = joined(identity, userId, workspaceId, "operator@example.com", "operator");

    const seen = [];
    for (const event of Object.values(EVENTS)) vault.on(event, (payload) => seen.push({ name: event, payload }));

    const put = vault.put(userId, workspaceId, { provider: "binance", value: SECRET });
    const got = vault.get(userId, workspaceId, "binance");
    const listed = vault.list(userId, workspaceId);
    vault.get(operator, workspaceId, "binance");
    const pulled = vault.revoke(userId, workspaceId, "binance", { reason: "leaked" });
    const missing = refusal(vault.get(userId, workspaceId, "bitget"));
    const stats = vault.stats();
    const trail = identity.trail(userId, { workspaceId });
    const surfaces = JSON.stringify([seen, put, listed, pulled, missing, stats, trail]);

    ok(seen.length === 4, "a write, a read, a refusal and a revocation were each published");
    ok(new Set(seen.map((event) => event.name)).size === 4, "one of each, and nothing was published twice");
    ok(seen.every((event) => event.payload.workspaceId === workspaceId), "and each names the workspace it decided about");
    ok(seen.every((event) => Object.isFrozen(event.payload)),
        "each payload is frozen on the way out: a listener cannot rewrite what happened");
    ok(seen.every((event) => !("value" in event.payload) && !("ciphertext" in event.payload)),
        "and none of them carries a value or a sealed value");
    ok(!surfaces.includes(SECRET), "nothing this layer emits, returns or records contains the plaintext");
    ok(got.value === SECRET, "while the one door that is meant to hand a value out does — or none of it would matter");

    const opened = seen.find((event) => event.name === EVENTS.OPENED);
    ok(opened && opened.payload.keyId === createCipher({ key: KEY }).id,
        "the event for a read names the fingerprint of the key that opened it, and not the key");

    const denied = seen.find((event) => event.name === EVENTS.DENIED);
    ok(denied && denied.payload.permission === "secrets:read" && denied.payload.target === "binance:default",
        "the event for a refusal says which permission was missing and about which secret");
    ok(denied.payload.code === CODES.FORBIDDEN && denied.payload.actorUserId === operator,
        "and whose request it was, which is the whole reason the refusal is worth publishing");

    ok(listed.secrets.every((secret) => !("ciphertext" in secret) && !("value" in secret)),
        "an inventory is metadata about keys, row by row");
    ok(!JSON.stringify(listed).includes("v1$"), "and it cannot even spell the sealed format");
    ok(stats.keyId === createCipher({ key: KEY }).id && stats.derived === "raw",
        "the counters name the key by fingerprint, and the fingerprint is the one this key produces");
    ok(missing.code === CODES.SECRET_NOT_FOUND && !("value" in missing),
        "and a miss is a miss with nothing attached to it");
}

/* ------------------------------------------------------------
 * 9. A layer that was wired wrong does not start at all
 * ---------------------------------------------------------- */

function aLayerThatWasWiredWrongDoesNotStart() {
    const db = new Database(":memory:");
    migrate(db);
    migrateVault(db);
    const now = () => START;
    const authorize = () => ({ ok: true, role: "owner" });
    const throws = (fn) => { try { fn(); return null; } catch (error) { return error; } };

    ok(throws(() => createVault({ now, key: KEY, authorize })).code === CODES.NO_DB,
        "a vault handed no database is refused at construction, not at the first write");
    ok(throws(() => createVault({ db, key: KEY, authorize })).code === CODES.NO_CLOCK,
        "so is one handed no clock: this layer reads no clock of its own");
    ok(throws(() => createVault({ db, now, key: KEY })).code === CODES.NO_DB,
        "and one handed no door to ask, because a vault that decides permissions itself would be a second source of truth about power");
    ok(throws(() => createVault({ db, now, authorize })).code === CODES.NO_VAULT_KEY,
        "and one with no key to seal with");
    ok(throws(() => createVault({ db, now, authorize, key: "too short" })).code === CODES.NO_VAULT_KEY,
        "a value that is not a key is refused where keys are understood: by the cipher");
    ok(throws(() => createVault({ db, now, authorize, key: KEY, providers: [] })).code === CODES.PROVIDER_UNKNOWN,
        "a vault told to hold keys for no venue at all has nothing to hold");
    ok(throws(() => createVault({ db, now, authorize, key: KEY, audit: {} })).code === CODES.BAD_ENTRY,
        "and the trail is identity's chain or nothing at all, never a look-alike that verifies nothing");

    /* A vault wired correctly still starts, so none of the above is a constructor
     * that refuses everything. */
    const vault = createVault({ db, now, authorize, key: KEY });
    ok(vault.migrate().to === 1 && vault.version() === 1,
        "while a vault wired correctly opens, and can say which schema version it is");
    ok(vault.migrate().applied.length === 0, "and migrating twice is not a second migration");
    ok(vault.stats().audited === false, "and it says out loud that it was handed no trail");
    ok(throws(() => vault.on(EVENTS.PUT, null)).code === CODES.BAD_ENTRY,
        "subscribing nothing to an event is a wiring bug too — and the quiet kind that hides real events");
    ok(vault.providers().length === PROVIDERS.length, "the venues in force are the ones this deployment named");
}

/* ------------------------------------------------------------
 * The sections, in the order they were written
 * ---------------------------------------------------------- */

const SECTIONS = Object.freeze([
    ["1. a key goes in as plaintext and comes to rest sealed", aKeyGoesInSealedAndComesBackWhole],
    ["2. the vault is owner-shaped, because secrets:read is", theVaultIsOwnerShaped],
    ["3. revoking closes the door without deleting the row", revokingClosesTheDoorWithoutDeletingTheRow],
    ["4. a venue off the allow-list is refused, not stored", aVenueOffTheListIsRefusedRatherThanStored],
    ["5. every way of failing to open refuses in the same words", everyWayOfFailingToOpenRefusesTheSameWay],
    ["6. every vault decision lands in identity's own chain", everyDecisionLandsInIdentitysOwnChain],
    ["7. the engine's door is not a route, and still a door", theEnginesDoorIsNotARouteButIsStillADoor],
    ["8. nothing that leaves this layer carries a plaintext", nothingThatLeavesThisLayerCarriesAPlaintext],
    ["9. a layer that was wired wrong does not start", aLayerThatWasWiredWrongDoesNotStart]
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
    console.log("D2: the vault keeps what it was given, and hands it to two doors and no more.\n");
    process.exit(0);
}

run();


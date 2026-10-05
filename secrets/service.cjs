/* ============================================================
 * File: secrets/service.cjs
 * Section: secrets (Phase 5, step 3 — the vault)
 * Version: 1.0.0
 *
 * Role:
 *   Where an API key is put away and where it is handed back — and the two are
 *   never the same door. Four rules shape every line:
 *
 *     1. The vault never invents a key or a clock. Both come in.
 *     2. The vault never opens its own database and never decides who may do
 *        what. It is handed `db` and it asks `authorize` — identity's own door —
 *        before it touches a row. A vault that decides permissions on its own is
 *        a second source of truth about power.
 *     3. A value goes in as plaintext, comes to rest as a sealed string, and
 *        comes back out only through `get` (owner-only, human) or `material`
 *        (the execution engine's injection seam, never a route).
 *     4. No plaintext, no key and no passphrase ever reaches an event, the
 *        audit trail, a refusal or a log line. Every record here carries
 *        metadata only, and the test suite greps for that.
 *
 *   A revocation is not a delete. The row stays, the fact that it was revoked
 *   stays, and reading it refuses from then on: a key that leaked once must not
 *   be able to quietly come back.
 * ============================================================ */

const crypto = require("node:crypto");

const { CODES, refuse, accept, fail } = require("../identity/core/errors.cjs");
const { PERMISSIONS } = require("../identity/core/rbac.cjs");
const { PROVIDERS, DEFAULT_LABEL, isProvider, isLabel } = require("./core/providers.cjs");
const { createCipher } = require("./core/cipher.cjs");
const { requireDb, migrate, version, tables } = require("./store/schema.cjs");
const { createSecretStore } = require("./store/records.cjs");

const MAX_SECRET_BYTES = 16 * 1024;

/** What a listener may subscribe to. Every payload is metadata only. */
const EVENTS = Object.freeze({
    PUT: "secret-put",
    OPENED: "secret-opened",
    REVOKED: "secret-revoked",
    DENIED: "secret-denied"
});

function createVault(options = {}) {
    const {
        db,
        now,
        authorize,
        audit = null,
        providers = PROVIDERS,
        maxSecretBytes = MAX_SECRET_BYTES
    } = options;

    requireDb(db);
    if (typeof now !== "function") {
        fail(CODES.NO_CLOCK, "the vault is handed a clock, never reads one");
    }
    if (typeof authorize !== "function") {
        /* The same rule as a missing database: a layer that cannot answer its
         * one real question must not start. `no-db` names a dependency that was
         * not wired in, and that is exactly what this is. */
        fail(CODES.NO_DB, "the vault is handed identity.authorize — the door it asks before it acts");
    }
    if (!Array.isArray(providers) || providers.length === 0) {
        fail(CODES.PROVIDER_UNKNOWN, "the vault is handed the venues it holds keys for");
    }
    if (audit !== null && (typeof audit !== "object" || typeof audit.append !== "function")) {
        fail(CODES.BAD_ENTRY, "the audit seam is identity.stores.audit, or nothing at all");
    }

    const cipher = options.cipher ?? createCipher({ key: options.key, salt: options.salt, keyId: options.keyId });
    if (!cipher || typeof cipher.seal !== "function" || typeof cipher.open !== "function") {
        fail(CODES.NO_VAULT_KEY, "the vault is given a cipher from secrets/core/cipher.cjs");
    }

    const records = createSecretStore({ db });
    const listeners = new Map();
    const decisions = { allowed: 0, denied: 0, refused: 0 };

    /* ------------------------------------------------------------
     * The two ways this layer says something happened
     * ---------------------------------------------------------- */

    /** Subscribe to a decision. Returns the unsubscribe. */
    function on(event, handler) {
        if (typeof handler !== "function") {
            fail(CODES.BAD_ENTRY, "a listener is a function");
        }
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event).delete(handler);
    }

    /**
     * Handed over after the change it describes has already happened, frozen,
     * and carrying what happened about a key — never the key.
     */
    function emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return 0;
        const frozen = Object.freeze(payload);
        for (const handler of [...set]) handler(frozen);
        return set.size;
    }

    /**
     * The same events, written into identity's append-only chain when a trail
     * was handed in. A vault decision is worth finding later exactly as much as
     * a login is, and it belongs in the same chain rather than a second one
     * nothing verifies. `meta` is metadata: provider, label, key fingerprint,
     * size — never a value.
     */
    function record(action, outcome, fields) {
        if (!audit) return null;
        return audit.append({
            at: now(),
            action,
            outcome,
            workspaceId: fields.workspaceId ?? null,
            actorUserId: fields.actorUserId ?? null,
            code: fields.code ?? null,
            target: fields.target ?? null,
            meta: fields.meta ?? null
        });
    }

    /**
     * The one question asked before every act, and the answer is identity's. A
     * refusal here is not an error and not a candidate for a retry: it is the
     * answer, and it is recorded on the way out.
     */
    function ask(actorUserId, workspaceId, permission, action, fields = {}) {
        const opened = authorize(actorUserId, workspaceId, permission);
        if (!opened.ok) {
            decisions.denied += 1;
            const payload = Object.freeze({
                action,
                workspaceId: workspaceId ?? null,
                actorUserId: actorUserId ?? null,
                permission,
                code: opened.code,
                target: fields.target ?? null
            });
            emit(EVENTS.DENIED, payload);
            record(action, "deny", {
                workspaceId,
                actorUserId,
                code: opened.code,
                target: fields.target ?? null,
                meta: { permission, detail: opened.message }
            });
            return opened;
        }

        decisions.allowed += 1;
        return opened;
    }

    function miss(code, message, extra) {
        decisions.refused += 1;
        return refuse(code, message, extra);
    }

    /* ------------------------------------------------------------
     * What a caller hands in, checked before anything is sealed
     * ---------------------------------------------------------- */

    function labelOf(value) {
        const label = value === undefined || value === null ? DEFAULT_LABEL : value;
        if (!isLabel(label)) {
            fail(CODES.BAD_ENTRY, "a label is lower-case, 32 characters or fewer, and names a key of that venue");
        }
        return label;
    }

    /**
     * The shape of an entry, and the size ceiling. A key is a string; anything
     * else is a bug in the caller rather than a refusal to answer, because a
     * wrong type here means the request was never understood at all.
     */
    function entryOf(entry) {
        if (!entry || typeof entry !== "object") {
            fail(CODES.BAD_ENTRY, "a secret entry is an object");
        }
        if (typeof entry.provider !== "string" || entry.provider.length === 0) {
            fail(CODES.BAD_ENTRY, "a secret entry names a venue");
        }
        if (typeof entry.value !== "string" || entry.value.length === 0) {
            fail(CODES.BAD_ENTRY, "a secret entry carries a non-empty value");
        }

        const label = labelOf(entry.label);
        const bytes = Buffer.byteLength(entry.value, "utf8");
        if (bytes > maxSecretBytes) {
            fail(CODES.BAD_ENTRY, `a secret is at most ${maxSecretBytes} bytes (this one is ${bytes})`);
        }

        return { provider: entry.provider, label, value: entry.value, bytes };
    }

    /**
     * A venue the vault has no shape for is not an error, it is a no: the
     * allow-list is short on purpose, and it is the same list the adapters
     * publish under. The refusal repeats the venue asked for and the venues that
     * exist — neither is a secret.
     */
    function known(provider) {
        if (isProvider(provider, providers)) return null;
        return miss(CODES.PROVIDER_UNKNOWN, "the vault holds keys for a known venue, and this is not one of them", {
            provider,
            known: Object.freeze([...providers])
        });
    }

    /** `provider:label`, the one way a secret is named outside this file. */
    function targetOf(provider, label) {
        return `${provider}:${label}`;
    }

    /* ------------------------------------------------------------
     * put — seal a value into this workspace, replacing this one only
     * ---------------------------------------------------------- */

    function put(actorUserId, workspaceId, entry) {
        const { provider, label, value, bytes } = entryOf(entry);
        const target = targetOf(provider, label);

        const unknown = known(provider);
        if (unknown) return unknown;

        const opened = ask(actorUserId, workspaceId, PERMISSIONS.SECRETS_WRITE, "secret-put", { target });
        if (!opened.ok) return opened;

        /* Read first: whether this is a first write, a rotation or a revival is
         * worth knowing for the audit line — and `save` only tells us after. */
        const before = records.rawByKey(workspaceId, provider, label);
        const sealed = cipher.seal(value);

        const secret = records.save({
            id: crypto.randomUUID(),
            workspaceId,
            provider,
            label,
            keyId: cipher.id,
            algorithm: cipher.algorithm,
            ciphertext: sealed,
            createdBy: actorUserId,
            at: now()
        });

        const created = before === null;
        const revived = Boolean(before && before.revoked_at !== null);

        emit(EVENTS.PUT, {
            action: "put",
            workspaceId,
            actorUserId,
            provider,
            label,
            keyId: cipher.id,
            algorithm: cipher.algorithm,
            bytes,
            created,
            revived
        });
        record("secret-put", "allow", {
            workspaceId,
            actorUserId,
            target,
            meta: { provider, label, keyId: cipher.id, algorithm: cipher.algorithm, bytes, created, revived }
        });

        return accept({ secret, bytes, created, revived });
    }

    /* ------------------------------------------------------------
     * Opening a value — one door, two callers
     * ---------------------------------------------------------- */

    /**
     * The only place a sealed value is opened. Both callers pass through it, so
     * "a revoked key stays revoked" and "an edited row refuses" hold for the
     * execution engine exactly as they hold for a person.
     */
    function read(workspaceId, provider, label, action, actorUserId) {
        const target = targetOf(provider, label);
        const row = records.rawByKey(workspaceId, provider, label);

        if (!row) {
            record(action, "deny", { workspaceId, actorUserId, code: CODES.SECRET_NOT_FOUND, target });
            return miss(CODES.SECRET_NOT_FOUND, "there is no such secret in this workspace", { target });
        }
        if (row.revoked_at !== null) {
            record(action, "deny", { workspaceId, actorUserId, code: CODES.SECRET_REVOKED, target });
            return miss(CODES.SECRET_REVOKED, "this secret was revoked and is not handed out again", {
                target,
                revokedAt: row.revoked_at,
                reason: row.revoked_reason
            });
        }

        const opened = cipher.open(row.ciphertext);
        if (!opened.ok) {
            /* The tag said no: the row was edited, or the key that sealed it is
             * gone. The caller learns nothing beyond that, and that is the
             * whole purpose of authenticating instead of only encrypting. */
            record(action, "deny", {
                workspaceId,
                actorUserId,
                code: CODES.BAD_KEY,
                target,
                meta: { keyId: row.key_id }
            });
            return miss(CODES.BAD_KEY, "the stored value did not authenticate against this key", {
                target,
                keyId: row.key_id
            });
        }

        records.touch(row.id, now());
        emit(EVENTS.OPENED, {
            action,
            workspaceId,
            actorUserId: actorUserId ?? null,
            provider,
            label,
            keyId: row.key_id
        });
        record(action, "allow", {
            workspaceId,
            actorUserId,
            target,
            meta: { keyId: row.key_id, algorithm: row.algorithm, useCount: row.use_count + 1 }
        });

        return accept({
            secret: records.findByKey(workspaceId, provider, label),
            provider,
            label,
            keyId: row.key_id,
            value: opened.value
        });
    }

    /** A person reads a workspace's key. Owner-only, because `secrets:read` is. */
    function get(actorUserId, workspaceId, provider, options = {}) {
        const label = labelOf(options.label);
        const target = targetOf(provider, label);

        const unknown = known(provider);
        if (unknown) return unknown;

        const opened = ask(actorUserId, workspaceId, PERMISSIONS.SECRETS_READ, "secret-get", { target });
        if (!opened.ok) return opened;

        return read(workspaceId, provider, label, "secret-get", actorUserId);
    }

    /**
     * The engine's door, and deliberately not a route: an execution process is
     * not a person, so there is no role to ask about and no membership to check.
     * It takes a workspace id the caller already holds, and the gateway must not
     * map it to an HTTP path — the seam test asserts that it does not.
     */
    function material(workspaceId, provider, options = {}) {
        const label = labelOf(options.label);

        const unknown = known(provider);
        if (unknown) return unknown;

        return read(workspaceId, provider, label, "secret-inject", null);
    }

    /* ------------------------------------------------------------
     * list — what is here, never what it says
     * ---------------------------------------------------------- */

    /**
     * The inventory: rows mapped through `shape`, so a sealed value cannot leave
     * this call even by accident. `counts` comes back with it because a screen
     * that lists keys without saying how many are revoked invites the wrong
     * conclusion.
     */
    function list(actorUserId, workspaceId, options = {}) {
        const provider = options.provider ?? null;
        if (provider !== null) {
            const unknown = known(provider);
            if (unknown) return unknown;
        }

        const opened = ask(actorUserId, workspaceId, PERMISSIONS.SECRETS_READ, "secret-list", {
            target: provider ? `${provider}:*` : "*"
        });
        if (!opened.ok) return opened;

        const secrets = records.listForWorkspace(workspaceId, provider ? { provider } : {});
        record("secret-list", "allow", {
            workspaceId,
            actorUserId,
            target: provider ? `${provider}:*` : "*",
            meta: { n: secrets.length, provider }
        });

        return accept({ secrets, counts: records.countsFor(workspaceId) });
    }

    /* ------------------------------------------------------------
     * revoke — the row stays, the door closes
     * ---------------------------------------------------------- */

    /**
     * Revocation is not deletion, and the difference is the point: the row, its
     * key fingerprint and the reason stay behind, so a key that was pulled after
     * a leak can be told apart from one that never existed.
     */
    function revoke(actorUserId, workspaceId, provider, options = {}) {
        const label = labelOf(options.label);
        const target = targetOf(provider, label);

        const unknown = known(provider);
        if (unknown) return unknown;

        const opened = ask(actorUserId, workspaceId, PERMISSIONS.SECRETS_WRITE, "secret-revoke", { target });
        if (!opened.ok) return opened;

        const row = records.rawByKey(workspaceId, provider, label);
        if (!row) {
            record("secret-revoke", "deny", { workspaceId, actorUserId, code: CODES.SECRET_NOT_FOUND, target });
            return miss(CODES.SECRET_NOT_FOUND, "there is no such secret in this workspace", { target });
        }
        if (row.revoked_at !== null) {
            record("secret-revoke", "deny", { workspaceId, actorUserId, code: CODES.SECRET_REVOKED, target });
            return miss(CODES.SECRET_REVOKED, "this secret is already revoked", {
                target,
                revokedAt: row.revoked_at
            });
        }

        const reason = typeof options.reason === "string" && options.reason.length > 0
            ? options.reason.slice(0, 200)
            : null;
        const at = now();
        records.markRevoked(row.id, { at, reason, by: actorUserId });

        emit(EVENTS.REVOKED, {
            action: "revoke",
            workspaceId,
            actorUserId,
            provider,
            label,
            keyId: row.key_id,
            reason
        });
        record("secret-revoke", "allow", {
            workspaceId,
            actorUserId,
            target,
            meta: { provider, label, keyId: row.key_id, reason }
        });

        return accept({ secret: records.findByKey(workspaceId, provider, label) });
    }

    /* ------------------------------------------------------------
     * The seams a gateway, a test and the engine all need
     * ---------------------------------------------------------- */

    function stats() {
        return Object.freeze({
            decisions: Object.freeze({ ...decisions }),
            providers: Object.freeze([...providers]),
            keyId: cipher.id,
            algorithm: cipher.algorithm,
            derived: cipher.derived,
            maxSecretBytes,
            audited: Boolean(audit)
        });
    }

    return Object.freeze({
        /* the vault's four verbs — each one asks the door first */
        put,
        get,
        list,
        revoke,

        /* not a verb of the API: the engine's injection seam, unauthenticated by
         * design, and never reachable through the gateway */
        material,

        /* the seams */
        on,
        stats,
        migrate: () => migrate(db),
        version: () => version(db),
        providers: () => Object.freeze([...providers]),
        events: Object.freeze(EVENTS),
        core: Object.freeze({ CODES, PERMISSIONS, DEFAULT_LABEL, MAX_SECRET_BYTES: maxSecretBytes }),
        stores: Object.freeze({
            secrets: records,
            cipher,
            schema: Object.freeze({ migrate, version, tables })
        })
    });
}

module.exports = { createVault, MAX_SECRET_BYTES, EVENTS };

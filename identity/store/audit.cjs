/* ============================================================
 * File: identity/store/audit.cjs
 * Section: identity/store
 * Version: 1.0.0
 *
 * Role:
 *   An append-only record of every allow and every deny that matters, where
 *   "append-only" is not a promise in a comment but a property that can be
 *   checked: each row carries the hash of the row before it, so editing or
 *   dropping a row in the middle breaks the chain and `verify()` says exactly
 *   where. The hash covers the whole entry, so a rewritten outcome is as
 *   visible as a deleted line.
 *
 *   The chain is only as good as what it covers, so `meta` — the free-form
 *   part — is folded into the hash as its JSON text, never as an object that
 *   could be re-ordered later.
 * ============================================================ */

const crypto = require("node:crypto");

const { CODES, fail } = require("../core/errors.cjs");

const GENESIS = "0".repeat(64);
const DEFAULT_LIMIT = 50;

function createAuditStore(options = {}) {
    const { db } = options;
    if (!db || typeof db.prepare !== "function") {
        fail(CODES.NO_DB, "the audit store needs an open database");
    }

    const insert = db.prepare(`INSERT INTO audit
        (at, workspace_id, actor_user_id, action, outcome, code, target, meta, prev_hash, hash)
        VALUES (@at, @workspaceId, @actorUserId, @action, @outcome, @code, @target, @meta, @prevHash, @hash)`);
    const head = db.prepare("SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1");
    const every = db.prepare("SELECT * FROM audit ORDER BY seq");
    const page = db.prepare(`SELECT * FROM audit
        WHERE (@workspaceId IS NULL OR workspace_id = @workspaceId) AND seq > @sinceSeq
        ORDER BY seq DESC LIMIT @limit`);
    const total = db.prepare("SELECT COUNT(*) AS n FROM audit");
    const denials = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE outcome = 'deny'");

    function text(value) {
        return typeof value === "string" && value.length ? value : null;
    }

    function shape(row) {
        return Object.freeze({
            seq: row.seq,
            at: row.at,
            workspaceId: row.workspace_id,
            actorUserId: row.actor_user_id,
            action: row.action,
            outcome: row.outcome,
            code: row.code,
            target: row.target,
            meta: row.meta,
            prevHash: row.prev_hash,
            hash: row.hash
        });
    }

    function canonical(entry) {
        return JSON.stringify([
            entry.at,
            entry.workspaceId,
            entry.actorUserId,
            entry.action,
            entry.outcome,
            entry.code,
            entry.target,
            entry.meta
        ]);
    }

    function digestOf(prevHash, entry) {
        return crypto.createHash("sha256").update(`${prevHash}\n${canonical(entry)}`).digest("hex");
    }

    /** Write one entry and return it with its sequence and hash. */
    function append(entry = {}) {
        if (!Number.isFinite(entry.at)) {
            fail(CODES.NO_CLOCK, "an audit entry carries the time it happened");
        }
        if (typeof entry.action !== "string" || !entry.action.length) {
            fail(CODES.BAD_ENTRY, "an audit entry names an action");
        }

        const row = {
            at: entry.at,
            workspaceId: text(entry.workspaceId),
            actorUserId: text(entry.actorUserId),
            action: entry.action,
            outcome: entry.outcome === "deny" ? "deny" : "allow",
            code: text(entry.code),
            target: text(entry.target),
            meta: entry.meta === undefined || entry.meta === null ? null : JSON.stringify(entry.meta)
        };

        const previous = head.get();
        const prevHash = previous ? previous.hash : GENESIS;
        const hash = digestOf(prevHash, row);
        const info = insert.run({ ...row, prevHash, hash });

        return shape({ seq: info.lastInsertRowid, ...row, prevHash, hash });
    }

    /** Walk the chain. `brokenAt` is the first row that does not belong — or none. */
    function verify() {
        let prevHash = GENESIS;
        let checked = 0;

        for (const row of every.all()) {
            const expected = digestOf(prevHash, {
                at: row.at,
                workspaceId: row.workspace_id,
                actorUserId: row.actor_user_id,
                action: row.action,
                outcome: row.outcome,
                code: row.code,
                target: row.target,
                meta: row.meta
            });
            if (row.prev_hash !== prevHash || row.hash !== expected) {
                return Object.freeze({ ok: false, checked, brokenAt: row.seq, head: prevHash });
            }
            prevHash = row.hash;
            checked += 1;
        }

        return Object.freeze({ ok: true, checked, brokenAt: null, head: prevHash });
    }

    /** Newest first, one workspace or all of them. */
    function trail(options = {}) {
        const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : DEFAULT_LIMIT;
        const sinceSeq = Number.isFinite(options.sinceSeq) ? Math.floor(options.sinceSeq) : 0;
        const workspaceId = text(options.workspaceId);

        return Object.freeze(page.all({ workspaceId, sinceSeq, limit }).map(shape));
    }

    function counts() {
        return Object.freeze({ entries: total.get().n, denials: denials.get().n });
    }

    return Object.freeze({ append, verify, trail, counts, GENESIS });
}

module.exports = { createAuditStore, GENESIS, DEFAULT_LIMIT };

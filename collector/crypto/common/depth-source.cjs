/* ============================================================
 * File: collector/crypto/common/depth-source.cjs
 * Section: collector/crypto/common
 * Version: 1.0.0
 *
 * Role:
 *   Single source of truth for depth packets (Phase-0 fix #3):
 *     1. one shared allow-list  → depthKind() / isDepthBookPacket()
 *     2. one winning feed/book  → DepthSourceSelector
 *
 *   Two feeds can describe the same (exchange, market, symbol) book:
 *     - the venue native feed : top-N native book + incremental patches
 *     - the synchronized book : <venue>/orderbook-sync.cjs → depth_full*
 *
 *   Feeding both into depth_100 / depth_delta / depth_pressure /
 *   depth_imbalance / depth_aggregator counts the same liquidity twice,
 *   and a 1-level native patch is not a book at all. The selector keeps
 *   exactly one authoritative feed per book:
 *
 *     synced packet, sequenceStatus ≠ "invalid" → synced book is the winner
 *     native packet and synced book fresh (< ttl) → native is dropped
 *     native packet and synced book stale (≥ ttl) → native TOP-N book is
 *                                                    the tagged fallback
 *     native patch (native_patch / native_level2) → never treated as a book
 *
 *   Every inspected packet is annotated in place so downstream consumers
 *   (analytics modules, health gates, dashboards) can see the provenance:
 *     data.depthKind          "synced_book" | "native_book" | "native_patch"
 *     data.depthSource        "synced_book" | "native"
 *     data.depthAuthoritative boolean
 *     data.depthSourceReason  machine-readable reason
 *
 *   `decision.switched` reports a change of the AUTHORITATIVE feed of a
 *   book, so the `depth_source` event published by the registration table
 *   fires on real fail-over/recovery only — never on the steady stream of
 *   native packets that are dropped while the synced book is healthy.
 *
 * Relations:
 *   - selector step : collector/crypto/realtime/registrations/futures.cjs
 *   - allow-list    : collector/crypto/realtime/futures/depth/depth_*.cjs
 *   - producers     : collector/crypto/realtime/venues/<venue>/futures/ws.cjs
 * ============================================================ */

/* ------------------------------------------------------------
 * Shared allow-list (the only place depth packet names live)
 * ---------------------------------------------------------- */
const SYNCED_BOOK_TYPES = Object.freeze([
    "depth_full",
    "depth_full_diff",
    "depth_full_snapshot"
]);

const NATIVE_FEED_TYPES = Object.freeze([
    "depth",
    "depth_20",
    "depth_100",
    "depth_medium",
    "depth_partial"
]);

/* depthType labels written by the venue websockets */
const DEPTH_TYPE_NATIVE_BOOK = "native_top_n";
const DEPTH_TYPE_NATIVE_PATCH = "native_patch";
const LEGACY_PATCH_DEPTH_TYPES = Object.freeze(["native_level2"]);

/* ------------------------------------------------------------
 * Producer contract (collector/crypto/realtime/venues/<venue>/futures/ws.cjs)
 *   depth_full_snapshot / depth_full_diff  → synchronized book (depthType "full")
 *   depth_partial + native_top_n           → native feed that pushes the
 *                                            COMPLETE top-N book
 *                                            (binance @depth20, venue snapshots)
 *   depth_partial + native_patch           → incremental native delta or a
 *                                            1-level level2 change
 *   depth_partial (no depthType)           → legacy native feed → patch
 * ---------------------------------------------------------- */

const KIND = Object.freeze({
    SYNCED_BOOK: "synced_book",
    NATIVE_BOOK: "native_book",
    NATIVE_PATCH: "native_patch"
});

const SOURCE = Object.freeze({
    SYNCED_BOOK: "synced_book",
    NATIVE: "native"
});

const SYNCED_BOOK_TTL_MS = 5000;
const INVALID_SEQUENCE_STATUS = "invalid";

/* ------------------------------------------------------------
 * Classification
 * ---------------------------------------------------------- */
function packetDepthType(data) {
    return String((data && data.depthType) || "");
}

function depthKind(data) {
    if (!data) return null;

    const type = String(data.type || data.event || "");
    if (SYNCED_BOOK_TYPES.includes(type)) return KIND.SYNCED_BOOK;

    const depthType = packetDepthType(data);
    if (depthType === DEPTH_TYPE_NATIVE_BOOK) return KIND.NATIVE_BOOK;
    if (depthType === DEPTH_TYPE_NATIVE_PATCH) return KIND.NATIVE_PATCH;
    if (LEGACY_PATCH_DEPTH_TYPES.includes(depthType)) return KIND.NATIVE_PATCH;

    /* Packets that explicitly declare themselves incremental patches. */
    if (data.patch === true || data.incremental === true) return KIND.NATIVE_PATCH;

    /* Legacy native feeds are incremental by construction → never a book. */
    if (NATIVE_FEED_TYPES.includes(type)) return KIND.NATIVE_PATCH;

    return null;
}

function isSyncedBookPacket(data) {
    return depthKind(data) === KIND.SYNCED_BOOK;
}

/**
 * A packet that really carries a book (synced full book or native top-N
 * book). Native patches are explicitly excluded.
 */
function isDepthBookPacket(data) {
    const kind = depthKind(data);
    return kind === KIND.SYNCED_BOOK || kind === KIND.NATIVE_BOOK;
}

function isNativePatchPacket(data) {
    return depthKind(data) === KIND.NATIVE_PATCH;
}

/** Legacy "does this packet carry a depth payload" guard. */
function hasDepthPayload(data) {
    return !!(data && data.bids && data.asks);
}

function isUsableSequenceStatus(status) {
    return String(status || "") !== INVALID_SEQUENCE_STATUS;
}

function depthKey(data) {
    const exchange = String((data && data.exchange) || "unknown");
    const market = String((data && data.market) || "futures");
    const symbol = String((data && (data.symbol || data.sourceSymbol)) || "unknown");
    return `${exchange}:${market}:${symbol}`;
}

function annotate(data, decision) {
    if (!data || !decision) return data;
    data.depthKind = decision.kind;
    data.depthSource = decision.source;
    data.depthAuthoritative = decision.authoritative;
    data.depthSourceReason = decision.reason;
    return data;
}

/* ------------------------------------------------------------
 * Winner selection
 * ---------------------------------------------------------- */
class DepthSourceSelector {
    constructor({ ttlMs = SYNCED_BOOK_TTL_MS, now = () => Date.now() } = {}) {
        this.ttlMs = ttlMs;
        this.now = now;
        this.books = new Map();
        this.stats = {
            inspected: 0,
            syncedBook: 0,
            nativeBook: 0,
            nativePatch: 0,
            fallbacks: 0,
            switches: 0
        };
    }

    entry(key) {
        let value = this.books.get(key);
        if (!value) {
            value = { lastSyncedAt: 0, sequenceStatus: null, source: null, activeSource: null, kind: null, reason: null };
            this.books.set(key, value);
        }
        return value;
    }

    /**
     * Decide whether this packet may feed the depth analytics modules and
     * annotate it with the outcome.
     *
     * @returns {{key:string,kind:string,source:string,authoritative:boolean,reason:string,ageMs:number|null,switched:boolean}|null}
     */
    decide(data, timestamp = this.now()) {
        const kind = depthKind(data);
        if (!kind) return null;

        const key = depthKey(data);
        const entry = this.entry(key);
        const sequenceStatus = (data && data.sequenceStatus) || null;

        let source = SOURCE.SYNCED_BOOK;
        let authoritative = true;
        let reason = "synced_book_healthy";

        if (kind === KIND.SYNCED_BOOK) {
            authoritative = isUsableSequenceStatus(sequenceStatus);
            reason = authoritative ? "synced_book_healthy" : `synced_book_${sequenceStatus}`;
            if (authoritative) {
                entry.lastSyncedAt = timestamp;
                entry.sequenceStatus = sequenceStatus;
            }
        } else if (kind === KIND.NATIVE_PATCH) {
            source = SOURCE.NATIVE;
            authoritative = false;
            reason = "native_patch_not_a_book";
        } else {
            const ageMs = entry.lastSyncedAt ? timestamp - entry.lastSyncedAt : null;
            const fresh = ageMs !== null && ageMs <= this.ttlMs;
            source = SOURCE.NATIVE;
            authoritative = !fresh;
            reason = fresh ? "synced_book_fresh" : "synced_book_stale";
            if (authoritative) this.stats.fallbacks += 1;
        }

        /* A switch is a change of the AUTHORITATIVE feed only: a stream of
         * dropped native packets must not flood the bus with `depth_source`. */
        const switched = authoritative && !!entry.activeSource && entry.activeSource !== source;
        if (authoritative) entry.activeSource = source;

        entry.source = source;
        entry.kind = kind;
        entry.reason = reason;

        this.stats.inspected += 1;
        if (kind === KIND.SYNCED_BOOK) this.stats.syncedBook += 1;
        else if (kind === KIND.NATIVE_BOOK) this.stats.nativeBook += 1;
        else this.stats.nativePatch += 1;
        if (switched) this.stats.switches += 1;

        const decision = {
            key,
            kind,
            source,
            authoritative,
            reason,
            ageMs: entry.lastSyncedAt ? timestamp - entry.lastSyncedAt : null,
            sequenceStatus,
            switched
        };

        annotate(data, decision);
        return decision;
    }

    state(key = null) {
        if (key) return this.books.get(key) || null;
        return Object.fromEntries(this.books);
    }

    reset() {
        this.books.clear();
        for (const name of Object.keys(this.stats)) this.stats[name] = 0;
    }
}

const depthSource = new DepthSourceSelector();

/**
 * Selector used by the futures registration table (priority 202).
 * It annotates the packet while deciding.
 */
function decideDepthSource(data, timestamp) {
    return depthSource.decide(data, timestamp);
}

/**
 * Single-source gate for the depth analytics modules.
 * Reuses the decision already stamped by the selector when present, so a
 * packet is never evaluated twice (no double counting, no clock drift).
 */
function isDepthAnalyticsSource(data, timestamp) {
    if (!data) return false;
    if (typeof data.depthAuthoritative === "boolean") return data.depthAuthoritative;
    const decision = decideDepthSource(data, timestamp);
    return !!(decision && decision.authoritative);
}

/**
 * True when the packet carries a book AND is the winning feed for it.
 */
function isAuthoritativeBookPacket(data, timestamp) {
    return isDepthBookPacket(data) && isDepthAnalyticsSource(data, timestamp);
}

function depthSourceSummary() {
    return {
        ttlMs: depthSource.ttlMs,
        stats: { ...depthSource.stats },
        books: depthSource.books.size
    };
}

function resetDepthSource() {
    depthSource.reset();
}

module.exports = {
    /* allow-list */
    SYNCED_BOOK_TYPES,
    NATIVE_FEED_TYPES,
    KIND,
    SOURCE,
    SYNCED_BOOK_TTL_MS,
    NATIVE_PATCH_DEPTH_TYPE: DEPTH_TYPE_NATIVE_PATCH,
    NATIVE_BOOK_DEPTH_TYPE: DEPTH_TYPE_NATIVE_BOOK,
    /* classification */
    depthKind,
    depthKey,
    hasDepthPayload,
    isSyncedBookPacket,
    isDepthBookPacket,
    isNativePatchPacket,
    /* single source */
    DepthSourceSelector,
    depthSource,
    decideDepthSource,
    isDepthAnalyticsSource,
    isAuthoritativeBookPacket,
    depthSourceSummary,
    resetDepthSource
};

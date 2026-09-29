/* ============================================================
 * File: test/depth-source.test.cjs
 *
 * Verifies Phase-0 fix #3 — single-source depth + unified allow-list:
 *
 *   1. classification allow-list (synced book / native book / patch)
 *   2. winner selection (synced wins, fresh native dropped, stale native
 *      becomes the tagged fallback, invalid synced never wins)
 *   3. end-to-end through the realtime futures handler: a synced book
 *      emits the depth analytics, a native patch of the same book does
 *      not (no double counting) while the health marker still fires
 *   4. depth_full mirrors the synced book as a replacement (no ghost
 *      levels left behind by a departed price)
 *   5. depth_delta never diffs across two different feeds
 * ============================================================ */

const assert = require("node:assert/strict");
const realtime = require("../collector/crypto/realtime/index.cjs");
const {
    KIND,
    SYNCED_BOOK_TTL_MS,
    DepthSourceSelector,
    depthKind,
    depthSource,
    depthSourceSummary,
    isDepthBookPacket,
    isNativePatchPacket,
    isSyncedBookPacket,
    resetDepthSource
} = require("../collector/crypto/common/depth-source.cjs");

/* ------------------------------------------------------------
 * 1. classification allow-list
 * ---------------------------------------------------------- */
assert.equal(depthKind({ type: "depth_full_diff" }), KIND.SYNCED_BOOK);
assert.equal(depthKind({ type: "depth_full_snapshot" }), KIND.SYNCED_BOOK);
assert.equal(depthKind({ type: "depth_full" }), KIND.SYNCED_BOOK);
assert.equal(depthKind({ type: "depth", depthType: "native_top_n" }), KIND.NATIVE_BOOK);
assert.equal(depthKind({ type: "depth", depthType: "native_patch" }), KIND.NATIVE_PATCH);
assert.equal(depthKind({ type: "depth", depthType: "native_level2" }), KIND.NATIVE_PATCH);
/* producer labels — only a complete top-N push counts as a native book */
assert.equal(depthKind({ type: "depth_partial", depthType: "native_top_n" }), KIND.NATIVE_BOOK, "binance @depth20 pushes the whole book");
assert.equal(depthKind({ type: "depth_partial", depthType: "native_patch" }), KIND.NATIVE_PATCH, "venue depth deltas are patches");
assert.equal(depthKind({ type: "depth_partial" }), KIND.NATIVE_PATCH, "unlabelled legacy native feeds are patches");
assert.equal(depthKind({ type: "depth_100" }), KIND.NATIVE_PATCH, "legacy native feeds are patches, never a book");
assert.equal(depthKind({ type: "depth_partial" }), KIND.NATIVE_PATCH);
assert.equal(depthKind({ type: "depth", patch: true }), KIND.NATIVE_PATCH);
assert.equal(depthKind({ type: "trade", price: 1 }), null, "non-depth packets stay unclassified");
assert.equal(depthKind(null), null);

assert.ok(isDepthBookPacket({ type: "depth_full_diff" }));
assert.ok(isDepthBookPacket({ type: "depth", depthType: "native_top_n" }));
assert.ok(!isDepthBookPacket({ type: "depth", depthType: "native_patch" }));
assert.ok(isSyncedBookPacket({ type: "depth_full_snapshot" }) && !isSyncedBookPacket({ type: "depth" }));
assert.ok(isNativePatchPacket({ type: "depth", depthType: "native_level2" }));

/* ------------------------------------------------------------
 * 2. winner selection
 * ---------------------------------------------------------- */
let clock = 1_000_000;
const selector = new DepthSourceSelector({ ttlMs: 5000, now: () => clock });

function packet(overrides = {}) {
    return {
        exchange: "binance",
        market: "futures",
        symbol: "BTCUSDT",
        bids: [{ price: 100, qty: 1 }],
        asks: [{ price: 101, qty: 1 }],
        ...overrides
    };
}

const synced = packet({ type: "depth_full_diff", sequenceStatus: "synchronized" });
let decision = selector.decide(synced);
assert.equal(decision.source, "synced_book");
assert.equal(decision.authoritative, true);
assert.equal(decision.reason, "synced_book_healthy");
assert.equal(decision.switched, false, "the first packet of a book is not a switch");
assert.equal(synced.depthKind, "synced_book");
assert.equal(synced.depthSource, "synced_book");
assert.equal(synced.depthAuthoritative, true);

const freshNative = packet({ type: "depth", depthType: "native_top_n" });
decision = selector.decide(freshNative, clock + 100);
assert.equal(decision.source, "native");
assert.equal(decision.authoritative, false, "the native feed is dropped while the synced book is fresh");
assert.equal(decision.reason, "synced_book_fresh");
assert.equal(decision.switched, false, "a dropped native packet is not a switch");
assert.equal(freshNative.depthSourceReason, "synced_book_fresh");

const patch = packet({ type: "depth", depthType: "native_patch" });
decision = selector.decide(patch, clock + 200);
assert.equal(decision.authoritative, false);
assert.equal(decision.switched, false);
assert.equal(decision.reason, "native_patch_not_a_book", "a 1-level patch is never a book");

const staleNative = packet({ type: "depth", depthType: "native_top_n" });
decision = selector.decide(staleNative, clock + SYNCED_BOOK_TTL_MS + 1);
assert.equal(decision.authoritative, true, "after the ttl the native top-N book is the fallback");
assert.equal(decision.reason, "synced_book_stale");
assert.equal(decision.switched, true, "the fail-over to the native fallback is a switch");
assert.equal(selector.stats.fallbacks, 1);

const recovered = packet({ type: "depth_full_snapshot", sequenceStatus: "healthy" });
decision = selector.decide(recovered, clock + SYNCED_BOOK_TTL_MS + 2);
assert.equal(decision.source, "synced_book");
assert.equal(decision.authoritative, true);
assert.equal(decision.switched, true, "coming back to the synced book is reported as a switch");
assert.equal(selector.stats.switches, 2, "fail-over and recovery are both reported");

const invalid = packet({ symbol: "ETHUSDT", type: "depth_full_diff", sequenceStatus: "invalid" });
decision = selector.decide(invalid, clock + SYNCED_BOOK_TTL_MS + 3);
assert.equal(decision.authoritative, false, "a broken synced chain never feeds the analytics");
assert.equal(decision.reason, "synced_book_invalid");
assert.equal(invalid.depthAuthoritative, false);

const summary = depthSourceSummary();
assert.equal(selector.books.size, 2, "the selector tracks one entry per book");
assert.equal(selector.stats.inspected, 6);
assert.equal(summary.stats.inspected, 0, "a local selector never touches the shared instance");
assert.equal(summary.books, 0);

/* ------------------------------------------------------------
 * 3. end-to-end: one source through the futures handler
 * ---------------------------------------------------------- */
resetDepthSource();

const SYMBOL = "SRCUSDT";
const FALLBACK_SYMBOL = "FALLUSDT";
const health = [];
const previousHealthEmit = global.healthEmit;
global.healthEmit = (event) => health.push(event && event.event);

/* Drive the shared selector from the test clock: identical logic, no waiting. */
const savedNow = depthSource.now;
const savedTtl = depthSource.ttlMs;
clock = 2_000_000;
depthSource.now = () => clock;
depthSource.ttlMs = SYNCED_BOOK_TTL_MS;

function run(symbol, data) {
    return realtime.futuresHandler({ symbol, data });
}

const namesOf = (events) => events.map((event) => event.event);

const DEPTH_ANALYTICS = [
    "depth_100",
    "depth_medium",
    "depth_full",
    "depth_delta",
    "depth_pressure",
    "depth_imbalance",
    "depth_aggregated"
];
const SYNCED_ONLY = ["depth_medium", "depth_full"];

const syncedEvents = run(SYMBOL, {
    exchange: "bybit",
    market: "futures",
    symbol: SYMBOL,
    type: "depth_full_snapshot",
    sequenceStatus: "healthy",
    bids: [{ price: 100, qty: 2 }],
    asks: [{ price: 101, qty: 1 }]
});
const syncedNames = namesOf(syncedEvents);

for (const event of DEPTH_ANALYTICS) {
    assert.ok(syncedNames.includes(event), `the synced book must emit ${event}`);
}
assert.ok(!syncedNames.includes("depth_source"), "the first authoritative feed is not a switch");

const medium = syncedEvents.find((event) => event.event === "depth_medium");
assert.equal(medium.depthSource, "synced_book", "every depth analytics event carries its provenance");
assert.equal(syncedEvents.find((event) => event.event === "depth_aggregated").payload.depthSource, "synced_book");

health.length = 0;

const nativeNames = namesOf(run(SYMBOL, {
    exchange: "bybit",
    market: "futures",
    symbol: SYMBOL,
    type: "depth",
    depthType: "native_patch",
    bids: [{ price: 100, qty: 50 }],
    asks: [{ price: 101, qty: 1 }]
}));

for (const event of DEPTH_ANALYTICS) {
    assert.ok(!nativeNames.includes(event), `the native patch must not emit ${event} (double counting)`);
}
assert.ok(!nativeNames.includes("depth_source"), "a dropped packet must not churn the feed event");
assert.ok(health.includes("depth"), "the depth health marker keeps firing for native packets");

/* ------------------------------------------------------------
 * 3b. fail-over: the synced book stops updating → tagged native book
 * ---------------------------------------------------------- */
run(FALLBACK_SYMBOL, {
    exchange: "bybit",
    market: "futures",
    symbol: FALLBACK_SYMBOL,
    type: "depth_full_snapshot",
    sequenceStatus: "healthy",
    bids: [{ price: 100, qty: 2 }],
    asks: [{ price: 101, qty: 1 }]
});

clock += SYNCED_BOOK_TTL_MS + 1;

const fallbackEvents = run(FALLBACK_SYMBOL, {
    exchange: "bybit",
    market: "futures",
    symbol: FALLBACK_SYMBOL,
    type: "depth",
    depthType: "native_top_n",
    bids: [{ price: 100, qty: 7 }],
    asks: [{ price: 101, qty: 3 }]
});
const fallbackNames = namesOf(fallbackEvents);
const announced = fallbackEvents.find((event) => event.event === "depth_source");

assert.ok(announced, "the fail-over to the native fallback must be announced");
assert.equal(announced.reason, "synced_book_stale");
assert.equal(announced.depthSource, "native");
assert.ok(fallbackNames.includes("depth_pressure"), "the tagged native fallback feeds the analytics");
const aggregated = fallbackEvents.find((event) => event.event === "depth_aggregated");
assert.equal(aggregated.payload.depthSource, "native", "the analytics must carry the provenance");
for (const event of SYNCED_ONLY) {
    assert.ok(!fallbackNames.includes(event), `${event} must stay synced-book only`);
}

depthSource.now = savedNow;
depthSource.ttlMs = savedTtl;
global.healthEmit = previousHealthEmit;

/* ------------------------------------------------------------
 * 4. depth_full mirrors the synced book (replacement, no ghosts)
 * ---------------------------------------------------------- */
const depthFull = require("../collector/crypto/realtime/futures/depth/depth_full.cjs");

const mirror = [];
const mirrorEmit = (event) => mirror.push(event);

depthFull({
    symbol: "MIRRORUSDT",
    emit: mirrorEmit,
    data: { type: "depth_full_diff", sequenceStatus: "healthy", bids: [{ price: 100, qty: 1 }, { price: 99, qty: 1 }], asks: [{ price: 101, qty: 1 }, { price: 102, qty: 1 }] }
});
depthFull({
    symbol: "MIRRORUSDT",
    emit: mirrorEmit,
    data: { type: "depth_full_diff", sequenceStatus: "healthy", bids: [{ price: 100, qty: 3 }], asks: [{ price: 101, qty: 2 }] }
});

assert.equal(mirror.length, 2);
assert.equal(mirror[0].bids.length, 2);
assert.equal(mirror[0].depthSource, "synced_book");
/* best level first on both sides: integer-like object keys iterate ascending,
 * so bids must be sorted descending explicitly */
assert.equal(mirror[0].bids[0].price, 100, "best bid first");
assert.equal(mirror[0].bids[1].price, 99);
assert.equal(mirror[0].asks[0].price, 101, "best ask first");
assert.equal(mirror[0].asks[1].price, 102);
assert.equal(mirror[1].bids.length, 1, "a price that left the book must not linger");
assert.equal(mirror[1].bids[0].price, 100);
assert.equal(mirror[1].bids[0].qty, 3);

/* ------------------------------------------------------------
 * 5. depth_delta never diffs across two feeds
 * ---------------------------------------------------------- */
const depthDelta = require("../collector/crypto/realtime/futures/depth/depth_delta.cjs");

const deltas = [];
const deltaEmit = (event) => deltas.push(event);
const deltaSymbol = "DELTAUSDT";
const nativeFallback = {
    type: "depth",
    depthType: "native_top_n",
    depthKind: "native_book",
    depthSource: "native",
    depthAuthoritative: true
};

depthDelta({ symbol: deltaSymbol, emit: deltaEmit, data: { type: "depth_full_diff", sequenceStatus: "healthy", bids: [{ price: 100, qty: 1 }], asks: [{ price: 101, qty: 1 }] } });
depthDelta({ symbol: deltaSymbol, emit: deltaEmit, data: { type: "depth_full_diff", sequenceStatus: "healthy", bids: [{ price: 100, qty: 4 }], asks: [{ price: 101, qty: 1 }] } });
depthDelta({ symbol: deltaSymbol, emit: deltaEmit, data: { ...nativeFallback, bids: [{ price: 100, qty: 9 }], asks: [{ price: 101, qty: 1 }] } });
depthDelta({ symbol: deltaSymbol, emit: deltaEmit, data: { ...nativeFallback, bids: [{ price: 100, qty: 11 }], asks: [{ price: 101, qty: 1 }] } });

assert.equal(deltas.length, 4);
assert.equal(deltas[0].comparable, false, "the first book has nothing to compare against");
assert.equal(deltas[1].comparable, true);
assert.equal(deltas[1].delta.bids[0].qty, 3, "same feed → real delta");
assert.equal(deltas[1].depthSource, "synced_book");
assert.equal(deltas[2].comparable, false, "a feed switch restarts the delta");
assert.deepEqual(deltas[2].delta, { bids: [], asks: [] });
assert.equal(deltas[3].comparable, true, "the fallback feed then diffs normally");

console.log("depth single-source tests passed: allow-list, winner selection, handler gate, mirror, delta");

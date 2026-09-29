/* ============================================================
 * File: depth_full.cjs
 * Market: futures
 * Version: 1.0.0
 *
 * Role:
 *   Mirrors the synchronized full orderbook published by
 *   <venue>/orderbook-sync.cjs as a `depth_full` event.
 *
 *   fix #3: the sync engine already merged the incremental patch into its
 *   own book before emitting, so every `depth_full*` packet carries the
 *   COMPLETE book → it is applied as a replacement. Re-merging only the
 *   levels present in the packet used to leave stale levels behind for
 *   every price that had left the book.
 *
 * Relations:
 *   - Input: depth_full_diff / depth_full_snapshot (allow-listed, fix #3)
 *   - Output: depth_full → depth_aggregator.cjs
 * ============================================================ */

const { isSyncedBookPacket, isDepthAnalyticsSource } = require("../../../common/depth-source.cjs");

const orderbooks = {};   // { BTCUSDT: { bids: {}, asks: {} } }

// Helper: ensure symbol orderbook exists
function ensureBook(symbol) {
    if (!orderbooks[symbol]) {
        orderbooks[symbol] = {
            bids: {},   // price: qty
            asks: {}    // price: qty
        };
    }
}

// Merge diff into orderbook
function applyDiff(book, bidsDiff, asksDiff) {

    // Merge bids
    bidsDiff.forEach(([price, qty]) => {
        if (qty === 0) {
            delete book.bids[price];
        } else {
            book.bids[price] = qty;
        }
    });

    // Merge asks
    asksDiff.forEach(([price, qty]) => {
        if (qty === 0) {
            delete book.asks[price];
        } else {
            book.asks[price] = qty;
        }
    });
}

// Optional: merge snapshot if provided
function normalizeLevels(levels) {
    if (!Array.isArray(levels)) return [];

    return levels.map(level => {
        if (Array.isArray(level)) return [Number(level[0]), Number(level[1])];
        if (level && typeof level === "object") {
            return [Number(level.price), Number(level.qty)];
        }
        return [undefined, undefined];
    }).filter(([price, qty]) => Number.isFinite(price) && Number.isFinite(qty));
}

function asOrderedList(bookSide, direction = "desc") {
    return Object.entries(bookSide || {}).map(([price, qty]) => ({
        price: Number(price),
        qty: Number(qty)
    })).filter(level => Number.isFinite(level.price) && Number.isFinite(level.qty))
        /* Object keys that look like integers iterate in ASCENDING order no
         * matter how they were inserted, so an explicit sort is mandatory:
         * bids descend (best first), asks ascend (best first). */
        .sort((a, b) => direction === "desc" ? b.price - a.price : a.price - b.price);
}

function applySnapshot(book, snapshot) {
    book.bids = {};
    book.asks = {};

    normalizeLevels(snapshot.bids).forEach(([price, qty]) => {
        book.bids[price] = qty;
    });

    normalizeLevels(snapshot.asks).forEach(([price, qty]) => {
        book.asks[price] = qty;
    });
}

module.exports = function depthFull({ symbol, data, emit }) {
    /* fix #3 — only the winning synced book may feed this module. */
    if (!isSyncedBookPacket(data) || !isDepthAnalyticsSource(data)) return;

    ensureBook(symbol);
    const book = orderbooks[symbol];

    if (data.patch === true || data.incremental === true) {
        /* Legacy incremental packet: merge what is present. */
        applyDiff(book, normalizeLevels(data.bids), normalizeLevels(data.asks));
    } else {
        /* Snapshot semantics: the packet carries the complete book. */
        applySnapshot(book, data);
    }

    emit({
        event: "depth_full",
        symbol,
        type: "depth_full",
        depthKind: data.depthKind,
        depthSource: data.depthSource,
        bids: asOrderedList(book.bids, "desc"),
        asks: asOrderedList(book.asks, "asc"),
        timestamp: data.timestamp
    });
};

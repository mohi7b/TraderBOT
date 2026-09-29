/* ============================================================
 * File: depth_delta.cjs
 * Path: collector/crypto/realtime/futures/depth/depth_delta.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes delta between current and previous depth snapshot.
 *   fix #3: only the winning feed is diffed, and a feed switch restarts
 *   the delta instead of mixing two different books.
 *
 * Relations:
 *   - Input: depth-source.cjs allow-list (common/depth-source.cjs)
 *   - Output: depth_delta → realtime-symbol-aggregator.cjs
 * ============================================================ */

const { isDepthBookPacket, isDepthAnalyticsSource } = require("../../../common/depth-source.cjs");

const last = {};

module.exports = function handleDepthDelta({ symbol, data, emit }) {
    if (!isDepthBookPacket(data) || !isDepthAnalyticsSource(data)) return;

    const current = { bids: data.bids, asks: data.asks };
    const previous = last[symbol];

    /* Never diff across feeds/kinds: synced book vs native book. */
    const comparable = !!previous && previous.kind === data.depthKind && previous.source === data.depthSource;

    let delta = { bids: [], asks: [] };

    if (comparable) {
        delta.bids = current.bids.map(levelDelta(previous.bids, "bid"));
        delta.asks = current.asks.map(levelDelta(previous.asks, "ask"));
    }

    last[symbol] = { bids: current.bids, asks: current.asks, kind: data.depthKind, source: data.depthSource };

    emit({
        event: "depth_delta",
        symbol,
        delta,
        comparable,
        depthKind: data.depthKind,
        depthSource: data.depthSource,
        timestamp: data.timestamp
    });
};

function levelDelta(previousLevels, side) {
    return level => {
        const previous = previousLevels.find(item => item.price === level.price);
        return {
            price: level.price,
            side,
            qty: level.qty - (previous ? previous.qty : 0)
        };
    };
}

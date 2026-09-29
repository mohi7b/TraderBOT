/* ============================================================
 * File: depth_imbalance.cjs
 * Path: collector/crypto/realtime/futures/depth/depth_imbalance.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes depth imbalance ratio on the winning feed only
 *   (fix #3: a native 1-level patch is never treated as a book).
 *
 * Relations:
 *   - Input: depth-source.cjs allow-list (common/depth-source.cjs)
 *   - Output: depth_imbalance → realtime-symbol-aggregator.cjs
 * ============================================================ */

const { isDepthBookPacket, isDepthAnalyticsSource } = require("../../../common/depth-source.cjs");

module.exports = function handleDepthImbalance({ symbol, data, emit }) {
    if (!isDepthBookPacket(data) || !isDepthAnalyticsSource(data)) return;

    const bidSum = data.bids.reduce((sum, level) => sum + Number(level.qty), 0);
    const askSum = data.asks.reduce((sum, level) => sum + Number(level.qty), 0);

    const imbalance = askSum === 0 ? 0 : bidSum / askSum;

    emit({
        event: "depth_imbalance",
        symbol,
        imbalance,
        depthKind: data.depthKind,
        depthSource: data.depthSource,
        timestamp: data.timestamp
    });
};

/* ============================================================
 * File: depth_pressure.cjs
 * Path: collector/crypto/realtime/futures/depth/depth_pressure.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes depth pressure (bid vs ask imbalance) on the winning feed only
 *   (fix #3: a native 1-level patch is never treated as a book).
 *
 * Relations:
 *   - Input: depth-source.cjs allow-list (common/depth-source.cjs)
 *   - Output: depth_pressure → realtime-symbol-aggregator.cjs
 * ============================================================ */

const { isDepthBookPacket, isDepthAnalyticsSource } = require("../../../common/depth-source.cjs");

module.exports = function handleDepthPressure({ symbol, data, emit }) {
    if (!isDepthBookPacket(data) || !isDepthAnalyticsSource(data)) return;

    const bidSum = data.bids.reduce((sum, level) => sum + Number(level.qty), 0);
    const askSum = data.asks.reduce((sum, level) => sum + Number(level.qty), 0);

    const pressure = bidSum - askSum;

    emit({
        event: "depth_pressure",
        symbol,
        pressure,
        bidSum,
        askSum,
        depthKind: data.depthKind,
        depthSource: data.depthSource,
        timestamp: data.timestamp
    });
};

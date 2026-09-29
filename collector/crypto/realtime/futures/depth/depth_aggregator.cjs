/* ============================================================
 * File: depth_aggregator.cjs
 * Path: collector/crypto/realtime/futures/depth/depth_aggregator.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Aggregates all depth-related signals into a single packet.
 *   fix #3: consumes the winning depth feed only (common/depth-source.cjs).
 *
 * Relations:
 *   - Input: depth, depth_100, depth_medium, depth_full* (allow-listed)
 *   - Output: depth_aggregated → worker
 * ============================================================ */

const { isDepthBookPacket, isDepthAnalyticsSource } = require("../../../common/depth-source.cjs");

module.exports = function handleDepthAggregator({ symbol, data, emit }) {
    /* fix #3 — unified allow-list + single source (common/depth-source.cjs) */
    if (!isDepthBookPacket(data) || !isDepthAnalyticsSource(data)) return;

    emit({
        event: "depth_aggregated",
        symbol,
        payload: {
            type: data.type,
            depthKind: data.depthKind,
            depthSource: data.depthSource,
            bids: data.bids,
            asks: data.asks
        },
        timestamp: data.timestamp
    });
};

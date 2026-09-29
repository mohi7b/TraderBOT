/* ============================================================
 * File: depth_100.cjs
 * Market: futures
 * Version: 1.0.0
 *
 * Role:
 *   Handles the top-100 view of the winning depth feed (fix #3).
 *
 * Relations:
 *   - Input: depth-source.cjs allow-list (synced book or native top-N book)
 *   - Output: depth_100 → depth_aggregator.cjs
 * ============================================================ */

const { isDepthBookPacket, isDepthAnalyticsSource } = require("../../../common/depth-source.cjs");

module.exports = function handleDepth100({ symbol, data, emit }) {
    /* fix #3 — unified allow-list + single source (common/depth-source.cjs) */
    if (!isDepthBookPacket(data) || !isDepthAnalyticsSource(data)) return;

    emit({
        event: "depth_100",
        symbol,
        bids: (data.bids || []).slice(0, 100),
        asks: (data.asks || []).slice(0, 100),
        depthKind: data.depthKind,
        depthSource: data.depthSource,
        timestamp: data.timestamp
    });
};

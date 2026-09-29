/* ============================================================
 * File: depth_medium.cjs
 * Market: futures
 * Version: 1.1.0
 *
 * Role:
 *   Medium (top-100) projection of the synchronized book.
 *   fix #3: only the synced book may feed this module — native packets
 *   carry a top-N/1-level view and would produce a phantom medium book.
 *
 * Relations:
 *   - Input: depth_full / depth_full_diff / depth_full_snapshot only
 *   - Output: depth_medium → depth_aggregator.cjs
 * ============================================================ */

const { isSyncedBookPacket, isDepthAnalyticsSource } = require("../../../common/depth-source.cjs");

module.exports = function handleDepthMedium({ symbol, data, emit }) {
    if (!isSyncedBookPacket(data) || !isDepthAnalyticsSource(data)) return;

    const bids = data.mediumBids || (data.bids || []).slice(0, 100);
    const asks = data.mediumAsks || (data.asks || []).slice(0, 100);

    emit({
        event: "depth_medium",
        symbol,
        type: "depth_medium",
        bids,
        asks,
        depthKind: data.depthKind,
        depthSource: data.depthSource,
        timestamp: data.timestamp
    });
};
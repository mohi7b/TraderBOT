/* ============================================================
 * File: liquidation_clusters.cjs
 * Path: collector/crypto/realtime/futures/liquidations/liquidation_clusters.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Detects liquidation clusters (multiple liquidations in short time).
 *
 * Relations:
 *   - Input: liquidation.cjs
 *   - Output: liquidation_clusters → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW_MS = 3000; // 3 seconds
let events = [];

module.exports = function handleLiquidationClusters({ symbol, data, emit }) {
    if (!data || data.type !== "liquidation") return;

    const ts = Number(data.timestamp);
    const qty = Number(data.qty);

    events.push({ ts, qty });

    events = events.filter(e => ts - e.ts <= WINDOW_MS);

    const totalQty = events.reduce((a, b) => a + b.qty, 0);

    emit({
        event: "liquidation_clusters",
        symbol,
        count: events.length,
        totalQty,
        timestamp: ts
    });
};

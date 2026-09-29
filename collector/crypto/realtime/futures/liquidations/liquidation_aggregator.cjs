/* ============================================================
 * File: liquidation_aggregator.cjs
 * Path: collector/crypto/realtime/futures/liquidations/liquidation_aggregator.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Aggregates all liquidation-related signals into a single packet.
 *
 * Relations:
 *   - Input: liquidation, liquidation_delta, liquidation_trend,
 *            liquidation_pressure, liquidation_clusters
 *   - Output: liquidation_aggregated → worker
 * ============================================================ */

module.exports = function handleLiquidationAggregator({ symbol, data, emit }) {
    const allowed = [
        "liquidation",
        "liquidation_delta",
        "liquidation_trend",
        "liquidation_pressure",
        "liquidation_clusters"
    ];

    if (!data || !allowed.includes(data.event)) return;

    emit({
        event: "liquidation_aggregated",
        symbol,
        payload: data,
        timestamp: data.timestamp
    });
};

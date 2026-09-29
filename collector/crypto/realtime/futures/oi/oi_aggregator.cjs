/* ============================================================
 * File: oi_aggregator.cjs
 * Path: collector/crypto/realtime/futures/oi/oi_aggregator.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Aggregates all OI-related signals into a single packet.
 *
 * Relations:
 *   - Input: oi, oi_delta, oi_trend, oi_pressure, oi_volatility
 *   - Output: oi_aggregated → worker
 * ============================================================ */

module.exports = function handleOIAggregator({ symbol, data, emit }) {
    const allowed = [
        "oi",
        "oi_delta",
        "oi_trend",
        "oi_pressure",
        "oi_volatility"
    ];

    if (!data || !allowed.includes(data.event)) return;

    emit({
        event: "oi_aggregated",
        symbol,
        payload: data,
        timestamp: data.timestamp
    });
};

/* ============================================================
 * File: candles_aggregator.cjs
 * Path: collector/crypto/realtime/futures/candles/candles_aggregator.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Aggregates all candle-related signals into a single packet.
 *
 * Relations:
 *   - Input: candle, candles_multi_tf
 *   - Output: candles_aggregated → worker
 * ============================================================ */

module.exports = function handleCandlesAggregator({ symbol, data, emit }) {
    const allowed = [
        "candle",
        "candles_multi_tf"
    ];

    if (!data || !allowed.includes(data.event)) return;

    emit({
        event: "candles_aggregated",
        symbol,
        payload: data,
        timestamp: data.timestamp
    });
};

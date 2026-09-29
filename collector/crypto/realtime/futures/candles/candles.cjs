/* ============================================================
 * File: candles.cjs
 * Path: collector/crypto/realtime/futures/candles/candles.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Handles realtime candle updates (OHLCV).
 *
 * Relations:
 *   - Input: exchange normalized candle stream
 *   - Output: candles → realtime-symbol-aggregator.cjs
 * ============================================================ */

module.exports = function handleCandles({ symbol, data, emit }) {
    if (!data || data.type !== "candle") return;

    emit({
        event: "candle",
        symbol,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
        timestamp: data.timestamp
    });
};

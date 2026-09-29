/* ============================================================
 * File: candles_multi_tf.cjs
 * Path: collector/crypto/realtime/futures/candles/candles_multi_tf.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Builds multi-timeframe candles (1m, 5m, 15m, 1h).
 *
 * Relations:
 *   - Input: candles.cjs
 *   - Output: candles_multi_tf → realtime-symbol-aggregator.cjs
 * ============================================================ */

const frames = {
    "1m": [],
    "5m": [],
    "15m": [],
    "1h": []
};

module.exports = function handleMultiTFCandles({ symbol, data, emit }) {
    if (!data || data.event !== "candle") return;

    const ts = data.timestamp;

    Object.keys(frames).forEach(tf => {
        frames[tf].push(data);

        const limit = tf === "1m" ? 60 :
                      tf === "5m" ? 300 :
                      tf === "15m" ? 900 :
                      3600;

        frames[tf] = frames[tf].filter(c => ts - c.timestamp <= limit);

        emit({
            event: "candles_multi_tf",
            symbol,
            timeframe: tf,
            candles: frames[tf],
            timestamp: ts
        });
    });
};

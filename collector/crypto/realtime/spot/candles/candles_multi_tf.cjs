/* ============================================================
 * File: collector/crypto/realtime/spot/candles/candles_multi_tf.cjs
 * Role:
 *   Spot Candles Multi Timeframe
 *   - ساخت کندل‌های چند تایم‌فریم (1m, 5m, 15m, 1h)
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

const frames = {
    "1m": 60000,
    "5m": 300000,
    "15m": 900000,
    "1h": 3600000
};

const buckets = {};

module.exports = function spotCandlesMultiTF(packet) {
    const { symbol, data, emit } = packet;

    const ts = data.timestamp || Date.now();

    if (!buckets[symbol]) buckets[symbol] = {};

    for (const tf in frames) {
        const frame = frames[tf];
        const bucketId = Math.floor(ts / frame);

        if (!buckets[symbol][tf]) buckets[symbol][tf] = {};
        if (!buckets[symbol][tf][bucketId]) {
            buckets[symbol][tf][bucketId] = {
                open: data.open,
                high: data.high,
                low: data.low,
                close: data.close,
                volume: data.volume,
                timestamp: ts
            };
        } else {
            const c = buckets[symbol][tf][bucketId];
            c.high = Math.max(c.high, data.high);
            c.low = Math.min(c.low, data.low);
            c.close = data.close;
            c.volume += data.volume;
        }

        emit({
            event: "candle_multi_tf",
            symbol,
            tf,
            candle: buckets[symbol][tf][bucketId],
            timestamp: ts
        });
    }
};

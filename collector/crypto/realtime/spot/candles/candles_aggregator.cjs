/* ============================================================
 * File: collector/crypto/realtime/spot/candles/candles_aggregator.cjs
 * Role:
 *   Spot Candles Aggregator
 *   - تجمیع کندل‌ها برای تایم‌فریم‌های مختلف
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

const buckets = {};

module.exports = function spotCandlesAggregator(packet) {
    const { symbol, data, emit } = packet;

    const ts = data.timestamp || Date.now();
    const minute = Math.floor(ts / 60000);

    if (!buckets[symbol]) buckets[symbol] = {};

    if (!buckets[symbol][minute]) {
        buckets[symbol][minute] = {
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume,
            timestamp: ts
        };
    } else {
        const c = buckets[symbol][minute];
        c.high = Math.max(c.high, data.high);
        c.low = Math.min(c.low, data.low);
        c.close = data.close;
        c.volume += data.volume;
    }

    emit({
        event: "candle_aggregator",
        symbol,
        candle: buckets[symbol][minute],
        timestamp: ts
    });
};

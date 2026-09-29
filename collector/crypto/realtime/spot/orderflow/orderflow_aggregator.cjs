/* ============================================================
 * File: collector/crypto/realtime/spot/orderflow/orderflow_aggregator.cjs
 * Role:
 *   Spot Orderflow Aggregator
 *   - تجمیع جریان سفارش‌ها در بازه‌های زمانی
 *   - مشابه liquidation_aggregator / oi_aggregator در فیوچرز
 * ============================================================ */

const buckets = {};

module.exports = function spotOrderflowAggregator(packet) {
    const { symbol, data, emit } = packet;

    const ts = data.timestamp || Date.now();
    const minute = Math.floor(ts / 60000);

    if (!buckets[symbol]) buckets[symbol] = {};

    if (!buckets[symbol][minute]) {
        buckets[symbol][minute] = {
            buy: 0,
            sell: 0,
            trades: 0,
            timestamp: ts
        };
    }

    const bucket = buckets[symbol][minute];

    if (data.side === "buy") bucket.buy += Number(data.qty);
    else bucket.sell += Number(data.qty);

    bucket.trades++;

    emit({
        event: "orderflow_aggregator",
        symbol,
        bucket,
        timestamp: ts
    });
};

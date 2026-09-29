/* ============================================================
 * File: price_delta.cjs
 * Path: collector/crypto/realtime/futures/price/price_delta.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes delta (change) between current and previous price.
 *
 * Relations:
 *   - Input: price.cjs
 *   - Output: price_delta → realtime-symbol-aggregator.cjs
 * ============================================================ */

let last = null;

module.exports = function handlePriceDelta({ symbol, data, emit }) {
    if (!data || data.type !== "price") return;

    const current = Number(data.price);
    const delta = last !== null ? current - last : 0;
    last = current;

    emit({
        event: "price_delta",
        symbol,
        price: current,
        delta,
        timestamp: data.timestamp
    });
};

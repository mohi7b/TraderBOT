/* ============================================================
 * File: mark_price_delta.cjs
 * Path: collector/crypto/realtime/futures/mark_price/mark_price_delta.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes delta (change) between current and previous mark price.
 *
 * Relations:
 *   - Input: mark_price.cjs
 *   - Output: mark_price_delta → realtime-symbol-aggregator.cjs
 * ============================================================ */

let last = null;

module.exports = function handleMarkPriceDelta({ symbol, data, emit }) {
    if (!data || data.type !== "mark_price") return;

    const current = Number(data.price);
    const delta = last !== null ? current - last : 0;
    last = current;

    emit({
        event: "mark_price_delta",
        symbol,
        price: current,
        delta,
        timestamp: data.timestamp
    });
};

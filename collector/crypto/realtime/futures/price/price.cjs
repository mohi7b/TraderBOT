/* ============================================================
 * File: price.cjs
 * Path: collector/crypto/realtime/futures/price/price.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Handles normalized realtime price events for futures.
 *
 * Relations:
 *   - Input: exchange normalized price stream
 *   - Output: price → realtime-symbol-aggregator.cjs
 * ============================================================ */

module.exports = function handlePrice({ symbol, data, emit }) {
    if (!data || data.type !== "price") return;

    emit({
        event: "price",
        symbol,
        price: Number(data.price),
        timestamp: data.timestamp
    });
};

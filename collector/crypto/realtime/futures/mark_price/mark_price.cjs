/* ============================================================
 * File: mark_price.cjs
 * Path: collector/crypto/realtime/futures/mark_price/mark_price.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Handles normalized realtime mark price events for futures.
 *
 * Relations:
 *   - Input: exchange normalized mark price stream
 *   - Output: mark_price → realtime-symbol-aggregator.cjs
 * ============================================================ */

module.exports = function handleMarkPrice({ symbol, data, emit }) {
    if (!data || data.type !== "mark_price") return;

    emit({
        event: "mark_price",
        symbol,
        price: Number(data.price),
        timestamp: data.timestamp
    });
};

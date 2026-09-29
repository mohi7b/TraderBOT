/* ============================================================
 * File: price_speed.cjs
 * Path: collector/crypto/realtime/futures/price/price_speed.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes price speed (Δprice / Δtime).
 *
 * Relations:
 *   - Input: price.cjs
 *   - Output: price_speed → realtime-symbol-aggregator.cjs
 * ============================================================ */

let last = null;
let lastTs = null;

module.exports = function handlePriceSpeed({ symbol, data, emit }) {
    if (!data || data.type !== "price") return;

    const price = Number(data.price);
    const ts = Number(data.timestamp);

    let speed = 0;

    if (last !== null && lastTs !== null) {
        const diff = price - last;
        const time = ts - lastTs;
        speed = time > 0 ? diff / time : 0;
    }

    last = price;
    lastTs = ts;

    emit({
        event: "price_speed",
        symbol,
        speed,
        timestamp: ts
    });
};

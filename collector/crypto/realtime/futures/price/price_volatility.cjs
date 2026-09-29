/* ============================================================
 * File: price_volatility.cjs
 * Path: collector/crypto/realtime/futures/price/price_volatility.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes short-term price volatility using standard deviation.
 *
 * Relations:
 *   - Input: price.cjs
 *   - Output: price_volatility → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 20;
let window = [];

module.exports = function handlePriceVolatility({ symbol, data, emit }) {
    if (!data || data.type !== "price") return;

    const price = Number(data.price);
    window.push(price);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "price_volatility", symbol, volatility: 0, timestamp: data.timestamp });
        return;
    }

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const volatility = Math.sqrt(variance);

    emit({
        event: "price_volatility",
        symbol,
        volatility,
        timestamp: data.timestamp
    });
};

/* ============================================================
 * File: mark_price_trend.cjs
 * Path: collector/crypto/realtime/futures/mark_price/mark_price_trend.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes short-term mark price trend using a sliding window.
 *
 * Relations:
 *   - Input: mark_price.cjs
 *   - Output: mark_price_trend → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 10;
let window = [];

module.exports = function handleMarkPriceTrend({ symbol, data, emit }) {
    if (!data || data.type !== "mark_price") return;

    const price = Number(data.price);
    window.push(price);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "mark_price_trend", symbol, trend: "flat", timestamp: data.timestamp });
        return;
    }

    let up = 0, down = 0;

    for (let i = 1; i < window.length; i++) {
        if (window[i] > window[i - 1]) up++;
        else if (window[i] < window[i - 1]) down++;
    }

    const trend = up > down ? "up" : down > up ? "down" : "flat";

    emit({
        event: "mark_price_trend",
        symbol,
        trend,
        timestamp: data.timestamp
    });
};

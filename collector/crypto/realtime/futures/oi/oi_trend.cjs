/* ============================================================
 * File: oi_trend.cjs
 * Path: collector/crypto/realtime/futures/oi/oi_trend.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes short-term OI trend using a sliding window.
 *
 * Relations:
 *   - Input: oi.cjs
 *   - Output: oi_trend → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 10;
let window = [];

module.exports = function handleOITrend({ symbol, data, emit }) {
    if (!data || data.type !== "oi") return;

    const oi = Number(data.oi);
    window.push(oi);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "oi_trend", symbol, trend: "flat", timestamp: data.timestamp });
        return;
    }

    let up = 0, down = 0;

    for (let i = 1; i < window.length; i++) {
        if (window[i] > window[i - 1]) up++;
        else if (window[i] < window[i - 1]) down++;
    }

    const trend = up > down ? "up" : down > up ? "down" : "flat";

    emit({
        event: "oi_trend",
        symbol,
        trend,
        timestamp: data.timestamp
    });
};

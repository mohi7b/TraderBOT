/* ============================================================
 * File: funding_trend.cjs
 * Path: collector/crypto/realtime/futures/funding/funding_trend.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes short-term funding trend using a sliding window.
 *
 * Relations:
 *   - Input: funding.cjs
 *   - Output: funding_trend → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 10;
let window = [];

module.exports = function handleFundingTrend({ symbol, data, emit }) {
    if (!data || data.type !== "funding") return;

    const rate = Number(data.rate);
    window.push(rate);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "funding_trend", symbol, trend: "flat", timestamp: data.timestamp });
        return;
    }

    let up = 0, down = 0;

    for (let i = 1; i < window.length; i++) {
        if (window[i] > window[i - 1]) up++;
        else if (window[i] < window[i - 1]) down++;
    }

    const trend = up > down ? "up" : down > up ? "down" : "flat";

    emit({
        event: "funding_trend",
        symbol,
        trend,
        timestamp: data.timestamp
    });
};

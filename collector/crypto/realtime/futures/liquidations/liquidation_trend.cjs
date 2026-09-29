/* ============================================================
 * File: liquidation_trend.cjs
 * Path: collector/crypto/realtime/futures/liquidations/liquidation_trend.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes short-term liquidation trend using a sliding window.
 *
 * Relations:
 *   - Input: liquidation.cjs
 *   - Output: liquidation_trend → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 20;
let window = [];

module.exports = function handleLiquidationTrend({ symbol, data, emit }) {
    if (!data || data.type !== "liquidation") return;

    const qty = Number(data.qty);
    window.push(qty);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "liquidation_trend", symbol, trend: "flat", timestamp: data.timestamp });
        return;
    }

    let up = 0, down = 0;

    for (let i = 1; i < window.length; i++) {
        if (window[i] > window[i - 1]) up++;
        else if (window[i] < window[i - 1]) down++;
    }

    const trend = up > down ? "up" : down > up ? "down" : "flat";

    emit({
        event: "liquidation_trend",
        symbol,
        trend,
        timestamp: data.timestamp
    });
};

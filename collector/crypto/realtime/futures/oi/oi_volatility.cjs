/* ============================================================
 * File: oi_volatility.cjs
 * Path: collector/crypto/realtime/futures/oi/oi_volatility.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes OI volatility using standard deviation.
 *
 * Relations:
 *   - Input: oi.cjs
 *   - Output: oi_volatility → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 20;
let window = [];

module.exports = function handleOIVolatility({ symbol, data, emit }) {
    if (!data || data.type !== "oi") return;

    const oi = Number(data.oi);
    window.push(oi);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "oi_volatility", symbol, volatility: 0, timestamp: data.timestamp });
        return;
    }

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const volatility = Math.sqrt(variance);

    emit({
        event: "oi_volatility",
        symbol,
        volatility,
        timestamp: data.timestamp
    });
};

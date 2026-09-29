/* ============================================================
 * File: funding_pressure.cjs
 * Path: collector/crypto/realtime/futures/funding/funding_pressure.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes funding pressure using deviation from mean.
 *
 * Relations:
 *   - Input: funding.cjs
 *   - Output: funding_pressure → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 20;
let window = [];

module.exports = function handleFundingPressure({ symbol, data, emit }) {
    if (!data || data.type !== "funding") return;

    const rate = Number(data.rate);
    window.push(rate);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "funding_pressure", symbol, pressure: 0, timestamp: data.timestamp });
        return;
    }

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const pressure = rate - mean;

    emit({
        event: "funding_pressure",
        symbol,
        pressure,
        rate,
        timestamp: data.timestamp
    });
};

/* ============================================================
 * File: oi_pressure.cjs
 * Path: collector/crypto/realtime/futures/oi/oi_pressure.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes OI pressure using deviation from mean.
 *
 * Relations:
 *   - Input: oi.cjs
 *   - Output: oi_pressure → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 20;
let window = [];

module.exports = function handleOIPressure({ symbol, data, emit }) {
    if (!data || data.type !== "oi") return;

    const oi = Number(data.oi);
    window.push(oi);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "oi_pressure", symbol, pressure: 0, timestamp: data.timestamp });
        return;
    }

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const pressure = oi - mean;

    emit({
        event: "oi_pressure",
        symbol,
        pressure,
        oi,
        timestamp: data.timestamp
    });
};

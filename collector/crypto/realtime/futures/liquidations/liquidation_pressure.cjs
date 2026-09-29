/* ============================================================
 * File: liquidation_pressure.cjs
 * Path: collector/crypto/realtime/futures/liquidations/liquidation_pressure.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes liquidation pressure using deviation from mean.
 *
 * Relations:
 *   - Input: liquidation.cjs
 *   - Output: liquidation_pressure → realtime-symbol-aggregator.cjs
 * ============================================================ */

const WINDOW = 30;
let window = [];

module.exports = function handleLiquidationPressure({ symbol, data, emit }) {
    if (!data || data.type !== "liquidation") return;

    const qty = Number(data.qty);
    window.push(qty);

    if (window.length > WINDOW) window.shift();

    if (window.length < WINDOW) {
        emit({ event: "liquidation_pressure", symbol, pressure: 0, timestamp: data.timestamp });
        return;
    }

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const pressure = qty - mean;

    emit({
        event: "liquidation_pressure",
        symbol,
        pressure,
        qty,
        timestamp: data.timestamp
    });
};

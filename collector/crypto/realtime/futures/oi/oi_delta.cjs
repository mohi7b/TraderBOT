/* ============================================================
 * File: oi_delta.cjs
 * Path: collector/crypto/realtime/futures/oi/oi_delta.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes delta (change) between current and previous OI.
 *
 * Relations:
 *   - Input: oi.cjs
 *   - Output: oi_delta → realtime-symbol-aggregator.cjs
 * ============================================================ */

let last = null;

module.exports = function handleOIDelta({ symbol, data, emit }) {
    if (!data || data.type !== "oi") return;

    const current = Number(data.oi);
    const delta = last !== null ? current - last : 0;
    last = current;

    emit({
        event: "oi_delta",
        symbol,
        oi: current,
        delta,
        timestamp: data.timestamp
    });
};

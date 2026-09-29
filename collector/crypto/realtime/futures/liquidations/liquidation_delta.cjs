/* ============================================================
 * File: liquidation_delta.cjs
 * Path: collector/crypto/realtime/futures/liquidations/liquidation_delta.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Computes delta between current and previous liquidation qty.
 *
 * Relations:
 *   - Input: liquidation.cjs
 *   - Output: liquidation_delta → realtime-symbol-aggregator.cjs
 * ============================================================ */

let lastQty = null;

module.exports = function handleLiquidationDelta({ symbol, data, emit }) {
    if (!data || data.type !== "liquidation") return;

    const qty = Number(data.qty);
    const delta = lastQty !== null ? qty - lastQty : 0;
    lastQty = qty;

    emit({
        event: "liquidation_delta",
        symbol,
        qty,
        delta,
        side: data.side,
        timestamp: data.timestamp
    });
};

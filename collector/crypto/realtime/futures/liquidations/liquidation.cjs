/* ============================================================
 * File: liquidation.cjs
 * Path: collector/crypto/realtime/futures/liquidations/liquidation.cjs
 * Version: 1.0.0
 *
 * Role:
 *   Handles normalized realtime liquidation events for futures.
 *
 * Relations:
 *   - Input: exchange normalized liquidation stream
 *   - Output: liquidation → realtime-symbol-aggregator.cjs
 * ============================================================ */

module.exports = function handleLiquidation({ symbol, data, emit }) {
    if (!data || data.type !== "liquidation") return;

    emit({
        event: "liquidation",
        symbol,
        price: Number(data.price),
        qty: Number(data.qty),
        side: data.side,
        timestamp: data.timestamp
    });
};

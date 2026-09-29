/* ============================================================
 * File: collector/crypto/realtime/spot/orderflow/micro_trades.cjs
 * Role:
 *   Spot Micro Trades
 *   - تریدهای کوچک (Scalper Activity)
 *   - مشابه ساختار clusters در فیوچرز
 *
 *   Threshold: notional (price × qty, quote currency) instead of raw qty —
 *   see collector/crypto/common/notional-thresholds.cjs.
 * ============================================================ */

const { classifyNotional } = require("../../../common/notional-thresholds.cjs");

module.exports = function spotMicroTrades(packet) {
    const { symbol, data, emit } = packet;
    if (!data) return;

    const { notional, kind, thresholds } = classifyNotional(data, symbol);
    if (kind !== "micro") return;

    emit({
        event: "micro_trades",
        symbol,
        price: Number(data.price),
        qty: Number(data.qty !== undefined && data.qty !== null ? data.qty : data.tradeQty),
        notional,
        notionalThreshold: thresholds.microNotional,
        side: data.side,
        timestamp: data.timestamp || Date.now()
    });
};

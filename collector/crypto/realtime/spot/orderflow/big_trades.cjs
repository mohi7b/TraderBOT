/* ============================================================
 * File: collector/crypto/realtime/spot/orderflow/big_trades.cjs
 * Role:
 *   Spot Big Trades
 *   - تریدهای بزرگ (Whale Activity)
 *   - مشابه liquidation_clusters در فیوچرز
 *
 *   Threshold: notional (price × qty, quote currency) instead of raw qty —
 *   see collector/crypto/common/notional-thresholds.cjs.
 * ============================================================ */

const { classifyNotional } = require("../../../common/notional-thresholds.cjs");

module.exports = function spotBigTrades(packet) {
    const { symbol, data, emit } = packet;
    if (!data) return;

    const { notional, kind, thresholds } = classifyNotional(data, symbol);
    if (kind !== "big") return;

    emit({
        event: "big_trades",
        symbol,
        price: Number(data.price),
        qty: Number(data.qty !== undefined && data.qty !== null ? data.qty : data.tradeQty),
        notional,
        notionalThreshold: thresholds.bigNotional,
        side: data.side,
        timestamp: data.timestamp || Date.now()
    });
};

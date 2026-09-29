/* ============================================================
 * File: collector/crypto/realtime/spot/orderflow/imbalance.cjs
 * Role:
 *   Spot Orderflow Imbalance
 *   - عدم تعادل خرید/فروش
 *   - مشابه depth_imbalance در فیوچرز
 * ============================================================ */

const history = {};

module.exports = function spotOrderflowImbalance(packet) {
    const { symbol, data, emit } = packet;

    const qty = Number(data.qty);
    if (!qty) return;

    if (!history[symbol]) history[symbol] = { buy: 0, sell: 0 };

    if (data.side === "buy") history[symbol].buy += qty;
    else history[symbol].sell += qty;

    const imbalance = history[symbol].buy - history[symbol].sell;

    emit({
        event: "orderflow_imbalance",
        symbol,
        buyVolume: history[symbol].buy,
        sellVolume: history[symbol].sell,
        imbalance,
        timestamp: data.timestamp || Date.now()
    });
};

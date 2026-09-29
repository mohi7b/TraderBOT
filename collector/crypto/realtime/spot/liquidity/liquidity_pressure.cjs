/* ============================================================
 * File: collector/crypto/realtime/spot/liquidity/liquidity_pressure.cjs
 * Role:
 *   Spot Liquidity Pressure
 *   - فشار خرید/فروش از روی نقدینگی
 *   - مشابه pressure در فیوچرز
 * ============================================================ */

module.exports = function spotLiquidityPressure(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bidTop = Number(data.bids[0]?.[1] || 0);
    const askTop = Number(data.asks[0]?.[1] || 0);

    const pressure =
        bidTop > askTop ? "buy_pressure" :
        askTop > bidTop ? "sell_pressure" :
        "neutral";

    emit({
        event: "liquidity_pressure",
        symbol,
        bidTop,
        askTop,
        pressure,
        timestamp: data.timestamp || Date.now()
    });
};

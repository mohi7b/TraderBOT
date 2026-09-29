/* ============================================================
 * File: collector/crypto/realtime/spot/spread/spread_pressure.cjs
 * Role:
 *   Spot Spread Pressure
 *   - فشار خرید/فروش از روی اسپرد
 *   - مشابه pressure در فیوچرز
 * ============================================================ */

module.exports = function spotSpreadPressure(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bid = Number(data.bids[0]?.[0] || 0);
    const ask = Number(data.asks[0]?.[0] || 0);
    const spread = ask - bid;

    const pressure =
        spread < 0.1 ? "high_buy_pressure" :
        spread > 0.5 ? "high_sell_pressure" :
        "neutral";

    emit({
        event: "spread_pressure",
        symbol,
        spread,
        pressure,
        timestamp: data.timestamp || Date.now()
    });
};

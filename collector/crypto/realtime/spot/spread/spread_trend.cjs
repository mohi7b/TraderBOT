/* ============================================================
 * File: collector/crypto/realtime/spot/spread/spread_trend.cjs
 * Role:
 *   Spot Spread Trend
 *   - تشخیص جهت حرکت اسپرد
 *   - مشابه trend در فیوچرز
 * ============================================================ */

const history = {};

module.exports = function spotSpreadTrend(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bid = Number(data.bids[0]?.[0] || 0);
    const ask = Number(data.asks[0]?.[0] || 0);
    const spread = ask - bid;

    if (!history[symbol]) history[symbol] = [];

    history[symbol].push(spread);
    if (history[symbol].length > 20) history[symbol].shift();

    const trend =
        spread > history[symbol][0] ? "widening" :
        spread < history[symbol][0] ? "tightening" :
        "flat";

    emit({
        event: "spread_trend",
        symbol,
        spread,
        trend,
        timestamp: data.timestamp || Date.now()
    });
};

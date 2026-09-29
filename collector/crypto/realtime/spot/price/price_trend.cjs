/* ============================================================
 * File: collector/crypto/realtime/spot/price/price_trend.cjs
 * Role:
 *   Spot Price Trend
 *   - تشخیص جهت حرکت قیمت اسپات
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

const history = {};

module.exports = function spotPriceTrend(packet) {
    const { symbol, data, emit } = packet;

    const price = Number(data.price);
    if (!price) return;

    if (!history[symbol]) history[symbol] = [];

    history[symbol].push(price);
    if (history[symbol].length > 20) history[symbol].shift();

    const trend =
        price > history[symbol][0] ? "up" :
        price < history[symbol][0] ? "down" :
        "flat";

    emit({
        event: "price_trend",
        symbol,
        price,
        trend,
        timestamp: data.timestamp || Date.now()
    });
};

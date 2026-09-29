/* ============================================================
 * File: collector/crypto/realtime/spot/price/price_volatility.cjs
 * Role:
 *   Spot Price Volatility
 *   - نوسان لحظه‌ای قیمت اسپات
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

const history = {};

module.exports = function spotPriceVolatility(packet) {
    const { symbol, data, emit } = packet;

    const price = Number(data.price);
    if (!price) return;

    if (!history[symbol]) history[symbol] = [];

    history[symbol].push(price);
    if (history[symbol].length > 30) history[symbol].shift();

    const avg = history[symbol].reduce((a, b) => a + b, 0) / history[symbol].length;
    const vol = Math.abs(price - avg);

    emit({
        event: "price_volatility",
        symbol,
        price,
        volatility: vol,
        timestamp: data.timestamp || Date.now()
    });
};

/* ============================================================
 * File: collector/crypto/realtime/spot/price/price_delta.cjs
 * Role:
 *   Spot Price Delta
 *   - محاسبه تغییرات لحظه‌ای قیمت اسپات
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

const lastPrice = {};

module.exports = function spotPriceDelta(packet) {
    const { symbol, data, emit } = packet;

    const price = Number(data.price);
    if (!price) return;

    const prev = lastPrice[symbol] || price;
    const delta = price - prev;

    lastPrice[symbol] = price;

    emit({
        event: "price_delta",
        symbol,
        price,
        delta,
        timestamp: data.timestamp || Date.now()
    });
};

/* ============================================================
 * File: collector/crypto/realtime/spot/price/price.cjs
 * Role:
 *   Spot Price (Main Module)
 *   - دریافت قیمت لحظه‌ای اسپات
 *   - ذخیره آخرین قیمت
 *   - ارسال داده به HealthMonitor
 *   - آماده برای تجمیع با فیوچرز
 * ============================================================ */

module.exports = function spotPrice(packet) {
    const { symbol, data, emit } = packet;

    const price = Number(data.price);
    if (!price) return;

    const output = {
        event: "price",
        symbol,
        price,
        timestamp: data.timestamp || Date.now()
    };

    emit(output);
};

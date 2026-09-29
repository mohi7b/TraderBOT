/* ============================================================
 * File: collector/crypto/realtime/spot/price/price_speed.cjs
 * Role:
 *   Spot Price Speed
 *   - سرعت حرکت قیمت اسپات
 *   - مشابه نسخه فیوچرز
 * ============================================================ */

const last = {};

module.exports = function spotPriceSpeed(packet) {
    const { symbol, data, emit } = packet;

    const price = Number(data.price);
    if (!price) return;

    const now = Date.now();
    const prev = last[symbol] || { price, ts: now };
    const elapsed = now - prev.ts;

    // first tick, or two ticks inside the same millisecond: no Δt yet ⇒ 0
    // (never NaN / Infinity — the futures twin guards the division too)
    const speed = elapsed > 0 ? (price - prev.price) / elapsed : 0;

    last[symbol] = { price, ts: now };

    emit({
        event: "price_speed",
        symbol,
        price,
        speed,
        timestamp: now
    });
};

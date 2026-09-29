/* ============================================================
 * File: collector/crypto/realtime/spot/advanced/volume_profile.cjs
 * Role:
 *   Spot Volume Profile
 *   - ساخت پروفایل حجم بر اساس قیمت
 *   - مشابه ساختار depth + orderflow در فیوچرز
 *   - کاربرد:
 *       * تشخیص نواحی با حجم بالا
 *       * تشخیص نواحی حمایت/مقاومت واقعی
 * ============================================================ */

const profile = {};

module.exports = function spotVolumeProfile(packet) {
    const { symbol, data, emit } = packet;

    const price = Number(data.price);
    const qty = Number(data.qty);

    if (!price || !qty) return;

    if (!profile[symbol]) profile[symbol] = {};

    const p = Math.round(price * 100) / 100; // گروه‌بندی قیمت‌ها

    if (!profile[symbol][p]) profile[symbol][p] = 0;

    profile[symbol][p] += qty;

    emit({
        event: "volume_profile",
        symbol,
        price: p,
        volume: profile[symbol][p],
        timestamp: data.timestamp || Date.now()
    });
};

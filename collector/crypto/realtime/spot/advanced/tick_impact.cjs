/* ============================================================
 * File: collector/crypto/realtime/spot/advanced/tick_impact.cjs
 * Role:
 *   Spot Tick Impact
 *   - اندازه‌گیری اثر هر تیک روی بازار
 *   - مشابه volatility در فیوچرز ولی با تمرکز روی micro‑movement
 *   - کاربرد:
 *       * تشخیص قدرت تیک‌ها
 *       * تشخیص micro‑trend
 *       * تشخیص رفتار مارکت‌میکرها
 * ============================================================ */

const last = {};

module.exports = function spotTickImpact(packet) {
    const { symbol, data, emit } = packet;

    const price = Number(data.price);
    if (!price) return;

    const now = Date.now();
    const prev = last[symbol] || { price, ts: now };
    const elapsed = now - prev.ts;

    const impact = Math.abs(price - prev.price);
    // first tick, or two ticks inside the same millisecond: no Δt yet ⇒ 0
    // (never NaN / Infinity)
    const speed = elapsed > 0 ? (price - prev.price) / elapsed : 0;

    last[symbol] = { price, ts: now };

    emit({
        event: "tick_impact",
        symbol,
        price,
        impact,
        speed,
        timestamp: now
    });
};

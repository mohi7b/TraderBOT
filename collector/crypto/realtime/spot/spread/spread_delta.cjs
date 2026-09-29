/* ============================================================
 * File: collector/crypto/realtime/spot/spread/spread_delta.cjs
 * Role:
 *   Spot Spread Delta
 *   - تغییرات لحظه‌ای اسپرد
 *   - مشابه ساختار delta در فیوچرز
 * ============================================================ */

const last = {};

module.exports = function spotSpreadDelta(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bid = Number(data.bids[0]?.[0] || 0);
    const ask = Number(data.asks[0]?.[0] || 0);
    const spread = ask - bid;

    const prev = last[symbol] || spread;
    const delta = spread - prev;

    last[symbol] = spread;

    emit({
        event: "spread_delta",
        symbol,
        spread,
        delta,
        timestamp: data.timestamp || Date.now()
    });
};

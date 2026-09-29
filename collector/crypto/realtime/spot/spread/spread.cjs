/* ============================================================
 * File: collector/crypto/realtime/spot/spread/spread.cjs
 * Role:
 *   Spot Spread (Main Module)
 *   - محاسبه اسپرد لحظه‌ای (Ask - Bid)
 *   - یکی از مهم‌ترین داده‌های اسپات
 *   - مشابه ساختار فیوچرز (ولی فیوچرز اسپرد ندارد)
 * ============================================================ */

module.exports = function spotSpread(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bestBid = Number(data.bids[0]?.[0] || 0);
    const bestAsk = Number(data.asks[0]?.[0] || 0);

    if (!bestBid || !bestAsk) return;

    const spread = bestAsk - bestBid;

    emit({
        event: "spread",
        symbol,
        bid: bestBid,
        ask: bestAsk,
        spread,
        timestamp: data.timestamp || Date.now()
    });
};

/* ============================================================
 * File: collector/crypto/realtime/spot/liquidity/liquidity.cjs
 * Role:
 *   Spot Liquidity (Main Module)
 *   - محاسبه نقدینگی لحظه‌ای از روی عمق بازار
 *   - مشابه ساختار depth در فیوچرز
 *   - آماده برای تجمیع اسپات + فیوچرز
 * ============================================================ */

module.exports = function spotLiquidity(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const bidLiquidity = data.bids
        .slice(0, 50)
        .reduce((sum, level) => sum + Number(level[1]), 0);

    const askLiquidity = data.asks
        .slice(0, 50)
        .reduce((sum, level) => sum + Number(level[1]), 0);

    emit({
        event: "liquidity",
        symbol,
        bidLiquidity,
        askLiquidity,
        totalLiquidity: bidLiquidity + askLiquidity,
        timestamp: data.timestamp || Date.now()
    });
};

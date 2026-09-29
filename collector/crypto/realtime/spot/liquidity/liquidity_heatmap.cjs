/* ============================================================
 * File: collector/crypto/realtime/spot/liquidity/liquidity_heatmap.cjs
 * Role:
 *   Spot Liquidity Heatmap
 *   - ساخت نقشهٔ نقدینگی (Heatmap)
 *   - مشابه depth_full در فیوچرز ولی با تمرکز روی حجم
 * ============================================================ */

module.exports = function spotLiquidityHeatmap(packet) {
    const { symbol, data, emit } = packet;

    if (!data.bids || !data.asks) return;

    const heatmap = {
        bids: data.bids.slice(0, 50).map(([price, qty]) => ({
            price: Number(price),
            qty: Number(qty)
        })),
        asks: data.asks.slice(0, 50).map(([price, qty]) => ({
            price: Number(price),
            qty: Number(qty)
        }))
    };

    emit({
        event: "liquidity_heatmap",
        symbol,
        heatmap,
        timestamp: data.timestamp || Date.now()
    });
};

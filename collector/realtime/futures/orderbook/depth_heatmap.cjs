/**
 * ============================================================
 *  File: depth_heatmap.cjs
 *  Path: collector/realtime/futures/orderbook/depth_heatmap.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Heatmap processor for Binance Futures orderbook.
 *      Heatmap = شدت نقدینگی در سطوح مختلف قیمت.
 *      این داده برای:
 *      - تحلیل بصری
 *      - مدل‌های ML
 *      - تشخیص مناطق مهم
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthHeatmap {

    constructor(levels = 50) {
        this.levels = levels;
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        const heatmap = {
            bids: bids.map(([price, qty]) => ({
                price: Number(price),
                intensity: Number(qty)
            })),
            asks: asks.map(([price, qty]) => ({
                price: Number(price),
                intensity: Number(qty)
            }))
        };

        return {
            exchange,
            symbol,
            type: "depth_heatmap",
            levels: this.levels,
            heatmap,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthHeatmap;

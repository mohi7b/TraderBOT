/**
 * ============================================================
 *  File: depth_levels.cjs
 *  Path: collector/realtime/futures/orderbook/depth_levels.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Depth Levels processor for Binance Futures.
 *      این پردازش سطوح مهم نقدینگی را استخراج می‌کند:
 *      - دیوارهای خرید/فروش
 *      - نقاط احتمالی برگشت قیمت
 *      - مناطق تجمع سفارشات
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthLevels {

    constructor(levels = 50) {
        this.levels = levels;
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        const bid_levels = bids.map(([price, qty]) => ({
            price: Number(price),
            qty: Number(qty)
        }));

        const ask_levels = asks.map(([price, qty]) => ({
            price: Number(price),
            qty: Number(qty)
        }));

        return {
            exchange,
            symbol,
            type: "depth_levels",
            levels: this.levels,
            bid_levels,
            ask_levels,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthLevels;

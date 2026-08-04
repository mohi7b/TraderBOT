/**
 * ============================================================
 *  File: depth_liquidity.cjs
 *  Path: collector/realtime/futures/orderbook/depth_liquidity.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Liquidity processor for Binance Futures orderbook.
 *      Liquidity = حجم قابل معامله در چند سطح قیمت.
 *      این داده برای تشخیص:
 *      - دیوارهای خرید/فروش
 *      - مناطق نقدینگی
 *      - نقاط احتمالی برگشت قیمت
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthLiquidity {

    constructor(levels = 20) {
        this.levels = levels;
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        const bid_liquidity = bids.reduce((sum, [_, qty]) => sum + Number(qty), 0);
        const ask_liquidity = asks.reduce((sum, [_, qty]) => sum + Number(qty), 0);

        return {
            exchange,
            symbol,
            type: "depth_liquidity",
            levels: this.levels,
            bid_liquidity,
            ask_liquidity,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthLiquidity;

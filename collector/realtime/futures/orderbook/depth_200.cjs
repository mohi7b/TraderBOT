/**
 * ============================================================
 *  File: depth_200.cjs
 *  Path: collector/realtime/futures/orderbook/depth_200.cjs
 *  Version: 5.8.0 (ENTERPRISE)
 *
 *  Description:
 *      Orderbook depth processor (200 levels) for Binance Futures.
 *
 *      این داده برای:
 *      - تحلیل حرفه‌ای
 *      - تشخیص دیوارهای بزرگ
 *      - تشخیص مناطق نقدینگی
 *      - مدل‌های ML سنگین
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepth200 {

    constructor(levels = 200) {
        this.levels = levels;
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        return {
            exchange,
            symbol,
            type: "depth_200",
            levels: this.levels,
            bids: bids.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
            asks: asks.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepth200;

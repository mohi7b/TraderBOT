/**
 * ============================================================
 *  File: depth_50.cjs
 *  Path: collector/realtime/futures/orderbook/depth_50.cjs
 *  Version: 5.8.0 (ENTERPRISE)
 *
 *  Description:
 *      Orderbook depth processor (50 levels) for Binance Futures.
 *
 *      این داده برای:
 *      - تحلیل سریع
 *      - اسکالپینگ
 *      - تشخیص دیوارهای کوچک
 *      - مدل‌های ML سبک
 *      استفاده می‌شود.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepth50 {

    constructor(levels = 50) {
        this.levels = levels;
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        return {
            exchange,
            symbol,
            type: "depth_50",
            levels: this.levels,
            bids: bids.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
            asks: asks.map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepth50;

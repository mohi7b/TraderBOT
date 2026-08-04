/**
 * ============================================================
 *  File: depth_imbalance.cjs
 *  Path: collector/realtime/futures/orderbook/depth_imbalance.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Orderbook imbalance processor for Binance Futures.
 *      Imbalance = نسبت حجم خرید به فروش در چند سطح قیمت.
 *
 *      اگر imbalance > 0.5 → فشار خرید
 *      اگر imbalance < -0.5 → فشار فروش
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthImbalance {

    constructor(levels = 10) {
        this.levels = levels;
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        const bid_total = bids.reduce((sum, [_, qty]) => sum + Number(qty), 0);
        const ask_total = asks.reduce((sum, [_, qty]) => sum + Number(qty), 0);

        const imbalance = (bid_total - ask_total) / (bid_total + ask_total || 1);

        return {
            exchange,
            symbol,
            type: "depth_imbalance",
            levels: this.levels,
            bid_total,
            ask_total,
            imbalance,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthImbalance;

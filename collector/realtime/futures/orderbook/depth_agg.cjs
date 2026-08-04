/**
 * ============================================================
 *  File: depth_agg.cjs
 *  Path: collector/realtime/futures/orderbook/depth_agg.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Aggregated orderbook processor for Binance Futures.
 *      Depth Aggregation = تجمیع حجم در چند سطح قیمت.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthAgg {

    constructor(levels = 10) {
        this.levels = levels;
    }

    handle(exchange, symbol, data) {
        const bids = (data.b || []).slice(0, this.levels);
        const asks = (data.a || []).slice(0, this.levels);

        const agg = {
            bid_total: bids.reduce((sum, [_, qty]) => sum + Number(qty), 0),
            ask_total: asks.reduce((sum, [_, qty]) => sum + Number(qty), 0)
        };

        return {
            exchange,
            symbol,
            type: "depth_agg",
            levels: this.levels,
            ...agg,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthAgg;

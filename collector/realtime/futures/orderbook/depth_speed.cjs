/**
 * ============================================================
 *  File: depth_speed.cjs
 *  Path: collector/realtime/futures/orderbook/depth_speed.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Orderbook speed processor for Binance Futures.
 *      Speed = سرعت تغییر حجم در سمت خرید/فروش.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthSpeed {

    constructor() {
        this.last = {};
    }

    handle(exchange, symbol, data) {
        const bids = data.b || [];
        const asks = data.a || [];

        const bid_total = bids.reduce((sum, [_, qty]) => sum + Number(qty), 0);
        const ask_total = asks.reduce((sum, [_, qty]) => sum + Number(qty), 0);

        const prev = this.last[symbol] || { bid: bid_total, ask: ask_total };

        const speed = {
            bid_speed: bid_total - prev.bid,
            ask_speed: ask_total - prev.ask
        };

        this.last[symbol] = { bid: bid_total, ask: ask_total };

        return {
            exchange,
            symbol,
            type: "depth_speed",
            ...speed,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthSpeed;

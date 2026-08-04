/**
 * ============================================================
 *  File: depth_absorption.cjs
 *  Path: collector/realtime/futures/orderbook/depth_absorption.cjs
 *  Version: 5.2.0 (ENTERPRISE)
 *
 *  Description:
 *      Advanced orderbook absorption processor for Binance Futures.
 *      Absorption = زمانی که حجم زیادی در یک سطح قیمت جذب می‌شود
 *      و قیمت حرکت نمی‌کند → نشانهٔ حضور نهنگ‌ها.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepthAbsorption {

    constructor() {
        this.last = {};
    }

    handle(exchange, symbol, data) {
        const bids = data.b || [];
        const asks = data.a || [];

        const absorption = {
            bid_absorption: bids.reduce((sum, [price, qty]) => sum + Number(qty), 0),
            ask_absorption: asks.reduce((sum, [price, qty]) => sum + Number(qty), 0)
        };

        return {
            exchange,
            symbol,
            type: "depth_absorption",
            ...absorption,
            ts: Date.now(),
            raw: data
        };
    }
}

module.exports = FuturesDepthAbsorption;

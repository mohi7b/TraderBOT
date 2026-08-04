/**
 * ============================================================
 *  File: depth.cjs
 *  Path: collector/realtime/futures/orderbook/depth.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures depth updates (orderbook).
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesDepth {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "depth",
            bids: data.b,
            asks: data.a,
            ts: data.T,
            raw: data
        };
    }
}

module.exports = FuturesDepth;

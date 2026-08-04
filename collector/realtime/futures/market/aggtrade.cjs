/**
 * ============================================================
 *  File: aggtrade.cjs
 *  Path: collector/realtime/futures/market/aggtrade.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures aggregated trades.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesAggTrade {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "aggTrade",
            price: data.p,
            qty: data.q,
            maker: data.m,
            ts: data.T,
            raw: data
        };
    }
}

module.exports = FuturesAggTrade;

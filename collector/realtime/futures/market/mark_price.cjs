/**
 * ============================================================
 *  File: mark_price.cjs
 *  Path: collector/realtime/futures/market/mark_price.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures mark price stream.
 *      Includes mark price, index price, funding rate.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesMarkPrice {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "markPrice",
            markPrice: data.p,
            indexPrice: data.i,
            fundingRate: data.r,
            nextFundingTime: data.T,
            raw: data
        };
    }
}

module.exports = FuturesMarkPrice;

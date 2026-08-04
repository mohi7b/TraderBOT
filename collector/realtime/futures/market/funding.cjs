/**
 * ============================================================
 *  File: funding.cjs
 *  Path: collector/realtime/futures/market/funding.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures funding rate updates.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesFunding {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "fundingRate",
            fundingRate: data.f,
            nextFundingTime: data.t,
            raw: data
        };
    }
}

module.exports = FuturesFunding;

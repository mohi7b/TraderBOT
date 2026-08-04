/**
 * ============================================================
 *  File: bookticker.cjs
 *  Path: collector/realtime/futures/orderbook/bookticker.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures best bid/ask stream.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesBookTicker {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "bookTicker",
            bid: data.b,
            bidQty: data.B,
            ask: data.a,
            askQty: data.A,
            ts: data.T,
            raw: data
        };
    }
}

module.exports = FuturesBookTicker;

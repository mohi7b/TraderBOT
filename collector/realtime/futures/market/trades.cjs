/**
 * ============================================================
 *  File: trades.cjs
 *  Path: collector/realtime/futures/market/trades.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures raw trade events.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesTrades {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "trade",
            price: data.p,
            qty: data.q,
            ts: data.T,
            raw: data
        };
    }
}

module.exports = FuturesTrades;

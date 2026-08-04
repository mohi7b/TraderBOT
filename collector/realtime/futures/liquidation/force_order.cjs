/**
 * ============================================================
 *  File: force_order.cjs
 *  Path: collector/realtime/futures/liquidation/force_order.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Processor for Binance Futures liquidation orders.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class FuturesLiquidation {
    handle(exchange, symbol, data) {
        return {
            exchange,
            symbol,
            type: "liquidation",
            price: data.o.p,
            qty: data.o.q,
            side: data.o.S,
            ts: data.o.T,
            raw: data
        };
    }
}

module.exports = FuturesLiquidation;

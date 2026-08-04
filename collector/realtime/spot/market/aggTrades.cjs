/*
 * Binance Spot AggTrades Collector
 * Version: 1.0.0 (Enterprise Spot Edition)
 * Path: collector/realtime/spot/market/aggTrades.cjs
 * Description:
 *   - Processes Binance @aggTrade stream
 *   - Normalizes aggTrade data (same format as Futures)
 *   - Sends normalized events to EventRouter
 *   - Updates StateTree metrics
 */

const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");

class SpotAggTradesCollector {

    constructor() {
        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    normalize(event) {
        return {
            symbol: event.s,
            aggId: event.a,
            price: parseFloat(event.p),
            quantity: parseFloat(event.q),
            firstTradeId: event.f,
            lastTradeId: event.l,
            buyerMaker: event.m,
            eventTime: event.T
        };
    }

    handle(market, symbol, event) {
        try {
            const normalized = this.normalize(event);

            this.state.updateMetrics(market, symbol, "market", "aggTrades", {
                lastPrice: normalized.price,
                lastQty: normalized.quantity,
                lastSide: normalized.buyerMaker ? "sell" : "buy"
            });

            this.router.route(
                market,
                symbol,
                "market",
                "aggTrades",
                normalized
            );

        } catch (err) {
            this.log.error(`AggTradesCollector error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "market", "aggTrades", err);
        }
    }
}

module.exports = SpotAggTradesCollector;

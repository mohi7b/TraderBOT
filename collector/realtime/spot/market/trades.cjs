/*
 * Binance Spot Trades Collector
 * Version: 2.0.0
 * Path: collector/realtime/spot/market/trades.cjs
 * Description:
 *   - Processes Binance @trade stream
 *   - Normalizes trade data into Enterprise format
 *   - Sends normalized events to EventRouter
 *   - Updates StateTree metrics
 */

/**
 * ============================================================
 *  File: trades.cjs
 *  Mode: Cluster-Compatible Collector
 * ============================================================
 */

const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");

class SpotTradesCollector {

    constructor() {
        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    normalize(event) {
        return {
            tradeId: event.t,
            price: parseFloat(event.p),
            quantity: parseFloat(event.q),
            buyerMaker: event.m,
            eventTime: event.T,
            symbol: event.s
        };
    }

    handle(market, symbol, event) {
        try {
            const normalized = this.normalize(event);

            this.state.updateMetrics(market, symbol, "market", "trades", {
                lastPrice: normalized.price,
                lastQty: normalized.quantity,
                lastSide: normalized.buyerMaker ? "sell" : "buy"
            });

            this.router.route(market, symbol, "market", "trades", normalized);

        } catch (err) {
            this.log.error(`TradesCollector error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "market", "trades", err);
        }
    }
}

module.exports = SpotTradesCollector;

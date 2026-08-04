/*
 * Binance Spot Price Collector
 * Version: 2.0.0
 * Path: collector/realtime/spot/market/price.cjs
 * Description:
 *   - Processes Binance @ticker stream
 *   - Normalizes price data into Enterprise format
 *   - Sends normalized events to EventRouter
 *   - Updates StateTree metrics
 */

/**
 * ============================================================
 *  File: price.cjs
 *  Mode: Cluster-Compatible Collector
 *  Description:
 *      - No orchestrator dependency
 *      - Uses IPC router/state/log from worker-context
 * ============================================================
 */

const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");

class SpotPriceCollector {

    constructor() {
        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    normalize(event) {
        return {
            price: parseFloat(event.c),
            open: parseFloat(event.o),
            high: parseFloat(event.h),
            low: parseFloat(event.l),
            volume: parseFloat(event.v),
            quoteVolume: parseFloat(event.q),
            change: parseFloat(event.P),
            absoluteChange: parseFloat(event.p),
            eventTime: event.E,
            symbol: event.s
        };
    }

    handle(market, symbol, event) {
        try {
            const normalized = this.normalize(event);

            this.state.updateMetrics(market, symbol, "market", "price", {
                lastPrice: normalized.price,
                lastVolume: normalized.volume,
                lastChange: normalized.change
            });

            this.router.route(market, symbol, "market", "price", normalized);

        } catch (err) {
            this.log.error(`PriceCollector error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "market", "price", err);
        }
    }
}

module.exports = SpotPriceCollector;

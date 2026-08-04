/*
 * Binance Spot Candles Collector
 * Version: 2.0.0
 * Path: collector/realtime/spot/market/candles.cjs
 * Description:
 *   - Processes Binance @kline_1s stream
 *   - Normalizes candle data into Enterprise format
 *   - Sends normalized events to EventRouter
 *   - Updates StateTree metrics
 */

/**
 * ============================================================
 *  File: candles.cjs
 *  Mode: Cluster-Compatible Collector
 * ============================================================
 */

const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");

class SpotCandlesCollector {

    constructor() {
        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    normalize(event) {
        const k = event.k;

        return {
            symbol: event.s,
            interval: k.i,
            startTime: k.t,
            closeTime: k.T,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            trades: k.n,
            closed: k.x,
            quoteVolume: parseFloat(k.q),
            takerBuyVolume: parseFloat(k.V),
            takerBuyQuoteVolume: parseFloat(k.Q),
            eventTime: event.E
        };
    }

    handle(market, symbol, event) {
        try {
            const normalized = this.normalize(event);

            this.state.updateMetrics(market, symbol, "market", "candles", {
                lastOpen: normalized.open,
                lastClose: normalized.close,
                lastHigh: normalized.high,
                lastLow: normalized.low,
                lastVolume: normalized.volume,
                closed: normalized.closed
            });

            this.router.route(market, symbol, "market", "candles", normalized);

        } catch (err) {
            this.log.error(`CandlesCollector error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "market", "candles", err);
        }
    }
}

module.exports = SpotCandlesCollector;

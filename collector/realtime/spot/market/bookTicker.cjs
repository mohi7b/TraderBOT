/*
 * Binance Spot BookTicker Collector
 * Version: 1.0.0 (Enterprise Spot Edition)
 * Path: collector/realtime/spot/market/bookTicker.cjs
 * Description:
 *   - Processes Binance @bookTicker stream
 *   - Normalizes best bid/ask data (same format as Futures)
 *   - Sends normalized events to EventRouter
 *   - Updates StateTree metrics
 */

const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");

class SpotBookTickerCollector {

    constructor() {
        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    normalize(event) {
        return {
            symbol: event.s,
            bidPrice: parseFloat(event.b),
            bidQty: parseFloat(event.B),
            askPrice: parseFloat(event.a),
            askQty: parseFloat(event.A),
            eventTime: event.E
        };
    }

    handle(market, symbol, event) {
        try {
            const normalized = this.normalize(event);

            this.state.updateMetrics(market, symbol, "orderbook", "bookTicker", {
                bestBid: normalized.bidPrice,
                bestAsk: normalized.askPrice
            });

            this.router.route(
                market,
                symbol,
                "orderbook",
                "bookTicker",
                normalized
            );

        } catch (err) {
            this.log.error(`BookTickerCollector error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "orderbook", "bookTicker", err);
        }
    }
}

module.exports = SpotBookTickerCollector;

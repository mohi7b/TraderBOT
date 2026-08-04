/*
 * Spot Open Interest Collector (Cluster Mode)
 * Version: 3.0.0
 * Path: collector/realtime/spot/market/oi.cjs
 * Description:
 *   - Binance Spot has no OI data
 *   - This collector generates a normalized zero-OI event
 *   - Maintains unified structure with Futures collectors
 *   - Cluster Mode: uses worker-context instead of orchestrator
 */

class SpotOICollector {
    constructor() {
        const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");

        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    // -----------------------------------------
    // Generate normalized OI event
    // -----------------------------------------
    normalize(symbol) {
        return {
            symbol,
            openInterest: 0,
            eventTime: Date.now(),
            exchange: "binance-spot"
        };
    }

    // -----------------------------------------
    // Handle OI event (always zero)
    // -----------------------------------------
    handle(market, symbol) {
        try {
            const normalized = this.normalize(symbol);

            // Update state metrics (IPC)
            this.state.updateMetrics(market, symbol, "market", "oi", {
                openInterest: 0
            });

            // Route normalized event (IPC)
            this.router.route(
                market,
                symbol,
                "market",
                "oi",
                normalized
            );

        } catch (err) {
            this.log.error(`OICollector error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "market", "oi", err);
        }
    }
}

module.exports = SpotOICollector;

/*
 * Spot Funding Collector (Cluster Mode)
 * Version: 3.0.0
 * Path: collector/realtime/spot/market/funding.cjs
 * Description:
 *   - Binance Spot has no funding data
 *   - This collector generates a normalized zero-funding event
 *   - Maintains unified structure with Futures collectors
 *   - Cluster Mode: uses worker-context instead of orchestrator
 */

class SpotFundingCollector {
    constructor() {
        const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");

        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    // -----------------------------------------
    // Generate normalized funding event
    // -----------------------------------------
    normalize(symbol) {
        return {
            symbol,
            fundingRate: 0,
            fundingTime: Date.now(),
            exchange: "binance-spot"
        };
    }

    // -----------------------------------------
    // Handle funding event (always zero)
    // -----------------------------------------
    handle(market, symbol) {
        try {
            const normalized = this.normalize(symbol);

            // Update state metrics (IPC)
            this.state.updateMetrics(market, symbol, "market", "funding", {
                fundingRate: 0
            });

            // Route normalized event (IPC)
            this.router.route(
                market,
                symbol,
                "market",
                "funding",
                normalized
            );

        } catch (err) {
            this.log.error(`FundingCollector error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "market", "funding", err);
        }
    }
}

module.exports = SpotFundingCollector;

/*
 * Binance Spot Depth Heatmap Analyzer (Cluster Mode)
 * Version: 3.0.0
 * Path: collector/realtime/spot/orderbook/depth-heatmap.cjs
 * Description:
 *   - Converts orderbook levels into heatmap intensity values
 *   - Computes liquidity intensity per level
 *   - Normalizes intensity for dashboard visualization
 *   - Produces enterprise-grade heatmap output
 *   - Cluster Mode: uses worker-context instead of orchestrator
 */

class SpotDepthHeatmap {
    constructor() {
        const ctx = require("../../../orchestrator/cluster/worker-context.cjs");

        this.router = ctx.router;
        this.state  = ctx.state;
        this.log    = ctx.log;
    }

    // -----------------------------------------
    // Compute intensity (log scale)
    // -----------------------------------------
    computeIntensity(quantity) {
        if (quantity <= 0) return 0;
        return Math.log10(quantity + 1); // log scale for better visualization
    }

    // -----------------------------------------
    // Normalize intensity to 0–1 range
    // -----------------------------------------
    normalizeIntensity(levels) {
        const intensities = levels.map(l => this.computeIntensity(l.quantity));
        const max = Math.max(...intensities, 1);

        return levels.map((lvl, i) => ({
            ...lvl,
            intensity: intensities[i] / max
        }));
    }

    // -----------------------------------------
    // Build heatmap structure
    // -----------------------------------------
    buildHeatmap(snapshot) {
        const mid = snapshot.midprice;

        const levels = snapshot.levels.map(lvl => ({
            side: lvl.side,
            level: lvl.level,
            price: lvl.price,
            quantity: lvl.quantity,
            distance: lvl.distance,
            distancePct: lvl.distancePct
        }));

        const normalized = this.normalizeIntensity(levels);

        return {
            symbol: snapshot.symbol,
            eventTime: snapshot.eventTime,
            midprice: mid,
            heatmap: normalized
        };
    }

    // -----------------------------------------
    // Handle incoming levels snapshot (Cluster Mode)
    // -----------------------------------------
    handle(market, symbol, snapshot) {
        try {
            const heatmap = this.buildHeatmap(snapshot);

            // Update state metrics (IPC)
            this.state.updateMetrics(market, symbol, "orderbook", "depth-heatmap", {
                levels: heatmap.heatmap.length,
                maxIntensity: Math.max(...heatmap.heatmap.map(l => l.intensity))
            });

            // Route normalized heatmap event (IPC)
            this.router.route(
                market,
                symbol,
                "orderbook",
                "depth-heatmap",
                heatmap
            );

        } catch (err) {
            this.log.error(`DepthHeatmap error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "orderbook", "depth-heatmap", err);
        }
    }
}

module.exports = SpotDepthHeatmap;

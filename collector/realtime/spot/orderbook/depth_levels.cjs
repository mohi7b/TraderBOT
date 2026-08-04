/*
 * Binance Spot Depth Levels Analyzer (Cluster Mode)
 * Version: 3.0.0
 * Path: collector/realtime/spot/orderbook/depth-levels.cjs
 * Description:
 *   - Converts full orderbook snapshot into structured levels
 *   - Computes distance from midprice
 *   - Computes cumulative volume per level
 *   - Produces normalized level metrics for Enterprise analysis
 *   - Cluster Mode: uses worker-context instead of orchestrator
 */

/*
 * Binance Spot Depth Levels Analyzer (Enterprise Cluster Edition)
 * Version: 3.0.0
 */

class SpotDepthLevels {
    constructor() {
        const ctx = require("../../../orchestrator/cluster/worker-context.cjs");

        this.state = ctx.state;
        this.log   = ctx.log;
    }

    midprice(snapshot) {
        const bestBid = snapshot.bids.length ? snapshot.bids[0].price : 0;
        const bestAsk = snapshot.asks.length ? snapshot.asks[0].price : 0;
        if (bestBid === 0 || bestAsk === 0) return 0;
        return (bestBid + bestAsk) / 2;
    }

    buildLevels(snapshot) {
        const mid = this.midprice(snapshot);
        const levels = [];

        snapshot.bids.forEach((lvl, index) => {
            levels.push({
                side: "bid",
                level: index + 1,
                price: lvl.price,
                quantity: lvl.quantity,
                distance: mid ? mid - lvl.price : 0,
                distancePct: mid ? (mid - lvl.price) / mid : 0
            });
        });

        snapshot.asks.forEach((lvl, index) => {
            levels.push({
                side: "ask",
                level: index + 1,
                price: lvl.price,
                quantity: lvl.quantity,
                distance: mid ? lvl.price - mid : 0,
                distancePct: mid ? (lvl.price - mid) / mid : 0
            });
        });

        return { mid, levels };
    }

    cumulative(levels) {
        let bidCum = 0;
        let askCum = 0;

        return levels.map((lvl) => {
            if (lvl.side === "bid") {
                bidCum += lvl.quantity;
                return { ...lvl, cumulative: bidCum };
            } else {
                askCum += lvl.quantity;
                return { ...lvl, cumulative: askCum };
            }
        });
    }

    handle(market, symbol, snapshot) {
        try {
            const { mid, levels } = this.buildLevels(snapshot);
            const enrichedLevels = this.cumulative(levels);

            const output = {
                symbol,
                eventTime: snapshot.eventTime,
                updateId: snapshot.updateId,
                bids: snapshot.bids,
                asks: snapshot.asks,
                midprice: mid,
                levels: enrichedLevels
            };

            this.state.updateMetrics(market, symbol, "orderbook", "depth-levels", {
                midprice: mid,
                totalLevels: enrichedLevels.length
            });

            // Cluster Mode → فقط خروجی را return می‌کنیم
            return output;

        } catch (err) {
            this.log.error(`DepthLevels error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "orderbook", "depth-levels", err);
            return null;
        }
    }
}

module.exports = SpotDepthLevels;

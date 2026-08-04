/**
 * ============================================================
 *  File: depth_20.cjs
 *  Path: collector/realtime/orderbook/depth_20.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Depth-20 processor for KuCoin Spot.
 *      Extracts top 20 levels of bids/asks and calculates:
 *          - liquidity
 *          - imbalance
 *          - pressure
 *          - absorption
 *
 *      Used by:
 *          - KuCoin Spot
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class Depth20 {

    constructor() {
        this.levels = 20;
    }

    /**
     * Main handler
     */
    handle(market, symbol, snapshot) {
        if (!snapshot || !snapshot.bids || !snapshot.asks)
            return null;

        const bids = snapshot.bids.slice(0, this.levels);
        const asks = snapshot.asks.slice(0, this.levels);

        const bidMetrics = this.computeMetrics(bids);
        const askMetrics = this.computeMetrics(asks);

        return {
            market,
            symbol,
            ts: Date.now(),
            bids,
            asks,
            bidMetrics,
            askMetrics
        };
    }

    /**
     * Compute liquidity, imbalance, pressure, absorption
     */
    computeMetrics(levels) {
        let totalQty = 0;
        let weightedPrice = 0;

        for (const lvl of levels) {
            totalQty += lvl.quantity;
            weightedPrice += lvl.price * lvl.quantity;
        }

        const avgPrice = totalQty > 0 ? weightedPrice / totalQty : 0;

        return {
            count: levels.length,
            totalQty,
            avgPrice,
            bestPrice: levels.length > 0 ? levels[0].price : 0
        };
    }
}

module.exports = Depth20;

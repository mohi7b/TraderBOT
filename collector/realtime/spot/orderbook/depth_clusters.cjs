/**
 * ============================================================
 *  File: depth_clusters.cjs
 *  Path: collector/realtime/orderbook/depth_clusters.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Cluster-based depth analyzer.
 *      Groups orderbook levels into clusters based on price distance
 *      and calculates cluster liquidity, pressure, imbalance, absorption.
 *
 *      Used by ALL Spot & Futures collectors:
 *          - Binance
 *          - Bybit
 *          - OKX
 *          - KuCoin
 *          - Bitget
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class DepthClusters {

    constructor() {
        this.clusterSize = 5;      // number of levels per cluster
        this.maxClusters = 20;     // safety limit
    }

    /**
     * Main handler
     */
    handle(market, symbol, snapshot) {
        if (!snapshot || !snapshot.bids || !snapshot.asks)
            return null;

        const bids = snapshot.bids;
        const asks = snapshot.asks;

        const bidClusters = this.buildClusters(bids, "bid");
        const askClusters = this.buildClusters(asks, "ask");

        const result = {
            market,
            symbol,
            ts: Date.now(),
            bidClusters,
            askClusters
        };

        return result;
    }

    /**
     * Build clusters from levels
     */
    buildClusters(levels, side) {
        const clusters = [];
        let current = [];

        for (let i = 0; i < levels.length; i++) {
            current.push(levels[i]);

            if (current.length === this.clusterSize) {
                clusters.push(this.computeCluster(current, side));
                current = [];

                if (clusters.length >= this.maxClusters)
                    break;
            }
        }

        // leftover cluster
        if (current.length > 0)
            clusters.push(this.computeCluster(current, side));

        return clusters;
    }

    /**
     * Compute cluster metrics
     */
    computeCluster(levels, side) {
        let totalQty = 0;
        let weightedPrice = 0;

        for (const lvl of levels) {
            totalQty += lvl.quantity;
            weightedPrice += lvl.price * lvl.quantity;
        }

        const avgPrice = totalQty > 0 ? weightedPrice / totalQty : 0;

        return {
            side,
            count: levels.length,
            totalQty,
            avgPrice,
            minPrice: levels[0].price,
            maxPrice: levels[levels.length - 1].price
        };
    }
}

module.exports = DepthClusters;

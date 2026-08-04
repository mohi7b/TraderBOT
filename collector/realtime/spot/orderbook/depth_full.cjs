/**
 * ============================================================
 *  File: depth_full.cjs
 *  Path: collector/realtime/orderbook/depth_full.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Full Depth processor for Spot & Futures collectors.
 *      Processes complete orderbook snapshots (bids + asks)
 *      and calculates:
 *          - total liquidity
 *          - weighted average price
 *          - spread
 *          - mid price
 *          - imbalance
 *
 *      Used by:
 *          - Binance Spot
 *          - Bybit Spot
 *          - OKX Spot (books-l2-tbt)
 *          - Bitget Spot
 *          - KuCoin Spot
 *          - All Futures collectors
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

class DepthFull {

    constructor() {}

    /**
     * Main handler
     */
    handle(market, symbol, snapshot) {
        if (!snapshot || !snapshot.bids || !snapshot.asks)
            return null;

        const bids = snapshot.bids;
        const asks = snapshot.asks;

        const bidMetrics = this.computeMetrics(bids);
        const askMetrics = this.computeMetrics(asks);

        const bestBid = bids.length > 0 ? bids[0].price : 0;
        const bestAsk = asks.length > 0 ? asks[0].price : 0;

        const spread = bestAsk > 0 ? bestAsk - bestBid : 0;
        const midPrice = bestAsk > 0 ? (bestAsk + bestBid) / 2 : 0;

        const imbalance = this.computeImbalance(bidMetrics.totalQty, askMetrics.totalQty);

        return {
            market,
            symbol,
            ts: Date.now(),
            bids,
            asks,
            bidMetrics,
            askMetrics,
            bestBid,
            bestAsk,
            spread,
            midPrice,
            imbalance
        };
    }

    /**
     * Compute liquidity + weighted average price
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
            avgPrice
        };
    }

    /**
     * Compute orderbook imbalance
     */
    computeImbalance(bidQty, askQty) {
        const total = bidQty + askQty;
        if (total === 0) return 0;

        return (bidQty - askQty) / total;
    }
}

module.exports = DepthFull;

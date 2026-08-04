/*
 * Binance Spot Depth Normalizer (Cluster Mode)
 * Version: 3.0.0
 * Path: collector/realtime/spot/orderbook/depth-normalizer.cjs
 * Description:
 *   - Converts delta depth updates into full normalized orderbook
 *   - Maintains internal bid/ask maps
 *   - Produces sorted full book snapshots
 *   - Cluster Mode: returns snapshot to ProcessorCluster (no orchestrator)
 */

/*
 * Binance Spot Depth Normalizer (Enterprise Cluster Edition)
 * Version: 3.0.0
 */

class SpotDepthNormalizer {
    constructor() {
        const ctx = require("../../../orchestrator/cluster/worker-context.cjs");

        this.state = ctx.state;
        this.log   = ctx.log;

        this.books = {}; // per-symbol full orderbook
    }

    ensureBook(symbol) {
        if (!this.books[symbol]) {
            this.books[symbol] = {
                bids: new Map(),
                asks: new Map(),
                lastUpdateId: 0
            };
        }
        return this.books[symbol];
    }

    applyDelta(book, delta) {
        for (const { price, quantity } of delta.bids) {
            if (quantity === 0) book.bids.delete(price);
            else book.bids.set(price, quantity);
        }

        for (const { price, quantity } of delta.asks) {
            if (quantity === 0) book.asks.delete(price);
            else book.asks.set(price, quantity);
        }

        book.lastUpdateId = delta.updateId;
    }

    toSortedArray(map, descending = false) {
        const arr = Array.from(map.entries()).map(([price, qty]) => ({
            price,
            quantity: qty
        }));

        return arr.sort((a, b) => descending ? b.price - a.price : a.price - b.price);
    }

    buildSnapshot(symbol) {
        const book = this.books[symbol];

        return {
            symbol,
            updateId: book.lastUpdateId,
            bids: this.toSortedArray(book.bids, true),
            asks: this.toSortedArray(book.asks, false),
            eventTime: Date.now()
        };
    }

    handle(market, symbol, delta) {
        try {
            const book = this.ensureBook(symbol);

            this.applyDelta(book, delta);

            const snapshot = this.buildSnapshot(symbol);

            this.state.updateMetrics(market, symbol, "orderbook", "depth-normalizer", {
                bidLevels: snapshot.bids.length,
                askLevels: snapshot.asks.length,
                updateId: snapshot.updateId
            });

            // Cluster Mode → فقط خروجی را return می‌کنیم
            return snapshot;

        } catch (err) {
            this.log.error(`DepthNormalizer error → ${symbol}: ${err.message}`);
            this.state.addError(market, symbol, "orderbook", "depth-normalizer", err);
            return null;
        }
    }
}

module.exports = SpotDepthNormalizer;

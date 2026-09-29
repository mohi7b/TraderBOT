const SourceHealth = require("./source-health.cjs");

class CrossVenueDepthAggregator {
    constructor({ staleAfterMs = 10000, tickSize = 0.01 } = {}) {
        this.tickSize = Number(tickSize) > 0 ? Number(tickSize) : 0.01;
        this.health = new SourceHealth({ staleAfterMs });
        this.books = new Map();
    }

    update(packet) {
        if (!packet || packet.market !== "futures" || !packet.exchange || !packet.symbol) return null;
        this.health.observe(packet);
        if (!packet.bids || !packet.asks || !this.health.isHealthy(packet)) return null;

        const key = this.health.key(packet);
        this.books.set(key, {
            ...packet,
            bids: packet.bids,
            asks: packet.asks,
            updatedAt: packet.receiveTimestamp || Date.now()
        });
        return this.snapshot(packet.symbol, packet.market);
    }

    normalizePrice(price) {
        return Math.round(Number(price) / this.tickSize) * this.tickSize;
    }

    snapshot(symbol, market = "futures", now = Date.now()) {
        const aggregate = new Map();
        for (const book of this.books.values()) {
            if (book.symbol !== symbol || book.market !== market || !this.health.isHealthy(book, now)) continue;
            this.addSide(aggregate, book.bids, "bid", book.exchange);
            this.addSide(aggregate, book.asks, "ask", book.exchange);
        }

        const levels = [...aggregate.values()].sort((a, b) => a.price - b.price);
        return {
            exchange: "aggregate",
            market,
            symbol,
            type: "depth_cross_venue",
            timestamp: now,
            bids: levels.filter(level => level.bidQty > 0).sort((a, b) => b.price - a.price),
            asks: levels.filter(level => level.askQty > 0).sort((a, b) => a.price - b.price),
            sourceCount: new Set([...this.books.values()].filter(book => book.symbol === symbol && this.health.isHealthy(book, now)).map(book => book.exchange)).size
        };
    }

    addSide(aggregate, levels, side, exchange) {
        for (const level of levels) {
            const price = this.normalizePrice(level.price);
            const quantity = Number(level.qty);
            if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) continue;
            const current = aggregate.get(price) || { price, bidQty: 0, askQty: 0, venues: new Set() };
            if (side === "bid") current.bidQty += quantity;
            else current.askQty += quantity;
            current.venues.add(exchange);
            current.venueCount = current.venues.size;
            aggregate.set(price, current);
        }
    }
}

module.exports = CrossVenueDepthAggregator;

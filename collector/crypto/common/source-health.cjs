class SourceHealth {
    constructor({ staleAfterMs = 10000 } = {}) {
        this.staleAfterMs = staleAfterMs;
        this.sources = new Map();
    }

    key({ exchange, market = "futures", symbol }) {
        return `${exchange}:${market}:${symbol}`;
    }

    observe(packet) {
        const key = this.key(packet);
        const current = this.sources.get(key) || {
            exchange: packet.exchange,
            market: packet.market || "futures",
            symbol: packet.symbol,
            received: 0,
            errors: 0,
            lastSeen: null,
            sequenceStatus: null
        };
        current.received += 1;
        current.lastSeen = packet.receiveTimestamp || Date.now();
        current.sequenceStatus = packet.sequenceStatus || current.sequenceStatus;
        current.lastType = packet.type;
        this.sources.set(key, current);
        return current;
    }

    error(packet, error) {
        const current = this.observe(packet);
        current.errors += 1;
        current.lastError = error && error.message ? error.message : String(error);
        return current;
    }

    isFresh(source, now = Date.now()) {
        return !!source.lastSeen && now - source.lastSeen <= this.staleAfterMs;
    }

    isHealthy(packet, now = Date.now()) {
        const source = this.sources.get(this.key(packet));
        if (!source || !this.isFresh(source, now)) return false;
        return !packet.sequenceStatus || ["healthy", "synchronized"].includes(packet.sequenceStatus);
    }

    getAll(now = Date.now()) {
        return [...this.sources.values()].map(source => ({
            ...source,
            fresh: this.isFresh(source, now),
            healthy: this.isFresh(source, now) && (!source.sequenceStatus || ["healthy", "synchronized"].includes(source.sequenceStatus))
        }));
    }
}

module.exports = SourceHealth;

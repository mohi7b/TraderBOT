class LiquidationObserver {
    constructor({ exchanges = [], capabilities = {}, windowMs = 30 * 60 * 1000, startedAt = Date.now() } = {}) {
        this.exchanges = exchanges;
        this.capabilities = capabilities;
        this.windowMs = windowMs;
        this.startedAt = startedAt;
        this.observations = new Map(exchanges.map((exchange) => [exchange, {
            exchange,
            count: 0,
            firstSeenAt: null,
            lastSeenAt: null
        }]));
    }

    observe(packet = {}) {
        if (packet.market !== "futures" || packet.event !== "liquidation" || !packet.exchange) return false;

        const observation = this.observations.get(packet.exchange) || {
            exchange: packet.exchange,
            count: 0,
            firstSeenAt: null,
            lastSeenAt: null
        };
        const now = Date.now();
        observation.count += 1;
        observation.firstSeenAt = observation.firstSeenAt || now;
        observation.lastSeenAt = now;
        this.observations.set(packet.exchange, observation);
        return true;
    }

    snapshot(now = Date.now()) {
        return [...this.observations.values()].map((observation) => ({
            ...observation,
            publicFeed: this.capabilities[observation.exchange] !== false,
            windowMs: this.windowMs,
            remainingMs: Math.max(0, this.startedAt + this.windowMs - now),
            status: this.capabilities[observation.exchange] === false
                ? "unavailable_public_feed"
                : observation.count > 0
                ? "validated"
                : now < this.startedAt + this.windowMs
                    ? "collecting"
                    : "expired_without_event"
        }));
    }
}

module.exports = LiquidationObserver;

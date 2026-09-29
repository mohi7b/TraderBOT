const FRESHNESS_MS = Object.freeze({
    trade: 5000,
    price: 5000,
    depth: 5000,
    depth_partial: 5000,
    depth_full_snapshot: 5000,
    depth_full_diff: 5000,
    candle: 90000,
    funding: 30000,
    mark_price: 30000,
    oi: 30000
});

/* fix #7 — how far the local clock may differ from a packet's
 * `receiveTimestamp` before that stamp is considered foreign (venue clock). */
const CLOCK_TRUST_MS = 5 * 60 * 1000;

class MarketDataQuality {
    constructor() {
        this.records = new Map();
        this.fingerprints = new Map();
    }

    eventType(packet = {}) {
        return packet.type || packet.event || "unknown";
    }

    key(packet = {}) {
        return [
            packet.exchange || "unknown",
            packet.market || "unknown",
            packet.symbol || "unknown",
            this.eventType(packet)
        ].join(":");
    }

    fingerprint(packet = {}) {
        const payload = packet.payload || {};
        const sequence = packet.sequence || {};
        return [
            this.eventType(packet),
            packet.timestamp || "",
            payload.tradeId || payload.id || "",
            sequence.seqId || sequence.sequenceEnd || sequence.updateId || sequence.seq || "",
            payload.price || packet.price || "",
            payload.qty || payload.tradeQty || packet.qty || packet.tradeQty || "",
            payload.rate || packet.rate || "",
            payload.oi || packet.oi || ""
        ].join("|");
    }

    accept(packet = {}) {
        const key = this.key(packet);
        const fingerprint = this.fingerprint(packet);
        if (this.fingerprints.get(key) === fingerprint) return false;
        this.fingerprints.set(key, fingerprint);
        return true;
    }

    /**
     * fix #7 — one clock for freshness: the moment WE received the packet.
     * `receiveTimestamp` is stamped locally by every producer, so it is the
     * most accurate receive time, but a venue clock (or a wrong unit) must
     * never be able to move it — a stamp that is absurdly far from `now` is
     * ignored, and the difference is still reported through `clockSkewMs`.
     */
    receivedAt(packet = {}, now = Date.now()) {
        const candidate = Number(packet.receiveTimestamp);
        if (!Number.isFinite(candidate) || candidate <= 0) return now;
        return Math.abs(now - candidate) <= CLOCK_TRUST_MS ? candidate : now;
    }

    record(packet = {}, now = Date.now()) {
        const eventType = this.eventType(packet);
        const key = this.key(packet);
        const receivedAt = this.receivedAt(packet, now);
        const exchangeTimestamp = Number(packet.timestamp) || receivedAt;
        const bids = packet.bids || packet.payload?.bids || [];
        const asks = packet.asks || packet.payload?.asks || [];
        const previous = this.records.get(key) || {};

        const record = {
            ...previous,
            exchange: packet.exchange || "unknown",
            market: packet.market || "unknown",
            symbol: packet.symbol || "unknown",
            eventType,
            source: packet.source || "websocket",
            lastReceivedAt: receivedAt,
            lastExchangeTimestamp: exchangeTimestamp,
            clockSkewMs: exchangeTimestamp - receivedAt,
            sequenceStatus: packet.sequenceStatus || previous.sequenceStatus || null,
            depthLevels: Array.isArray(bids) || Array.isArray(asks) ? bids.length + asks.length : previous.depthLevels || 0
        };

        this.records.set(key, record);
        return record;
    }

    snapshot(now = Date.now()) {
        return [...this.records.values()].map((record) => {
            const freshnessMs = FRESHNESS_MS[record.eventType] || 10000;
            const ageMs = now - record.lastReceivedAt;
            const sequenceInvalid = record.sequenceStatus === "invalid";
            return {
                ...record,
                freshnessMs,
                ageMs,
                status: sequenceInvalid ? "degraded" : ageMs <= freshnessMs ? "healthy" : "stale"
            };
        });
    }
}

const marketDataQuality = new MarketDataQuality();

module.exports = { FRESHNESS_MS, MarketDataQuality, marketDataQuality };

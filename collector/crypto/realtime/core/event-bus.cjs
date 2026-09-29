/* ============================================================
 * File: collector/crypto/realtime/core/event-bus.cjs
 * Section: collector/crypto/realtime/core
 *
 * Role:
 *   In-process publish/subscribe bus for every realtime event.
 *
 *   Before the refactor, L2 module output was only handed to
 *   global.healthEmit (and for spot it was even thrown away). The bus
 *   is now the single sink for:
 *     - L2 module emits           (channel: market:exchange:symbol:event)
 *     - flow events               (packet accepted, market_aggregate)
 *     - group health markers      (price, depth, candles, funding, ...)
 *
 *   It also keeps a bounded per-channel "latest + history" ring so the
 *   standalone server can answer GET /state/:symbol without any
 *   external dependency, and so consumers can subscribe (SSE).
 *
 * Channel format:  "<market>:<exchange>:<symbol>:<event>"
 * ============================================================ */

const CONFIG = require("../config/realtime.cjs");
const logger = require("./logger.cjs").createLogger("bus");

function channelKey({ market, exchange, symbol, event }) {
    return [
        market || "unknown",
        exchange || "unknown",
        symbol || "unknown",
        event || "unknown"
    ].join(":");
}

function normalizeEvent(event) {
    if (typeof event === "string") return event ? { event } : null;
    if (event && typeof event === "object") return event;
    return null;
}

class EventBus {
    constructor({ historyMs = CONFIG.signalHistoryMs, maxPerChannel = CONFIG.signalMaxPerChannel } = {}) {
        this.historyMs = Number(historyMs) > 0 ? Number(historyMs) : 0;
        this.maxPerChannel = Number(maxPerChannel) > 0 ? Number(maxPerChannel) : 100;

        this.latest = new Map();   // channel -> entry
        this.history = new Map();  // channel -> entry[]
        this.taps = new Set();     // global listeners (fn(entry))

        this.counters = { published: 0, rejected: 0, listenerErrors: 0 };
    }

    /* ------------------------------------------------------------
     * Publishing
     * ---------------------------------------------------------- */
    publish(event, context = {}) {
        const normalized = normalizeEvent(event);
        if (!normalized || !normalized.event) {
            this.counters.rejected += 1;
            return null;
        }

        const channel = channelKey({
            market: normalized.market || context.market,
            exchange: normalized.exchange || context.exchange,
            symbol: normalized.symbol || context.symbol,
            event: normalized.event
        });

        const entry = {
            channel,
            event: normalized.event,
            market: normalized.market || context.market || null,
            exchange: normalized.exchange || context.exchange || null,
            symbol: normalized.symbol || context.symbol || null,
            at: Date.now(),
            payload: normalized
        };

        this.latest.set(channel, entry);

        const bucket = this.history.get(channel) || [];
        bucket.push(entry);
        this.prune(bucket, entry.at);
        this.history.set(channel, bucket);
        this.counters.published += 1;

        for (const tap of this.taps) {
            try {
                tap(entry);
            } catch (err) {
                this.counters.listenerErrors += 1;
                logger.error(`subscriber failed → ${err.message}`);
            }
        }

        return entry;
    }

    prune(bucket, now) {
        while (bucket.length && bucket.length > this.maxPerChannel) bucket.shift();
        if (this.historyMs > 0) {
            while (bucket.length && now - bucket[0].at > this.historyMs) bucket.shift();
        }
    }

    /* ------------------------------------------------------------
     * Subscriptions
     *   on(channel, fn)  → a single exact channel
     *   subscribe(fn)    → every channel (SSE + signal store)
     * ---------------------------------------------------------- */
    on(channel, fn) {
        return this.subscribe((entry) => {
            if (entry.channel === channel) fn(entry);
        });
    }

    subscribe(fn) {
        if (typeof fn !== "function") return () => {};
        this.taps.add(fn);
        return () => this.taps.delete(fn);
    }

    /* ------------------------------------------------------------
     * Reads
     * ---------------------------------------------------------- */
    latestFor(channel) {
        return this.latest.get(channel) || null;
    }

    historyFor(channel, limit = this.maxPerChannel) {
        const bucket = this.history.get(channel) || [];
        return bucket.slice(-Math.max(1, Number(limit) || 1));
    }

    channels(filter = {}) {
        const all = [...new Set([...this.latest.keys(), ...this.history.keys()])];
        return all.filter((channel) => {
            const [market, exchange, symbol] = channel.split(":");
            if (filter.market && filter.market !== market) return false;
            if (filter.exchange && filter.exchange !== exchange) return false;
            if (filter.symbol && filter.symbol !== symbol) return false;
            return true;
        });
    }

    /**
     * Event-name keyed snapshot, optionally filtered by symbol/exchange/market.
     * Used by GET /state/:symbol and by realtime.signals().
     */
    snapshot(filter = {}) {
        const result = {};
        for (const channel of this.channels(filter)) {
            const entry = this.latest.get(channel) || this.historyFor(channel, 1)[0];
            if (!entry) continue;
            result[entry.event] = result[entry.event] || {};
            const scope = entry.exchange || entry.market || "unknown";
            result[entry.event][scope] = entry.payload;
        }
        return result;
    }

    /** Flat, ordered view (oldest first) — used as the SSE bootstrap tail. */
    tail(filter = {}, limit = 20) {
        const entries = [];
        for (const channel of this.channels(filter)) {
            for (const entry of this.historyFor(channel, limit)) entries.push(entry);
        }
        entries.sort((a, b) => a.at - b.at);
        return entries.slice(-limit);
    }

    clear(filter = {}) {
        const targets = this.channels(filter);
        for (const channel of targets) {
            this.latest.delete(channel);
            this.history.delete(channel);
        }
        return targets.length;
    }

    stats() {
        return {
            channels: this.channels().length,
            subscribers: this.taps.size,
            historyMs: this.historyMs,
            maxPerChannel: this.maxPerChannel,
            ...this.counters
        };
    }
}

module.exports = { EventBus, channelKey, normalizeEvent };

/* ============================================================
 * File: analytics-engine/modules/liquidations/index.cjs
 * Section: analytics-engine/modules/liquidations
 * Version: 1.0.0
 *
 * Role:
 *   Module 2 of the analytics engine: liquidation heatmap.
 *
 *   Forced liquidations arrive as discrete events (price, size, side).
 *   A single event is noise; their *distribution over price* is the
 *   signal — it shows where leverage was stacked and where the market
 *   has just been "cleaned" (magnet levels / cascade origins).
 *
 *   Construction:
 *     - price axis is bucketed logarithmically, so a bin is a fixed
 *       *percentage* band (0.25% by default) and the map behaves the
 *       same at 0.0001 and at 100000:
 *         index  = floor( ln(price) / ln(1 + binPct) )
 *         lower  = (1 + binPct)^index
 *         upper  = (1 + binPct)^(index + 1)
 *       Bins are therefore *global* — independent of arrival order — and
 *       two engines (or a restart) bin the same price identically.
 *     - a rolling window (24 h default) keeps the map current; events
 *       older than the window are dropped, so the map decays instead of
 *       growing forever.
 *     - side semantics: `side: "long"` means a LONG position was
 *       liquidated → market sells. netNotional = long − short, so a
 *       positive netNotional means "longs were wiped out here" (bearish
 *       pressure at that level).
 *
 *   Output: bins + the strongest clusters, ready to render as a heatmap
 *   (clusters also work as a horizontal-level overlay).
 * ============================================================ */

const math = require("../../core/math.cjs");

const DEFAULT_BIN_PCT = 0.0025;   /* 0.25% bands */
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

class LiquidationHeatmap {
    constructor({
        windowMs = DEFAULT_WINDOW_MS,
        binPct = DEFAULT_BIN_PCT,
        maxEvents = 50_000,
        now = Date.now
    } = {}) {
        this.windowMs = Math.max(1000, Number(windowMs) || DEFAULT_WINDOW_MS);
        this.binPct = Math.min(0.2, Math.max(0.0001, Number(binPct) || DEFAULT_BIN_PCT));
        this.maxEvents = Math.max(100, Number(maxEvents) || 50_000);
        this.now = now;

        this.events = new Map();  // SYMBOL → event[]
        this.counters = { ingested: 0, rejected: 0, expired: 0 };
    }

    /* ------------------------------------------------------------
     * Global log-bucketed price axis (order-independent)
     * ---------------------------------------------------------- */

    /** Bin of a price: floor( ln(price) / ln(1 + binPct) ). */
    static binIndex(price, binPct = DEFAULT_BIN_PCT) {
        const parsed = math.positive(price);
        if (parsed === null) return null;
        return Math.floor(Math.log(parsed) / Math.log(1 + binPct));
    }

    /** [lower, upper) price band of a bin (+ its center for overlays). */
    static binRange(index, binPct = DEFAULT_BIN_PCT) {
        const i = math.finite(index);
        if (i === null) return null;
        const lower = (1 + binPct) ** i;
        const upper = (1 + binPct) ** (i + 1);
        return { index: i, lower, upper, center: (lower + upper) / 2 };
    }

    /**
     * @param {{exchange?:string, symbol:string, side:"long"|"short",
     *          price:number, qty:number, notional?:number, timestamp?:number}} sample
     * @returns {object|null} the stored event (null when unusable)
     */
    ingest(sample = {}) {
        const price = math.positive(sample.price);
        const qty = math.positive(sample.qty);
        const side = sample.side === "long" || sample.side === "short" ? sample.side : null;

        if (!sample.symbol || side === null || price === null || qty === null) {
            this.counters.rejected += 1;
            return null;
        }

        const timestamp = math.finite(sample.timestamp) || this.now();
        const event = {
            exchange: sample.exchange || null,
            side,
            price,
            qty,
            notional: math.positive(sample.notional) || qty * price,
            timestamp,
            bin: LiquidationHeatmap.binIndex(price, this.binPct)
        };

        const symbol = String(sample.symbol).toUpperCase();
        const bucket = this.events.get(symbol) || [];
        bucket.push(event);
        this.expire(bucket, timestamp);
        if (bucket.length > this.maxEvents) bucket.splice(0, bucket.length - this.maxEvents);
        this.events.set(symbol, bucket);

        this.counters.ingested += 1;
        return event;
    }

    /** Drop everything older than the newest timestamp − windowMs. */
    expire(bucket, at) {
        const cutoff = at - this.windowMs;
        let drop = 0;
        while (drop < bucket.length && bucket[drop].timestamp < cutoff) drop += 1;
        if (drop > 0) {
            bucket.splice(0, drop);
            this.counters.expired += drop;
        }
        return bucket;
    }

    /** All events of a symbol, oldest first (expiring stale ones first). */
    eventsFor(symbol) {
        const upper = String(symbol || "").toUpperCase();
        const bucket = this.events.get(upper);
        if (!bucket || !bucket.length) return [];
        this.expire(bucket, bucket[bucket.length - 1].timestamp);
        return bucket;
    }

    /* ------------------------------------------------------------
     * Aggregation
     * ---------------------------------------------------------- */

    /** One bin per touched price band, sorted by total notional (desc). */
    binsFor(symbol) {
        const events = this.eventsFor(symbol);
        const byBin = new Map();

        for (const event of events) {
            const entry = byBin.get(event.bin) || {
                index: event.bin,
                longNotional: 0,
                shortNotional: 0,
                longCount: 0,
                shortCount: 0,
                exchanges: {},
                firstAt: event.timestamp,
                lastAt: event.timestamp
            };

            if (event.side === "long") {
                entry.longNotional += event.notional;
                entry.longCount += 1;
            } else {
                entry.shortNotional += event.notional;
                entry.shortCount += 1;
            }

            const exchangeKey = event.exchange || "unknown";
            entry.exchanges[exchangeKey] = (entry.exchanges[exchangeKey] || 0) + event.notional;
            entry.firstAt = Math.min(entry.firstAt, event.timestamp);
            entry.lastAt = Math.max(entry.lastAt, event.timestamp);

            byBin.set(event.bin, entry);
        }

        return [...byBin.values()]
            .map((entry) => {
                const range = LiquidationHeatmap.binRange(entry.index, this.binPct);
                const totalNotional = entry.longNotional + entry.shortNotional;
                return {
                    index: entry.index,
                    lower: range.lower,
                    upper: range.upper,
                    center: range.center,
                    longNotional: entry.longNotional,
                    shortNotional: entry.shortNotional,
                    totalNotional,
                    netNotional: entry.longNotional - entry.shortNotional,
                    count: entry.longCount + entry.shortCount,
                    longCount: entry.longCount,
                    shortCount: entry.shortCount,
                    dominantSide: entry.longNotional >= entry.shortNotional ? "long" : "short",
                    exchanges: { ...entry.exchanges },
                    firstAt: entry.firstAt,
                    lastAt: entry.lastAt
                };
            })
            .sort((a, b) => b.totalNotional - a.totalNotional);
    }
    /** Strongest bins ("magnet levels"), with their share of total notional. */
    clustersFor(symbol, { top = 10 } = {}) {
        const bins = this.binsFor(symbol);
        const totalNotional = math.sum(bins.map((bin) => bin.totalNotional));

        return bins.slice(0, Math.max(1, Number(top) || 10)).map((bin) => ({
            index: bin.index,
            lower: bin.lower,
            upper: bin.upper,
            center: bin.center,
            totalNotional: bin.totalNotional,
            notional: bin.totalNotional,
            netNotional: bin.netNotional,
            dominantSide: bin.dominantSide,
            count: bin.count,
            share: math.divide(bin.totalNotional, totalNotional),
            lastAt: bin.lastAt
        }));
    }

    /**
     * The full heatmap of one symbol: bins + clusters + totals.
     *   totals.netNotional > 0 → longs were liquidated more (bearish washout)
     */
    snapshot({ symbol, top = 10, includeBins = true } = {}) {
        const upper = String(symbol || "").toUpperCase();
        const events = this.eventsFor(upper);
        const bins = this.binsFor(upper);

        if (!events.length) {
            return {
                symbol: upper || null,
                windowMs: this.windowMs,
                binPct: this.binPct,
                bins: [],
                clusters: [],
                totals: null,
                exchanges: {},
                timestamp: this.now()
            };
        }

        const exchanges = {};
        for (const event of events) {
            const key = event.exchange || "unknown";
            const entry = exchanges[key] || { notional: 0, longNotional: 0, shortNotional: 0, count: 0 };
            entry.notional += event.notional;
            entry.count += 1;
            if (event.side === "long") entry.longNotional += event.notional;
            else entry.shortNotional += event.notional;
            exchanges[key] = entry;
        }

        const longNotional = math.sum(events.filter((e) => e.side === "long").map((e) => e.notional)) || 0;
        const shortNotional = math.sum(events.filter((e) => e.side === "short").map((e) => e.notional)) || 0;
        const totalNotional = longNotional + shortNotional;
        const prices = events.map((event) => event.price);
        const clusters = this.clustersFor(upper, { top });

        return {
            symbol: upper,
            windowMs: this.windowMs,
            binPct: this.binPct,
            bins: includeBins ? bins : [],
            binsTouched: bins.length,
            clusters,
            totals: {
                notional: totalNotional,
                longNotional,
                shortNotional,
                netNotional: longNotional - shortNotional,
                longShare: math.divide(longNotional, totalNotional),
                count: events.length,
                averageNotional: math.divide(totalNotional, events.length),
                minPrice: Math.min(...prices),
                maxPrice: Math.max(...prices),
                vwap: math.divide(math.sum(events.map((e) => e.notional)) || 0, math.sum(events.map((e) => e.qty)))
            },
            /* Largest single forced order in the window — the "cascade" print. */
            largest: events.reduce(
                (best, event) => (best === null || event.notional > best.notional
                    ? { exchange: event.exchange, side: event.side, price: event.price, qty: event.qty, notional: event.notional, timestamp: event.timestamp }
                    : best),
                null
            ),
            exchanges,
            windowStart: Math.min(...events.map((e) => e.timestamp)),
            timestamp: Math.max(...events.map((e) => e.timestamp))
        };
    }

    reset({ symbol = null } = {}) {
        if (symbol === null) {
            const size = this.events.size;
            this.events.clear();
            return size;
        }
        return this.events.delete(String(symbol).toUpperCase()) ? 1 : 0;
    }
}

module.exports = { LiquidationHeatmap, DEFAULT_BIN_PCT, DEFAULT_WINDOW_MS };

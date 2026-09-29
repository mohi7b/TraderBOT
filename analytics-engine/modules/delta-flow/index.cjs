/* ============================================================
 * File: analytics-engine/modules/delta-flow/index.cjs
 * Section: analytics-engine/modules/delta-flow
 * Version: 1.0.0
 *
 * Role:
 *   Module 1 of the analytics engine: order-flow pressure.
 *
 *     a) CVD — Cumulative Volume Delta over a rolling window.
 *        delta(trade) = +qty  when the taker was the buyer (side "buy")
 *                     = -qty  when the taker was the seller (side "sell")
 *        CVD          = Σ delta within the window (base asset)
 *        CVD(USD)     = Σ signed notional (price × qty)
 *        Taker-buy ratio = buyNotional / totalNotional  ∈ [0, 1]
 *        The window is rolling, so CVD here is a *window* CVD: it decays
 *        as trades leave the window. That is what a trader reads as
 *        "net pressure of the last N minutes"; a monotonic
 *        since-listing CVD is not comparable across venues/restarts.
 *
 *     b) Orderbook imbalance from the top-N levels:
 *        raw imbalance      = (bidNotional − askNotional)/(bid+ask)  ∈ [−1,1]
 *        weighted imbalance = the same over level-weighted notionals,
 *                             weight(l) = 1/l  (the touch matters most)
 *
 *   Pure maths + in-memory state; no IO, no bus, no timers — the engine
 *   feeds it and publishes what comes out.
 * ============================================================ */

const math = require("../../core/math.cjs");

const SIDE_ALIASES = {
    buy: "buy",
    b: "buy",
    long: "buy",
    bid: "buy",
    sell: "sell",
    s: "sell",
    short: "sell",
    ask: "sell"
};

function normalizeSide(side) {
    return SIDE_ALIASES[String(side === null || side === undefined ? "" : side).toLowerCase()] || null;
}

/** [[price, qty], ...] and [{price, qty|size}, ...] are both accepted. */
function normalizeLevels(levels) {
    if (!Array.isArray(levels)) return [];

    const out = [];
    for (const level of levels) {
        if (Array.isArray(level)) {
            const price = math.positive(level[0]);
            const qty = math.positive(level[1]);
            if (price !== null && qty !== null) out.push({ price, qty });
            continue;
        }
        if (level && typeof level === "object") {
            const price = math.positive(level.price);
            const rawQty = math.finite(level.qty) !== null ? level.qty : level.size;
            const qty = math.positive(rawQty);
            if (price !== null && qty !== null) out.push({ price, qty });
        }
    }
    return out;
}

class DeltaFlow {
    constructor({ windowMs = 5 * 60_000, bucketMs = 10_000, depthLevels = 10, now = Date.now } = {}) {
        this.windowMs = Math.max(1000, Number(windowMs) || 300_000);
        this.bucketMs = Math.max(1000, Number(bucketMs) || 10_000);
        this.depthLevels = Math.max(1, Number(depthLevels) || 10);
        this.now = now;

        this.trades = new Map();   // "exchange:symbol" → trade[]
        this.depths = new Map();   // "exchange:symbol" → depth sample
    }

    static key(exchange, symbol) {
        return `${exchange || "unknown"}:${symbol || "unknown"}`;
    }

    /* ------------------------------------------------------------
     * Trades → CVD
     * ---------------------------------------------------------- */

    /**
     * @param {{exchange?:string, symbol:string, side:string, qty:number,
     *          price:number, timestamp?:number}} trade
     * @returns {object|null} the trade reduced to its canonical form
     */
    ingestTrade(trade = {}) {
        const side = normalizeSide(trade.side);
        const qty = math.positive(trade.qty);
        const price = math.positive(trade.price);
        if (!trade.symbol || side === null || qty === null || price === null) return null;

        const timestamp = math.finite(trade.timestamp) || this.now();
        const entry = {
            exchange: trade.exchange || null,
            symbol: String(trade.symbol).toUpperCase(),
            side,
            qty,
            price,
            notional: qty * price,
            timestamp
        };

        const key = DeltaFlow.key(entry.exchange, entry.symbol);
        const bucket = this.trades.get(key) || [];
        bucket.push(entry);
        this.pruneTrades(bucket, timestamp);
        this.trades.set(key, bucket);

        return entry;
    }

    pruneTrades(bucket, at) {
        const cutoff = at - this.windowMs;
        let drop = 0;
        while (drop < bucket.length && bucket[drop].timestamp < cutoff) drop += 1;
        if (drop > 0) bucket.splice(0, drop);
        return bucket;
    }

    /** Windowed CVD for one venue × symbol (nulls when nothing is in window). */
    cvdFor(exchange, symbol) {
        const upper = String(symbol).toUpperCase();
        const bucket = this.trades.get(DeltaFlow.key(exchange, upper));

        if (!bucket || !bucket.length) {
            return {
                symbol: upper,
                exchange: exchange || null,
                trades: 0,
                buyQty: null,
                sellQty: null,
                volume: null,
                cvd: null,
                buyNotional: null,
                sellNotional: null,
                cvdUsd: null,
                takerBuyRatio: null,
                vwap: null,
                windowMs: this.windowMs,
                windowStart: null,
                firstTradeAt: null,
                lastTradeAt: null,
                timestamp: this.now()
            };
        }

        const cutoff = bucket[bucket.length - 1].timestamp - this.windowMs;
        const window = bucket.filter((trade) => trade.timestamp > cutoff);

        let buyQty = 0;
        let sellQty = 0;
        let buyNotional = 0;
        let sellNotional = 0;

        for (const trade of window) {
            if (trade.side === "buy") {
                buyQty += trade.qty;
                buyNotional += trade.notional;
            } else {
                sellQty += trade.qty;
                sellNotional += trade.notional;
            }
        }

        const totalNotional = buyNotional + sellNotional;
        return {
            symbol: window[0].symbol,
            exchange: window[0].exchange,
            trades: window.length,
            buyQty,
            sellQty,
            volume: buyQty + sellQty,
            cvd: buyQty - sellQty,
            buyNotional,
            sellNotional,
            cvdUsd: buyNotional - sellNotional,
            takerBuyRatio: math.divide(buyNotional, totalNotional),
            vwap: math.divide(totalNotional, buyQty + sellQty),
            windowMs: this.windowMs,
            windowStart: window[0].timestamp,
            firstTradeAt: window[0].timestamp,
            lastTradeAt: window[window.length - 1].timestamp,
            timestamp: window[window.length - 1].timestamp
        };
    }
    /**
     * Symbol-level CVD: every venue merged, plus a per-venue breakdown and
     * the CVD path bucketed into `bucketMs` slices (chart series).
     */
    snapshot({ symbol, bucketMs = this.bucketMs } = {}) {
        const upper = String(symbol || "").toUpperCase();
        if (!upper) return { symbol: null, venues: {}, aggregate: null, series: [], timestamp: this.now() };

        const venues = {};
        const perVenue = [];

        for (const [key, bucket] of this.trades) {
            const [exchange, tradeSymbol] = key.split(":");
            if (tradeSymbol !== upper || !bucket.length) continue;
            const cvd = this.cvdFor(exchange, upper);
            venues[exchange] = cvd;
            perVenue.push(cvd);
        }

        if (!perVenue.length) return { symbol: upper, venues: {}, aggregate: null, series: [], timestamp: this.now() };

        const merged = this.merge(perVenue);
        return {
            symbol: upper,
            venues,
            aggregate: merged,
            series: this.series(upper, merged.windowStart, merged.lastTradeAt, bucketMs),
            timestamp: merged.timestamp
        };
    }

    merge(samples) {
        const buyQty = math.sum(samples.map((s) => s.buyQty));
        const sellQty = math.sum(samples.map((s) => s.sellQty));
        const buyNotional = math.sum(samples.map((s) => s.buyNotional));
        const sellNotional = math.sum(samples.map((s) => s.sellNotional));
        const volume = buyQty !== null && sellQty !== null ? buyQty + sellQty : null;
        const totalNotional = buyNotional !== null && sellNotional !== null ? buyNotional + sellNotional : null;

        return {
            symbol: samples[0].symbol,
            venues: samples.length,
            trades: math.sum(samples.map((s) => s.trades)) || 0,
            buyQty,
            sellQty,
            volume,
            cvd: buyQty !== null && sellQty !== null ? buyQty - sellQty : null,
            buyNotional,
            sellNotional,
            cvdUsd: buyNotional !== null && sellNotional !== null ? buyNotional - sellNotional : null,
            takerBuyRatio: math.divide(buyNotional, totalNotional),
            vwap: math.divide(totalNotional, volume),
            windowMs: this.windowMs,
            windowStart: Math.min(...samples.map((s) => s.windowStart)),
            lastTradeAt: Math.max(...samples.map((s) => s.lastTradeAt)),
            timestamp: Math.max(...samples.map((s) => s.timestamp))
        };
    }

    /** Bucketed CVD path: [[bucketStart, cvd, cvdUsd, trades], ...] (oldest first). */
    series(symbol, from, to, bucketMs = this.bucketMs) {
        const upper = String(symbol || "").toUpperCase();
        const start = math.finite(from);
        const end = math.finite(to);
        if (!upper || start === null || end === null || end < start) return [];

        const size = Math.max(1000, Number(bucketMs) || this.bucketMs);
        const slots = Math.min(2000, Math.floor((end - start) / size) + 1);
        const buckets = new Array(slots).fill(null).map((_, index) => ({
            at: start + index * size,
            cvd: 0,
            cvdUsd: 0,
            trades: 0
        }));

        for (const [key, list] of this.trades) {
            if (!key.endsWith(`:${upper}`)) continue;
            for (const trade of list) {
                const index = Math.floor((trade.timestamp - start) / size);
                if (index < 0 || index >= slots) continue;
                const slot = buckets[index];
                slot.trades += 1;
                const sign = trade.side === "buy" ? 1 : -1;
                slot.cvd += sign * trade.qty;
                slot.cvdUsd += sign * trade.notional;
            }
        }

        /* Accumulate so the series is a CVD path, not per-bucket deltas. */
        let running = 0;
        let runningUsd = 0;
        return buckets.map((slot) => {
            running += slot.cvd;
            runningUsd += slot.cvdUsd;
            return [slot.at, running, runningUsd, slot.trades];
        });
    }
    /* ------------------------------------------------------------
     * Depth → orderbook imbalance
     * ---------------------------------------------------------- */

    /**
     * @param {{exchange?:string, symbol:string, bids:Array, asks:Array,
     *          levels?:number, timestamp?:number}} depth
     * @returns {object|null} imbalance sample (null when the book is unusable)
     */
    ingestDepth(depth = {}) {
        const bids = normalizeLevels(depth.bids).slice(0, depth.levels || this.depthLevels);
        const asks = normalizeLevels(depth.asks).slice(0, depth.levels || this.depthLevels);
        if (!depth.symbol || (!bids.length && !asks.length)) return null;

        const bestBid = bids.length ? Math.max(...bids.map((l) => l.price)) : null;
        const bestAsk = asks.length ? Math.min(...asks.map((l) => l.price)) : null;
        const midPrice = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk);

        const side = (levels) => {
            let raw = 0;
            let weighted = 0;
            for (let index = 0; index < levels.length; index += 1) {
                const notional = levels[index].price * levels[index].qty;
                raw += notional;
                weighted += notional / (index + 1);
            }
            return { notional: raw, weighted };
        };

        const bid = side(bids);
        const ask = side(asks);
        const rawImbalance = math.divide(bid.notional - ask.notional, bid.notional + ask.notional);
        const weightedImbalance = math.divide(bid.weighted - ask.weighted, bid.weighted + ask.weighted);

        const sample = {
            exchange: depth.exchange || null,
            symbol: String(depth.symbol).toUpperCase(),
            midPrice,
            bestBid,
            bestAsk,
            spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
            spreadBps: math.bpsDiff(bestAsk, bestBid),
            bidNotional: bid.notional,
            askNotional: ask.notional,
            bidLevels: bids.length,
            askLevels: asks.length,
            imbalance: rawImbalance,
            weightedImbalance,
            /* Human-readable direction of the pressure. */
            bias: rawImbalance === null ? null : (rawImbalance > 0 ? "bid" : (rawImbalance < 0 ? "ask" : "flat")),
            timestamp: math.finite(depth.timestamp) || this.now()
        };

        this.depths.set(DeltaFlow.key(sample.exchange, sample.symbol), sample);
        return sample;
    }

    depthFor(exchange, symbol) {
        return this.depths.get(DeltaFlow.key(exchange, String(symbol).toUpperCase())) || null;
    }

    /**
     * Flow pressure: the two independent readings side by side, plus a
     * simple agreement flag. CVD is per-symbol (all venues) and imbalance
     * is per-venue, so the caller can compare the aggregate flow with one
     * venue's book.
     */
    pressure({ symbol, exchange = null } = {}) {
        const flow = this.snapshot({ symbol });
        const depth = exchange ? this.depthFor(exchange, symbol) : this.depthFor(null, symbol);

        const cvdSign = flow.aggregate && flow.aggregate.cvd !== null
            ? Math.sign(flow.aggregate.cvd)
            : null;
        const imbalanceSign = depth && depth.imbalance !== null ? Math.sign(depth.imbalance) : null;

        return {
            symbol: String(symbol || "").toUpperCase(),
            cvd: flow.aggregate ? flow.aggregate.cvd : null,
            cvdUsd: flow.aggregate ? flow.aggregate.cvdUsd : null,
            takerBuyRatio: flow.aggregate ? flow.aggregate.takerBuyRatio : null,
            imbalance: depth ? depth.imbalance : null,
            weightedImbalance: depth ? depth.weightedImbalance : null,
            imbalanceExchange: depth ? depth.exchange : null,
            agreement: cvdSign !== null && imbalanceSign !== null ? cvdSign === imbalanceSign : null,
            timestamp: flow.timestamp
        };
    }

    reset({ symbol = null } = {}) {
        if (symbol === null) {
            this.trades.clear();
            this.depths.clear();
            return 0;
        }

        const upper = String(symbol).toUpperCase();
        let removed = 0;
        for (const key of [...this.trades.keys()]) {
            if (key.endsWith(`:${upper}`)) {
                this.trades.delete(key);
                removed += 1;
            }
        }
        for (const key of [...this.depths.keys()]) {
            if (key.endsWith(`:${upper}`)) {
                this.depths.delete(key);
                removed += 1;
            }
        }
        return removed;
    }
}

module.exports = { DeltaFlow, normalizeLevels, normalizeSide };

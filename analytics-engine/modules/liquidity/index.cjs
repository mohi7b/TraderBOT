/* ============================================================
 * File: analytics-engine/modules/liquidity/index.cjs
 * Section: analytics-engine/modules/liquidity
 * Version: 1.0.0
 *
 * Role:
 *   Module 5 of the analytics engine: the liquidity view of the six
 *   markets (collector/liquidity_6markets, sub-phase 2.2).
 *
 *   The collector reports ONE venue at a time — a gold quote, a 10-year
 *   yield, a crypto BBO — and already computes a cross-venue view of its
 *   own (core/flow-engine.cjs). This module is the layer above it: it
 *   keeps the last sample of every venue and answers three questions per
 *   asset.
 *
 *     reading(symbol)       what is this asset worth right now, per venue?
 *                           median of the fresh prices, the two venue
 *                           extremes, and the tightest bid/ask any venue
 *                           is actually showing
 *     flow(symbol)          how liquid is it, and where? Cross-venue spread,
 *                           tradable spread, depth imbalance — plus what
 *                           the collector measured, carried verbatim
 *     candle(symbol)        what bar did a venue last hand over (OHLCV)?
 *                           edge-triggered: `candleUpdate()` returns a bar
 *                           once, when its open time is new to this module
 *
 *   Honesty rules (the same ones the collector and the storage engine
 *   follow):
 *     - a missing number is null, never 0: a venue that serves no book has
 *       no spread, not a zero spread
 *     - two measurements are never blended: what the collector measured is
 *       reported under `reported`, what this module computed from the venue
 *       samples under `engine`; `evidence` says which numbers are
 *       measurements and which one is a proxy
 *     - an asset with no sample is not a reading: every accessor returns
 *       null instead of an empty placeholder
 *     - a fresh venue is preferred, but a stale-only market is still
 *       reported (with `stale: true`) rather than silently emptied
 *
 *   What this module deliberately does NOT do: it does not price a market
 *   from one venue's book twice, and it never derives a CVD of its own.
 *   The venue-level CVD proxy belongs to the collector; here it travels as
 *   the collector's number with the collector's method label.
 * ============================================================ */

const math = require("../../core/math.cjs");
const { baseAssetOf } = require("../../../collector/crypto/common/envelope.cjs");

/** Default freshness window. The collector's cadences are per-venue and
 *  sometimes daily (stooq/fred), so a caller can widen it per instance. */
const DEFAULT_STALE_MS = 90_000;

/** One instrument's venues are few; the cap only stops a runaway producer. */
const DEFAULT_MAX_INSTRUMENTS = 256;

/** Venue key of a sample whose frame carried no exchange. */
const UNKNOWN_VENUE = "unknown";

function venueKey(exchange) {
    const value = exchange === null || exchange === undefined ? "" : String(exchange).trim().toLowerCase();
    return value || UNKNOWN_VENUE;
}

/** The evidence flags a reading may carry (all optional, never invented). */
function evidenceOf(raw, sample) {
    const source = raw && typeof raw === "object" ? raw : {};
    return Object.freeze({
        bidAsk: source.bidAsk === true || (math.positive(sample.bid) !== null && math.positive(sample.ask) !== null),
        depth: source.depth === true,
        candle: source.candle === true || (math.positive(sample.open) !== null && math.positive(sample.close) !== null),
        cvd: source.cvd === undefined ? null : source.cvd
    });
}

class LiquidityAnalytics {
    /**
     * @param {object}   [options]
     * @param {Function} [options.now]            clock (tests inject a fake)
     * @param {number}   [options.staleMs]        freshness window of a sample
     * @param {number}   [options.maxInstruments] cap on tracked assets
     */
    constructor({ now = Date.now, staleMs = DEFAULT_STALE_MS, maxInstruments = DEFAULT_MAX_INSTRUMENTS } = {}) {
        this.now = now;
        this.staleMs = math.positive(staleMs) || DEFAULT_STALE_MS;
        this.maxInstruments = Math.max(1, Number(maxInstruments) || DEFAULT_MAX_INSTRUMENTS);
        this.books = new Map();
        /* Edge-trigger memory of candleUpdate(): venue|symbol|interval → open time. */
        this.emittedBars = new Map();
        this.counters = { readings: 0, venues: 0, dropped: 0, candles: 0, candlesEmitted: 0 };
    }

    /* ------------------------------------------------------------
     * Ingestion
     * ---------------------------------------------------------- */

    /**
     * One venue reading (a collector `ticker`: a quote, and possibly a bar
     * inside it) → the stored sample of that (asset, venue).
     *
     * @returns {object|null} the frozen sample, or null when it carries no
     *   price at all (a reading without a price is not a reading)
     */
    ingestReading(sample = {}) {
        const symbol = sample.symbol === null || sample.symbol === undefined
            ? null
            : String(sample.symbol).trim().toUpperCase();
        if (!symbol) return null;

        const bid = math.positive(sample.bid);
        const ask = math.positive(sample.ask);
        const derivedMid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
        const price = math.positive(sample.price) || derivedMid;
        if (price === null) return null;

        const book = this.books.get(symbol) || null;
        if (!book && this.books.size >= this.maxInstruments) {
            this.counters.dropped += 1;
            return null;
        }

        const bidSize = math.finite(sample.bidSize);
        const askSize = math.finite(sample.askSize);
        const evidence = evidenceOf(sample.evidence, { ...sample, bid, ask });
        const depth = evidence.depth && bidSize !== null && askSize !== null && (bidSize > 0 || askSize > 0);
        const spreadAbs = bid !== null && ask !== null && ask >= bid ? ask - bid : null;
        const reportedSpread = math.finite(sample.quoteSpreadBps);

        const captured = Object.freeze({
            symbol,
            exchange: sample.exchange === null || sample.exchange === undefined ? null : String(sample.exchange),
            venue: venueKey(sample.exchange),
            assetClass: sample.assetClass === undefined ? null : sample.assetClass,
            marketType: sample.marketType === undefined ? null : sample.marketType,
            kind: sample.kind === undefined ? null : sample.kind,
            sourceMarket: sample.sourceMarket === undefined ? null : sample.sourceMarket,
            price,
            bid,
            ask,
            bidSize,
            askSize,
            depth,
            /* The venue's own number when it reported one, otherwise the one
             * arithmetic allows; null when there is only one side of the book. */
            quoteSpreadBps: reportedSpread !== null
                ? reportedSpread
                : (spreadAbs === null ? null : math.bpsDiff(ask, bid)),
            quoteSpreadReported: reportedSpread !== null,
            depthImbalance: depth ? (bidSize - askSize) / (bidSize + askSize) : null,
            bar: evidence.candle
                ? Object.freeze({
                    interval: sample.barInterval || null,
                    open: math.positive(sample.open),
                    high: math.positive(sample.high),
                    low: math.positive(sample.low),
                    close: math.positive(sample.close),
                    volume: math.finite(sample.volume)
                })
                : null,
            evidence,
            timestamp: math.finite(sample.timestamp),
            receivedAt: this.now()
        });

        const target = book || {
            symbol,
            asset: null,
            assetClass: captured.assetClass,
            marketType: captured.marketType,
            venues: new Map(),
            reported: null,
            reportedAt: null,
            at: null
        };
        if (!book) this.books.set(symbol, target);

        target.assetClass = captured.assetClass || target.assetClass;
        if (captured.marketType) target.marketType = captured.marketType;
        target.venues.set(captured.venue, captured);
        if (sample.flow && typeof sample.flow === "object") {
            target.reported = Object.freeze({ ...sample.flow });
            target.reportedAt = captured.timestamp;
        }
        target.at = captured.timestamp;

        this.counters.readings += 1;
        this.counters.venues = target.venues.size;
        return captured;
    }
    /* ------------------------------------------------------------
     * Reads
     * ---------------------------------------------------------- */

    /** The stored sample of one (asset, venue), or null. */
    venue(symbol, exchange) {
        const book = this.books.get(String(symbol || "").toUpperCase());
        return book ? book.venues.get(venueKey(exchange)) || null : null;
    }

    /**
     * What the asset is worth right now, per venue.
     * @returns {object|null} null when this asset was never seen
     */
    reading(symbol, { at = this.now(), includeVenues = true } = {}) {
        const book = this.booksFor(symbol);
        if (!book) return null;
        return this.readingBody(book, viewsOf(book, at, { staleMs: this.staleMs }), { at, includeVenues });
    }

    /** The body of reading(); separate so flow() builds the venue views once. */
    readingBody(book, views, { at, includeVenues = true }) {
        const { considered, fresh } = splitFresh(views);
        const prices = considered.map((view) => view.price);
        const quoted = considered.filter((view) => view.bid !== null && view.ask !== null);
        const depthVenues = considered.filter((view) => view.depth);
        const depthBids = math.sum(depthVenues.map((view) => view.bidSize));
        const depthAsks = math.sum(depthVenues.map((view) => view.askSize));
        const depthTotal = depthBids === null || depthAsks === null ? null : depthBids + depthAsks;

        const result = {
            symbol: book.symbol,
            asset: baseAssetOf(book.symbol),
            assetClass: book.assetClass,
            marketType: book.marketType,
            at,
            venueCount: views.length,
            freshCount: fresh.length,
            stale: views.length > 0 && fresh.length === 0,
            venues: includeVenues ? views : undefined,
            /* The median, not the mean: one lagging venue must not drag the
             * reference price with it. */
            price: math.median(prices),
            high: extreme(considered, "max"),
            low: extreme(considered, "min"),
            priceSpreadBps: prices.length >= 2
                ? math.bpsDiff(Math.max(...prices), Math.min(...prices))
                : null,
            bidAskSpreadBps: tightestSpread(quoted),
            bidAskVenue: tightestVenue(quoted),
            depthImbalance: depthTotal === null || depthTotal === 0
                ? null
                : (depthBids - depthAsks) / depthTotal,
            depthVenues: depthVenues.map((view) => view.exchange),
            evidence: evidenceSummary(considered, book.reported),
            timestamp: latestTimestamp(considered)
        };

        if (!includeVenues) delete result.venues;
        return Object.freeze(result);
    }

    /**
     * How liquid this asset is, and where. Two measurements live side by
     * side in one frame, never blended:
     *   engine   — computed here, from the venue samples seen so far
     *   reported — what the collector measured itself, carried verbatim
     */
    flow(symbol, { at = this.now() } = {}) {
        const book = this.booksFor(symbol);
        if (!book) return null;

        const views = viewsOf(book, at, { staleMs: this.staleMs });
        const considered = splitFresh(views).considered;
        const reading = this.readingBody(book, views, { at, includeVenues: false });
        const pair = tradablePair(considered);

        return Object.freeze({
            symbol: book.symbol,
            asset: reading.asset,
            assetClass: book.assetClass,
            marketType: book.marketType,
            at,
            venueCount: reading.venueCount,
            freshCount: reading.freshCount,
            stale: reading.stale,
            engine: Object.freeze({
                price: reading.price,
                priceSpreadBps: reading.priceSpreadBps,
                /* How far the venues disagree, relative to the median. */
                dispersionBps: dispersionBps(considered, reading.price),
                bidAskSpreadBps: reading.bidAskSpreadBps,
                bidAskVenue: reading.bidAskVenue,
                /* What a taker would pay to cross venues: the best bid of one
                 * venue against the best ask of another (negative = crossed,
                 * i.e. a real dislocation). Null with fewer than two books. */
                tradableSpreadBps: pair === null ? null : math.bpsDiff(pair.ask, pair.bid),
                longVenue: pair === null ? null : pair.longVenue,
                shortVenue: pair === null ? null : pair.shortVenue,
                depthImbalance: reading.depthImbalance,
                depthVenues: reading.depthVenues
            }),
            /* The collector's own cross-venue measurement for this asset (its
             * flow engine), or null when the frame carried none. */
            reported: book.reported === null
                ? null
                : Object.freeze({
                    ...book.reported,
                    ageMs: book.reportedAt === null ? null : Math.max(0, at - book.reportedAt)
                }),
            evidence: reading.evidence,
            timestamp: reading.timestamp
        });
    }
    /** The stored state of one asset, or null. */
    booksFor(symbol) {
        const upper = String(symbol || "").trim().toUpperCase();
        return upper ? this.books.get(upper) || null : null;
    }

    /**
     * The last bar a venue handed over for this asset (a pure read).
     *
     * `exchange` selects one venue; without it the most recent bar wins, and
     * ties are broken by venue name so the answer stays deterministic. A
     * daily venue's bar is normally "stale" between publications, which is
     * exactly when it is still the latest bar — so candle() ignores staleness
     * (it reports it) while reading() prefers fresh venues.
     * @returns {object|null} null when no venue of this asset carried a bar
     */
    candle(symbol, { exchange = null, at = this.now() } = {}) {
        const book = this.booksFor(symbol);
        if (!book) return null;

        const views = viewsOf(book, at, { staleMs: this.staleMs });
        const withBar = exchange === null || exchange === undefined
            ? views.filter((view) => view.bar !== null)
            : views.filter((view) => view.venue === venueKey(exchange) && view.bar !== null);
        if (withBar.length === 0) return null;

        const chosen = withBar.reduce((best, view) => {
            const left = view.timestamp === null ? -Infinity : view.timestamp;
            const right = best.timestamp === null ? -Infinity : best.timestamp;
            if (left > right) return view;
            if (left < right) return best;
            return view.venue < best.venue ? view : best;
        }, withBar[0]);

        return Object.freeze({
            symbol: book.symbol,
            asset: baseAssetOf(book.symbol),
            assetClass: chosen.assetClass || book.assetClass,
            marketType: chosen.marketType || book.marketType,
            exchange: chosen.exchange,
            venue: chosen.venue,
            interval: chosen.bar.interval,
            open: chosen.bar.open,
            high: chosen.bar.high,
            low: chosen.bar.low,
            close: chosen.bar.close,
            volume: chosen.bar.volume,
            timestamp: chosen.timestamp,
            ageMs: chosen.ageMs,
            stale: chosen.stale,
            at
        });
    }

    /**
     * Edge-triggered candle: the bar is returned ONCE, the first time this
     * module sees that open time for (venue, asset, interval). Polling the
     * same bar again returns null, so a subscriber gets one event per bar
     * instead of one per sweep. A revised bar is therefore not re-emitted —
     * the venue's latest numbers stay readable through reading()/flow().
     */
    candleUpdate(symbol, options = {}) {
        const bar = this.candle(symbol, options);
        if (!bar) return null;
        this.counters.candles += 1;

        const key = `${bar.venue}|${bar.symbol}|${bar.interval || "na"}`;
        if (this.emittedBars.get(key) === bar.timestamp) return null;

        this.emittedBars.set(key, bar.timestamp);
        this.counters.candlesEmitted += 1;
        return bar;
    }



    /** Everything this module knows about one asset, or null. */
    snapshot(symbol, options = {}) {
        const book = this.booksFor(symbol);
        if (!book) return null;

        const at = options.at === undefined ? this.now() : options.at;
        return {
            symbol: book.symbol,
            asset: baseAssetOf(book.symbol),
            assetClass: book.assetClass,
            marketType: book.marketType,
            reading: this.reading(symbol, { ...options, at }),
            flow: this.flow(symbol, { at }),
            candle: this.candle(symbol, { ...options, at })
        };
    }

    /** Forget one asset (or everything) — including its emitted candles. */
    reset({ symbol = null } = {}) {
        const upper = symbol === null || symbol === undefined ? null : String(symbol).trim().toUpperCase();
        let removed = 0;

        for (const [key] of [...this.books.entries()]) {
            if (upper === null || key === upper) {
                this.books.delete(key);
                removed += 1;
            }
        }
        for (const key of [...this.emittedBars.keys()]) {
            if (upper === null || key.includes(`|${upper}|`)) this.emittedBars.delete(key);
        }

        this.counters.venues = this.books.size;
        return removed;
    }
}

/* ------------------------------------------------------------
 * Pure helpers — no state, so they can be read on their own
 * ---------------------------------------------------------- */

/** The stored samples of one asset as per-venue views, by venue name. */
function viewsOf(book, at, { staleMs = DEFAULT_STALE_MS } = {}) {
    const views = [];

    for (const sample of book.venues.values()) {
        const ageMs = sample.timestamp === null ? null : Math.max(0, at - sample.timestamp);
        views.push(Object.freeze({
            exchange: sample.exchange,
            venue: sample.venue,
            assetClass: sample.assetClass,
            marketType: sample.marketType,
            kind: sample.kind,
            sourceMarket: sample.sourceMarket,
            price: sample.price,
            bid: sample.bid,
            ask: sample.ask,
            bidSize: sample.bidSize,
            askSize: sample.askSize,
            depth: sample.depth,
            quoteSpreadBps: sample.quoteSpreadBps,
            quoteSpreadReported: sample.quoteSpreadReported,
            depthImbalance: sample.depthImbalance,
            bar: sample.bar,
            evidence: sample.evidence,
            timestamp: sample.timestamp,
            ageMs,
            stale: ageMs !== null && ageMs > staleMs
        }));
    }

    views.sort((left, right) => left.venue.localeCompare(right.venue));
    return views;
}

/**
 * The venues a reading should be computed from: the fresh ones, or every
 * venue when none is fresh (a market whose only venue publishes daily still
 * has a price — the reading says `stale: true` instead of going empty).
 */
function splitFresh(views) {
    const fresh = views.filter((view) => !view.stale);
    return { considered: fresh.length ? fresh : views, fresh };
}

/** The venue with the highest (max) or lowest (min) price; null with < 2. */
function extreme(views, direction) {
    if (views.length < 2) return null;

    const chosen = views.reduce((best, view) => {
        if (best === null) return view;
        const better = direction === "max" ? view.price > best.price : view.price < best.price;
        return better ? view : best;
    }, null);

    return chosen === null ? null : Object.freeze({ exchange: chosen.exchange, price: chosen.price });
}

/** The venue showing the tightest two-sided book, or null. */
function tightestQuoted(views) {
    let chosen = null;
    for (const view of views) {
        if (view.quoteSpreadBps === null) continue;
        if (chosen === null || view.quoteSpreadBps < chosen.quoteSpreadBps) chosen = view;
    }
    return chosen;
}

function tightestSpread(views) {
    const chosen = tightestQuoted(views);
    return chosen === null ? null : chosen.quoteSpreadBps;
}

function tightestVenue(views) {
    const chosen = tightestQuoted(views);
    return chosen === null ? null : chosen.exchange;
}

/**
 * The two books a taker would actually cross: the highest bid and the lowest
 * ask across the considered venues (both may sit on one venue — that is a
 * crossed book there, which is a real dislocation, not an error to hide).
 */
function tradablePair(views) {
    const quoted = views.filter((view) => view.bid !== null && view.ask !== null);
    if (quoted.length < 2) return null;

    const bestBid = quoted.reduce((high, view) => (view.bid > high.bid ? view : high), quoted[0]);
    const bestAsk = quoted.reduce((low, view) => (view.ask < low.ask ? view : low), quoted[0]);

    return Object.freeze({
        bid: bestBid.bid,
        ask: bestAsk.ask,
        longVenue: bestBid.exchange,
        shortVenue: bestAsk.exchange
    });
}

/** How far the venues disagree, in bps of the reference price. */
function dispersionBps(views, reference) {
    const base = math.positive(reference);
    if (base === null) return null;
    const spread = math.stdev(views.map((view) => view.price));
    return spread === null ? null : (spread / base) * 10_000;
}

/**
 * Which numbers are measurements, and which one is a proxy. `cvd` is never
 * derived here: it is the collector's own method label when it sent one.
 */
function evidenceSummary(views, reported) {
    const method = reported && reported.cvdMethod ? reported.cvdMethod : null;
    return Object.freeze({
        bidAsk: views.some((view) => view.bid !== null && view.ask !== null),
        depth: views.some((view) => view.depth),
        candle: views.some((view) => view.bar !== null),
        cvd: method
    });
}

/** Newest observation among the given views (null when none is stamped). */
function latestTimestamp(views) {
    const stamps = views.map((view) => math.finite(view.timestamp)).filter((value) => value !== null);
    return stamps.length ? Math.max(...stamps) : null;
}

module.exports = {
    LiquidityAnalytics,
    viewsOf,
    splitFresh,
    extreme,
    tradablePair,
    dispersionBps,
    evidenceSummary,
    DEFAULT_STALE_MS,
    DEFAULT_MAX_INSTRUMENTS,
    UNKNOWN_VENUE
};


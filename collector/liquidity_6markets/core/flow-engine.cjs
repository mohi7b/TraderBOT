/* ============================================================
 * File: collector/liquidity_6markets/core/flow-engine.cjs
 * Section: collector/liquidity_6markets/core
 * Version: 1.0.0
 *
 * Role:
 *   The live flow state of one instrument across every venue that
 *   quotes it. Everything here is either measured or clearly labelled
 *   as a proxy — a market without depth/tick data never gets a
 *   fabricated orderbook number:
 *
 *     priceSpreadBps     dispersion between venues (measured)
 *     tradableSpreadBps  best ask vs best bid across venues (measured,
 *                        only when ≥2 venues publish bid/ask)
 *     bidAskSpreadBps    the tightest single-venue bid/ask (measured)
 *     depthImbalance     size-weighted book imbalance (measured, only
 *                        when a venue publishes sizes → else null)
 *     cvdProxy           cumulative candle-body × volume proxy, session
 *                        scoped, labelled cvdMethod (a proxy, not a
 *                        trade stream — the crypto leg has the real CVD
 *                        in analytics-engine/modules/delta-flow)
 *
 *   Bars are counted once: a still-forming bar that is polled again
 *   *replaces* its own contribution instead of being added twice.
 * ============================================================ */

const { DEFAULT_FRESHNESS_MS, medianOf, toBps } = require("./quote-normalizer.cjs");

const CVD_METHOD = "candle_body_volume_proxy";

function utcDayOf(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
}

/** body/range × volume — the honest stand-in for a tick-rule CVD. */
function barDeltaOf(reading) {
    const { open, high, low, close, volume } = reading;
    if (open === null || close === null || high === null || low === null || volume === null) return null;
    const range = high - low;
    if (!(range > 0)) return null;
    return volume * ((close - open) / range);
}

class LiquidFlowEngine {
    constructor({ now = () => Date.now(), staleMs = DEFAULT_FRESHNESS_MS, cadenceMs = {}, maxReadingsPerVenue = 240 } = {}) {
        this.now = now;
        this.staleMs = staleMs;
        /* Per-venue data cadence (from config/providers.cjs): a daily series
         * must not be judged by the freshness rule of a live quote. */
        this.cadenceMs = cadenceMs;
        this.maxReadingsPerVenue = maxReadingsPerVenue;
        this.books = new Map();   // instrument → { meta, venues: Map, session, lastBar }
        this.counters = { readings: 0, rejected: 0, instruments: 0 };
    }

    /** How long a reading from this venue stays fresh (ms). */
    freshnessFor(venue) {
        const cadence = Number(this.cadenceMs && this.cadenceMs[venue]);
        return Number.isFinite(cadence) && cadence > 0 ? cadence : this.staleMs;
    }

    /** Remember what the instrument *is* (freshness is per instrument). */
    register(instrument) {
        if (!instrument || !instrument.id) throw new TypeError("register: instrument is required");
        const book = this.books.get(instrument.id) || { meta: null, venues: new Map(), session: null, lastBar: null };
        book.meta = {
            id: instrument.id,
            assetClass: instrument.assetClass,
            kind: instrument.kind,
            quote: instrument.quote || null,
            marketType: instrument.marketType || null,
            sourceMarket: instrument.sourceMarket || null,
            freshnessMs: instrument.freshnessMs || this.staleMs
        };
        this.books.set(instrument.id, book);
        this.counters.instruments = this.books.size;
        return book.meta;
    }

    /** Store one reading (and roll the session proxy forward). */
    ingest(reading) {
        if (!reading || !reading.instrument || !reading.venue) {
            this.counters.rejected += 1;
            return null;
        }

        let book = this.books.get(reading.instrument);
        if (!book) {
            this.register({ id: reading.instrument, assetClass: reading.assetClass, kind: reading.kind });
            book = this.books.get(reading.instrument);
        }

        const bucket = book.venues.get(reading.venue) || [];
        bucket.push(reading);
        while (bucket.length > this.maxReadingsPerVenue) bucket.shift();
        book.venues.set(reading.venue, bucket);

        this.rollSession(book, reading);
        this.counters.readings += 1;
        return reading;
    }

    /** Session (UTC day) cumulative proxy — replaced bars, never double counted. */
    rollSession(book, reading) {
        const day = utcDayOf(reading.timestamp);
        if (!book.session || book.session.day !== day) {
            book.session = { day, cvdProxy: 0, volume: 0, bars: 0 };
            book.lastBar = null;
        }

        const delta = barDeltaOf(reading);
        if (delta === null) return null;

        const barKey = `${reading.venue}|${reading.timestamp}|${reading.barInterval || "na"}`;
        if (book.lastBar && book.lastBar.venue === reading.venue && book.lastBar.key === barKey) {
            /* The same (still forming) bar polled twice: undo the old contribution. */
            book.session.cvdProxy -= book.lastBar.delta;
            book.session.volume -= book.lastBar.volume;
            book.session.bars -= 1;
        }

        book.session.cvdProxy += delta;
        book.session.volume += reading.volume;
        book.session.bars += 1;
        book.lastBar = { key: barKey, venue: reading.venue, delta, volume: reading.volume };
        return book.session;
    }

    /** Cross-venue view of one instrument (null when nothing was ever seen). */
    snapshot(instrumentId, { at = this.now() } = {}) {
        const book = this.books.get(instrumentId);
        if (!book || !book.meta) return null;

        const freshnessMs = book.meta.freshnessMs || this.staleMs;
        const venues = [];
        for (const [venue, bucket] of book.venues) {
            const reading = bucket[bucket.length - 1];
            const ageMs = Math.max(0, at - reading.timestamp);
            /* Fresh = within the instrument's own window *or* the venue's
             * publishing cadence — whichever is more generous. */
            const freshLimit = Math.max(freshnessMs, this.freshnessFor(venue));
            venues.push({
                venue,
                price: reading.price,
                bid: reading.bid,
                ask: reading.ask,
                quoteSpreadBps: reading.quoteSpreadBps,
                depth: reading.depth,
                bidSize: reading.bidSize,
                askSize: reading.askSize,
                ageMs,
                stale: ageMs > freshLimit
            });
        }
        venues.sort((a, b) => a.venue.localeCompare(b.venue));

        const fresh = venues.filter((venue) => !venue.stale);
        const considered = fresh.length ? fresh : venues;
        const priced = considered.map((venue) => venue.price).filter((price) => Number.isFinite(price));
        const mid = medianOf(priced);

        const quoted = considered.filter((venue) => Number.isFinite(venue.bid) && Number.isFinite(venue.ask));
        let tightest = null;
        for (const venue of quoted) {
            const current = venue.quoteSpreadBps === null ? Infinity : venue.quoteSpreadBps;
            const best = tightest === null || tightest.quoteSpreadBps === null ? Infinity : tightest.quoteSpreadBps;
            if (tightest === null || current < best) tightest = venue;
        }

        let bestBid = null;
        let bestAsk = null;
        if (quoted.length >= 2) {
            bestBid = quoted.reduce((high, venue) => (venue.bid > high.bid ? venue : high));
            bestAsk = quoted.reduce((low, venue) => (venue.ask < low.ask ? venue : low));
        }

        const depthVenues = considered.filter((venue) => venue.depth);
        const depthBids = depthVenues.reduce((sum, venue) => sum + venue.bidSize, 0);
        const depthAsks = depthVenues.reduce((sum, venue) => sum + venue.askSize, 0);
        const depthTotal = depthBids + depthAsks;

        const session = book.session || { day: null, cvdProxy: 0, volume: 0, bars: 0 };
        const spreadAbs = priced.length >= 2 ? Math.max(...priced) - Math.min(...priced) : null;

        return Object.freeze({
            instrument: book.meta.id,
            assetClass: book.meta.assetClass,
            kind: book.meta.kind,
            marketType: book.meta.marketType,
            sourceMarket: book.meta.sourceMarket,
            at,
            venues: Object.freeze(venues),
            venueCount: venues.length,
            freshCount: fresh.length,
            stale: venues.length > 0 && fresh.length === 0,
            mid,
            spreadAbs,
            priceSpreadBps: spreadAbs === null ? null : toBps(spreadAbs, mid),
            tradableSpreadBps: bestBid === null ? null : toBps(bestAsk.ask - bestBid.bid, (bestAsk.ask + bestBid.bid) / 2),
            longVenue: bestBid === null ? null : bestBid.venue,
            shortVenue: bestAsk === null ? null : bestAsk.venue,
            bidAskSpreadBps: tightest === null ? null : tightest.quoteSpreadBps,
            bidAskVenue: tightest === null ? null : tightest.venue,
            depthImbalance: depthTotal > 0 ? (depthBids - depthAsks) / depthTotal : null,
            depthVenues: depthVenues.map((venue) => venue.venue),
            cvdProxy: session.cvdProxy,
            cvdMethod: CVD_METHOD,
            cvdDay: session.day,
            sessionVolume: session.volume,
            sessionBars: session.bars,
            direction: session.cvdProxy === 0 ? "flat" : (session.cvdProxy > 0 ? "up" : "down")
        });
    }

    /** Newest reading of an instrument (optionally of one venue). */
    latestReading(instrumentId, { venue = null } = {}) {
        const book = this.books.get(instrumentId);
        if (!book) return null;

        if (venue) {
            const bucket = book.venues.get(venue);
            return bucket && bucket.length ? bucket[bucket.length - 1] : null;
        }

        let newest = null;
        for (const bucket of book.venues.values()) {
            const candidate = bucket[bucket.length - 1];
            if (candidate && (!newest || candidate.timestamp > newest.timestamp)) newest = candidate;
        }
        return newest;
    }

    instruments() {
        return [...this.books.keys()];
    }

    /** Forget one instrument, or everything (instrument: null). */
    reset({ instrument = null } = {}) {
        if (instrument === null) {
            const removed = this.books.size;
            this.books.clear();
            this.counters.instruments = 0;
            return removed;
        }
        return this.books.delete(instrument) ? 1 : 0;
    }

    stats() {
        let venues = 0;
        for (const book of this.books.values()) venues += book.venues.size;
        return Object.freeze({
            instruments: this.books.size,
            venues,
            readings: this.counters.readings,
            rejected: this.counters.rejected
        });
    }
}

module.exports = { LiquidFlowEngine, CVD_METHOD, barDeltaOf, utcDayOf };

/* ============================================================
 * File: analytics-engine/core/bars.cjs
 * Section: analytics-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   The bar vocabulary of the analytical layer — the one place where a
 *   frame becomes a bar, where a bar is stored, and how a coarser
 *   timeframe is built from a finer feed.
 *
 *   Two modules read closed bars (modules/indicators and
 *   modules/price_action), and they must not disagree about what a bar
 *   is: a bar the indicator layer refuses as impossible cannot become a
 *   market structure in the price-action layer. So the rules live here,
 *   once, and a module supplies only its own view on top of them:
 *
 *     BarSeries       the ingest side: frames in, one ring per
 *                     (symbol, timeframe), an edge per closed bar
 *     RingBuffer      one (symbol, timeframe) bar series (fixed capacity)
 *     pure helpers    intervals, bucket arithmetic, symbol spelling,
 *                     readBar (a frame → a bar, or null)
 *
 *   Honesty rules (shared by every reader of this file):
 *     - a missing number is null, never 0 (a price of zero is a missing
 *       price, never a price)
 *     - a bar is never invented: a bucket is ringed only when every
 *       source bar of that bucket arrived; an incomplete bucket is
 *       dropped and counted (`partial`), and an unfinished venue bar is
 *       not ringed at all (`open`)
 *     - history is never rewritten: a bar the ring already holds (or one
 *       older than its newest) is counted (`duplicate` / `late`)
 *     - one ring is one series: it is fed by the venue's own bars or by
 *       buckets of ONE base interval, never by both (`mixed`, `offBase`)
 *     - the venue's bar and a bar this layer built are not the same
 *       measurement: every bar carries `source` and, when aggregated,
 *       `builtFrom`
 *     - nothing is derived from arrival order: the bucket a bar belongs
 *       to is UTC arithmetic, and an interval is never guessed
 * ============================================================ */

const math = require("./math.cjs");

/** The timeframes the layer serves by default: 1m…4h answer a stream that
 *  aggregates upward; 1d answers the six-market layer's daily bars (and a 1m
 *  stream's own day, built from its 1m bars). Both bar-reading modules are
 *  built with this list unless a deployment says otherwise. */
const DEFAULT_TIMEFRAMES = Object.freeze(["1m", "5m", "15m", "1h", "4h", "1d"]);

/** Bars held per (symbol, timeframe): 512 one-minute bars ≈ 8.5 h, 512 daily
 *  bars ≈ 17 months — a bounded window however long the feed runs. */
const DEFAULT_MAX_BARS = 512;

/** One instrument's timeframes are few; the cap only stops a runaway producer. */
const DEFAULT_MAX_INSTRUMENTS = 128;

/** Milliseconds of one interval unit, as venues spell them. */
const UNIT_MS = Object.freeze({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 });
const DAY_MS = UNIT_MS.d;

/* ------------------------------------------------------------
 * Intervals, symbols
 * ---------------------------------------------------------- */

/**
 * "15m" → 900000, "1h" → 3600000, "4h" → 14400000, 60000 → 60000.
 * A venue spelling is read as unit arithmetic (5m, 15m, 1h, 4h, 1d, 1w);
 * anything that is not a readable interval is null, never a guess.
 */
function parseInterval(interval) {
    if (interval === null || interval === undefined || interval === "") return null;

    if (typeof interval === "number") {
        const ms = math.positive(interval);
        return ms === null ? null : Math.round(ms);
    }

    const text = String(interval).trim().toLowerCase();
    if (/^\d+$/.test(text)) {
        const ms = Number(text);
        return ms > 0 ? ms : null;
    }

    const match = /^(\d+(?:\.\d+)?)\s*([smhdw])$/.exec(text);
    if (!match) return null;

    const ms = Number(match[1]) * UNIT_MS[match[2]];
    return ms > 0 ? Math.round(ms) : null;
}

/** The interval as a venue spells it again: 900000 → "15m", 86400000 → "1d". */
function intervalLabel(ms) {
    const value = math.positive(ms);
    if (value === null) return null;

    for (const [unit, size] of [["w", UNIT_MS.w], ["d", UNIT_MS.d], ["h", UNIT_MS.h], ["m", UNIT_MS.m], ["s", UNIT_MS.s]]) {
        if (value >= size && value % size === 0) return `${value / size}${unit}`;
    }
    return null;
}

/**
 * The served timeframes as { label: ms }, ascending. "60m" and "1h" are one
 * timeframe and the canonical label wins. An unreadable configuration is a
 * configuration error and throws: a module that serves no timeframe would
 * otherwise sit silent forever.
 */
function normalizeTimeframes(timeframes) {
    const list = Array.isArray(timeframes) ? timeframes : DEFAULT_TIMEFRAMES;
    const mapped = new Map();

    for (const entry of list) {
        const ms = parseInterval(entry);
        if (ms === null) continue;
        mapped.set(intervalLabel(ms) || String(ms), ms);
    }

    if (!mapped.size) throw new Error("BarSeries: not one timeframe could be read");

    return Object.fromEntries([...mapped.entries()].sort((left, right) => left[1] - right[1]));
}

/** The label of a served timeframe, however the caller spelled it ("900000" → "15m"). */
function timeframeKey(timeframes, timeframe) {
    const text = timeframe === null || timeframe === undefined ? "" : String(timeframe).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(timeframes, text)) return text;

    const ms = parseInterval(timeframe);
    if (ms === null) return null;

    const label = intervalLabel(ms) || String(ms);
    return Object.prototype.hasOwnProperty.call(timeframes, label) ? label : null;
}

/** The open time of the `timeframeMs` bucket holding `openTime` (UTC-aligned). */
function bucketStart(openTime, timeframeMs) {
    return Math.floor(openTime / timeframeMs) * timeframeMs;
}

/** How many `intervalMs` bars one `timeframeMs` bucket holds (null when it is not a multiple). */
function barsPerBucket(timeframeMs, intervalMs) {
    if (!(intervalMs > 0) || !(timeframeMs > 0) || timeframeMs % intervalMs !== 0) return null;
    return timeframeMs / intervalMs;
}

/** A symbol as the modules spell it, or null. */
function normalizeSymbol(symbol) {
    if (symbol === null || symbol === undefined) return null;
    const text = String(symbol).trim().toUpperCase();
    return text || null;
}

/* ------------------------------------------------------------
 * Bars
 * ---------------------------------------------------------- */

/**
 * One frame → one bar, or null when the frame is not a bar.
 *
 * A bar without a positive open, high, low and close is not a bar (a zero is a
 * missing price, never a price — the rule core/math.cjs and the liquidity
 * module already follow), and a bar that cannot exist (high below low, or an
 * extreme inside the bar's own body) is refused rather than repaired.
 *
 * A bar whose volume the venue did not send is still a price bar: it is ringed
 * with weight 0 and `volumeComplete: false`, so a volume-weighted average can
 * count it instead of pretending it weighed something.
 */
function readBar(sample, openTime, intervalMs) {
    const open = math.positive(sample.open);
    const high = math.positive(sample.high);
    const low = math.positive(sample.low);
    const close = math.positive(sample.close);

    if (open === null || high === null || low === null || close === null) return null;
    if (high < low || high < Math.max(open, close) || low > Math.min(open, close)) return null;

    const sent = math.finite(sample.closeTime);
    const volume = math.finite(sample.volume);
    const measured = volume !== null && volume >= 0;

    return Object.freeze({
        openTime,
        closeTime: sent === null ? openTime + intervalMs - 1 : sent,
        open,
        high,
        low,
        close,
        volume: measured ? volume : 0,
        volumeComplete: measured,
        intervalMs,
        source: "native",
        builtFrom: 1
    });
}

/* ------------------------------------------------------------
 * RingBuffer — one (symbol, timeframe) bar series
 * ---------------------------------------------------------- */

/**
 * A fixed-capacity window over one bar series, held as parallel number arrays:
 * the shape tulind takes without a copy, and the reason one instrument costs a
 * bounded amount of memory (capacity × 8 numbers) however long the feed runs.
 *
 * The window only ever moves forward: a bar older than the newest one is
 * refused by the caller (history is never rewritten), and a bar pushed out by
 * the capacity is counted (`dropped`) so a reading can say how much of the
 * series is still there.
 */
class RingBuffer {
    constructor({ capacity = DEFAULT_MAX_BARS, symbol = null, timeframe = null, timeframeMs = null } = {}) {
        this.symbol = symbol;
        this.timeframe = timeframe;
        this.timeframeMs = timeframeMs;
        this.capacity = Math.max(2, Math.floor(capacity) || DEFAULT_MAX_BARS);

        /* How this ring is fed: "native" (the venue's own bars) or "aggregated"
         * (buckets this layer built). The first writer owns the ring. */
        this.source = null;
        this.intervalMs = null;
        this.bucketBars = null;
        this.lastBucket = null;

        this.openTime = [];
        this.open = [];
        this.high = [];
        this.low = [];
        this.close = [];
        this.volume = [];
        this.builtFrom = [];
        this.volumeComplete = [];

        this.count = 0;
        this.dropped = 0;                 // bars the capacity pushed out
        this.gaps = 0;                    // open times where the series was not consecutive
        this.volumeIncompleteBars = 0;
        this.startedAt = null;            // the first bar this ring ever held
    }

    get newestOpenTime() {
        return this.count ? this.openTime[this.count - 1] : null;
    }

    get oldestOpenTime() {
        return this.count ? this.openTime[0] : null;
    }

    /**
     * One bar in. The ring records whether the series stayed consecutive, so
     * every reading can say "these are 200 bars, and 3 of them are missing".
     */
    push(bar) {
        if (this.count && this.openTime[this.count - 1] + this.timeframeMs !== bar.openTime) this.gaps += 1;
        if (this.count >= this.capacity) this.shift();

        this.openTime.push(bar.openTime);
        this.open.push(bar.open);
        this.high.push(bar.high);
        this.low.push(bar.low);
        this.close.push(bar.close);
        this.volume.push(bar.volume);
        this.builtFrom.push(bar.builtFrom);
        this.volumeComplete.push(bar.volumeComplete ? 1 : 0);
        this.count += 1;

        if (!bar.volumeComplete) this.volumeIncompleteBars += 1;
        if (this.startedAt === null) this.startedAt = bar.openTime;

        return this.last();
    }

    /** The oldest bar leaves the window (the price arrays stay aligned). */
    shift() {
        if (!this.count) return null;

        if (this.volumeComplete[0] === 0) this.volumeIncompleteBars -= 1;
        this.openTime.shift();
        this.open.shift();
        this.high.shift();
        this.low.shift();
        this.close.shift();
        this.volume.shift();
        this.builtFrom.shift();
        this.volumeComplete.shift();
        this.count -= 1;
        this.dropped += 1;

        return this.oldestOpenTime;
    }

    /** The newest bar, as a copy that cannot be mutated through the ring. */
    last() {
        if (!this.count) return null;
        const at = this.count - 1;

        return Object.freeze({
            openTime: this.openTime[at],
            closeTime: this.openTime[at] + this.timeframeMs - 1,
            open: this.open[at],
            high: this.high[at],
            low: this.low[at],
            close: this.close[at],
            volume: this.volume[at],
            volumeComplete: this.volumeComplete[at] === 1,
            builtFrom: this.builtFrom[at],
            intervalMs: this.intervalMs,
            source: this.source
        });
    }

    /**
     * Every bar in the window, oldest first, as copies — what an analyzer wants
     * when it has to look at more than the last bar (a swing, a gap, a sweep is
     * a shape across bars, and a shape needs the bars).
     *
     * `index` is the bar's position in the window, 0 being the oldest held: a
     * reading that points back at a bar can name it the same way in every
     * reading, and a ring that drops bars shifts the numbering exactly as much
     * as it drops them.
     */
    bars() {
        const out = [];
        for (let at = 0; at < this.count; at += 1) {
            out.push(Object.freeze({
                index: at,
                openTime: this.openTime[at],
                closeTime: this.openTime[at] + this.timeframeMs - 1,
                open: this.open[at],
                high: this.high[at],
                low: this.low[at],
                close: this.close[at],
                volume: this.volume[at],
                volumeComplete: this.volumeComplete[at] === 1,
                builtFrom: this.builtFrom[at],
                intervalMs: this.intervalMs,
                source: this.source
            }));
        }
        return Object.freeze(out);
    }

    /** How much of the series is here, and how complete it is. */
    stats() {
        return Object.freeze({
            bars: this.count,
            capacity: this.capacity,
            source: this.source,
            interval: this.intervalMs,
            intervalLabel: intervalLabel(this.intervalMs),
            bucketBars: this.bucketBars,
            from: this.oldestOpenTime,
            to: this.newestOpenTime,
            startedAt: this.startedAt,
            dropped: this.dropped,
            gaps: this.gaps,
            contiguous: this.gaps === 0,
            volumeIncompleteBars: this.volumeIncompleteBars
        });
    }
}

/* ------------------------------------------------------------
 * BarSeries — the ingest side shared by every bar-reading module
 * ---------------------------------------------------------- */

/**
 * The bar feed of the analytical layer: one instance serves every symbol the
 * engine routes to it and holds one ring per (symbol, timeframe).
 *
 * A subclass adds its own view of the bars — numbers (modules/indicators) or
 * structure (modules/price_action) — and implements reading(symbol, timeframe).
 * Everything below is about the bars themselves and is deliberately identical
 * for both readers, because two readers of one bar must never disagree about it.
 *
 * The read side is shaped once, here, so every bar-reading module answers the
 * same way:
 *
 *   ingestCandle(sample)          one frame → that symbol's rings
 *   pending(symbol, timeframe)    the reading, edge-triggered on a closed bar
 *   reading(symbol, timeframe)    the reading, however often it is asked
 *   snapshot(symbol)              everything held for one instrument
 *   seriesState() / stats()       what this module holds and what it refused
 *   reset({ symbol })             forget one instrument, or all of them
 */
class BarSeries {
    /**
     * @param {object}   [options]
     * @param {Function} [options.now]            clock (tests inject a fake)
     * @param {string[]} [options.timeframes]     served timeframes ("1m" … "1d")
     * @param {number}   [options.maxBars]        ring capacity per (symbol, timeframe)
     * @param {number}   [options.maxInstruments] cap on tracked symbols
     * @param {number}   [options.minBars]        bars a timeframe needs to publish
     */
    constructor({
        now = Date.now,
        timeframes = DEFAULT_TIMEFRAMES,
        maxBars = DEFAULT_MAX_BARS,
        maxInstruments = DEFAULT_MAX_INSTRUMENTS,
        minBars = 1
    } = {}) {
        this.now = now;
        this.maxBars = Math.max(2, Math.floor(math.positive(maxBars) || DEFAULT_MAX_BARS));
        this.maxInstruments = Math.max(1, Math.floor(math.positive(maxInstruments) || DEFAULT_MAX_INSTRUMENTS));
        this.timeframes = Object.freeze(normalizeTimeframes(timeframes));

        const requested = math.positive(minBars);
        this.minBars = Math.min(this.maxBars, Math.max(1, Math.floor(requested === null ? 1 : requested)));

        this.rings = new Map();      // "SYMBOL|timeframe" → RingBuffer
        this.forming = new Map();    // "SYMBOL|timeframe" → the bucket being built
        this.edges = new Map();      // "SYMBOL|timeframe" → open time of its newest bar
        this.emitted = new Map();    // "SYMBOL|timeframe" → the edge last published
        this.bases = new Map();      // SYMBOL → the interval its buckets are built from
        this.symbols = new Set();

        /* The module's own accounting. Every refusal is counted where it is
         * made, so "why is there no reading" always has an answer. */
        this.counters = {
            candles: 0,            // frames that carried a usable, closed bar
            sealed: 0,             // bars that went into a ring
            native: 0,             // …of which the venue's own
            aggregated: 0,         // …of which buckets this layer built
            partial: 0,            // buckets dropped for missing source bars
            open: 0,               // unfinished bars (never read)
            late: 0,               // bars older than the newest one held
            duplicate: 0,          // bars the ring already held
            mixed: 0,              // native/aggregated temptations refused
            offBase: 0,            // bars of another base interval
            finer: 0,              // bars finer than the timeframe asked
            unknownInterval: 0,    // frames with no readable interval
            undated: 0,            // frames with no usable open time
            invalidBar: 0,         // frames that are not bars at all
            droppedInstruments: 0, // symbols beyond maxInstruments
            readings: 0,           // readings produced
            published: 0,          // …of which published as an edge
            insufficient: 0        // readings refused for too few bars
        };
        this.warnings = [];
    }

    /**
     * One candle frame → every served timeframe it can fill.
     *
     * The frame is what the `candle` route builds (core/router.cjs, frameOfCandle)
     * and what the six-market ticker carries: symbol, interval, an open time,
     * OHLCV and whether the venue considers the bar finished. Both bar-reading
     * modules take exactly this sample through exactly this method, so a bar
     * that is not a bar is refused once, the same way, for both of them.
     *
     * @param {object} [sample]
     * @returns {object[]|null} the bars this call sealed, in timeframe order
     *   ([{ timeframe, bar }]) — an empty array when the frame only went into a
     *   forming bucket, null when the frame was not usable at all
     */
    ingestCandle(sample = {}) {
        const symbol = normalizeSymbol(sample.symbol);
        if (!symbol) {
            this.counters.invalidBar += 1;
            return null;
        }

        const intervalMs = parseInterval(
            sample.interval === undefined || sample.interval === null ? sample.barInterval : sample.interval
        );
        if (intervalMs === null) {
            this.counters.unknownInterval += 1;
            return null;
        }

        const openTime = math.finite(
            sample.openTime === undefined || sample.openTime === null ? sample.timestamp : sample.openTime
        );
        if (openTime === null) {
            this.counters.undated += 1;
            return null;
        }

        const bar = readBar(sample, openTime, intervalMs);
        if (bar === null) {
            this.counters.invalidBar += 1;
            return null;
        }

        if (!this.isBarClosed(sample, bar)) {
            this.counters.open += 1;
            return null;
        }

        if (!this.symbols.has(symbol)) {
            if (this.symbols.size >= this.maxInstruments) {
                this.counters.droppedInstruments += 1;
                return null;
            }
            this.symbols.add(symbol);
        }

        const base = this.baseFor(symbol, intervalMs);
        const sealed = [];
        let sawFiner = false;
        let sawOffBase = false;

        for (const [timeframe, timeframeMs] of Object.entries(this.timeframes)) {
            if (timeframeMs === intervalMs) {
                this.appendNative(this.ringFor(symbol, timeframe, timeframeMs), bar, sealed);
                continue;
            }
            if (timeframeMs < intervalMs) {
                /* Nothing finer than the bar that carries it can be derived. */
                sawFiner = true;
                continue;
            }
            if (intervalMs !== base || barsPerBucket(timeframeMs, intervalMs) === null) {
                sawOffBase = true;
                continue;
            }
            this.aggregate(this.ringFor(symbol, timeframe, timeframeMs), bar, sealed);
        }

        if (sawFiner) this.counters.finer += 1;
        if (sawOffBase) this.counters.offBase += 1;
        this.counters.candles += 1;

        return Object.freeze(sealed);
    }

    /**
     * Is this bar finished? The venue normally says so. Without that word the
     * bar's own close time settles it against the clock — nothing is inferred
     * from arrival order, and an unfinished bar is never read: an indicator (or
     * a structure) on a half-built bar is a reading that is already wrong when
     * it is consumed.
     */
    isBarClosed(sample, bar) {
        if (sample.isClosed === true || sample.closed === true) return true;
        if (sample.isClosed === false || sample.closed === false) return false;
        return this.now() >= bar.closeTime;
    }

    /**
     * The interval a symbol's aggregation is built from: the first one it was
     * seen with, for good. A different interval arriving later is still ringed
     * on its own timeframe, but it does not join the buckets — two bases in one
     * ring would be two series glued together (`offBase` counts it).
     */
    baseFor(symbol, intervalMs) {
        const known = this.bases.get(symbol);
        if (known === undefined) {
            this.bases.set(symbol, intervalMs);
            return intervalMs;
        }
        return known;
    }

    /** The ring of one (symbol, timeframe), created on first use. */
    ringFor(symbol, timeframe, timeframeMs) {
        const key = `${symbol}|${timeframe}`;
        let ring = this.rings.get(key);
        if (!ring) {
            ring = new RingBuffer({ symbol, timeframe, timeframeMs, capacity: this.maxBars });
            this.rings.set(key, ring);
        }
        return ring;
    }

    /**
     * One bar into a ring — the only place a bar is stored, so "history is
     * never rewritten" is enforced once. A bar at an open time the ring already
     * holds is a revision or a replay: it is counted and dropped rather than
     * allowed to overwrite the bar the readings were computed on.
     */
    append(ring, bar) {
        const newest = ring.newestOpenTime;
        if (newest !== null && bar.openTime <= newest) {
            if (bar.openTime === newest) this.counters.duplicate += 1;
            else this.counters.late += 1;
            return null;
        }

        const stored = ring.push(bar);
        this.counters.sealed += 1;
        if (bar.source === "aggregated") this.counters.aggregated += 1;
        else this.counters.native += 1;

        /* This is the edge pending() publishes on: one reading per closed bar. */
        this.edges.set(`${ring.symbol}|${ring.timeframe}`, bar.openTime);
        return stored;
    }

    /**
     * A venue's own bar. The ring's source is decided by whoever reached it
     * first: a ring built from aggregated buckets never takes a native bar
     * (and the other way round) — one ring is one series, and `mixed` counts
     * every temptation to blend two.
     */
    appendNative(ring, bar, sealed) {
        if (ring.source === "aggregated" || (ring.source === "native" && ring.intervalMs !== bar.intervalMs)) {
            this.counters.mixed += 1;
            return null;
        }

        ring.source = "native";
        ring.intervalMs = bar.intervalMs;

        const stored = this.append(ring, bar);
        if (stored) sealed.push(Object.freeze({ timeframe: ring.timeframe, bar: stored }));
        return stored;
    }

    /**
     * A bar into the bucket of a coarser timeframe — and, when that bucket is
     * complete, the aggregated bar into the ring.
     *
     * Every source bar of a bucket must arrive: a bucket that closes with fewer
     * bars than its timeframe asks for is dropped (`partial`), never published
     * as a bar of that timeframe. Which bucket a bar belongs to is arithmetic
     * (UTC-aligned), never arrival order.
     *
     * @returns {object|null} the sealed bar, or null while the bucket forms
     */
    aggregate(ring, bar, sealed) {
        if (ring.source === "native") {
            this.counters.mixed += 1;
            return null;
        }

        const expected = barsPerBucket(ring.timeframeMs, bar.intervalMs);
        if (expected === null) {
            this.counters.offBase += 1;
            return null;
        }

        const start = bucketStart(bar.openTime, ring.timeframeMs);
        if (ring.lastBucket !== null && start <= ring.lastBucket) {
            this.counters.late += 1;
            return null;
        }

        ring.source = "aggregated";
        ring.intervalMs = bar.intervalMs;
        ring.bucketBars = expected;

        const key = `${ring.symbol}|${ring.timeframe}`;
        const previous = this.forming.get(key) || null;
        if (previous && previous.openTime !== start) this.sealBucket(ring, previous, sealed);

        const fresh = !previous || previous.openTime !== start;
        const bucket = fresh
            ? {
                openTime: start,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                lastOpenTime: bar.openTime,
                volume: 0,
                builtFrom: 0,
                volumeIncomplete: 0
            }
            : previous;

        bucket.builtFrom += 1;
        /* A source bar arriving out of order inside one bucket never moves the
         * close: the bucket's close is its latest bar's close, not its last
         * arrival's. */
        if (bar.openTime >= bucket.lastOpenTime) {
            bucket.close = bar.close;
            bucket.lastOpenTime = bar.openTime;
        }
        bucket.high = Math.max(bucket.high, bar.high);
        bucket.low = Math.min(bucket.low, bar.low);
        bucket.volume += bar.volume;
        if (!bar.volumeComplete) bucket.volumeIncomplete += 1;

        if (bucket.builtFrom >= expected) return this.sealBucket(ring, bucket, sealed);

        this.forming.set(key, bucket);
        return null;
    }

    /**
     * A bucket is done: ring its bar if every source bar arrived, drop it (and
     * count it) if not. The ring remembers the bucket either way, so a replay
     * of that period can never open a second one.
     *
     * @returns {object|null} the sealed bar, or null when the bucket was partial
     */
    sealBucket(ring, bucket, sealed) {
        this.forming.delete(`${ring.symbol}|${ring.timeframe}`);
        ring.lastBucket = bucket.openTime;

        if (bucket.builtFrom < ring.bucketBars) {
            this.counters.partial += 1;
            return null;
        }

        const bar = Object.freeze({
            /* The bucket covers [openTime, openTime + timeframeMs): its close
             * time is the bucket's own last millisecond, not a venue's word. */
            openTime: bucket.openTime,
            closeTime: bucket.openTime + ring.timeframeMs - 1,
            open: bucket.open,
            high: bucket.high,
            low: bucket.low,
            close: bucket.close,
            volume: bucket.volume,
            volumeComplete: bucket.volumeIncomplete === 0,
            intervalMs: ring.timeframeMs,
            source: "aggregated",
            builtFrom: bucket.builtFrom
        });

        const stored = this.append(ring, bar);
        if (stored) sealed.push(Object.freeze({ timeframe: ring.timeframe, bar: stored }));
        return stored;
    }

    /**
     * The reading, once per closed bar — the publication trigger of every
     * bar-reading module (`indicators_<timeframe>`, `price_action_<timeframe>`).
     *
     * The first call after a new bar went into that timeframe's ring returns the
     * reading; every later call returns null until the next bar closes. An
     * unreadable edge is not consumed: a ring that is still too short leaves the
     * edge in place, so the first bar that makes the timeframe readable
     * publishes, rather than the first bar that merely closed.
     *
     * @param {string} symbol
     * @param {string|number} timeframe  "15m" / 900000, however spelled
     * @returns {object|null}
     */
    pending(symbol, timeframe) {
        const name = normalizeSymbol(symbol);
        if (!name) return null;

        const label = timeframeKey(this.timeframes, timeframe);
        if (!label) return null;

        const key = `${name}|${label}`;
        const edge = this.edges.get(key);
        if (edge === undefined || this.emitted.get(key) === edge) return null;

        const reading = this.reading(name, label);
        if (!reading) return null;

        this.emitted.set(key, edge);
        this.counters.published += 1;
        return reading;
    }

    /**
     * Everything this module holds about one symbol, timeframe by timeframe:
     * the ring's accounting and the reading when there is one. This is the
     * status view ("what is behind those numbers"), not a publication —
     * `pending()` is the publication. The reading itself is the subclass's: it
     * is the one thing the two bar readers answer differently.
     *
     * @returns {object|null} null for a symbol this module has never seen
     */
    snapshot(symbol) {
        const name = normalizeSymbol(symbol);
        if (!name || !this.symbols.has(name)) return null;

        const timeframes = {};
        for (const [label, ms] of Object.entries(this.timeframes)) {
            const ring = this.rings.get(`${name}|${label}`) || null;
            timeframes[label] = Object.freeze({
                interval: ms,
                series: ring ? ring.stats() : null,
                /* null while the timeframe is too short to read — the series
                 * block above still says how far it has come. */
                reading: this.reading(name, label)
            });
        }

        return Object.freeze({
            symbol: name,
            at: this.now(),
            timeframes: Object.freeze(timeframes)
        });
    }

    /**
     * The bars this module holds, oldest first, or null when it holds none for
     * that (symbol, timeframe). The analyzer of a subclass reads bars, not
     * parallel arrays.
     *
     * @returns {object[]|null}
     */
    barsOf(symbol, timeframe) {
        const name = normalizeSymbol(symbol);
        if (!name) return null;

        const label = timeframeKey(this.timeframes, timeframe);
        if (!label) return null;

        const ring = this.rings.get(`${name}|${label}`);
        return ring && ring.count ? ring.bars() : null;
    }

    /**
     * The ring accounting every bar-reading module reports in stats(): how many
     * series are held and how they are fed, how many bars are behind them, and
     * how much of the series is missing (gaps) or already gone (dropped).
     */
    seriesState() {
        const rings = { total: this.rings.size, native: 0, aggregated: 0, unset: 0 };
        let bars = 0;
        let dropped = 0;
        let gaps = 0;
        let volumeIncomplete = 0;

        for (const ring of this.rings.values()) {
            bars += ring.count;
            dropped += ring.dropped;
            gaps += ring.gaps;
            volumeIncomplete += ring.volumeIncompleteBars;
            if (ring.source === "native") rings.native += 1;
            else if (ring.source === "aggregated") rings.aggregated += 1;
            else rings.unset += 1;
        }

        return { rings, forming: this.forming.size, edges: this.edges.size, bars, dropped, gaps, volumeIncomplete };
    }

    /**
     * Forget one symbol, or (with no symbol) everything: rings, half-built
     * buckets, edges and the aggregation base. Nothing else in the process
     * holds a reference to a ring, so the memory goes with it. Whatever else a
     * subclass caches goes through clearModuleState().
     *
     * The counters are not reset: they are the module's history, and a caller
     * asking for a reset wants to free state, not to rewrite what happened.
     *
     * @param {object} [options]
     * @param {string} [options.symbol] one instrument, or null for all
     * @returns {number} how many rings were dropped
     */
    reset({ symbol = null } = {}) {
        const name = normalizeSymbol(symbol);

        if (name === null) {
            const dropped = this.rings.size;
            this.clearModuleState(null);
            this.rings.clear();
            this.forming.clear();
            this.edges.clear();
            this.emitted.clear();
            this.bases.clear();
            this.symbols.clear();
            return dropped;
        }

        this.clearModuleState(name);
        const prefix = `${name}|`;
        let dropped = 0;
        for (const key of [...this.rings.keys()]) {
            if (!key.startsWith(prefix)) continue;

            this.rings.delete(key);
            this.forming.delete(key);
            this.edges.delete(key);
            this.emitted.delete(key);
            dropped += 1;
        }

        this.bases.delete(name);
        this.symbols.delete(name);
        return dropped;
    }

    /**
     * A hook for a subclass whose own state is keyed the way the rings are: it
     * is called with the symbol being forgotten (null for every symbol) before
     * the bars go, so a module's cache never outlives the series behind it.
     */
    clearModuleState() {
        /* nothing to clear in the base */
    }
}

/* ------------------------------------------------------------
 * Exports — the classes, and the pure helpers the modules and
 * their tests drive directly
 * ---------------------------------------------------------- */

module.exports = {
    BarSeries,
    RingBuffer,
    parseInterval,
    intervalLabel,
    normalizeTimeframes,
    timeframeKey,
    bucketStart,
    barsPerBucket,
    normalizeSymbol,
    readBar,
    DEFAULT_TIMEFRAMES,
    DEFAULT_MAX_BARS,
    DEFAULT_MAX_INSTRUMENTS,
    UNIT_MS,
    DAY_MS
};










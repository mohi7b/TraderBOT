/* ============================================================
 * File: analytics-engine/modules/indicators/index.cjs
 * Section: analytics-engine/modules/indicators
 * Version: 1.0.0
 *
 * Role:
 *   Module 7 of the analytics engine: the price-indicator view of one
 *   market, on several timeframes at once.
 *
 *   Closed bars arrive (a venue's own candle, or the bar the six-market
 *   layer carries inside a `ticker`), and this module answers — per symbol,
 *   per timeframe:
 *
 *     reading(symbol, timeframe)  what do the indicators say on that
 *                                 timeframe, right now?
 *     pending(symbol, timeframe)  edge-triggered: that reading, once, on the
 *                                 first candle that closed a new bar of that
 *                                 timeframe (`indicators_<timeframe>`)
 *
 *   Timeframes: the interval a venue streams is ringed as it arrives
 *   ("native"), and every coarser timeframe this module serves is built
 *   from that same stream by UTC-aligned bucket aggregation:
 *
 *     1m  ──► 5m ──► 15m ──► 1h ──► 4h ──► 1d      (a 1m feed)
 *     1d  ──► (nothing finer is derivable)          (six-market daily bars)
 *
 *   A ring is filled from ONE source: the venue's own bars, or buckets built
 *   from one base interval. A venue that streams 1m and 5m while another
 *   streams 5m only cannot mix the two 5m series — the first writer owns the
 *   ring and the conflicting bar is counted (`mixed`), never blended.
 *
 *   Honesty rules (the same ones the rest of the layer follows):
 *     - a missing number is null, never 0: a 200-bar average with 60 bars
 *       behind it is null, not the 60-bar average relabelled
 *     - a bar is never invented: a bucket is ringed only when every source
 *       bar of that bucket arrived; an incomplete bucket is dropped and
 *       counted (`partial`), and an unfinished venue bar is not read at all
 *       (`open`) — indicators are computed on closed bars only
 *     - a series that is not contiguous says so: `ring.gaps` counts the open
 *       times where the window was not consecutive, so a reading never
 *       pretends the bars behind it are unbroken
 *     - the venue's bar and a bar this module built are not the same
 *       measurement: every bar carries `source` and, when aggregated,
 *       `builtFrom` (how many source bars it was made of)
 *     - a flat window has no RSI: tulind answers NaN there and NaN becomes
 *       null, never 50; no NaN ever travels (core/math.cjs finite())
 *     - a bar is not a price: open/high/low/close must be positive and form
 *       a valid bar (high ≥ max(open, close), low ≤ min(open, close)),
 *       otherwise the frame is refused (`invalidBar`) instead of ringed
 *     - a reading that cannot be computed is not published: `pending()`
 *       returns null until the timeframe holds `minBars` bars
 *
 *   What this module deliberately does NOT do: it does not fetch history,
 *   it does not backfill or interpolate a missing bar, it does not guess an
 *   interval from the clock, and it never mixes two sources in one ring.
 * ============================================================ */

const math = require("../../core/math.cjs");

/** The timeframes served by default. 1m…4h answer a crypto stream that
 *  aggregates upward; 1d answers the six-market layer's daily bars (and a
 *  1m stream's own day, built from its 1m bars). */
const DEFAULT_TIMEFRAMES = Object.freeze(["1m", "5m", "15m", "1h", "4h", "1d"]);

/** The indicator periods of the core set (every one of them configurable). */
const DEFAULT_PERIODS = Object.freeze({
    rsi: 14,
    atr: 14,
    sma: Object.freeze([20, 50, 200]),
    ema: Object.freeze([9, 21, 50, 200]),
    macd: Object.freeze({ fast: 12, slow: 26, signal: 9 }),
    bollinger: Object.freeze({ period: 20, stdDev: 2 }),
    vwap: Object.freeze({ window: 20, session: true })
});

/** Bars held per (symbol, timeframe): 512 one-minute bars ≈ 8.5 h, 512 daily
 *  bars ≈ 17 months — enough for the 200-bar ladders with room to spare. */
const DEFAULT_MAX_BARS = 512;

/** One instrument's timeframes are few; the cap only stops a runaway producer. */
const DEFAULT_MAX_INSTRUMENTS = 128;

/** Milliseconds of one interval unit, as venues spell them. */
const UNIT_MS = Object.freeze({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 });
const DAY_MS = UNIT_MS.d;

/** Our name → tulind's name, where the two differ (checked against tulind
 *  0.8.x): the library calls Bollinger Bands "bbands" (lower, middle, upper).
 *  It has no VWAP at all, which is why the one here is computed by hand. */
const TULIND_NAMES = Object.freeze({ bollinger: "bbands" });

/* ------------------------------------------------------------
 * Intervals, symbols, periods
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

    if (!mapped.size) throw new Error("IndicatorAnalytics: not one timeframe could be read");

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

/** Configured periods: whole numbers ≥ 1, ascending, without duplicates. */
function periodsOf(value, fallback) {
    const list = (Array.isArray(value) ? value : [])
        .map((item) => Math.floor(math.positive(item) || 0))
        .filter((period) => period >= 1);
    const usable = [...new Set(list)].sort((left, right) => left - right);
    return usable.length ? usable : [...fallback];
}

/* ------------------------------------------------------------
 * tulind — the indicator library
 * ---------------------------------------------------------- */

/**
 * The library, or why it is not there. A native binding that fails to build
 * must not take the other modules down with it: this module then answers null
 * readings and says so in stats().library.
 */
function loadTulind() {
    try {
        const lib = require("tulind");
        if (lib && lib.indicators && typeof lib.indicators === "object") return { lib, error: null };
        return { lib: null, error: "tulind exposes no indicators table" };
    } catch (err) {
        return { lib: null, error: err && err.message ? err.message : String(err) };
    }
}

/**
 * One tulind call. The library's callback is synchronous (verified against
 * tulind 0.8.x), so `outputs` is already filled when indicator() returns; a
 * throw or a callback error becomes null — a route must never see either.
 */
function indicatorCall(spec, inputs, options) {
    if (!spec || typeof spec.indicator !== "function") return null;

    let outputs = null;
    let failure = null;
    try {
        spec.indicator(inputs, options, (err, result) => {
            if (err) failure = err.message || String(err);
            else outputs = result;
        });
    } catch (err) {
        failure = err && err.message ? err.message : String(err);
    }

    if (failure || !Array.isArray(outputs)) return null;
    return outputs;
}

/** The last value of one output series as a finite number, or null (NaN → null). */
function lastValue(series) {
    if (!Array.isArray(series) || !series.length) return null;
    return math.finite(series[series.length - 1]);
}

/** The last value of every output ([macd, signal, histogram]) — null per output. */
function lastValues(outputs) {
    return outputs === null ? null : outputs.map(lastValue);
}

/**
 * How many bars an indicator needs before it has a value at all. tulind's own
 * `start()` is the truth (it is how many bars the library drops); the fallback
 * is the documented requirement and only applies when the library is missing.
 */
function requiredBars(spec, options, fallback) {
    try {
        if (spec && typeof spec.start === "function") return Math.max(1, spec.start(options) + 1);
    } catch (err) {
        /* the fallback below is the documented requirement */
    }
    return Math.max(1, fallback);
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
         * (buckets this module built). The first writer owns the ring. */
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
 * IndicatorAnalytics — the module
 * ---------------------------------------------------------- */

/**
 * One instance serves every symbol the engine routes to it, and answers per
 * (symbol, timeframe). Two questions, two shapes:
 *
 *   reading(symbol, timeframe)   the picture on that timeframe (the bar, the
 *                                price, the indicator set, the ring's own
 *                                completeness) — null until it means something
 *   pending(symbol, timeframe)   the same reading, edge-triggered: the first
 *                                call after that timeframe's bar closed
 */
class IndicatorAnalytics {
    /**
     * @param {object}   [options]
     * @param {Function} [options.now]            clock (tests inject a fake)
     * @param {string[]} [options.timeframes]     served timeframes ("1m" … "1d")
     * @param {number}   [options.maxBars]        ring capacity per (symbol, timeframe)
     * @param {number}   [options.maxInstruments] cap on tracked symbols
     * @param {number}   [options.minBars]        bars a timeframe needs before it publishes
     * @param {number}   [options.rsiPeriod]      RSI period (default 14)
     * @param {number}   [options.atrPeriod]      ATR period (default 14)
     * @param {number[]} [options.smaPeriods]     SMA ladder (default 20/50/200)
     * @param {number[]} [options.emaPeriods]     EMA ladder (default 9/21/50/200)
     * @param {object}   [options.macd]           { fast, slow, signal }
     * @param {object}   [options.bollinger]      { period, stdDev }
     * @param {object}   [options.vwap]           { window, session }
     */
    constructor({
        now = Date.now,
        timeframes = DEFAULT_TIMEFRAMES,
        maxBars = DEFAULT_MAX_BARS,
        maxInstruments = DEFAULT_MAX_INSTRUMENTS,
        minBars = null,
        rsiPeriod = DEFAULT_PERIODS.rsi,
        atrPeriod = DEFAULT_PERIODS.atr,
        smaPeriods = DEFAULT_PERIODS.sma,
        emaPeriods = DEFAULT_PERIODS.ema,
        macd = DEFAULT_PERIODS.macd,
        bollinger = DEFAULT_PERIODS.bollinger,
        vwap = DEFAULT_PERIODS.vwap
    } = {}) {
        this.now = now;
        /* Two bars are the minimum a window can be. */
        this.maxBars = Math.max(2, Math.floor(math.positive(maxBars) || DEFAULT_MAX_BARS));
        this.maxInstruments = Math.max(1, Math.floor(math.positive(maxInstruments) || DEFAULT_MAX_INSTRUMENTS));
        this.timeframes = Object.freeze(normalizeTimeframes(timeframes));

        const warnings = [];
        const library = loadTulind();
        this.lib = library.lib;
        this.libraryError = library.error;
        this.version = this.lib && typeof this.lib.version === "string" ? this.lib.version : null;
        if (!this.lib) warnings.push(`tulind is unavailable (${library.error}): no indicator reading can be computed`);

        this.rsiPeriod = Math.max(1, Math.floor(math.positive(rsiPeriod) || DEFAULT_PERIODS.rsi));
        this.atrPeriod = Math.max(1, Math.floor(math.positive(atrPeriod) || DEFAULT_PERIODS.atr));

        /* A ladder that held no usable period is worth saying out loud rather
         * than quietly replacing. */
        const ladder = (value, fallback, label) => {
            const periods = periodsOf(value, fallback);
            if (Array.isArray(value) && value.length && !value.some((item) => math.positive(item) !== null)) {
                warnings.push(`${label} held no usable period: the default ladder is used`);
            }
            return periods;
        };
        this.smaPeriods = Object.freeze(ladder(smaPeriods, DEFAULT_PERIODS.sma, "smaPeriods"));
        this.emaPeriods = Object.freeze(ladder(emaPeriods, DEFAULT_PERIODS.ema, "emaPeriods"));

        const macdOptions = macd && typeof macd === "object" ? macd : {};
        this.macd = Object.freeze({
            fast: Math.max(1, Math.floor(math.positive(macdOptions.fast) || DEFAULT_PERIODS.macd.fast)),
            slow: Math.max(1, Math.floor(math.positive(macdOptions.slow) || DEFAULT_PERIODS.macd.slow)),
            signal: Math.max(1, Math.floor(math.positive(macdOptions.signal) || DEFAULT_PERIODS.macd.signal))
        });
        const bandOptions = bollinger && typeof bollinger === "object" ? bollinger : {};
        this.bollinger = Object.freeze({
            period: Math.max(2, Math.floor(math.positive(bandOptions.period) || DEFAULT_PERIODS.bollinger.period)),
            stdDev: math.positive(bandOptions.stdDev) || DEFAULT_PERIODS.bollinger.stdDev
        });
        const vwapOptions = vwap && typeof vwap === "object" ? vwap : {};
        this.vwap = Object.freeze({
            window: Math.max(1, Math.floor(math.positive(vwapOptions.window) || DEFAULT_PERIODS.vwap.window)),
            session: vwapOptions.session !== false
        });

        /* How many bars each indicator needs. tulind's own start() is the truth
         * (it is how many bars the library drops); the formula only stands in
         * for a missing library. */
        this.requirements = Object.freeze({
            rsi: requiredBars(this.indicator("rsi"), [this.rsiPeriod], this.rsiPeriod + 1),
            atr: requiredBars(this.indicator("atr"), [this.atrPeriod], this.atrPeriod),
            sma: Object.freeze(this.smaPeriods.map((period) => requiredBars(this.indicator("sma"), [period], period))),
            ema: Object.freeze(this.emaPeriods.map((period) => requiredBars(this.indicator("ema"), [period], 1))),
            macd: requiredBars(
                this.indicator("macd"),
                [this.macd.fast, this.macd.slow, this.macd.signal],
                this.macd.slow
            ),
            bollinger: requiredBars(
                this.indicator("bollinger"),
                [this.bollinger.period, this.bollinger.stdDev],
                this.bollinger.period
            )
        });
        this.warmupBars = Math.max(
            1,
            this.requirements.rsi,
            this.requirements.atr,
            this.requirements.macd,
            this.requirements.bollinger,
            this.vwap.window,
            ...this.requirements.sma,
            ...this.requirements.ema
        );

        /* The core set: the single-period indicators plus the VWAP window. A
         * reading publishes as soon as those are computable — a ladder answers
         * per rung (sma_200 stays null long after sma_20 has a value), which is
         * why the warmup is not the publication threshold. */
        this.coreBars = Math.max(
            this.requirements.rsi,
            this.requirements.atr,
            this.requirements.macd,
            this.requirements.bollinger,
            this.vwap.window
        );
        const requested = math.positive(minBars);
        this.minBars = Math.min(this.maxBars, Math.max(1, Math.floor(requested === null ? this.coreBars : requested)));

        if (this.maxBars < this.coreBars) {
            warnings.push(`maxBars ${this.maxBars} is shorter than the core set (${this.coreBars} bars): slow values stay null`);
        } else if (this.maxBars < this.warmupBars) {
            warnings.push(`maxBars ${this.maxBars} is shorter than the warmup (${this.warmupBars} bars): the slow ladders never fill`);
        }
        if (requested !== null && this.minBars < this.coreBars) {
            warnings.push(`minBars ${this.minBars} is below the core set (${this.coreBars} bars): readings publish with null core values`);
        }

        /* The configured periods, frozen once: every reading carries them, so a
         * consumer reads a value and its period from the same event. */
        this.periods = Object.freeze({
            rsi: this.rsiPeriod,
            atr: this.atrPeriod,
            sma: this.smaPeriods,
            ema: this.emaPeriods,
            macd: this.macd,
            bollinger: this.bollinger,
            vwap: this.vwap
        });

        /* State. Every map is bounded: rings, forming buckets and edges by
         * (symbol × timeframe), bases and symbols by instrument — so a feed
         * that runs for a month holds exactly as much as one that runs for a
         * minute. */
        this.rings = new Map();
        this.forming = new Map();
        this.edges = new Map();
        this.emitted = new Map();
        this.bases = new Map();
        this.symbols = new Set();

        this.counters = {
            candles: 0,             // closed bars accepted from a venue
            sealed: 0,              // bars ringed (native + aggregated)
            native: 0,              // bars a venue handed over
            aggregated: 0,          // bars this module built from a base interval
            partial: 0,             // buckets dropped because a source bar was missing
            open: 0,                // bars the venue said were still forming
            late: 0,                // bars older than the ring's newest
            duplicate: 0,           // the same bar seen twice
            mixed: 0,               // native/aggregated conflicts refused
            offBase: 0,             // frames whose bar cannot feed this symbol's aggregation
            finer: 0,               // frames coarser than a served timeframe (nothing finer derives)
            unknownInterval: 0,     // frames without a readable interval
            undated: 0,             // frames without an open time
            invalidBar: 0,          // frames that are not a bar
            droppedInstruments: 0,  // symbols beyond maxInstruments
            readings: 0,            // readings computed
            published: 0,           // edge-triggered readings handed out
            insufficient: 0,        // readings refused: fewer than minBars bars behind them
            libraryMissing: 0,      // readings refused because tulind is absent
            calls: 0                // tulind calls made
        };
        this.warnings = Object.freeze(warnings);
    }

    /* ------------------------------------------------------------
     * Ingestion — one closed bar in, at most one new bar per timeframe
     * ---------------------------------------------------------- */

    /**
     * One candle frame → every served timeframe it can fill.
     *
     * The frame is what the `candle` route builds (and what the six-market
     * ticker carries): symbol, interval, an open time, OHLCV and whether the
     * venue considers the bar finished.
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
     * from arrival order, and an unfinished bar is never read: an indicator on
     * a half-built bar is a number that is already wrong when it is consumed.
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
     * allowed to overwrite the bar the indicators were computed on.
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

    /* ------------------------------------------------------------
     * The indicator set
     * ---------------------------------------------------------- */

    /** tulind's entry for one indicator, or null when the library is absent. */
    indicator(name) {
        if (!this.lib || !this.lib.indicators) return null;

        const mapped = TULIND_NAMES[name];
        return this.lib.indicators[mapped] || this.lib.indicators[name] || null;
    }

    /**
     * One tulind call over a ring — the single place the library is called, so
     * "too few bars" and "no library" are answered once for every indicator.
     *
     * @returns {number[][]|null} the output series, or null when the ring is
     *   shorter than the indicator needs (`required`) or tulind is missing
     */
    series(spec, inputs, options, required) {
        const bars = Array.isArray(inputs[0]) ? inputs[0].length : 0;
        if (!spec || typeof spec.indicator !== "function" || bars < required) return null;

        this.counters.calls += 1;
        return indicatorCall(spec, inputs, options);
    }

    /** The core set on one ring: rsi, atr, the ladders, macd, bollinger, vwap. */
    computeIndicators(ring) {
        if (!this.lib) {
            this.counters.libraryMissing += 1;
            return null;
        }

        return Object.freeze({
            bars: ring.count,
            required: this.coreBars,
            ready: ring.count >= this.coreBars,
            warm: ring.count >= this.warmupBars,
            rsi: this.rsiOf(ring),
            atr: this.atrOf(ring),
            sma: this.ladderOf(ring, "sma", this.smaPeriods, this.requirements.sma),
            ema: this.ladderOf(ring, "ema", this.emaPeriods, this.requirements.ema),
            macd: this.macdOf(ring),
            bollinger: this.bollingerOf(ring),
            vwap: this.vwapOf(ring)
        });
    }

    /**
     * Relative strength index over the ring. A window with no movement has no
     * RSI at all: tulind answers NaN there and NaN becomes null — never 50,
     * which would be a made-up "neutral".
     */
    rsiOf(ring) {
        const outputs = this.series(this.indicator("rsi"), [ring.close], [this.rsiPeriod], this.requirements.rsi);
        return lastValue(outputs ? outputs[0] : null);
    }

    /** True range average (Wilder, as tulind defines it) over the ring. */
    atrOf(ring) {
        const outputs = this.series(
            this.indicator("atr"),
            [ring.high, ring.low, ring.close],
            [this.atrPeriod],
            this.requirements.atr
        );
        return lastValue(outputs ? outputs[0] : null);
    }

    /** A moving-average ladder: {"20": value, "50": value, …} — null per rung. */
    ladderOf(ring, name, periods, required) {
        const spec = this.indicator(name);
        const out = {};

        periods.forEach((period, at) => {
            const outputs = this.series(spec, [ring.close], [period], required[at]);
            out[period] = lastValue(outputs ? outputs[0] : null);
        });

        return Object.freeze(out);
    }

    /** MACD of the configured spans: { macd, signal, histogram }. */
    macdOf(ring) {
        const outputs = this.series(
            this.indicator("macd"),
            [ring.close],
            [this.macd.fast, this.macd.slow, this.macd.signal],
            this.requirements.macd
        );
        const values = lastValues(outputs);
        if (!values) return null;

        return Object.freeze({ macd: values[0], signal: values[1], histogram: values[2] });
    }

    /** Bollinger bands of the configured period: { lower, middle, upper }. */
    bollingerOf(ring) {
        const outputs = this.series(
            this.indicator("bollinger"),
            [ring.close],
            [this.bollinger.period, this.bollinger.stdDev],
            this.requirements.bollinger
        );
        const values = lastValues(outputs);
        if (!values) return null;

        return Object.freeze({ lower: values[0], middle: values[1], upper: values[2] });
    }

    /**
     * Volume-weighted average price, computed here because tulind has none —
     * and computed two ways, because the question has two answers:
     *
     *   window   over the last `window` bars: a rolling VWAP, comparable
     *            between timeframes and defined from the first full window
     *   session  from the UTC day's open (00:00): the level intraday trading
     *            measures against, and the one a bar-level VWAP can anchor
     *
     * A bar is weighted at its typical price ((high + low + close) / 3). A bar
     * the venue sent no volume for weighs nothing: it is counted and reported
     * (`volumeComplete`), never given an invented weight, and a slice whose
     * bars all lack volume has no average at all — null, not the mean of the
     * closes dressed up as a VWAP.
     */
    vwapOf(ring) {
        const session = this.vwap.session ? this.sessionVwap(ring) : null;
        const window = this.windowVwap(ring);
        if (!window && !session) return null;

        return Object.freeze({
            window: window ? window.value : null,
            windowBars: window ? window.bars : 0,
            windowFrom: window ? window.from : null,
            windowComplete: window ? window.complete : false,
            session: session ? session.value : null,
            sessionBars: session ? session.bars : 0,
            sessionFrom: session ? session.from : null,
            sessionDay: session ? session.day : null,
            sessionComplete: session ? session.complete : false,
            /* How many of the counted bars carried a volume at all — the
             * number that says how much of this average is a real average. */
            volumeBars: window ? window.volumeBars : 0,
            volume: window ? window.volume : 0
        });
    }

    /**
     * The volume-weighted average of one slice of the ring (both ends
     * included), with the accounting that makes it honest: how many bars went
     * in, how many carried volume, and whether the slice is the whole window
     * the caller asked for.
     */
    vwapBetween(ring, from, to, expected) {
        let weighted = 0;
        let volume = 0;
        let bars = 0;
        let volumeBars = 0;

        for (let at = from; at <= to; at += 1) {
            bars += 1;
            if (ring.volumeComplete[at] === 0) continue;

            /* No volume sent is no weight; a sent zero volume is no weight
             * either, but it does not make the bar a missing one. */
            const typical = (ring.high[at] + ring.low[at] + ring.close[at]) / 3;
            volumeBars += 1;
            weighted += typical * ring.volume[at];
            volume += ring.volume[at];
        }

        return Object.freeze({
            value: volume > 0 ? weighted / volume : null,
            bars,
            volumeBars,
            volume,
            from: bars ? ring.openTime[from] : null,
            to: bars ? ring.openTime[to] : null,
            complete: bars >= expected
        });
    }

    /** The last `window` closed bars, volume-weighted (null when the ring is empty). */
    windowVwap(ring) {
        const wanted = Math.min(this.vwap.window, ring.count);
        if (wanted <= 0) return null;

        return this.vwapBetween(ring, ring.count - wanted, ring.count - 1, this.vwap.window);
    }

    /**
     * The UTC day's bars, volume-weighted: from the 00:00 open of the day the
     * newest bar belongs to (the day a 1d bar *is*).
     *
     * A day whose first bars are not in the ring says so instead of passing off
     * a partial average as the session's: `from` is the oldest bar counted and
     * `complete` is true only when the ring really starts at 00:00 UTC. The
     * usual case for a 1m ring is a partial day (512 minutes = 8.5 h) and the
     * reading says exactly that.
     */
    sessionVwap(ring) {
        if (!ring.count) return null;

        const newest = ring.openTime[ring.count - 1];
        const day = Math.floor(newest / DAY_MS) * DAY_MS;

        /* The ring is sorted, so the day's first bar is found by scanning back
         * from the newest one — never by assuming the day started here. */
        let first = ring.count - 1;
        while (first > 0 && ring.openTime[first - 1] >= day) first -= 1;

        const slice = this.vwapBetween(ring, first, ring.count - 1, ring.count - first);
        return Object.freeze({
            ...slice,
            day,
            complete: ring.openTime[first] === day && slice.complete
        });
    }

    /* ------------------------------------------------------------
     * Readings — what a consumer sees
     * ---------------------------------------------------------- */

    /**
     * The indicator picture on one (symbol, timeframe), or null when there is
     * nothing honest to say: an unknown symbol, a timeframe this module does not
     * serve, a ring still shorter than `minBars`, or no indicator library.
     *
     * Everything in the reading is about one bar — the last closed bar of that
     * timeframe — and it carries that bar, so the numbers can always be traced
     * back to the candles they were computed on.
     *
     * @param {string}          symbol
     * @param {string|number}   timeframe   "15m" / 900000, however spelled
     * @returns {object|null}
     */
    reading(symbol, timeframe) {
        const name = normalizeSymbol(symbol);
        if (!name) return null;

        const label = timeframeKey(this.timeframes, timeframe);
        if (!label) return null;

        const ring = this.rings.get(`${name}|${label}`);
        if (!ring || ring.count < this.minBars) {
            this.counters.insufficient += 1;
            return null;
        }

        const indicators = this.computeIndicators(ring);
        if (!indicators) return null;

        const bar = ring.last();
        const at = this.now();
        this.counters.readings += 1;

        return Object.freeze({
            symbol: name,
            timeframe: label,
            interval: this.timeframes[label],
            at,
            /* The bar the numbers belong to: closed, and the newest one this
             * timeframe has. */
            bar,
            openTime: bar.openTime,
            closeTime: bar.closeTime,
            price: bar.close,
            /* The bar's own open → close move, in percent — the one change a
             * reading can state without a period behind it, so it is the only
             * one it states. open is positive by construction (readBar refuses
             * a bar without positive prices), so this is always a number. */
            changePct: ((bar.close - bar.open) / bar.open) * 100,
            /* How long the newest bar has been closed when the reading was
             * taken — a consumer can tell a fresh reading from a replayed one
             * without trusting its own clock. */
            barAge: Math.max(0, at - bar.closeTime),
            source: ring.source,
            builtFrom: bar.builtFrom,
            volumeComplete: bar.volumeComplete,
            indicators,
            params: this.periods,
            /* The series behind the numbers: bars held, gaps, what was dropped
             * out of the window. A reading never pretends the ring is whole. */
            series: ring.stats()
        });
    }

    /**
     * The reading, once per closed bar — the publication trigger
     * (`indicators_<timeframe>`).
     *
     * The first call after a new bar went into that timeframe's ring returns
     * the reading; every later call returns null until the next bar closes.
     * An unreadable edge is not consumed: a ring that is still too short leaves
     * the edge in place, so the first bar that makes the timeframe readable
     * publishes, rather than the first bar that merely closed.
     *
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

    /* ------------------------------------------------------------
     * The module's own state — for an operator, not for a chart
     * ---------------------------------------------------------- */

    /**
     * Everything this module holds about one symbol, timeframe by timeframe:
     * the ring's accounting and the reading when there is one. This is the
     * status view ("what is behind those numbers"), not a publication —
     * `pending()` is the publication.
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
     * The module's own accounting: what it was fed, what it holds, what it
     * refused and what it would need to do better. Not a reading — readings
     * speak about the market, this speaks about the module, and the two are
     * never mixed in one event.
     */
    stats() {
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

        return Object.freeze({
            library: Object.freeze({
                loaded: this.lib !== null,
                version: this.version,
                error: this.libraryError
            }),
            timeframes: Object.freeze(Object.keys(this.timeframes)),
            intervals: Object.freeze({ ...this.timeframes }),
            periods: this.periods,
            requirements: this.requirements,
            bars: Object.freeze({
                publish: this.minBars,
                core: this.coreBars,
                warmup: this.warmupBars,
                capacity: this.maxBars
            }),
            instruments: Object.freeze({ tracked: this.symbols.size, cap: this.maxInstruments }),
            state: Object.freeze({
                rings: Object.freeze(rings),
                forming: this.forming.size,
                edges: this.edges.size,
                bars,
                dropped,
                gaps,
                volumeIncomplete
            }),
            counters: Object.freeze({ ...this.counters }),
            warnings: this.warnings
        });
    }

    /**
     * Forget one symbol, or (with no symbol) everything: rings, half-built
     * buckets, edges and the aggregation base. Nothing else in the process
     * holds a reference to a ring, so the memory goes with it.
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
            this.rings.clear();
            this.forming.clear();
            this.edges.clear();
            this.emitted.clear();
            this.bases.clear();
            this.symbols.clear();
            return dropped;
        }

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
}

/* ------------------------------------------------------------
 * Exports — the class, and the pure helpers the tests drive directly
 * ---------------------------------------------------------- */

module.exports = {
    IndicatorAnalytics,
    RingBuffer,
    parseInterval,
    intervalLabel,
    normalizeTimeframes,
    timeframeKey,
    bucketStart,
    barsPerBucket,
    normalizeSymbol,
    periodsOf,
    loadTulind,
    indicatorCall,
    lastValue,
    lastValues,
    requiredBars,
    readBar,
    DEFAULT_TIMEFRAMES,
    DEFAULT_PERIODS,
    DEFAULT_MAX_BARS,
    DEFAULT_MAX_INSTRUMENTS,
    UNIT_MS,
    DAY_MS
};

/* ============================================================
 * File: analytics-engine/modules/cross_market/index.cjs
 * Section: analytics-engine/modules
 * Version: 1.0.0
 *
 * Role:
 *   The cross-market view: what two markets did *relative to each other*.
 *
 *   Every other module in this folder answers about one series — its flow, its
 *   book, its bars, its structure. This one reads the same closed bars
 *   (core/bars.cjs) two series at a time and answers three questions:
 *
 *     macro_correlation_<tf>   how much do these two move together, on one
 *                              timeframe, over the bars BOTH of them answered?
 *     relative_strength_<tf>   did this market do better than its benchmark over
 *                              that same window of bars?
 *     market_leverage_risk     how much leverage is in this market, composed
 *                              from the four things that measure it (open
 *                              interest, funding, positioning, the washout the
 *                              liquidation prints left)
 *
 *   Honesty rules (this module's own, on top of the bar layer's):
 *     - One coefficient, one window: the two series are aligned by the bar's own
 *       open time, never by arrival order, and the reading names the first and
 *       the last bar it was measured over.
 *     - Pairwise-complete: a bar only one side answered for is dropped and
 *       counted (`missing`), never carried over from its neighbour and never
 *       filled with a zero.
 *     - A return exists only between two bars ONE interval apart: a window with
 *       a hole in it yields no return for the pair that would span the hole
 *       (`gaps`), because a two-day move is not a daily move.
 *     - Both series must answer for the newest bar (`unaligned` otherwise).
 *       Correlating a fresh window against a stale one is the one mistake that
 *       looks like a finding.
 *     - Too few pairs, or a window without movement, is no coefficient at all:
 *       `null` and a counter — never 0, which would claim "no relationship"
 *       where the truth is "no measurement".
 *     - Relative strength is NOT dominance. It compares two price series over
 *       the same bars; it does not measure a share of anything, and no BTC.D /
 *       USDT.D is computed here because no total was ever measured. The reading
 *       says so in its own payload (`dominance: false`), so no consumer can read
 *       a relative move as a market share.
 *     - Leverage risk is a composition, and it says what it was made of: every
 *       part carries its own value, `missing` names the parts that were not
 *       there and `max` says how much of the scale the parts that WERE there
 *       could reach. A score from two parts is never presented as a score from
 *       four.
 *
 *   The module never touches a bus, an envelope or another module: the router
 *   hands it bars, and (for the leverage view) the readings of two other modules
 *   as plain values.
 * ============================================================ */

const math = require("../../core/math.cjs");
const { CROSS_MARKET_TIMEFRAMES } = require("../../topics.cjs");
const { BarSeries, normalizeSymbol, timeframeKey } = require("../../core/bars.cjs");

/**
 * The module's own choices, stated once so a reading can carry them (`params`)
 * and a consumer can tell a configured engine from a default one.
 */
const DEFAULTS = Object.freeze({
    /* Bars each side must hold before a coefficient may be produced: below the
     * floor the answer would be about one afternoon, not about a market. */
    minBars: 30,
    /* Return pairs the coefficient must be measured over. Two series can each
     * hold a full window and still share only a few bars (different calendars,
     * different sessions), so the floor is on the overlap, not on either series. */
    minPairs: 20,
    /* The macro anchor of each market: the series this market is conventionally
     * read against, tried in order. The reading names which one answered
     * (`against.symbol` and `against.source`), so a coefficient is never
     * silently measured against a fallback. */
    anchors: Object.freeze({
        crypto: Object.freeze(["USDTWI", "XAUUSD"]),
        forex: Object.freeze(["USDTWI", "XAUUSD"]),
        commodities: Object.freeze(["USDTWI", "XAUUSD"]),
        indices: Object.freeze(["US10Y", "XAUUSD"]),
        bonds: Object.freeze(["SPX", "XAUUSD"]),
        realestatecredit: Object.freeze(["US10Y", "SPX"])
    }),
    /* …and the chain used when the frame named no market at all. */
    defaultAnchors: Object.freeze(["USDTWI", "XAUUSD", "SPX", "US10Y"]),
    /* The benchmark a market's relative strength is read against. Only the
     * markets that have one are listed: relative strength compares two tradable
     * series, so it is stated per market instead of assumed for every market. */
    benchmark: Object.freeze({
        crypto: "BTCUSDT"
    }),
    /* Leverage-risk scales. Every part is scored between 0 and its weight, from
     * the size of a DEVIATION — not from a level — because a level is not a risk:
     *   funding      |annualized rate|        0.3 = 30 % a year
     *   openInterest |percent change|         over the module's change window
     *   positioning  |ln(long/short ratio)|   ln 2 = twice as many accounts on
     *                                         one side as on the other
     *   liquidations |longShare − 0.5|        0.5 = every forced order was long
     * A part is full at its threshold and empty at zero, and nothing is
     * extrapolated past the threshold — an extreme funding rate cannot hide three
     * missing parts. */
    leverage: Object.freeze({
        weights: Object.freeze({ openInterest: 25, funding: 30, positioning: 20, liquidations: 25 }),
        thresholds: Object.freeze({
            fundingAnnualized: 0.3,
            openInterestChangePct: 10,
            positioningLogRatio: Math.log(2),
            liquidationSkew: 0.5
        }),
        /* The bands the ratio (the score ÷ the scale the parts that answered
         * could reach) is read in. Named here so a consumer can disagree with
         * the wording rather than with the number. */
        bands: Object.freeze([
            Object.freeze({ upTo: 0.25, label: "low" }),
            Object.freeze({ upTo: 0.5, label: "moderate" }),
            Object.freeze({ upTo: 0.75, label: "elevated" }),
            Object.freeze({ upTo: 1, label: "high" })
        ])
    })
});

/** The markets whose bars are read here, spelled the way the collector spells them. */
const ASSET_CLASS_LABELS = Object.freeze(["crypto", "forex", "commodities", "indices", "bonds", "realestatecredit", "equities"]);

/* ------------------------------------------------------------
 * Pure helpers — the arithmetic, driven directly by the tests
 * ---------------------------------------------------------- */

/** The bars of a series, indexed by their own open time. */
function barsByOpenTime(bars) {
    const index = new Map();
    for (const bar of bars) index.set(bar.openTime, bar);
    return index;
}

/** close ÷ previous close − 1, or null when either close is not a price. */
function returnOf(close, previousClose) {
    const now = math.positive(close);
    const before = math.positive(previousClose);
    if (now === null || before === null) return null;
    return now / before - 1;
}

/**
 * The return pairs two series share — the only input a correlation on bars may
 * be measured from.
 *
 * The pairs are found by the bars' own open times, never by their position in
 * the series, and a pair is kept only when BOTH series hold a bar at both ends
 * of the move and each move is exactly one interval long. So a return never
 * spans a hole in either series, and a series that skipped a day is never
 * stretched to fit its peer's day. What was dropped is counted rather than
 * hidden: `missing` for a bar the other side never answered for, `gaps` for a
 * move that would have spanned a hole in the subject's own series.
 *
 * @param {object[]} barsA      subject bars, oldest first
 * @param {object[]} barsB      peer bars, oldest first
 * @param {number}   intervalMs the interval a move must be exactly one of
 * @returns {{pairs: object[], missing: number, gaps: number, from: number|null, to: number|null}}
 */
function alignReturns(barsA, barsB, intervalMs) {
    const own = Array.isArray(barsA) ? barsA : [];
    const index = barsByOpenTime(Array.isArray(barsB) ? barsB : []);
    const interval = math.positive(intervalMs);
    const pairs = [];
    let missing = 0;
    let gaps = 0;

    for (let at = 1; at < own.length; at += 1) {
        const previous = own[at - 1];
        const bar = own[at];

        /* A move that spans more than one interval is not this timeframe's move. */
        if (interval === null || bar.openTime - previous.openTime !== interval) {
            gaps += 1;
            continue;
        }

        const peerPrevious = index.get(previous.openTime);
        const peer = index.get(bar.openTime);
        if (!peerPrevious || !peer) {
            missing += 1;
            continue;
        }

        const a = returnOf(bar.close, previous.close);
        const b = returnOf(peer.close, peerPrevious.close);
        if (a === null || b === null) {
            missing += 1;
            continue;
        }

        pairs.push(Object.freeze({
            openTime: previous.openTime,
            closeTime: bar.closeTime,
            a,
            b,
            close: bar.close,
            peerClose: peer.close
        }));
    }

    return Object.freeze({
        pairs: Object.freeze(pairs),
        missing,
        gaps,
        from: pairs.length ? pairs[0].openTime : null,
        to: pairs.length ? pairs[pairs.length - 1].closeTime : null
    });
}

/**
 * One series' move over a window the other series shares: the newest close
 * inside the window against the oldest close inside it — never against a bar
 * outside the window, and never against a bar of another series.
 *
 * @returns {object|null} null when the window holds fewer than two closes
 */
function windowReturn(bars, { from, to } = {}) {
    const usable = (Array.isArray(bars) ? bars : []).filter((bar) => bar.openTime >= from && bar.openTime <= to);
    if (usable.length < 2) return null;

    const first = usable[0];
    const last = usable[usable.length - 1];
    const change = returnOf(last.close, first.close);
    if (change === null) return null;

    return Object.freeze({
        /* The same span that was asked about: the oldest bar's open time to the
         * newest bar's close time, so this window and the pair window above it are
         * spoken of the same way. */
        from: first.openTime,
        to: last.closeTime,
        bars: usable.length,
        first: first.close,
        last: last.close,
        high: Math.max(...usable.map((bar) => bar.high)),
        low: Math.min(...usable.map((bar) => bar.low)),
        changePct: change * 100
    });
}

/** |value| ÷ threshold, capped at 1 — null when either is not a number. */
function share(value, threshold) {
    const parsed = math.finite(value);
    const full = math.positive(threshold);
    if (parsed === null || full === null) return null;
    return Math.min(1, Math.abs(parsed) / full);
}

/** The band a ratio falls in, from the module's own band table. */
function bandOf(ratio, bands = DEFAULTS.leverage.bands) {
    const value = math.finite(ratio);
    if (value === null) return null;
    for (const entry of bands) {
        if (value <= entry.upTo) return entry.label;
    }
    return null;
}

/**
 * "usdtwi" / " USDTWI " → "USDTWI"; anything unusable is left out. A single
 * symbol is read as a chain of one — an anchor table may say either.
 */
function chainOf(symbols) {
    const out = [];
    const list = Array.isArray(symbols)
        ? symbols
        : (symbols === null || symbols === undefined ? [] : [symbols]);

    for (const symbol of list) {
        const name = normalizeSymbol(symbol);
        if (name && !out.includes(name)) out.push(name);
    }
    return Object.freeze(out);
}

/** { crypto: ["a", "b"], … } → { crypto: ["A", "B"], … }, frozen. */
function chainsOf(chains) {
    const out = {};
    for (const [market, symbols] of Object.entries(chains && typeof chains === "object" ? chains : {})) {
        const key = String(market).trim().toLowerCase();
        if (!key) continue;
        out[key] = chainOf(symbols);
    }
    return Object.freeze(out);
}

/**
 * The spellings of a market this module accepts beyond the collector's own:
 * a data source may write real_estate_credit where the collector writes
 * realestatecredit, and neither spelling is a market this module invents.
 */
const ASSET_CLASS_ALIASES = Object.freeze({
    real_estate_credit: "realestatecredit",
    realestate: "realestatecredit",
    real_estate: "realestatecredit",
    realestate_credit: "realestatecredit",
    real_estate_credits: "realestatecredit",
    index: "indices",
    commodity: "commodities",
    commodities_index: "commodities",
    bond: "bonds",
    equity: "equities",
    stocks: "equities",
    stock: "equities"
});

/**
 * A frame's assetClass → one of the markets this module reads, or null.
 *
 * null is not "crypto": a frame that named no market (or a market this module
 * does not read) is read against the DEFAULT anchor chain, and the reading says
 * which anchor answered — a series is never quietly filed under a market the
 * frame never claimed.
 *
 * @param {*} value
 * @returns {string|null}
 */
function assetClassOf(value) {
    const raw = String(value === null || value === undefined ? "" : value).trim().toLowerCase();
    if (!raw) return null;

    const key = raw.replace(/[\s-]+/g, "_");
    const alias = ASSET_CLASS_ALIASES[key];
    if (alias !== undefined) return alias;

    return ASSET_CLASS_LABELS.includes(key) ? key : null;
}

/* ------------------------------------------------------------
 * The module
 * ---------------------------------------------------------- */

/**
 * The cross-market layer of one engine: it reads the same closed bars every bar
 * layer reads — core/bars.cjs rings one series per (symbol, timeframe) — and
 * answers about PAIRS of them. Ingestion, the rings, the per-timeframe edge and
 * the status view are the shared layer's; what this class adds is the pair
 * arithmetic and the readings a pair can produce.
 */
class CrossMarketAnalytics extends BarSeries {
    /**
     * @param {object}   [options]
     * @param {Function} [options.now]             clock (tests inject a fake)
     * @param {string[]} [options.timeframes]      served timeframes (default: the topic list)
     * @param {number}   [options.maxBars]         ring capacity per (symbol, timeframe)
     * @param {number}   [options.maxInstruments]  cap on tracked symbols
     * @param {number}   [options.minBars]         bars each side of a pair needs
     * @param {number}   [options.minPairs]        return pairs a coefficient needs
     * @param {object}   [options.anchors]         market → anchor chain (macro view)
     * @param {string[]} [options.defaultAnchors]  chain used when the market is unknown
     * @param {object}   [options.benchmark]       market → relative-strength benchmark
     * @param {object}   [options.leverage]        weights, thresholds and bands
     */
    constructor({
        now = Date.now,
        timeframes = CROSS_MARKET_TIMEFRAMES,
        maxBars,
        maxInstruments,
        minBars = DEFAULTS.minBars,
        minPairs = DEFAULTS.minPairs,
        anchors = DEFAULTS.anchors,
        defaultAnchors = DEFAULTS.defaultAnchors,
        benchmark = DEFAULTS.benchmark,
        leverage = DEFAULTS.leverage
    } = {}) {
        const pairFloor = Math.max(2, Math.floor(math.positive(minPairs) || DEFAULTS.minPairs));
        /* Two bars make one return, so a series needs one bar more than there are
         * pairs to measure over; a floor below that would demand a coefficient the
         * window cannot hold. The correction is stated, not silent. */
        const floor = pairFloor + 1;
        const requested = math.positive(minBars);
        const warnings = [];
        let windowBars = requested === null ? DEFAULTS.minBars : Math.floor(requested);
        if (windowBars < floor) {
            warnings.push(`minBars ${windowBars} cannot hold ${pairFloor} return pairs: raised to ${floor}`);
            windowBars = floor;
        }

        super({ now, timeframes, maxBars, maxInstruments, minBars: windowBars });

        this.minPairs = pairFloor;
        this.anchors = chainsOf(anchors);
        this.defaultAnchors = chainOf(defaultAnchors);
        this.benchmarks = chainsOf(benchmark);
        this.leverage = Object.freeze({
            weights: Object.freeze({ ...DEFAULTS.leverage.weights, ...(leverage && leverage.weights ? leverage.weights : {}) }),
            thresholds: Object.freeze({ ...DEFAULTS.leverage.thresholds, ...(leverage && leverage.thresholds ? leverage.thresholds : {}) }),
            bands: Object.freeze(Array.isArray(leverage && leverage.bands) ? leverage.bands : DEFAULTS.leverage.bands)
        });
        this.params = Object.freeze({
            minBars: this.minBars,
            minPairs: this.minPairs,
            returns: "simple (close ÷ previous close − 1)",
            anchors: this.anchors,
            defaultAnchors: this.defaultAnchors,
            benchmark: this.benchmarks,
            leverage: this.leverage
        });

        /* The market each series belongs to, as the frames named it: "which
         * benchmark answers for this series" is a question about the market, and
         * the shared layer (which is about bars) does not keep it. */
        this.classes = new Map();          // SYMBOL → assetClass
        /* The edge map of the SECOND reading a route publishes on one closed bar
         * (`relative_strength_<tf>`): the shared layer's map belongs to the
         * correlation, and one bar closes once but yields two readings. */
        this.relativeEmitted = new Map();

        /* The module's own accounting, next to the shared layer's. */
        this.counters.correlations = 0;    // macro-correlation readings produced
        this.counters.relative = 0;        // relative-strength readings produced
        this.counters.leverage = 0;        // leverage readings produced
        this.counters.unanchored = 0;      // no anchor of this market had enough bars
        this.counters.unaligned = 0;       // the two series do not answer for one bar
        this.counters.flat = 0;            // a window without movement → no coefficient
        this.counters.notComparable = 0;   // this market has no relative benchmark
        this.counters.sameSymbol = 0;      // a series asked about itself
        this.counters.notAMarket = 0;      // no bar was ever seen for this symbol
        this.counters.unmeasured = 0;      // leverage: nothing measurable behind it
        this.counters.remapped = 0;        // a series seen later under a second market
        this.counters.relativePublished = 0; // relative readings published as an edge

        this.warnings = Object.freeze(warnings);
    }

    /* ------------------------------------------------------------
     * Ingestion — the bars, plus the one thing the shared layer does
     * not keep: the market each series belongs to
     * ---------------------------------------------------------- */

    /**
     * One candle frame in.
     *
     * The shared layer rings the bar — or counts why it cannot — and this layer
     * records the market the frame named, because the anchor a series is read
     * against is a property of its MARKET and not of its bars, and core/bars.cjs
     * is about bars only. The market of a series is learned once: a later frame
     * naming another one is counted (`remapped`), never silently moved into
     * another market's anchor chain.
     *
     * @param {object} [sample] the frame, as the router built it (frameOfCandle)
     * @returns {object[]} the bars this frame closed, oldest first (shared layer)
     */
    ingestCandle(sample = {}) {
        const name = normalizeSymbol(sample.symbol);
        const market = assetClassOf(sample.assetClass);

        if (name && market) {
            const known = this.classes.get(name);
            if (known === undefined) this.classes.set(name, market);
            else if (known !== market) this.counters.remapped += 1;
        }

        return super.ingestCandle(sample);
    }

    /** The market a series was first seen under, as this module spells it. */
    marketOf(symbol) {
        const name = normalizeSymbol(symbol);
        return name === null ? null : (this.classes.get(name) || null);
    }

    /**
     * The anchors of a series, in order: its market's own chain, or the default
     * one when the frame never named a market (or named one this module does not
     * read). Which candidate answered is named in the reading itself, so a
     * coefficient is never quietly measured against a fallback.
     */
    chainFor(symbol) {
        const market = this.marketOf(symbol);
        const chain = market === null ? null : this.anchors[market];
        return chain && chain.length ? chain : this.defaultAnchors;
    }

    /* ------------------------------------------------------------
     * Readings — what a consumer sees
     * ---------------------------------------------------------- */

    /**
     * The macro reading of one (symbol, timeframe): how much this series and the
     * macro anchor of its market moved together over the bars BOTH answered.
     *
     * The coefficient is measured on return pairs the alignment could actually
     * form — by open time, one interval each, both sides present — so a two-day
     * move is never read as a daily move and a bar one side never sent is never
     * filled in. The reading names the anchor that answered, the span it covers,
     * how many moves it was measured over, and what the alignment had to drop
     * (`missing`, `gaps`). null — never 0 — when there is nothing honest to say.
     *
     * @param {string}        symbol
     * @param {string|number} timeframe   "15m" / 900000, however spelled
     * @returns {object|null}
     */
    reading(symbol, timeframe) {
        const name = normalizeSymbol(symbol);
        if (!name) return null;

        const label = timeframeKey(this.timeframes, timeframe);
        if (!label) return null;

        const ring = this.rings.get(`${name}|${label}`);
        /* A symbol no frame has ever carried: not a series this layer holds, and
         * not a window that was too short either. */
        if (!this.symbols.has(name)) {
            this.counters.notAMarket += 1;
            return null;
        }

        if (!ring || ring.count < this.minBars) {
            this.counters.insufficient += 1;
            return null;
        }

        const bars = ring.bars();
        const intervalMs = this.timeframes[label];
        const chain = this.chainFor(name);
        let considered = 0;

        for (const candidate of chain) {
            if (candidate === name) {
                /* A series correlated with itself is 1 by arithmetic and a
                 * finding by nobody. */
                this.counters.sameSymbol += 1;
                continue;
            }

            const peer = this.rings.get(`${candidate}|${label}`);
            if (!peer || peer.count < this.minBars) continue;
            considered += 1;

            const aligned = alignReturns(bars, peer.bars(), intervalMs);
            /* A reading about one afternoon is not a macro reading: the floor is
             * on the OVERLAP, because two series can each be full and still share
             * few bars (different sessions, different calendars). */
            if (aligned.pairs.length < this.minPairs) {
                this.counters.insufficient += 1;
                continue;
            }

            /* Both sides must answer for the NEWEST bar: a fresh window against a
             * stale one is the one mistake that looks like a finding. */
            if (peer.newestOpenTime !== ring.newestOpenTime) {
                this.counters.unaligned += 1;
                continue;
            }

            const coefficient = math.pearson(
                aligned.pairs.map((pair) => pair.a),
                aligned.pairs.map((pair) => pair.b),
                { minSamples: this.minPairs }
            );
            /* At the floor and still no coefficient: a window without movement has
             * no direction to correlate (math.pearson's zero variance), and 0
             * would claim it had one. */
            if (coefficient === null) {
                this.counters.flat += 1;
                continue;
            }

            return this.correlationReading({ symbol: name, timeframe: label, ring, peer, candidate, chain, aligned, coefficient, intervalMs });
        }

        /* Not one candidate of this market held the bars at all — as opposed to
         * held them and disagreed about the newest one (counted above). */
        if (considered === 0) this.counters.unanchored += 1;
        return null;
    }

    /**
     * The payload of one correlation — built in one place, so the reading and its
     * accounting are written together.
     *
     * The bar the reading ends on is carried whole (the same bar the other layers
     * read), because a coefficient a consumer cannot trace back to the candles it
     * was measured from is a number to be trusted instead of checked.
     */
    correlationReading({ symbol, timeframe, ring, peer, candidate, chain, aligned, coefficient, intervalMs }) {
        const bar = ring.last();
        const at = this.now();
        const firstPair = aligned.pairs[0];
        const lastPair = aligned.pairs[aligned.pairs.length - 1];
        this.counters.readings += 1;
        this.counters.correlations += 1;

        return Object.freeze({
            symbol,
            timeframe,
            interval: intervalMs,
            at,
            bar,
            openTime: bar.openTime,
            closeTime: bar.closeTime,
            /* How long the newest bar had been closed when the reading was taken:
             * a fresh reading and a replayed one are told apart without trusting
             * the consumer's own clock. */
            barAge: Math.max(0, at - bar.closeTime),
            price: bar.close,
            /* What was measured, and against what. The whole anchor chain is named
             * too, so a consumer sees what this market would have been read
             * against had the first candidate stayed silent. */
            against: Object.freeze({
                symbol: candidate,
                assetClass: this.marketOf(candidate),
                source: peer.source,
                bars: peer.count,
                newestOpenTime: peer.newestOpenTime,
                anchors: chain
            }),
            coefficient,
            /* How many moves it was measured over, and what the alignment had to
             * drop to get there. */
            samples: aligned.pairs.length,
            missing: aligned.missing,
            gaps: aligned.gaps,
            pairWindow: Object.freeze({
                from: firstPair.openTime,
                to: lastPair.closeTime,
                intervalMs
            }),
            /* The newest move of both sides — the pair the coefficient ends on,
             * spelled out so it can be checked by hand. */
            latest: Object.freeze({
                openTime: lastPair.openTime,
                closeTime: lastPair.closeTime,
                subject: lastPair.a,
                peer: lastPair.b
            }),
            method: "pearson on simple returns, pairwise-complete",
            params: this.params,
            series: ring.stats()
        });
    }

    /* ------------------------------------------------------------
     * Relative strength — the same market, against its own benchmark
     * ---------------------------------------------------------- */

    /**
     * The relative reading of one (symbol, timeframe): how this series did against
     * the benchmark of its own market, over the bars BOTH answered.
     *
     * The headline is the gap between the two series' own returns across the
     * aligned span — first close to last close, inside the window both answered —
     * so it never compares a market's week with a benchmark's afternoon. Both
     * windows are carried in full (first/last bar, closes, change), and the
     * reading states that it is a comparison of two price series and NOT a share
     * of anything: no total was ever measured here.
     *
     * @param {string}        symbol
     * @param {string|number} timeframe
     * @returns {object|null}
     */
    relativeStrength(symbol, timeframe) {
        const name = normalizeSymbol(symbol);
        if (!name) return null;

        const label = timeframeKey(this.timeframes, timeframe);
        if (!label) return null;

        const ring = this.rings.get(`${name}|${label}`);
        /* The same rule as the correlation: a symbol no frame ever carried is not
         * a market this layer can compare anything of. */
        if (!this.symbols.has(name)) {
            this.counters.notAMarket += 1;
            return null;
        }

        if (!ring || ring.count < this.minBars) {
            this.counters.insufficient += 1;
            return null;
        }

        const market = this.marketOf(name);
        const benchmark = market === null ? null : (this.benchmarks[market] || [])[0] || null;

        /* A market this module holds no benchmark for cannot be compared: there is
         * no "the rest of forex" among these six series, and inventing one would
         * be inventing the comparison. */
        if (benchmark === null) {
            this.counters.notComparable += 1;
            return null;
        }

        if (benchmark === name) {
            this.counters.sameSymbol += 1;
            return null;
        }

        const peer = this.rings.get(`${benchmark}|${label}`);
        if (!peer || peer.count < this.minBars) {
            this.counters.insufficient += 1;
            return null;
        }

        const intervalMs = this.timeframes[label];
        const aligned = alignReturns(ring.bars(), peer.bars(), intervalMs);
        if (aligned.pairs.length < this.minPairs) {
            this.counters.insufficient += 1;
            return null;
        }

        /* The same rule as the correlation, deliberately: both sides must answer
         * for the NEWEST bar, or the two readings of one bar would be describing
         * two different bars. */
        if (peer.newestOpenTime !== ring.newestOpenTime) {
            this.counters.unaligned += 1;
            return null;
        }

        /* The window is the span the two series actually share — between the first
         * and the last bar both answered — and each side's return is measured over
         * that span, on its own closes. */
        const window = Object.freeze({
            from: aligned.pairs[0].openTime,
            to: aligned.pairs[aligned.pairs.length - 1].closeTime
        });

        const subjectWindow = windowReturn(ring.bars(), window);
        const benchmarkWindow = windowReturn(peer.bars(), window);
        if (subjectWindow === null || benchmarkWindow === null) {
            this.counters.insufficient += 1;
            return null;
        }

        return this.relativeReading({
            symbol: name,
            timeframe: label,
            ring,
            peer,
            bar: ring.last(),
            market,
            benchmark,
            aligned,
            intervalMs,
            window,
            subjectWindow,
            benchmarkWindow
        });
    }

    /**
     * The payload of one relative reading.
     *
     * Two honest ways of asking "did it do better", both stated: `spreadPct` in
     * percentage points (4 % against 1 % is +3) and `ratio` in units of the
     * benchmark's own move ((1 + a) / (1 + b) - 1). Neither is a market share, and
     * the reading says so itself with `dominance: false` — a share of what was
     * never measured would be a claim about the whole.
     */
    relativeReading({ symbol, timeframe, ring, peer, bar, market, benchmark, aligned, intervalMs, window, subjectWindow, benchmarkWindow }) {
        const at = this.now();
        this.counters.readings += 1;
        this.counters.relative += 1;

        const spreadPct = subjectWindow.changePct - benchmarkWindow.changePct;
        /* The benchmark's own gross return: strictly positive, because a close of
         * zero is not a price and windowReturn would have refused it. */
        const gross = 1 + benchmarkWindow.changePct / 100;
        const ratio = gross === 0 ? null : (1 + subjectWindow.changePct / 100) / gross - 1;

        return Object.freeze({
            symbol,
            timeframe,
            interval: intervalMs,
            at,
            bar,
            openTime: bar.openTime,
            closeTime: bar.closeTime,
            barAge: Math.max(0, at - bar.closeTime),
            price: bar.close,
            /* A comparison of two price series, not a share of a market. */
            dominance: false,
            market,
            benchmark: Object.freeze({
                symbol: benchmark,
                assetClass: this.marketOf(benchmark),
                source: peer.source,
                bars: peer.count,
                newestOpenTime: peer.newestOpenTime
            }),
            subjectWindow,
            benchmarkWindow,
            /* Percentage points ahead of the benchmark — and null when the span was
             * too short to measure either side. */
            spreadPct,
            /* The same question as a ratio: how much better it did, in units of the
             * benchmark's own move. */
            ratio,
            /* The moves both series answered, which is what the two returns above
             * were measured across, and what the alignment had to drop. */
            pairs: aligned.pairs.length,
            missing: aligned.missing,
            gaps: aligned.gaps,
            window,
            method: "simple returns over the bars both series answered",
            params: this.params,
            series: ring.stats()
        });
    }

    /**
     * The relative reading, published once per closed bar — the second thing the
     * cross-market route answers, and the reason a frame that does not reach the
     * correlation floor can still be asked about.
     *
     * Same edge rule as the correlation: one reading per closed bar per series,
     * and a null reading leaves the edge unconsumed rather than swallowing the
     * bar. The counter is separate (`relativePublished`), because a bar that
     * produced a relative reading and no correlation is not a bar that produced
     * nothing.
     *
     * @param {string}        symbol
     * @param {string|number} timeframe
     * @returns {object|null}
     */
    relativePending(symbol, timeframe) {
        const name = normalizeSymbol(symbol);
        if (!name) return null;

        const label = timeframeKey(this.timeframes, timeframe);
        if (!label) return null;

        const key = `${name}|${label}`;
        const edge = this.edges.get(key);
        if (edge === undefined || this.relativeEmitted.get(key) === edge) return null;

        const reading = this.relativeStrength(name, label);
        if (!reading) return null;

        this.relativeEmitted.set(key, edge);
        this.counters.relativePublished += 1;
        return reading;
    }

    /* ------------------------------------------------------------
     * Leverage risk — a composition, and it says what it was made of
     * ---------------------------------------------------------- */

    /**
     * The four leverage measurements, scored — each against the size of its own
     * DEVIATION, never against a level: a market is not leveraged because funding
     * is positive, but because it is far from zero. A part is full at its
     * threshold and empty at zero, nothing is extrapolated past the threshold, and
     * a reading that cannot be scored (a ratio of zero has no logarithm) is not a
     * part at all.
     *
     * This module re-measures none of them: the values come in as the modules that
     * own them published them, and each part carries the value it came in as.
     *
     * @returns {{parts: object, present: string[], missing: string[], weights: object, thresholds: object}}
     */
    leverageParts({ openInterest = null, funding = null, positioning = null, liquidations = null } = {}) {
        const { weights, thresholds } = this.leverage;

        /* Open interest: how fast the position is being built or unwound, as the
         * flow module already measured it. */
        const change = openInterest && openInterest.change ? openInterest.change : null;
        const oiPercent = change ? math.finite(change.percent) : null;
        const oiShare = share(oiPercent, thresholds.openInterestChangePct);
        const openInterestPart = oiShare === null ? null : Object.freeze({
            value: oiPercent,
            unit: "percent change in open interest",
            windowMs: change ? math.positive(change.windowMs) : null,
            at: change ? math.finite(change.referenceAt) : null,
            share: oiShare,
            weight: weights.openInterest
        });

        /* Funding: distance from zero in either direction. A market paying 30 % a
         * year to stay long is a leveraged market however quiet its price is, and
         * a market paying 30 % to stay short is the same amount of it. */
        const weighted = funding ? math.finite(funding.weightedAnnualized) : null;
        const simple = funding ? math.finite(funding.simpleAnnualized) : null;
        const annualized = weighted === null ? simple : weighted;
        const fundingShare = share(annualized, thresholds.fundingAnnualized);
        const fundingPart = fundingShare === null ? null : Object.freeze({
            value: annualized,
            unit: "annualized funding rate",
            /* Which of the flow module's two means answered: they are not the same
             * measurement and they are not interchangeable. */
            basis: weighted === null ? "simple mean over venues" : "open-interest-weighted mean over venues",
            at: funding ? math.finite(funding.timestamp) : null,
            share: fundingShare,
            weight: weights.funding
        });

        /* Positioning: distance from balance, signed, so 2:1 and 1:2 are the same
         * amount of one-sidedness (ln 2 and −ln 2). A ratio of zero has no
         * logarithm, so it is not a part. */
        const ratio = positioning ? math.finite(positioning.ratio) : null;
        const logRatio = ratio === null || ratio <= 0 ? null : Math.log(ratio);
        const positioningShare = share(logRatio, thresholds.positioningLogRatio);
        const positioningPart = positioningShare === null ? null : Object.freeze({
            value: ratio,
            unit: "accounts long ÷ accounts short",
            logRatio,
            at: positioning ? math.finite(positioning.timestamp) : null,
            share: positioningShare,
            weight: weights.positioning
        });

        /* Liquidations: which side was forced out, and the notional it was printed
         * in. A washout is leverage being paid for. */
        const totals = liquidations && liquidations.totals ? liquidations.totals : null;
        const longShare = totals ? math.finite(totals.longShare) : null;
        const skew = longShare === null ? null : longShare - 0.5;
        const liquidationShare = share(skew, thresholds.liquidationSkew);
        const liquidationPart = liquidationShare === null ? null : Object.freeze({
            value: longShare,
            unit: "share of forced notional that was long",
            skew,
            notional: math.finite(totals.notional),
            windowMs: liquidations ? math.positive(liquidations.windowMs) : null,
            at: liquidations ? math.finite(liquidations.timestamp) : null,
            share: liquidationShare,
            weight: weights.liquidations
        });

        const parts = {
            openInterest: openInterestPart,
            funding: fundingPart,
            positioning: positioningPart,
            liquidations: liquidationPart
        };

        return {
            parts,
            present: Object.keys(parts).filter((key) => parts[key] !== null),
            missing: Object.keys(parts).filter((key) => parts[key] === null),
            weights,
            thresholds
        };
    }

    /**
     * The leverage-risk reading of one market: the weighted mean of the parts that
     * answered, and the parts that did not.
     *
     * The `score` is the sum of the points the parts earned (0 … 100 at the module's
     * own weights) and `max` is what they could have earned — so `ratio` is the
     * score against the scale that was actually reachable, and `band` is read off
     * that ratio, never off the absolute score. A market whose only reading is
     * funding is judged on funding, and the payload says so.
     *
     * null — with `unmeasured` counted — when nothing measurable came in: a score
     * from nothing would be a claim about the market.
     *
     * @param {object} [inputs] see leverageParts()
     * @returns {object|null}
     */
    leverageRisk(inputs = {}) {
        const name = normalizeSymbol(inputs.symbol);
        if (!name) return null;

        const { parts, present, missing, weights, thresholds } = this.leverageParts(inputs);
        if (present.length === 0) {
            this.counters.unmeasured += 1;
            return null;
        }

        let score = 0;
        let max = 0;
        for (const key of present) {
            score += parts[key].weight * parts[key].share;
            max += parts[key].weight;
        }

        const ratio = max === 0 ? null : score / max;
        this.counters.leverage += 1;

        return Object.freeze({
            symbol: name,
            at: this.now(),
            score,
            /* The score ÷ the scale the parts that ANSWERED could reach: a score
             * from two parts is never presented as a score from four. */
            ratio,
            max,
            band: bandOf(ratio, this.leverage.bands),
            parts: Object.freeze(parts),
            present: Object.freeze(present),
            missing: Object.freeze(missing),
            weights,
            thresholds,
            method: "weighted mean of the leverage measurements that answered",
            params: this.params
        });
    }

    /* ------------------------------------------------------------
     * The module's own state — for an operator, not for a chart
     * ---------------------------------------------------------- */

    /**
     * The module's own accounting: the timeframes it serves, the choices it reads
     * with, what it holds, which markets it has learned and what it refused. Not a
     * reading — readings speak about the market, this speaks about the module, and
     * the two are never mixed in one event.
     */
    stats() {
        return Object.freeze({
            timeframes: Object.freeze(Object.keys(this.timeframes)),
            intervals: Object.freeze({ ...this.timeframes }),
            params: this.params,
            bars: Object.freeze({ publish: this.minBars, pairs: this.minPairs, capacity: this.maxBars }),
            markets: Object.freeze({
                /* The markets learned, by name — the series that named them are
                 * counted separately, because one market carries many series. */
                learned: Object.freeze([...new Set(this.classes.values())].sort()),
                series: this.classes.size,
                anchors: this.anchors,
                defaultAnchors: this.defaultAnchors,
                benchmarks: this.benchmarks
            }),
            instruments: Object.freeze({ tracked: this.symbols.size, cap: this.maxInstruments }),
            state: Object.freeze(this.seriesState()),
            counters: Object.freeze({ ...this.counters }),
            warnings: this.warnings
        });
    }

    /**
     * The shared status view, plus the two things only this layer can answer about
     * a symbol: the market it was filed under (and the anchors that follow from it)
     * and the relative reading of each timeframe, next to the correlation.
     *
     * @returns {object|null} null for a symbol this module has never seen
     */
    snapshot(symbol) {
        const base = super.snapshot(symbol);
        if (!base) return null;

        const name = base.symbol;
        const market = this.marketOf(name);
        const timeframes = {};
        for (const [label, entry] of Object.entries(base.timeframes)) {
            timeframes[label] = Object.freeze({
                ...entry,
                /* null while there is no benchmark or not enough shared bars: the
                 * correlation in `entry.reading` may still be there. */
                relative: this.relativeStrength(name, label)
            });
        }

        return Object.freeze({
            symbol: name,
            at: base.at,
            market,
            anchors: this.chainFor(name),
            benchmark: market === null ? null : (this.benchmarks[market] || [])[0] || null,
            timeframes: Object.freeze(timeframes)
        });
    }

    /**
     * A coefficient is only ever the coefficient of the bars behind it: when those
     * bars are forgotten, so are the markets learned with them. The shared layer
     * calls this before the rings go, for one symbol or for every symbol.
     */
    clearModuleState(symbol = null) {
        if (symbol === null) {
            this.classes.clear();
            this.relativeEmitted.clear();
            return;
        }

        this.classes.delete(symbol);
        const prefix = `${symbol}|`;
        for (const key of [...this.relativeEmitted.keys()]) {
            if (key.startsWith(prefix)) this.relativeEmitted.delete(key);
        }
    }
}

module.exports = {
    CrossMarketAnalytics,
    barsByOpenTime,
    returnOf,
    alignReturns,
    windowReturn,
    share,
    bandOf,
    chainOf,
    chainsOf,
    assetClassOf,
    ASSET_CLASS_LABELS,
    ASSET_CLASS_ALIASES,
    DEFAULTS
};




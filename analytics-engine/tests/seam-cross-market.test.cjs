/**
 * A12 — Seam: two series on the bus → the cross-market layer → the pair topics
 * collector/crypto/realtime + collector/liquidity_6markets + analytics-engine
 * ============================================================
 * The cross-market module's own arithmetic is driven directly where a number has
 * to be written down by hand first (a coefficient counted out here is the only
 * thing that can check a coefficient). Everything else walks the path a pair
 * really takes: a candle frame on the Realtime event bus, through the router's
 * cross-market candle route — the very same frame and the very same builder the
 * indicator and the price-action layers are fed with — into ONE ring per
 * (symbol, timeframe), and out again as
 * analytics.<assetClass>.<asset>.macro_correlation_<tf>,
 * .relative_strength_<tf> and .market_leverage_risk.
 *
 * What it pins down, beyond "a reading came out":
 *
 *   1. one input frame, three bar-reading layers: the indicator layer, the
 *      price-action layer and the cross-market layer see the same sample and
 *      keep the same bar — never two bars out of one frame, and never one bar in
 *      two windows of the same layer
 *   2. the coefficient is Pearson over simple returns, checked against a mean /
 *      covariance count written out in this file: perfectly in step → +1,
 *      perfectly opposed → −1, a window with no movement → null (never 0)
 *   3. the alignment rules are the ones the module's header promises: pairwise-
 *      complete (a bar one side never sent is dropped and counted, never carried
 *      over), no return across a hole (`gaps`), both sides answering for the
 *      NEWEST bar (`unaligned`), and too few pairs → no coefficient at all
 *   4. the cadences are separate: a 1m pair publishes per closed minute, a 15m
 *      pair per closed quarter-hour, a 1d pair per closed day — each on its own
 *      topic, each measured over the moves of its own interval, and a duplicate
 *      frame publishes nothing at all
 *   5. a frame that is not a bar is refused and counted where it happened — no
 *      interval, an impossible bar, a missing price, an unfinished bar, a late
 *      bar — and so is a question that is not one: an unknown symbol, a timeframe
 *      this layer does not serve
 *   6. relative strength is a comparison, not a share (`dominance: false`): it
 *      refuses to compare a series with itself, it refuses a market with no
 *      benchmark, and its two windows are the span BOTH series answered
 *   7. the leverage reading is a composition and says what it was made of:
 *      `parts`, `present`, `missing` and the `max` scale the parts that answered
 *      could reach — and null, with `unmeasured` counted, when nothing answered
 *   8. the engine's own analytics traffic never comes back in as an input, and
 *      its reads around it (snapshot, stats, reset) keep working — including the
 *      markets the module learned and the second edge map behind
 *      relative_strength_<tf>, which must not outlive the bars it was read from
 *
 * Run: node analytics-engine/tests/seam-cross-market.test.cjs
 * ============================================================
 */
"use strict";

const assert = require("assert");
const path = require("node:path");

const {
    createEnvelope,
    ASSET_CLASS,
    SOURCE_TYPE,
    MARKET_TYPE
} = require(path.join(__dirname, "..", "..", "collector", "crypto", "common", "envelope.cjs"));
const { createEngine } = require(path.join(__dirname, "..", "engine.cjs"));
const { macroCorrelationEvent, relativeStrengthEvent } = require(path.join(__dirname, "..", "topics.cjs"));
const {
    CrossMarketAnalytics,
    alignReturns,
    windowReturn,
    chainOf,
    assetClassOf,
    DEFAULTS
} = require(path.join(__dirname, "..", "modules", "cross_market", "index.cjs"));

const MINUTE = 60_000;
const QUARTER = 15 * MINUTE;
const DAY = 86_400_000;
const START = Date.parse("2026-09-27T00:00:00.000Z");
const SERVED = ["1m", "15m", "1d"];

/* The one engine serves every market, so the market each series belongs to is
 * part of the fixture: a frame names it, exactly as the six-market layer does. */
const SUBJECT = "BTCUSDT";
const PEER = "USDTWI";
const GOLD = "XAUUSD";
const SPX = "SPX";
const ASSET = "btc";
const ASSET_OF = { [SUBJECT]: ASSET, [PEER]: "usdtwi", [GOLD]: "xau", [SPX]: "spx" };

let checks = 0;
const ok = (condition, message) => {
    assert.ok(condition, `A12: ${message}`);
    checks += 1;
};
const near = (left, right, message, tolerance = 1e-9) => {
    const same = typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= tolerance;
    assert.ok(same, `A12: ${message} (got ${left}, expected ${right})`);
    checks += 1;
};
/** The topic of one reading, spelled the way the module and the topics table spell it. */
const topicOf = (event, asset = ASSET, market = "crypto") => `analytics.${market}.${asset}.${event}`;
/** The publications of one topic, in order. */
const entriesOn = (published, topic) => published.filter((entry) => entry.topic === topic);
/** The reading inside one published analytics entry. */
const readingOf = (entry) => entry.envelope.payload;
/** The module's own counters, as a frozen snapshot of this moment. */
const countersOf = (engine) => engine.modules.crossMarket.stats().counters;

/* ------------------------------------------------------------
 * The bus, as the collector has it
 * ---------------------------------------------------------- */

/** EventBus double that mimics collector/crypto/realtime/core/event-bus.cjs. */
function fakeBus(clock) {
    const state = { taps: new Set(), history: [] };

    return {
        state,
        subscribe(fn) {
            state.taps.add(fn);
            return () => state.taps.delete(fn);
        },
        publish(entry, context = {}) {
            /* As the real bus has it: the event's own words win, the context is
             * the fallback (collector/crypto/realtime/core/event-bus.cjs). */
            const market = entry.market || context.market || null;
            const exchange = entry.exchange || context.exchange || null;
            const symbol = entry.symbol || context.symbol || null;
            const wrapped = {
                channel: [market, exchange, symbol, entry.event].join(":"),
                event: entry.event,
                market,
                exchange,
                symbol,
                at: clock(),
                payload: entry
            };

            state.history.push(wrapped);
            for (const tap of [...state.taps]) tap(wrapped);
            return wrapped;
        }
    };
}

/* ------------------------------------------------------------
 * Series — deterministic closes, carried as venue frames
 * ---------------------------------------------------------- */

const intervalMs = (interval) => (interval === "1d" ? DAY : interval === "15m" ? QUARTER : MINUTE);

/** The closes of a series built from a repeating pattern of moves. */
function closesFrom(pattern, count, start = 100) {
    const closes = [];
    let price = start;

    for (let index = 0; index < count; index += 1) {
        price *= pattern[index % pattern.length];
        closes.push(Math.round(price * 1e6) / 1e6);
    }
    return closes;
}

/** The moves of a series: simple returns, close ÷ previous close − 1. */
const returnsOf = (closes) => closes.slice(1).map((close, index) => close / closes[index] - 1);

/**
 * The frames of one series, one per close: bar i opens where bar i − 1 closed, on
 * the timeframe's own grid — a real candle frame, as a venue sends it.
 */
function framesOf(closes, { symbol, assetClass, interval }) {
    return closes.map((close, index) => {
        const open = index === 0 ? close : closes[index - 1];

        return {
            symbol,
            assetClass,
            interval,
            openTime: START + index * intervalMs(interval),
            open,
            high: Math.max(open, close) * 1.001,
            low: Math.min(open, close) * 0.999,
            close,
            volume: 10,
            isClosed: true
        };
    });
}

/**
 * Pearson's r, counted out here by hand — the means, the covariance and the two
 * spreads — so a coefficient out of the module is checked against arithmetic
 * rather than against itself.
 */
function handPearson(a, b) {
    const count = Math.min(a.length, b.length);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const meanA = mean(a.slice(0, count));
    const meanB = mean(b.slice(0, count));
    let covariance = 0;
    let spreadA = 0;
    let spreadB = 0;

    for (let index = 0; index < count; index += 1) {
        const da = a[index] - meanA;
        const db = b[index] - meanB;
        covariance += da * db;
        spreadA += da * da;
        spreadB += db * db;
    }
    return covariance / Math.sqrt(spreadA * spreadB);
}

/* A move pattern, its exact opposite (2 − p, so one series' return is minus the
 * other's to the last digit) and a mixture that is neither. */
const PATTERN = [1.01, 0.99, 1.02, 0.98, 1.005, 0.995, 1.015, 0.985];
const MIRROR = [0.99, 1.01, 0.98, 1.02, 0.995, 1.005, 0.985, 1.015];
const MIXED = [1.01, 0.985, 1.02, 0.99, 1.005, 0.995, 1.001, 1.01];

/** The defaults the module ships with, for the checks that must not move with this fixture. */
const SHIPPED = Object.freeze({ anchors: DEFAULTS.anchors, defaultAnchors: DEFAULTS.defaultAnchors, benchmark: DEFAULTS.benchmark });

/* ------------------------------------------------------------
 * The engine under test, wired to the bus it also publishes onto
 * ---------------------------------------------------------- */

function createHarness(crossMarket = {}) {
    let at = START;
    const bus = fakeBus(() => at);
    const published = [];

    const engine = createEngine({
        bus,
        now: () => at,
        /* Every published entry in order, with no ring buffer in the way. */
        sink: (entry) => published.push(entry),
        crossMarket: {
            timeframes: SERVED,
            minBars: 6,
            minPairs: 5,
            maxBars: 256,
            /* The anchors and the benchmarks of the fixture, stated here so the
             * pair each series is read against is this test's choice and not the
             * module's shipped table (which gets checks of its own below). */
            anchors: { crypto: PEER, commodities: SPX, indices: GOLD },
            defaultAnchors: [],
            benchmark: { crypto: PEER, commodities: SPX, indices: GOLD },
            ...crossMarket
        }
    });
    engine.attach(bus);

    /** A candle frame arrives when its bar closes: the bus stamps the entry then. */
    const arrivesAt = (openTime, interval) => {
        at = openTime + intervalMs(interval);
        return at;
    };

    /** A venue candle, published the way the realtime collector publishes it. */
    const publishCandle = (frame, { symbol = frame.symbol, assetClass = frame.assetClass, exchange = "binance" } = {}) => {
        arrivesAt(frame.openTime, frame.interval);

        const envelope = createEnvelope({
            assetClass,
            sourceType: SOURCE_TYPE.REALTIME,
            marketType: MARKET_TYPE.SPOT,
            exchange,
            symbol,
            eventType: "candle",
            data: frame,
            timestamp: frame.openTime
        });
        const entry = { event: "candle", market: "futures", exchange, symbol, envelope };

        return bus.publish(entry, { market: entry.market, exchange, symbol });
    };

    /**
     * A whole series, one frame per close. `skip` drops frames the way a venue's
     * own outage does — the series simply has no bar there, and nothing fills it
     * in for it.
     */
    const publishSeries = (closes, { symbol, assetClass, interval, skip = [] } = {}) => {
        const frames = framesOf(closes, { symbol, assetClass, interval });
        frames.forEach((frame, index) => {
            if (!skip.includes(index)) publishCandle(frame);
        });

        return frames.length - skip.length;
    };

    /** The clock moves on: not every frame that arrives is a candle. */
    const tick = (ms) => {
        at += ms;
        return at;
    };

    return { bus, engine, published, publishCandle, publishSeries, tick, clock: () => at };
}

/**
 * The two series of a pair, published the way two venues really report: bar by
 * bar, the peer first — so when the subject's bar closes, its peer has already
 * answered for that same bar. That is what makes a reading possible at every
 * closed bar, and what a single shared clock would have hidden.
 */
const publishPair = (harness, closesA, closesB, {
    interval,
    symbolA = SUBJECT,
    symbolB = PEER,
    assetClass = ASSET_CLASS.CRYPTO,
    assetClassA = assetClass,
    assetClassB = assetClass,
    skipA = [],
    skipB = []
} = {}) => {
    const framesA = framesOf(closesA, { symbol: symbolA, assetClass: assetClassA, interval });
    const framesB = framesOf(closesB, { symbol: symbolB, assetClass: assetClassB, interval });
    const length = Math.max(framesA.length, framesB.length);

    for (let index = 0; index < length; index += 1) {
        if (index < framesB.length && !skipB.includes(index)) harness.publishCandle(framesB[index]);
        if (index < framesA.length && !skipA.includes(index)) harness.publishCandle(framesA[index]);
    }

    return { subject: closesA, peer: closesB };
};

/* ------------------------------------------------------------
 * 1. One frame → three bar-reading layers, and one bar per window
 * ---------------------------------------------------------- */

function oneFrameThreeLayers() {
    const { engine, published, publishCandle } = createHarness();

    /* A single quarter-hour candle for gold, exactly as the venue sends it. */
    const frame = {
        symbol: GOLD,
        assetClass: ASSET_CLASS.COMMODITIES,
        interval: "15m",
        openTime: START,
        open: 2400,
        high: 2404,
        low: 2398,
        close: 2402,
        volume: 5,
        isClosed: true
    };
    publishCandle(frame);

    const mine = engine.modules.crossMarket.barsOf(GOLD, "15m");
    ok(Array.isArray(mine) && mine.length === 1, "the cross-market layer ringed the bar the frame carried");
    ok(mine[0].openTime === frame.openTime && mine[0].close === frame.close,
        "and it is the frame's own bar — the same open time and the same close");
    ok(engine.modules.crossMarket.barsOf(GOLD, "1m") === null,
        "one frame is one bar in one window: it was not also filed under a finer timeframe");

    const indicators = engine.modules.indicators.snapshot(GOLD).timeframes["15m"];
    const structure = engine.modules.priceAction.barsOf(GOLD, "15m");
    ok(indicators.series !== null && indicators.series.bars === 1 && indicators.series.from === mine[0].openTime,
        "the indicator layer holds the same bar (one bar, same open time)");
    ok(engine.modules.indicators.snapshot(GOLD).timeframes["1m"].series === null,
        "and it did not file the same frame under a finer timeframe either");
    ok(Array.isArray(structure) && structure.length === 1 && structure[0].openTime === mine[0].openTime,
        "and the price-action layer holds it too (same open time)");
    const held = engine.modules.crossMarket.stats().state;
    ok(held.rings.native === 1 && held.bars === 1 && engine.modules.crossMarket.barsOf(GOLD, "1d") === null,
        "and the layer holds it exactly once: one native window with one bar, the daily bucket it also feeds still empty");

    /* One bar is not a pair: nothing can be read yet, and nothing is published. */
    ok(published.length === 0, "not one topic from a single bar: there is no second series to read it against");

    const asked = countersOf(engine).insufficient;
    ok(engine.modules.crossMarket.reading(GOLD, "15m") === null,
        "asking anyway answers null — a coefficient here would be arithmetic about nothing");
    ok(countersOf(engine).insufficient === asked + 1,
        "and the module counts the refusal instead of guessing one");

    /* Another market's bar is another bucket: same frame shape, same answer. */
    publishCandle({
        symbol: SPX,
        assetClass: ASSET_CLASS.INDICES,
        interval: "15m",
        openTime: START + QUARTER,
        open: 5000,
        high: 5005,
        low: 4995,
        close: 5001,
        volume: 7,
        isClosed: true
    });
    ok(engine.modules.crossMarket.barsOf(SPX, "15m").length === 1
        && engine.modules.crossMarket.barsOf(GOLD, "15m").length === 1,
        "each symbol keeps its own window: one series never inherits another's bars");
    ok(engine.modules.crossMarket.marketOf(SPX) === "indices" && engine.modules.crossMarket.marketOf(GOLD) === "commodities",
        "and each bar kept the market its own frame named");
}

/* ------------------------------------------------------------
 * 2. The coefficient is Pearson, counted out by hand
 * ---------------------------------------------------------- */

function correlationIsCountedByHand() {
    const closes = closesFrom(PATTERN, 12);
    const mixedCloses = closesFrom(MIXED, 12);

    /* The same pair in step. */
    const inStep = createHarness();
    publishPair(inStep, closes, closes, { interval: "1m" });
    const same = inStep.engine.modules.crossMarket.reading(SUBJECT, "1m");

    ok(same !== null, "twelve bars of a pair are enough to read");
    near(same.coefficient, 1, "one series against its identical twin is +1");
    near(same.coefficient, handPearson(returnsOf(closes), returnsOf(closes)),
        "…which is exactly what the hand count gives");

    ok(same.symbol === SUBJECT && same.timeframe === "1m" && same.interval === MINUTE,
        "the reading names the series, the timeframe and the interval it was measured on");
    ok(same.samples === closes.length - 1 && same.missing === 0 && same.gaps === 0,
        `twelve bars are eleven moves and all of them were shared (${same.samples})`);
    ok(same.against.symbol === PEER && same.against.assetClass === "crypto" && same.against.anchors.join(",") === PEER,
        "and it names the anchor that answered, out of the chain its own market carries");
    ok(same.against.bars === closes.length
        && same.against.newestOpenTime === START + (closes.length - 1) * MINUTE,
        "the peer it answered with is the peer's own newest bar");
    ok(same.bar.openTime === same.openTime && same.price === same.bar.close && same.barAge >= 0,
        "the bar the reading ends on is carried whole, stamped with how old it already was");
    ok(same.pairWindow.from === START && same.pairWindow.to === START + (closes.length - 1) * MINUTE + MINUTE - 1,
        "and the window it was measured over is the span of those moves");
    ok(Object.isFrozen(same) && Object.isFrozen(same.against) && Object.isFrozen(same.latest),
        "a reading is frozen all the way down: a consumer can hold it, not change it");

    /* The same pair, exactly opposed. */
    const opposed = createHarness();
    const mirrorCloses = closesFrom(MIRROR, 12);
    publishPair(opposed, closes, mirrorCloses, { interval: "1m" });
    const against = opposed.engine.modules.crossMarket.reading(SUBJECT, "1m");

    ok(against !== null, "the opposed pair is read too");
    near(against.coefficient, -1, "a series against its exact opposite is −1");
    ok(against.samples === same.samples, "over the same eleven shared moves");

    /* …and a pair that is neither. */
    const mixed = createHarness();
    publishPair(mixed, closes, mixedCloses, { interval: "1m" });
    const partial = mixed.engine.modules.crossMarket.reading(SUBJECT, "1m");

    near(partial.coefficient, handPearson(returnsOf(closes), returnsOf(mixedCloses)),
        "a mixed pattern gives the coefficient the hand count gives");
    ok(partial.coefficient > -1 && partial.coefficient < 1,
        "and it is neither of the two certainties — the arithmetic was not rounded into one");
}

/* ------------------------------------------------------------
 * 3. The alignment rules, checked where they can be broken
 * ---------------------------------------------------------- */

function alignmentIsHonest() {
    const closes = closesFrom(PATTERN, 12);
    const flatCloses = closesFrom([1], 12);

    /* A window with no movement at all: 0 would claim "no relationship" where the
     * truth is "no measurement". */
    const flat = createHarness();
    publishPair(flat, flatCloses, closes, { interval: "1m" });
    const flatBefore = countersOf(flat.engine).flat;
    ok(flat.engine.modules.crossMarket.reading(SUBJECT, "1m") === null,
        "a subject that did not move anywhere has no coefficient");
    ok(countersOf(flat.engine).flat === flatBefore + 1,
        "and the window is counted as flat, not published as a zero correlation");

    /* Below the floor on either side. */
    const short = createHarness();
    publishPair(short, closesFrom(PATTERN, 5), closesFrom(PATTERN, 5), { interval: "1m" });
    const shortBefore = countersOf(short.engine).insufficient;
    ok(short.engine.modules.crossMarket.reading(SUBJECT, "1m") === null,
        "five bars is below the floor the module reads at");
    ok(countersOf(short.engine).insufficient === shortBefore + 1,
        "and the refusal is counted, not estimated");

    /* A bar the peer never sent: the moves that needed it are dropped. */
    const holed = createHarness();
    publishPair(holed, closes, closes, { interval: "1m", skipB: [7] });
    const missing = holed.engine.modules.crossMarket.reading(SUBJECT, "1m");

    ok(missing !== null, "the pair is still read around the peer's missing bar");
    ok(missing.missing === 2 && missing.samples === closes.length - 1 - 2,
        `the two moves that needed that bar are gone, not filled in (missing ${missing.missing}, samples ${missing.samples})`);
    ok(missing.gaps === 0, "and the subject's own series stayed consecutive throughout");

    /* A bar the SUBJECT never sent: no return may span the hole. */
    const ownHole = createHarness();
    ownHole.publishSeries(closes, { symbol: SUBJECT, assetClass: ASSET_CLASS.CRYPTO, interval: "1m", skip: [5] });
    ownHole.publishSeries(closes, { symbol: PEER, assetClass: ASSET_CLASS.CRYPTO, interval: "1m" });
    const across = ownHole.engine.modules.crossMarket.reading(SUBJECT, "1m");

    ok(across !== null && across.gaps === 1 && across.samples === 9,
        `the move that would have spanned the subject's own hole is a gap, not a two-minute move (gaps ${across.gaps}, samples ${across.samples})`);
    ok(across.missing === 0, "the peer answered for every bar of the moves that were kept");

    /* Both sides must answer for the NEWEST bar: a fresh window against a stale
     * one is the one mistake that looks like a finding. */
    const stale = createHarness();
    publishPair(stale, closes, closes, { interval: "1m" });
    ok(stale.engine.modules.crossMarket.reading(SUBJECT, "1m") !== null, "with both sides on one bar there is a reading");

    stale.publishCandle({
        symbol: SUBJECT,
        assetClass: ASSET_CLASS.CRYPTO,
        interval: "1m",
        openTime: START + closes.length * MINUTE,
        open: closes[closes.length - 1],
        high: closes[closes.length - 1] * 1.01,
        low: closes[closes.length - 1] * 0.99,
        close: closes[closes.length - 1] * 1.004,
        volume: 1,
        isClosed: true
    });
    const staleBefore = countersOf(stale.engine).unaligned;
    ok(stale.engine.modules.crossMarket.reading(SUBJECT, "1m") === null,
        "one more subject bar and no peer bar: the pair is refused rather than read across two windows");
    ok(countersOf(stale.engine).unaligned === staleBefore + 1,
        "and the misalignment is counted where it happened");

    /* The alignment itself, driven directly — a window written down by hand. */
    const barsA = [0, 1, 2, 3].map((index) => ({ openTime: index * 1000, closeTime: index * 1000 + 999, close: 100 + index }));
    const barsB = [0, 2, 3].map((index) => ({ openTime: index * 1000, closeTime: index * 1000 + 999, close: 200 + index }));
    const aligned = alignReturns(barsA, barsB, 1000);

    ok(aligned.pairs.length === 1 && aligned.missing === 2 && aligned.gaps === 0,
        "only the move both series hold a bar at BOTH ends of survives (pairwise-complete)");
    ok(aligned.pairs[0].openTime === 2000 && aligned.from === 2000 && aligned.to === 3999,
        "and the pair names its own window: the move's open time to its close");
    near(aligned.pairs[0].a, (103 - 102) / 102, "the subject's move is its own two closes");
    near(aligned.pairs[0].b, (203 - 202) / 202, "and the peer's move is its own two closes");

    const window = windowReturn(barsA, { from: 1000, to: 2000 });
    ok(window.bars === 2 && window.first === 101 && window.last === 102,
        "a window's move is its newest close against its oldest, inside the window");
    ok(windowReturn(barsA, { from: 1000, to: 1000 }) === null,
        "a window holding one close has no move to report");
}

/* ------------------------------------------------------------
 * 4. One reading per closed bar, and each cadence on its own
 * ---------------------------------------------------------- */

function cadencesAreSeparate() {
    /* A pair publishing every closed minute… */
    const minute = createHarness();
    const minutes = 20;
    const closes = closesFrom(PATTERN, minutes);
    publishPair(minute, closes, closes, { interval: "1m" });

    const correlations = entriesOn(minute.published, topicOf(macroCorrelationEvent("1m")));
    const strength = entriesOn(minute.published, topicOf(relativeStrengthEvent("1m")));
    const expected = minutes - 5;     // six bars are five moves: the first bar the floor allows

    ok(correlations.length === expected,
        `one correlation per closed bar once the pair can be read (${correlations.length} of ${minutes} bars)`);
    ok(strength.length === expected,
        `and the relative reading keeps its own edge, so one per closed bar too (${strength.length})`);

    const times = correlations.map(readingOf).map((reading) => reading.openTime);
    ok(new Set(times).size === times.length, "no bar is ever published twice: the edge is consumed exactly once");
    ok(times.every((time, index) => index === 0 || time > times[index - 1]), "and the bars arrive in bar order");

    const first = readingOf(correlations[0]);
    ok(first.samples === 5 && first.timeframe === "1m" && first.interval === MINUTE,
        "the first reading is the smallest window the floor allows: five one-minute moves");
    ok(readingOf(strength[0]).dominance === false,
        "the relative reading on the same bar is a comparison, and says so");

    /* …and nothing at all on the timeframes it was never fed. */
    ok(entriesOn(minute.published, topicOf(macroCorrelationEvent("15m"))).length === 0
        && entriesOn(minute.published, topicOf(macroCorrelationEvent("1d"))).length === 0,
        "a 1m pair publishes nothing on 15m or 1d: one cadence is never inferred from another");
    ok(minute.engine.modules.crossMarket.barsOf(SUBJECT, "1d") === null,
        "and no daily window was invented for it");

    /* A quarter-hour pair, each side read against the market it was filed under.
     * The feed is bar by bar, the index first — so when gold's bar closes, the
     * index has already answered for the same bar and gold is read. */
    const quarter = createHarness();
    const quarters = 8;
    const goldCloses = closesFrom(PATTERN, quarters, 2400);
    const spxCloses = closesFrom(MIXED, quarters, 5000);
    publishPair(quarter, goldCloses, spxCloses, {
        interval: "15m",
        symbolA: GOLD,
        symbolB: SPX,
        assetClassA: ASSET_CLASS.COMMODITIES,
        assetClassB: ASSET_CLASS.INDICES
    });

    const goldOn15 = entriesOn(quarter.published, topicOf(macroCorrelationEvent("15m"), "xau", "commodities"));
    const spxOn15 = entriesOn(quarter.published, topicOf(macroCorrelationEvent("15m"), "spx", "indices"));
    const goldRelative = entriesOn(quarter.published, topicOf(relativeStrengthEvent("15m"), "xau", "commodities"));

    ok(goldOn15.length === quarters - 5,
        `gold publishes once per closed bar, on its own market's topic (${goldOn15.length} of ${quarters})`);
    ok(spxOn15.length === 0,
        "while the index — whose bar closes FIRST in every step — publishes nothing: its window is a bar behind");
    ok(goldOn15.every((entry) => readingOf(entry).against.symbol === SPX),
        "and gold's anchor is the index, out of its market's chain rather than out of the arrival order");
    ok(goldRelative.length === quarters - 5, "gold's relative reading keeps its own edge on the same bars");

    /* Then one bar where the order flips: now the index closes last, and the
     * reading is ITS. The rule is symmetric — the series that closes last is the
     * series that is read, and never across two different bars. */
    const index = quarters;
    const goldNext = framesOf(goldCloses.concat([goldCloses[quarters - 1] * PATTERN[0]]), {
        symbol: GOLD, assetClass: ASSET_CLASS.COMMODITIES, interval: "15m"
    })[index];
    const spxNext = framesOf(spxCloses.concat([spxCloses[quarters - 1] * MIXED[0]]), {
        symbol: SPX, assetClass: ASSET_CLASS.INDICES, interval: "15m"
    })[index];

    quarter.publishCandle(goldNext);
    ok(entriesOn(quarter.published, topicOf(macroCorrelationEvent("15m"), "xau", "commodities")).length === quarters - 5,
        "gold's close finds the index a bar behind: no reading, and the refusal is not published either");
    quarter.publishCandle(spxNext);

    const indexReadings = entriesOn(quarter.published, topicOf(macroCorrelationEvent("15m"), "spx", "indices"));
    ok(indexReadings.length === 1, "the index's close finds gold there, so the index is read");
    ok(readingOf(indexReadings[0]).against.symbol === GOLD && readingOf(indexReadings[0]).samples === 8,
        "against gold, over all eight moves both series answered");
    ok(readingOf(indexReadings[0]).interval === QUARTER && readingOf(indexReadings[0]).timeframe === "15m",
        "and the reading states the grid it was measured on");

    /* A daily pair: one move per day, never one per arrival. */
    const daily = createHarness();
    const days = 7;
    const dailyCloses = closesFrom(PATTERN, days);
    publishPair(daily, dailyCloses, dailyCloses, { interval: "1d" });

    const dailyReadings = entriesOn(daily.published, topicOf(macroCorrelationEvent("1d")));
    ok(dailyReadings.length === days - 5, `a daily pair publishes once per closed day (${dailyReadings.length} of ${days})`);

    const lastDay = readingOf(dailyReadings[dailyReadings.length - 1]);
    ok(lastDay.interval === DAY && lastDay.samples === days - 1,
        "and the window it counted is seven daily moves, not four hundred minutes of them");

    /* The same frame again: a duplicate, not a second reading. */
    const twice = framesOf(dailyCloses, { symbol: SUBJECT, assetClass: ASSET_CLASS.CRYPTO, interval: "1d" });
    daily.publishCandle(twice[twice.length - 1]);

    ok(entriesOn(daily.published, topicOf(macroCorrelationEvent("1d"))).length === days - 5,
        "a repeated frame is a duplicate bar, not a second reading");
    ok(countersOf(daily.engine).duplicate >= 1, "and the module counts the duplicate where it happened");
}

/* ------------------------------------------------------------
 * 5. Relative strength is a comparison, not a share
 * ---------------------------------------------------------- */

function relativeStrengthIsAComparison() {
    /* Two series that end the same span in different places, so the answer can be
     * counted out by hand from the closes themselves. */
    const harness = createHarness();
    const subjectCloses = closesFrom([1.01, 1.01, 0.99, 1.02, 1.0, 1.01], 8, 100);
    const peerCloses = closesFrom([1.0, 1.005, 1.0, 1.002, 1.0, 0.999], 8, 300);
    publishPair(harness, subjectCloses, peerCloses, { interval: "1d" });

    const readings = entriesOn(harness.published, topicOf(relativeStrengthEvent("1d")));
    ok(readings.length === 3, `the relative reading publishes on its own edge (${readings.length} of 8 daily bars)`);

    const last = readingOf(readings[readings.length - 1]);
    const subjectMove = (subjectCloses[7] / subjectCloses[0] - 1) * 100;
    const peerMove = (peerCloses[7] / peerCloses[0] - 1) * 100;

    near(last.subjectWindow.changePct, subjectMove, "the subject's window is its own first and last close");
    near(last.benchmarkWindow.changePct, peerMove, "and the benchmark's is its own, over the same bars");
    near(last.spreadPct, subjectMove - peerMove, "the headline is the difference between the two moves, in points");
    near(last.ratio, (1 + subjectMove / 100) / (1 + peerMove / 100) - 1,
        "and the ratio is the same question in units of the benchmark's own move");

    ok(last.dominance === false, "neither of them is a market share, and the reading says so itself");
    ok(last.window.from === START && last.window.to === START + 8 * DAY - 1,
        "the window is the span BOTH series answered — never a week against an afternoon");
    ok(last.subjectWindow.to === last.window.to && last.benchmarkWindow.to === last.window.to
        && last.subjectWindow.bars === 8 && last.benchmarkWindow.bars === 8,
        "and each side measures its own move over that same span, on the same eight bars");
    ok(last.benchmark.symbol === PEER && last.market === "crypto",
        "and the benchmark it was compared against is named in the reading");
    ok(last.pairs === 7 && last.missing === 0 && last.gaps === 0, "measured over the seven moves both answered");

    /* A series is not its own benchmark. */
    const self = createHarness();
    const closes = closesFrom(PATTERN, 8);
    publishPair(self, closes, closes, { interval: "1d" });
    const selfBefore = countersOf(self.engine).sameSymbol;
    ok(self.engine.modules.crossMarket.relativeStrength(PEER, "1d") === null,
        "the peer's benchmark is the peer itself here: no relative reading, because 0 would be arithmetic and not a finding");
    ok(countersOf(self.engine).sameSymbol === selfBefore + 1, "and the refusal is counted as a series against itself");

    /* The same rule against the table the module ships with, where the crypto
     * benchmark really is bitcoin itself. */
    const shipped = new CrossMarketAnalytics({ now: () => START, timeframes: ["1d"], minBars: 6, minPairs: 5 });
    ok(shipped.benchmarks.crypto.join(",") === SUBJECT, "the shipped benchmark of crypto is the coin itself");
    framesOf(closesFrom(PATTERN, 8), { symbol: SUBJECT, assetClass: ASSET_CLASS.CRYPTO, interval: "1d" })
        .forEach((frame) => shipped.ingestCandle(frame));

    ok(shipped.relativeStrength(SUBJECT, "1d") === null && shipped.stats().counters.sameSymbol === 1,
        "so bitcoin is not compared with itself: refused by name, never answered with a coefficient of 1");

    /* A market with no benchmark is left uncompared rather than compared badly. */
    const unbenchmarked = createHarness({
        anchors: { crypto: PEER, commodities: SPX, indices: GOLD },
        benchmark: { crypto: PEER }
    });
    const goldCloses = closesFrom(PATTERN, 8, 2400);
    const spxCloses = closesFrom(MIXED, 8, 5000);
    publishPair(unbenchmarked, goldCloses, spxCloses, {
        interval: "1d",
        symbolA: GOLD,
        symbolB: SPX,
        assetClassA: ASSET_CLASS.COMMODITIES,
        assetClassB: ASSET_CLASS.INDICES
    });

    ok(entriesOn(unbenchmarked.published, topicOf(relativeStrengthEvent("1d"), "xau", "commodities")).length === 0,
        "a market this layer holds no benchmark for publishes no relative reading");
    const notComparable = countersOf(unbenchmarked.engine).notComparable;
    ok(unbenchmarked.engine.modules.crossMarket.relativeStrength(GOLD, "1d") === null
        && countersOf(unbenchmarked.engine).notComparable === notComparable + 1,
        "and says so by name: not comparable, rather than compared with something else");
}

/* ------------------------------------------------------------
 * 6. The leverage reading is a composition, and says what of
 * ---------------------------------------------------------- */

function leverageIsAComposition() {
    const harness = createHarness();
    const { engine, published, tick } = harness;
    const topic = topicOf("market_leverage_risk");
    const readings = () => entriesOn(published, topic);
    const latest = () => {
        const found = readings();
        return found.length ? readingOf(found[found.length - 1]) : null;
    };

    /** One derivatives frame, as the collector publishes it. */
    const frame = (eventType, data) => engine.ingest(createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.DERIVATIVES,
        marketType: MARKET_TYPE.FUTURES,
        exchange: "binance",
        symbol: SUBJECT,
        eventType,
        data,
        timestamp: harness.clock()
    }));

    /* One measurement: open interest that has not moved. A steady position is a
     * measurement, and the reading is judged on the scale that measurement can
     * reach — never on the four parts a different day might have had. */
    frame("open_interest", { oiUsd: 1_000_000, markPrice: 100 });
    const one = latest();

    ok(one !== null && readings().length === 1, "the open interest alone is enough for a leverage reading");
    ok(one.present.join(",") === "openInterest" && one.missing.join(",") === "funding,positioning,liquidations",
        "and the reading names the one part it was made of, and the three it was not");
    ok(one.parts.openInterest.share === 0 && one.parts.funding === null,
        "a part that was not measured is null, not a zero score; the part that was carries its own share");
    ok(one.max === 25 && one.score === 0 && one.ratio === 0 && one.band === "low",
        "nothing earned out of the 25 points that part could reach: low, and never read as no leverage at all");
    ok(one.weights.funding === 30 && one.thresholds.fundingAnnualized === 0.3,
        "the weights and thresholds it was read with travel with the reading");
    ok(one.bar === undefined && one.symbol === SUBJECT && typeof one.at === "number",
        "and it speaks about a state of the market, with no bar borrowed from another layer to stand on");

    /* A rate past the threshold: full, and no further. */
    tick(6000);      // past the route's throttle
    frame("funding", { rate: 0.001, intervalHours: 8, exchange: "binance" });
    const two = latest();
    const funding = engine.modules.derivatives.fundingSnapshot(SUBJECT);

    near(two.parts.funding.value, funding.weightedAnnualized,
        "the funding part is the flow module's own number, not a second opinion of it");
    ok(two.parts.funding.share === 1 && two.parts.funding.value > 0.3,
        "a rate past the threshold is full — never extrapolated past it to hide a missing part");
    ok(two.present.join(",") === "openInterest,funding" && two.max === 55,
        "so the scale is 55 points now, and the reading says so");
    ok(two.score === 30 && two.ratio === 30 / 55 && two.band === "elevated",
        "thirty of those fifty-five points is 0.55 of the reachable scale, so the band is elevated");

    /* Positioning: distance from balance, in either direction. */
    tick(6000);
    frame("long_short_ratio", { ratio: 4, longAccount: 0.8, shortAccount: 0.2 });
    const three = latest();

    ok(three.parts.positioning.share === 1 && three.parts.positioning.logRatio > 1.3,
        "four accounts long for every one short is past twice-as-many, so that part is full");
    ok(three.max === 75 && three.band === "elevated",
        "three parts, 75 points of scale, and the ratio is what decides the band — not the score");

    /* The washout, and with it the fourth part. */
    tick(6000);
    frame("liquidation", { side: "long", price: 100, qty: 1 });
    const all = latest();

    ok(all.present.length === 4 && all.missing.length === 0 && all.max === 100,
        "all four measurements answered, so for once the score is out of the whole scale");
    near(all.ratio, all.score / all.max, "and the ratio is the score against the scale that answered");
    ok(all.score === 75 && all.band === "elevated",
        "seventy-five of a hundred, and elevated — the one thing still unmoved is the open interest");
    ok(Object.keys(all.parts).join(",") === "openInterest,funding,positioning,liquidations",
        "every part is stated, present or not: a composition that hides its ingredients is not one");

    /* The fourth part moves too: the position itself, built 30 % in one window —
     * past the module's own 10 % threshold, so the whole scale is earned. */
    tick(6000);
    frame("open_interest", { oiUsd: 1_300_000, markPrice: 100 });
    const full = latest();

    ok(full.parts.openInterest.value === 30 && full.parts.openInterest.share === 1,
        "a position built thirty percent in one window is three times the threshold, and full");
    ok(full.score === 100 && full.max === 100 && full.ratio === 1 && full.band === "high",
        "so the reading is the whole hundred points, and the highest band the module speaks");

    /* The same state is one reading, not one per input. */
    const before = readings().length;
    frame("funding", { rate: 0.0005, intervalHours: 8, exchange: "binance" });
    ok(readings().length === before, "the same state is not published twice: the route throttles it");

    tick(6000);
    frame("funding", { rate: 0.0004, intervalHours: 8, exchange: "binance" });
    ok(readings().length === before + 1, "and publishes again once the throttle window has passed");

    /* Nothing measurable: no reading at all, rather than a confident zero. */
    const unmeasured = countersOf(engine).unmeasured;
    ok(engine.modules.crossMarket.leverageRisk({ symbol: "NOPEUSDT" }) === null,
        "a symbol with nothing measured behind it has no leverage reading");
    ok(countersOf(engine).unmeasured === unmeasured + 1, "and the refusal is counted, never published as calm");
    ok(engine.modules.crossMarket.leverageRisk({ symbol: "NOPEUSDT", positioning: { ratio: 0 } }) === null,
        "a long/short ratio of zero has no logarithm, so it is not a part either");
}

/* ------------------------------------------------------------
 * 7. Refusals are counted where they happen
 * ---------------------------------------------------------- */

function refusalsAreCountedNotGuessed() {
    const harness = createHarness();
    const { engine, publishCandle } = harness;
    const before = countersOf(engine);

    /* A frame that names no interval: the route never invents one. */
    publishCandle({
        symbol: SUBJECT, assetClass: ASSET_CLASS.CRYPTO, openTime: START,
        open: 100, high: 101, low: 99, close: 100.5, volume: 1, isClosed: true
    });
    ok(countersOf(engine).unknownInterval === before.unknownInterval + 1
        && engine.modules.crossMarket.barsOf(SUBJECT, "1m") === null,
        "a frame that names no interval is counted, never read as the width of its own timestamps");

    /* A bar that cannot exist, and a bar with a missing price. */
    publishCandle({
        symbol: SUBJECT, assetClass: ASSET_CLASS.CRYPTO, interval: "1m", openTime: START,
        open: 100, high: 99, low: 101, close: 100, volume: 1, isClosed: true
    });
    publishCandle({
        symbol: SUBJECT, assetClass: ASSET_CLASS.CRYPTO, interval: "1m", openTime: START,
        open: 100, high: 101, low: 99, close: 0, volume: 1, isClosed: true
    });
    ok(countersOf(engine).invalidBar === before.invalidBar + 2,
        "a bar whose high is below its low, and a bar whose close is zero, are both refused — never repaired");
    ok(engine.modules.crossMarket.barsOf(SUBJECT, "1m") === null, "and neither of them reached a window");

    /* An unfinished bar is not read at all. */
    publishCandle({
        symbol: SUBJECT, assetClass: ASSET_CLASS.CRYPTO, interval: "1m", openTime: START,
        open: 100, high: 101, low: 99, close: 100.5, volume: 1, isClosed: false
    });
    ok(countersOf(engine).open === before.open + 1
        && engine.modules.crossMarket.barsOf(SUBJECT, "1m") === null,
        "a bar the venue has not finished is counted as open and never ringed");

    /* A bar older than the newest one held: late, not a correction. */
    const goldBars = framesOf(closesFrom(PATTERN, 3), { symbol: GOLD, assetClass: ASSET_CLASS.COMMODITIES, interval: "1m" });
    publishCandle(goldBars[1]);
    publishCandle(goldBars[0]);

    ok(countersOf(engine).late === before.late + 1, "a bar older than the newest one held is counted as late");
    ok(engine.modules.crossMarket.barsOf(GOLD, "1m").length === 1,
        "and the series stays the one bar it was: bars are appended in time, never inserted");

    /* A symbol no frame ever carried, and a timeframe this layer does not serve. */
    const never = countersOf(engine).notAMarket;
    ok(engine.modules.crossMarket.reading("NEVERSEEN", "1m") === null
        && engine.modules.crossMarket.relativeStrength("NEVERSEEN", "1m") === null,
        "a symbol that never arrived has no reading of either kind");
    ok(countersOf(engine).notAMarket === never + 2,
        "counted as a symbol this layer never saw, not as a window that was too short");

    const untouched = countersOf(engine).readings;
    ok(engine.modules.crossMarket.reading(SUBJECT, "7m") === null
        && engine.modules.crossMarket.pending(SUBJECT, "nope") === null,
        "a timeframe this layer does not serve is answered with null");
    ok(countersOf(engine).readings === untouched && engine.modules.crossMarket.reading("   ", "1m") === null,
        "without moving the counters: there was no reading to refuse, only a question that is not one");

    /* The same for the composition: no symbol, no reading. */
    ok(engine.modules.crossMarket.leverageRisk({}) === null
        && engine.modules.crossMarket.leverageRisk({ symbol: "" }) === null,
        "a leverage reading without a symbol is not a reading about the market");
}

/* ------------------------------------------------------------
 * 8. The engine's own traffic, and the markets it learned
 * ---------------------------------------------------------- */

function theEngineKeepsItsOwnTrafficOut() {
    const harness = createHarness();
    const { bus, engine, published } = harness;
    const closes = closesFrom(PATTERN, 12);
    publishPair(harness, closes, closes, { interval: "1m" });

    const ingested = engine.counters.ingested;
    const readings = published.length;

    /* One of its own readings, published back onto the bus it listens to. */
    const [first] = published;
    bus.publish(
        { event: "analytics", market: "analytics", exchange: "analytics", symbol: SUBJECT, envelope: first.envelope },
        { market: "analytics", exchange: "analytics", symbol: SUBJECT }
    );

    ok(engine.counters.ingested === ingested, "the engine's own analytics entry never comes back in as an input");
    ok(published.length === readings, "and starts no second round of readings on the bars it came from");

    /* The markets are learned from the frames that named them — never assumed. */
    ok(engine.modules.crossMarket.marketOf(SUBJECT) === "crypto" && engine.modules.crossMarket.marketOf(GOLD) === null,
        "a market is learned from the frames that carried it, and only for the symbols they carried");

    const goldBars = framesOf(closesFrom(PATTERN, 2), { symbol: GOLD, assetClass: ASSET_CLASS.COMMODITIES, interval: "1m" });
    harness.publishCandle(goldBars[0]);
    ok(engine.modules.crossMarket.marketOf(GOLD) === "commodities" && engine.modules.crossMarket.chainFor(GOLD).join(",") === SPX,
        "gold is filed under the market its own frame named, and follows that market's chain");

    const remapped = countersOf(engine).remapped;
    harness.publishCandle({ ...goldBars[1], assetClass: ASSET_CLASS.FOREX });
    ok(engine.modules.crossMarket.marketOf(GOLD) === "commodities" && countersOf(engine).remapped === remapped + 1,
        "a series later named as another market keeps the market it was filed under, and the disagreement is counted");
    ok(engine.modules.crossMarket.chainFor(GOLD).join(",") === SPX,
        "so its anchors do not quietly change under the readers either");

    /* A frame that named no market at all: the shipped default chain, and the
     * reading says which anchor answered. */
    const unnamed = new CrossMarketAnalytics({ now: () => START, timeframes: ["1d"], minBars: 6, minPairs: 5 });
    const subjectCloses = closesFrom(PATTERN, 8);
    framesOf(subjectCloses, { symbol: SUBJECT, assetClass: null, interval: "1d" })
        .forEach((frame) => unnamed.ingestCandle(frame));
    framesOf(closesFrom(MIXED, 8), { symbol: PEER, assetClass: null, interval: "1d" })
        .forEach((frame) => unnamed.ingestCandle(frame));

    ok(unnamed.marketOf(SUBJECT) === null && unnamed.chainFor(SUBJECT).join(",") === DEFAULTS.defaultAnchors.join(","),
        "a series whose market was never named falls back to the default chain — null is not an asset class");

    const anchored = unnamed.reading(SUBJECT, "1d");
    ok(anchored !== null && anchored.against.symbol === PEER && anchored.against.assetClass === null,
        "and the reading names the anchor that answered, and the market it was filed under (none)");
    ok(anchored.against.anchors.join(",") === DEFAULTS.defaultAnchors.join(","),
        "with the whole chain it was tried against, so a fallback is never silent");
    ok(unnamed.relativeStrength(SUBJECT, "1d") === null,
        "while a relative reading needs a benchmark the market never named, so there is none");
}

/* ------------------------------------------------------------
 * 9. What the engine holds around the pair
 * ---------------------------------------------------------- */

function whatTheEngineHoldsAroundIt() {
    const harness = createHarness();
    const { engine } = harness;
    const closes = closesFrom(PATTERN, 12);
    publishPair(harness, closes, closes, { interval: "1m" });

    /* The engine's own view of the symbol, cross-market part included. */
    const snapshot = engine.snapshot({ symbol: SUBJECT });
    ok(snapshot.crossMarket !== null && snapshot.crossMarket.market === "crypto",
        "the snapshot says which market the series was filed under");
    ok(snapshot.crossMarket.timeframes["1m"].reading !== null
        && snapshot.crossMarket.timeframes["1m"].relative !== null,
        "and carries both readings of the timeframe, next to the series they were made from");
    ok(snapshot.crossMarket.timeframes["1m"].series.bars === closes.length,
        `…and the accounting behind them (${closes.length} one-minute bars)`);
    ok(!Object.prototype.hasOwnProperty.call(snapshot.crossMarket.timeframes, "5m"),
        "the timeframes this layer does not serve are absent, not empty-looking");
    ok(snapshot.crossMarket.anchors.join(",") === PEER && snapshot.crossMarket.benchmark === PEER,
        "with the chain and the benchmark its market follows");

    /* The module's own accounting — about the module, never mixed into a reading. */
    const stats = engine.modules.crossMarket.stats();
    ok(stats.timeframes.join(",") === SERVED.join(",") && stats.bars.publish === 6 && stats.bars.pairs === 5,
        "the module's stats state the timeframes it serves and the floors it reads at");
    ok(stats.markets.learned.join(",") === "crypto" && stats.markets.series === 2,
        "and the market it learned, with the two series that named it, and the table it follows");
    ok(stats.markets.anchors.crypto.join(",") === PEER && stats.markets.benchmarks.crypto.join(",") === PEER,
        "the anchors and benchmarks of every market it knows travel in the same report");
    ok(stats.counters.correlations > 0 && stats.counters.relative > 0 && stats.counters.relativePublished > 0,
        "counting correlations apart from relative readings");
    ok(engine.stats().modules.includes("crossMarket") && engine.stats().subscribers > 0,
        "the engine counts the layer among its modules, and itself among the bus's subscribers");

    /* Forgetting the bars forgets what was built on them. */
    const before = countersOf(engine);
    const dropped = engine.reset({ symbol: SUBJECT });

    ok(dropped.crossMarket === SERVED.length,
        `a reset drops the symbol's rings, one per served timeframe (${dropped.crossMarket})`);
    ok(engine.modules.crossMarket.marketOf(SUBJECT) === null && engine.modules.crossMarket.snapshot(SUBJECT) === null,
        "and the market learned for it goes with them, rather than being remembered for bars it no longer holds");
    ok(engine.modules.crossMarket.barsOf(SUBJECT, "1m") === null
        && engine.modules.crossMarket.reading(SUBJECT, "1m") === null,
        "no bars, no reading");
    ok(countersOf(engine).correlations === before.correlations && countersOf(engine).readings === before.readings,
        "while the counters stay the history of what happened: a reset frees state, it does not rewrite it");

    /* The second edge map goes with the bars too. */
    const relativeBefore = countersOf(engine).relativePublished;
    publishPair(harness, closes, closes, { interval: "1m" });
    ok(countersOf(engine).relativePublished > relativeBefore,
        "the same series fed again is read again: the relative edge did not outlive the bars it was read from");

    /* The pure helpers, on the spellings the collector really uses. */
    ok(assetClassOf("real_estate_credit") === "realestatecredit" && assetClassOf(" Crypto ") === "crypto"
        && assetClassOf("nonsense") === null,
        "the market spellings accepted are the collector's and its own aliases, and nothing invented");
    ok(chainOf([" usdtwi ", "USDTWI", null, "", "SPX"]).join(",") === "USDTWI,SPX",
        "an anchor chain is canonicalised and de-duplicated, so one spelling is never two series");
    ok(chainOf("usdtwi").join(",") === "USDTWI", "and a single symbol is read as a chain of one");
}

/* ------------------------------------------------------------
 * The seam, end to end
 * ---------------------------------------------------------- */

oneFrameThreeLayers();
correlationIsCountedByHand();
alignmentIsHonest();
cadencesAreSeparate();
relativeStrengthIsAComparison();
leverageIsAComposition();
refusalsAreCountedNotGuessed();
theEngineKeepsItsOwnTrafficOut();
whatTheEngineHoldsAroundIt();




console.log(`A12 cross-market seam: ${checks} checks passed`);


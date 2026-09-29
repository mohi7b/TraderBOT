/**
 * A10 — Seam: a bar on the bus → the price-action layer → price_action_* topics
 * collector/crypto/realtime + collector/liquidity_6markets + analytics-engine
 * ============================================================
 * The price-action module's own tests drive ingestCandle() directly. This test
 * walks the path a bar really takes: a frame on the Realtime event bus (the
 * shape the collector's candles.cjs emits, and the shape the six-market layer's
 * ticker carries), through the router's candle route, into the module, and out
 * again as analytics.<assetClass>.<asset>.price_action_<timeframe>.
 *
 * What it pins down, beyond "a reading came out":
 *
 *   1. the four structures are the four documented shapes, checked on
 *      hand-built windows where the answer can be written down by hand:
 *      a swing needs `swingStrength` bars on BOTH sides and a unique extreme,
 *      a break needs a CLOSE beyond the level (a wick is a sweep, never also a
 *      break), a gap is the hole between the first and the third bar with the
 *      touched state and the filled state stated separately, and an order block
 *      is the last opposite bar before the leg that broke the swing
 *   2. one input frame → one structure per served timeframe, on that
 *      timeframe's own topic, and no topic at all for a timeframe the module
 *      does not serve; the same frame feeds the indicator layer, which reads
 *      the very same closed bar
 *   3. structures are read on the real series and every one of them points back
 *      at the bar it came from — index, open time, price and level re-checked
 *      against the feed, plus the honesty rules: levels are consumed once, a
 *      closed-through level is a break and not a sweep, and the bounded lists
 *      are the newest of what the counts say
 *   4. publication is edge-triggered: a duplicate bar, an unfinished bar and a
 *      late bar publish nothing; the next closed bar publishes exactly once
 *   5. refusals are counted, never guessed around: a frame with no interval, a
 *      bar that cannot exist, a quote with no bar in it, a window shorter than
 *      one swing neighbourhood, a timeframe the module does not serve — and a
 *      parameter the window cannot honour is corrected out loud (`warnings`)
 *   6. the engine's own analytics traffic never comes back in as an input, and
 *      the engine's reads around it (snapshot, stats, reset) keep working —
 *      including the per-edge cache a structure is answered from
 *
 * Run: node analytics-engine/tests/seam-price-action.test.cjs
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
const { PRICE_ACTION_TIMEFRAMES } = require(path.join(__dirname, "..", "topics.cjs"));
const {
    swingPoints,
    breakEvents,
    fairValueGaps,
    orderBlocks,
    liquiditySweeps
} = require(path.join(__dirname, "..", "modules", "price_action", "index.cjs"));

const MINUTE = 60_000;
const START = Date.parse("2026-09-27T12:00:00.000Z");
const SERVED = ["1m", "5m", "15m"];
const FEED = 240;                    // four hours of one-minute bars
const STRENGTH = 2;                  // the module's own default
const LOOKBACK = 12;
const ASSET = "btc";
const SYMBOL = "BTCUSDT";

let checks = 0;
const ok = (condition, message) => {
    assert.ok(condition, `A10: ${message}`);
    checks += 1;
};
const near = (left, right, message, tolerance = 1e-12) => {
    const same = typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= tolerance;
    assert.ok(same, `A10: ${message} (got ${left}, expected ${right})`);
    checks += 1;
};
/** The topic of one reading, spelled the way the topic table spells it. */
const topicOf = (event, asset = ASSET) => `analytics.crypto.${asset}.${event}`;
/** The publications of one topic, in order. */
const entriesOn = (published, topic) => published.filter((entry) => entry.topic === topic);
/** The reading inside one published analytics entry. */
const readingOf = (entry) => entry.envelope.payload;

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
 * Bars — one deterministic series, carried several ways
 * ---------------------------------------------------------- */

/** The one-minute bar at `index`: positive, and valid (high ≥ body, low ≤ body). */
function barAt(index) {
    const openTime = START + index * MINUTE;
    const open = 100 + index * 0.25 + Math.sin(index / 3) * 4;
    const close = open + Math.cos(index / 2) * 0.9;
    const high = Math.max(open, close) + 0.5 + (index % 3) * 0.1;
    const low = Math.min(open, close) - 0.5 - (index % 5) * 0.05;

    return {
        openTime,
        closeTime: openTime + MINUTE - 1,
        open,
        high,
        low,
        close,
        volume: 10 + (index % 7)
    };
}

const feed = Array.from({ length: FEED }, (unused, index) => barAt(index));

/** The venue's own candle event: what futures/candles/candles.cjs emits. */
function candleFrame(index, interval = "1m", overrides = {}) {
    const bar = barAt(index);

    return {
        event: "candle",
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        timestamp: bar.openTime,
        closeTime: bar.closeTime,
        isClosed: true,
        interval,
        ...overrides
    };
}

/** The six-market ticker reading: a quote with the venue's last bar inside it. */
function tickerReading(index, overrides = {}) {
    const bar = barAt(index);

    return {
        kind: "quote",
        price: bar.close,
        bid: bar.close - 0.05,
        ask: bar.close + 0.05,
        bidSize: 3,
        askSize: 4,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        barInterval: "1m",
        timestamp: bar.openTime,
        isClosed: true,
        ...overrides
    };
}

/** A window written down by hand: [open, high, low, close] per bar, one minute apart. */
const barsFrom = (rows) => rows.map(([open, high, low, close], index) => ({
    openTime: START + index * MINUTE,
    closeTime: START + index * MINUTE + MINUTE - 1,
    open,
    high,
    low,
    close,
    volume: 1
}));

/**
 * The swings of a window, computed here the way the module documents them: a
 * bar is a swing when its whole neighbourhood exists and every one of those
 * bars stays strictly inside its extreme. Written independently of the module,
 * so the two agreeing means something.
 */
function referenceSwings(bars, strength) {
    const highs = [];
    const lows = [];

    for (let at = strength; at + strength < bars.length; at += 1) {
        const neighbours = [];
        for (let off = 1; off <= strength; off += 1) neighbours.push(bars[at - off], bars[at + off]);

        if (neighbours.every((bar) => bar.high < bars[at].high)) {
            highs.push({ index: at, openTime: bars[at].openTime, price: bars[at].high });
        }
        if (neighbours.every((bar) => bar.low > bars[at].low)) {
            lows.push({ index: at, openTime: bars[at].openTime, price: bars[at].low });
        }
    }

    return { highs, lows };
}

/* ------------------------------------------------------------
 * 1. The structures are the documented shapes — windows by hand
 * ---------------------------------------------------------- */

function swingsNeedTheirNeighbourhood() {
    /* A seven-bar zig-zag: one high, one low, both of them unique. */
    const zigzag = barsFrom([
        [10.0, 12.0, 9.0, 11.0],
        [11.0, 13.0, 10.0, 12.0],
        [12.0, 15.0, 11.0, 13.0],   // 15 is the highest of its five-bar neighbourhood
        [13.0, 14.0, 12.0, 13.0],
        [13.0, 13.5, 9.0, 12.0],    // 9 is the lowest
        [12.0, 13.0, 10.0, 12.0],
        [12.0, 13.0, 10.5, 11.0]
    ]);
    const swings = swingPoints(zigzag, STRENGTH);

    ok(swings.highs.length === 1 && swings.highs[0].index === 2 && swings.highs[0].price === 15,
        "the highest bar of its five-bar neighbourhood is the swing high");
    ok(swings.lows.length === 1 && swings.lows[0].index === 4 && swings.lows[0].price === 9,
        "and the lowest bar is the swing low");
    ok(swings.highs[0].openTime === zigzag[2].openTime && swings.lows[0].openTime === zigzag[4].openTime,
        "each swing carries the bar it was read from");

    const reference = referenceSwings(zigzag, STRENGTH);
    ok(reference.highs.length === swings.highs.length && reference.lows.length === swings.lows.length,
        "the test's own reading of the rule agrees, bar for bar");

    /* A shared extreme is no extreme, and the newest bars are not confirmed. */
    const shared = barsFrom([
        [10.0, 10.5, 10.0, 10.2],
        [10.2, 11.0, 10.1, 10.8],
        [10.8, 12.0, 10.5, 11.5],   // 12 …
        [11.5, 12.0, 10.6, 11.0],   // … is the same high as the bar beside it: not a swing
        [11.0, 11.2, 10.4, 10.6],
        [10.6, 10.9, 10.2, 10.8],
        [10.8, 13.0, 10.8, 12.5]    // the highest bar of all, and never a candidate
    ]);
    const none = swingPoints(shared, STRENGTH);

    ok(none.highs.length === 0 && none.lows.length === 0,
        "two bars at the same high are not an extreme, and the last bars are not confirmed yet");

    const fine = swingPoints(shared, 1);
    ok(fine.lows.length === 1 && fine.lows[0].index === 5,
        "a one-bar neighbourhood confirms a bar the five-bar one must wait for");
    ok(fine.highs.length === 0, "…and still refuses the shared high");
    ok(swingPoints(barsFrom([[10.0, 11.0, 9.0, 10.0]]), STRENGTH).highs.length === 0,
        "a window shorter than one neighbourhood has nothing to say");
}

function breaksNeedAClose() {
    /* A swing high at 15 broken by a close, then the low at 9 closed through. */
    const window = barsFrom([
        [10.0, 12.0, 9.0, 11.0],
        [11.0, 13.0, 10.0, 12.0],
        [12.0, 15.0, 11.0, 13.0],   // swing high 15, confirmed two bars later
        [13.0, 14.0, 12.0, 13.0],
        [13.0, 13.5, 9.0, 12.0],    // swing low 9, confirmed two bars later
        [12.0, 16.2, 12.0, 16.0],   // closes 16: beyond 15 → the level is broken
        [16.0, 16.5, 15.0, 15.5],
        [15.5, 16.0, 14.5, 15.0],
        [15.0, 15.5, 13.0, 13.5],
        [13.5, 14.0, 8.0, 8.8],     // closes 8.8: below 9 → against the direction
        [8.8, 9.5, 8.5, 9.2],
        [9.2, 10.0, 9.0, 9.8]
    ]);
    const swings = swingPoints(window, STRENGTH);

    ok(swings.highs.map((point) => point.index).join(",") === "2,6", "the window's swing highs are the two displacement tops");
    ok(swings.lows.map((point) => point.index).join(",") === "4,9", "and its swing lows the two dips");

    const { events, trend } = breakEvents(window, swings, STRENGTH);
    ok(events.length === 2, `two bars closed beyond a level (${events.length})`);

    const [first, second] = events;
    ok(first.index === 5 && first.side === "up" && first.kind === "bos",
        "the first break continues the direction it sets: a bos");
    ok(first.level === 15 && first.levelIndex === 2 && first.levelOpenTime === window[2].openTime,
        "…at the swing high it closed beyond");
    ok(first.price === 16, "and it carries the close that broke it");
    ok(second.index === 9 && second.side === "down" && second.kind === "mss",
        "a break against the direction in force is the shift: an mss");
    ok(second.level === 9 && second.levelIndex === 4 && second.price === 8.8, "…at the swing low it closed below");
    ok(trend === "down", "and the direction in force is down from there");

    /* The same window, with the fifth bar only wicking past the level. */
    const sweptWindow = window.map((bar, at) => (at === 5 ? { ...bar, close: 14.0 } : bar));
    const sweptSwings = swingPoints(sweptWindow, STRENGTH);
    const sweptBreaks = breakEvents(sweptWindow, sweptSwings, STRENGTH);

    ok(sweptBreaks.events.length === 2 && sweptBreaks.events[0].index === 6,
        "a wick past a level breaks nothing: the close came back inside");
    ok(liquiditySweeps(window, swings, LOOKBACK).length === 0,
        "and where the close did go through, the level is a break and never also a sweep");

    const sweeps = liquiditySweeps(sweptWindow, sweptSwings, LOOKBACK);
    ok(sweeps.length === 1, `the wick is read as one sweep (${sweeps.length})`);
    ok(sweeps[0].index === 5 && sweeps[0].side === "high" && sweeps[0].level === 15,
        "…of the level the wick took");
    ok(sweeps[0].extreme === 16.2 && sweeps[0].price === 14, "…with the wick and the close it came back to");
    near(sweeps[0].depth, 1.2, "and the depth says how far past the level the wick reached");
    ok(sweeps[0].levelIndex === 2 && sweeps[0].levelOpenTime === sweptWindow[2].openTime,
        "the sweep points back at the swing it took");
}

function gapsAreGaps() {
    /* A bullish hole: the first bar's high (10) is below the third bar's low (11). */
    const bullish = barsFrom([
        [9.0, 10.0, 8.5, 9.5],
        [9.5, 12.0, 9.0, 11.5],     // the displacement bar
        [11.5, 12.5, 11.0, 12.0],
        [12.0, 12.2, 10.8, 11.0],   // back into the hole: touched, not filled
        [11.0, 11.0, 9.5, 9.8]      // through the far edge: filled
    ]);
    const gaps = fairValueGaps(bullish);

    ok(gaps.length === 1, `one hole in three consecutive bars (${gaps.length})`);
    const gap = gaps[0];
    ok(gap.index === 2 && gap.openTime === bullish[1].openTime,
        "the gap belongs to the displacement bar that made it");
    ok(gap.side === "bullish" && gap.bottom === 10 && gap.top === 11 && gap.size === 1,
        "…and its hole is (first high, third low)");
    near(gap.sizeRatio, 1 / 3, "put next to the range of the three bars that made it");
    ok(gap.touched !== null && gap.touched.index === 3 && gap.touched.openTime === bullish[3].openTime,
        "a later bar traded back into it, and the reading says which");
    ok(gap.filled !== null && gap.filled.index === 4, "a later bar traded the hole away, and the reading says which too");
    near(gap.depth, 1, "a filled hole is reported as fully retraced — never as untouched");

    /* Tested but not filled: the states are separate, not one flag. */
    const tested = barsFrom([
        [9.0, 10.0, 8.5, 9.5],
        [9.5, 12.0, 9.0, 11.5],
        [11.5, 12.5, 11.0, 12.0],
        [12.0, 12.2, 10.8, 11.0]
    ]);
    const standing = fairValueGaps(tested)[0];

    ok(standing.touched.index === 3 && standing.filled === null, "a gap that was tested but not traded through is still standing");
    near(standing.depth, 0.2, "and it says how much of the hole was retraced (10.8 of the 10 → 11 hole)");

    /* The other way round, and never traded at all. */
    const bearish = barsFrom([
        [11.5, 12.5, 11.0, 12.0],   // the first bar's low (11) is above the third bar's high (10.5)
        [12.0, 13.0, 9.5, 10.0],
        [10.0, 10.5, 9.0, 9.5]
    ]);
    const holes = fairValueGaps(bearish);

    ok(holes.length === 1 && holes[0].side === "bearish" && holes[0].bottom === 10.5 && holes[0].top === 11,
        "the other way round the hole is (third high, first low)");
    near(holes[0].sizeRatio, 0.5 / 3.5, "…measured against the same three-bar range");
    ok(holes[0].touched === null && holes[0].filled === null && holes[0].depth === 0,
        "a gap nobody traded is still a gap, and it says so");
}

function blocksAreTheLegsOrigin() {
    const window = barsFrom([
        [10.0, 12.0, 9.0, 11.0],
        [11.0, 13.0, 10.0, 12.0],
        [12.0, 15.0, 11.0, 13.0],
        [13.0, 14.0, 12.0, 13.0],
        [13.0, 13.5, 9.0, 12.0],    // the last down bar before the up break
        [12.0, 16.2, 12.0, 16.0],   // the up break
        [16.0, 16.5, 15.0, 15.5],
        [15.5, 16.0, 14.5, 15.0],
        [15.0, 15.5, 13.0, 13.5],   // back into the block
        [13.5, 14.0, 8.0, 8.8]      // and closed through it
    ]);
    const swings = swingPoints(window, STRENGTH);
    const { events } = breakEvents(window, swings, STRENGTH);
    const blocks = orderBlocks(window, events, LOOKBACK);

    ok(blocks.length === 2, `one block per break (${blocks.length})`);
    const [up, down] = blocks;

    ok(up.side === "up" && up.index === 4 && up.bottom === 9 && up.top === 13.5,
        "the up break's block is the last down bar before it, and the block is that bar's own range");
    ok(up.kind === "bos" && up.breakIndex === 5 && up.breakOpenTime === window[5].openTime,
        "…carrying the break it belongs to");
    ok(up.touched !== null && up.touched.index === 8, "price came back into it a bar before the shift");
    ok(up.broken !== null && up.broken.index === 9, "and closed through it, which consumed it");

    ok(down.side === "down" && down.index === 5 && down.bottom === 12 && down.top === 16.2,
        "the down break's block is the last up bar before it — where the displacement started");
    ok(down.kind === "mss" && down.breakIndex === 9, "…carrying the shift");
    ok(down.touched === null && down.broken === null, "and price never came back to it: it is still standing");
}

/* ------------------------------------------------------------
 * The engine under test, wired to the bus it also publishes onto
 * ---------------------------------------------------------- */

function createHarness(priceAction = {}) {
    let at = START;
    const bus = fakeBus(() => at);
    const published = [];

    const engine = createEngine({
        bus,
        now: () => at,
        /* Every published entry in order, with no ring buffer in the way. */
        sink: (entry) => published.push(entry),
        indicators: { timeframes: SERVED, minBars: 6, maxBars: 256 },
        priceAction: { timeframes: SERVED, minBars: 6, maxBars: 256, ...priceAction }
    });
    engine.attach(bus);

    /** A bar arrives when it closes: the bus stamps the entry then, as it does. */
    const arrivesAt = (openTime) => {
        at = openTime + MINUTE;
        return at;
    };

    /** A venue candle, published the way the realtime collector publishes it. */
    const publishCandle = (index, frame = candleFrame(index), symbol = SYMBOL) => {
        arrivesAt(frame.timestamp === undefined ? barAt(index).openTime : frame.timestamp);
        return bus.publish(frame, { market: "futures", exchange: "binance", symbol });
    };

    /**
     * A six-market reading, published the way collector/liquidity_6markets
     * publishes it (core/bus-bridge.cjs): the envelope travels ON the entry, the
     * bus axis is `liquidity` and its exchange segment is the ASSET CLASS, so the
     * asset class rides the frame and one engine can serve gold and bitcoin.
     */
    const publishMarket = (data, {
        symbol = SYMBOL,
        exchange = "goldapi",
        assetClass = ASSET_CLASS.CRYPTO,
        eventType = "ticker",
        timestamp = data.timestamp
    } = {}) => {
        if (timestamp !== undefined) arrivesAt(timestamp);

        const envelope = createEnvelope({
            assetClass,
            sourceType: SOURCE_TYPE.LIQUIDITY,
            marketType: MARKET_TYPE.SPOT,
            exchange,
            symbol,
            eventType,
            data,
            timestamp
        });

        const entry = {
            event: eventType,
            market: "liquidity",
            exchange: assetClass,
            symbol,
            envelope,
            source: SOURCE_TYPE.LIQUIDITY
        };

        return bus.publish(entry, { market: entry.market, exchange: entry.exchange, symbol: entry.symbol });
    };

    return { bus, engine, published, publishCandle, publishMarket };
}

/* ------------------------------------------------------------
 * 2. Four hours of candles → one structure per served timeframe
 * ---------------------------------------------------------- */

function oneInputTwoLayers() {
    const { engine, published, publishCandle } = createHarness();

    for (let index = 0; index < FEED; index += 1) publishCandle(index);

    const on = (event) => entriesOn(published, topicOf(event));
    const minBars = engine.modules.priceAction.stats().bars.publish;

    ok(engine.counters.ingested === FEED, `every candle frame reached the engine (${engine.counters.ingested})`);
    ok(engine.counters.unrouted === 0 && engine.counters.errors === 0 && engine.counters.skipped === 0,
        "every frame had a route, every frame was usable, and nothing threw");
    ok(minBars === 6, `the module publishes from ${minBars} bars, as the engine was configured`);

    ok(on("price_action_1m").length === FEED - minBars + 1,
        `1m published once per closed bar (${on("price_action_1m").length})`);
    ok(on("price_action_5m").length === Math.floor(FEED / 5) - minBars + 1,
        `5m once per closed 5m bar (${on("price_action_5m").length})`);
    ok(on("price_action_15m").length === Math.floor(FEED / 15) - minBars + 1,
        `15m once per closed 15m bar (${on("price_action_15m").length})`);

    /* A timeframe the module does not serve has a topic in the table and no
     * publication at all: nothing is announced before it can be answered. */
    ok(PRICE_ACTION_TIMEFRAMES.length === 6 && !SERVED.includes("1h"),
        "the topic table knows six timeframes; this module was built with three");
    ok(!published.some((entry) => /analytics\.crypto\.btc\.price_action_(1h|4h|1d)$/.test(String(entry.topic))),
        "and the three it was not built with published nothing");

    /* The topic, the channel and the envelope around one reading. */
    const last = on("price_action_1m").pop();
    const reading = readingOf(last);
    const newest = feed[FEED - 1];

    ok(last.channel === "analytics:crypto:BTCUSDT:price_action_1m", `the reading rides the analytics channel (${last.channel})`);
    ok(last.topic === topicOf("price_action_1m"), "and the topic of its own timeframe");
    ok(last.envelope.meta.sourceType === SOURCE_TYPE.ANALYTICS, "the frame says which layer produced it");
    ok(last.envelope.meta.provenance.sourceEvent === "candle", "and provenance remembers the frame it was read from");

    ok(reading.symbol === SYMBOL && reading.timeframe === "1m" && reading.interval === MINUTE,
        "the reading names its instrument and its timeframe");
    ok(reading.openTime === newest.openTime && reading.closeTime === newest.closeTime,
        "and it is about one bar: the newest closed one");
    ok(reading.price === newest.close && reading.source === "native" && reading.builtFrom === 1,
        "its price is that bar's close, and the bar came from the venue as one bar");
    near(reading.changePct, ((newest.close - newest.open) / newest.open) * 100, "the change it states is the bar's own move");
    ok(reading.barAge === (newest.openTime + MINUTE) - newest.closeTime,
        "and it says how long the bar had been closed when it was read");
    ok(reading.series.bars === FEED && reading.series.contiguous === true && reading.series.gaps === 0,
        "the series behind it holds every bar of the feed, with no hole in it");
    ok(reading.structure.range.from === feed[0].openTime && reading.structure.range.to === newest.openTime,
        "and the structure states the window it was read over");

    /* The indicator layer reads the very same bars: one input, two views. */
    const indicators = readingOf(entriesOn(published, topicOf("indicators_1m")).pop());

    ok(indicators.bar.openTime === reading.bar.openTime && indicators.bar.close === reading.bar.close,
        "the indicator layer and the price-action layer read the same closed bar");

    /* A six-market ticker carrying a bar feeds the same module, and the reading
     * keeps the frame's asset class: gold stays commodities. */
    const gold = createHarness();

    for (let index = 0; index < 6; index += 1) {
        gold.publishMarket(tickerReading(index), {
            symbol: "XAUUSD",
            exchange: "goldapi",
            assetClass: ASSET_CLASS.COMMODITIES
        });
    }

    const goldEntries = entriesOn(gold.published, "analytics.commodities.xau.price_action_1m");

    ok(goldEntries.length === 1, `a ticker that carried a bar published one structure (${goldEntries.length})`);
    ok(readingOf(goldEntries[0]).bar.openTime === barAt(5).openTime, "…on the bar the frame carried");
    ok(goldEntries[0].channel === "analytics:commodities:XAUUSD:price_action_1m", "…on the commodity's own channel");
    ok(entriesOn(gold.published, topicOf("price_action_1m")).length === 0, "and nothing on the crypto topic");
    ok(gold.engine.modules.priceAction.stats().counters.published === 1, "the module published exactly one edge");
}

/* ------------------------------------------------------------
 * 3. The same structures on the real series, back to the bars
 * ---------------------------------------------------------- */

function structuresPointBackAtTheirBars() {
    const { engine, published, publishCandle } = createHarness();

    for (let index = 0; index < FEED; index += 1) publishCandle(index);

    const reading = readingOf(entriesOn(published, topicOf("price_action_5m")).pop());
    const structure = reading.structure;
    const counts = structure.counts;
    const bars = engine.modules.priceAction.barsOf(SYMBOL, "5m");
    const at = (index) => bars[index];
    const newest = (list) => (list.length ? list[list.length - 1] : null);

    ok(bars.length === FEED / 5 && reading.series.bars === FEED / 5,
        `the 5m ring holds the ${FEED / 5} bars the feed built (${bars.length})`);
    ok(structure.range.from === bars[0].openTime && structure.range.to === bars[bars.length - 1].openTime,
        "and the structure was read over exactly that window");

    /* The swings: the module's count is the rule's count, worked out again. */
    const reference = referenceSwings(bars, STRENGTH);

    ok(counts.swings.highs === reference.highs.length && counts.swings.lows === reference.lows.length,
        `every high and low of the window is found, and nothing else (${counts.swings.highs}/${counts.swings.lows})`);
    ok(structure.levels.high !== null && structure.levels.high.index === newest(reference.highs).index
        && structure.levels.high.price === newest(reference.highs).price
        && structure.levels.low !== null && structure.levels.low.index === newest(reference.lows).index
        && structure.levels.low.price === newest(reference.lows).price,
        "the levels are the newest confirmed extreme each way, and they are that confirmation itself");

    /* The breaks: each one is the close of the bar it names, beyond its level. */
    ok(counts.breaks > 0, `the window produced breaks (${counts.breaks})`);
    ok(structure.breaks.every((event) => at(event.index).openTime === event.openTime && at(event.index).close === event.price),
        "each break names a bar of the window, and its price is that bar's close");
    ok(structure.breaks.every((event) => (event.side === "up" ? event.price > event.level : event.price < event.level)),
        "…a close that went beyond the level it points at");
    ok(structure.breaks.every((event) => at(event.levelIndex).openTime === event.levelOpenTime
        && (event.side === "up" ? at(event.levelIndex).high === event.level : at(event.levelIndex).low === event.level)),
        "…and the level is the extreme of the bar it names");
    ok(structure.trend === structure.breaks[structure.breaks.length - 1].side,
        "the trend is the direction of the newest break, not a separate opinion");
    ok(structure.bias === newest(structure.breaks), "and the bias is that same break");

    /* The gaps: each standing gap is a hole between the first and third bar. */
    ok(counts.gaps >= counts.filledGaps,
        `filled gaps are counted inside the gaps (${counts.gaps} gaps, ${counts.filledGaps} filled)`);
    ok(structure.fairValueGaps.every((gap) => gap.filled === null && gap.size === gap.top - gap.bottom && gap.size > 0),
        "what is listed is still there: an unfilled hole, sized by the hole itself");
    ok(structure.fairValueGaps.every((gap) => (gap.side === "bullish"
        ? at(gap.index - 2).high === gap.bottom && at(gap.index).low === gap.top
        : at(gap.index - 2).low === gap.top && at(gap.index).high === gap.bottom)),
        "each gap is the hole between the first and the third of the three bars that made it");
    ok(structure.fairValueGaps.every((gap) => gap.touched === null || at(gap.touched.index) !== undefined),
        "and every gap that was tested names the bar that tested it");

    /* The blocks: each one is a bar of the window, at the origin of a leg. */
    ok(structure.orderBlocks.every((block) => at(block.index).low === block.bottom && at(block.index).high === block.top),
        "each order block is the range of the bar it names");
    ok(structure.orderBlocks.every((block) => block.touched === null || block.touched.index > block.index),
        "a block price came back into says so, and the bar that touched it came after it");
    ok(structure.orderBlocks.every((block) => block.broken === null && block.index < block.breakIndex
        && at(block.breakIndex).openTime === block.breakOpenTime),
        "and every block still standing was made before the break it belongs to");

    /* The sweeps: a wick past a level, and a close that came back inside. */
    ok(structure.sweeps.every((sweep) => (sweep.side === "high"
        ? at(sweep.index).high === sweep.extreme && sweep.extreme > sweep.level && sweep.price <= sweep.level
        : at(sweep.index).low === sweep.extreme && sweep.extreme < sweep.level && sweep.price >= sweep.level)),
        "each sweep is a wick beyond the level and a close back inside it");
    ok(structure.sweeps.every((sweep) => at(sweep.index).openTime === sweep.openTime
        && sweep.levelOpenTime === at(sweep.levelIndex).openTime),
        "…pointing back at both the bar that swept and the bar that set the level");
    ok(structure.sweeps.every((sweep) => !structure.breaks.some((event) => event.index === sweep.index
        && (event.side === "up") === (sweep.side === "high"))),
        "no bar is both a break and a sweep of the same side: a wick is a sweep, a close is a break");

    /* The bounded lists are the newest of what the counts say, and the counts are
     * the whole truth: a bounded list never reads as the whole window. */
    const bounded = (label, list, total) => {
        ok(list.length === Math.min(total, reading.params.maxStructures),
            `${label}: the list is the newest of what its count says (${list.length} of ${total})`);
    };

    bounded("breaks", structure.breaks, counts.breaks);
    bounded("gaps", structure.fairValueGaps, counts.gaps - counts.filledGaps);
    bounded("blocks", structure.orderBlocks, counts.blocks - counts.consumedBlocks);
    bounded("sweeps", structure.sweeps, counts.sweeps);

    ok(structure.fairValueGap === newest(structure.fairValueGaps)
        && structure.orderBlock === newest(structure.orderBlocks)
        && structure.sweep === newest(structure.sweeps),
        "the single \"the one\" each kind answers with is the newest of its list");
}
/* ------------------------------------------------------------
 * 4. One frame may close no bar — and then it publishes nothing
 * ---------------------------------------------------------- */

function publicationIsEdgeTriggered() {
    const { engine, published, publishCandle } = createHarness();
    const on = (event) => entriesOn(published, topicOf(event));
    const stats = () => engine.modules.priceAction.stats();

    /* Five bars are not a window: nothing is read, nothing is published. */
    for (let index = 0; index < 5; index += 1) publishCandle(index);
    ok(on("price_action_1m").length === 0, "five bars are not enough to read a structure");
    ok(stats().counters.insufficient > 0, "and the module says why it stayed quiet instead of guessing");

    /* The sixth closed bar is the first edge. */
    publishCandle(5);
    ok(on("price_action_1m").length === 1, `the sixth bar is the first reading (${on("price_action_1m").length})`);
    ok(on("price_action_5m").length === 0 && on("price_action_15m").length === 0,
        "a timeframe that closed no bar of its own stays silent");
    ok(stats().counters.published === 1, "the module published exactly once");
    ok(engine.modules.priceAction.pending(SYMBOL, "1m") === null, "and the edge is spent: asking again answers null");

    /* The same bar again: a replayed or revised frame — nothing new to say. */
    publishCandle(5);
    ok(on("price_action_1m").length === 1, "a bar the ring already holds publishes nothing");
    ok(stats().counters.duplicate === 1 && stats().counters.native === 6 && stats().counters.aggregated === 1,
        `…and is counted as a bar already held: six the venue sent, one the layer built (dup ${stats().counters.duplicate})`);

    /* An unfinished bar is not a bar. */
    publishCandle(6, candleFrame(6, "1m", { isClosed: false }));
    ok(on("price_action_1m").length === 1, "an unfinished bar publishes nothing");
    ok(stats().counters.open === 1, "…and is counted as unfinished");

    /* A bar older than the newest is refused, never slipped into the series. */
    const lateBefore = stats().counters.late;
    publishCandle(2);
    ok(on("price_action_1m").length === 1, "a bar older than the newest one is refused: nothing is read again");
    ok(stats().counters.late - lateBefore === 2,
        "…and every ring it could not be used in counts it (the 1m ring and the 5m bucket)");
    ok(engine.modules.priceAction.barsOf(SYMBOL, "1m").length === 6
        && engine.modules.priceAction.barsOf(SYMBOL, "1m")[5].openTime === barAt(5).openTime,
        "…and the series still ends where it ended: six bars, the newest still last");

    /* The next closed bar is one more edge, and the cache is one per edge. */
    publishCandle(6);
    ok(on("price_action_1m").length === 2, "the next closed bar publishes once");

    const first = readingOf(entriesOn(published, topicOf("price_action_1m"))[1]);
    const again = engine.modules.priceAction.reading(SYMBOL, "1m");

    ok(again.structure === first.structure, "asking twice about one bar answers with one structure, not two");
    ok(stats().state.edges === 2, "only the timeframes that have closed a bar of their own have an edge to spend");
    ok(stats().state.rings.total === 3 && engine.modules.priceAction.barsOf(SYMBOL, "15m") === null,
        "the 15m ring is there and empty: it is neither read nor filled ahead of its own bars");

    publishCandle(7);
    const next = engine.modules.priceAction.reading(SYMBOL, "1m");

    ok(next.structure !== first.structure && next.structure.range.to === barAt(7).openTime
        && next.structure.range.from === first.structure.range.from,
        "a new closed bar is a new structure: the same window, one bar longer");
    ok(next.series.bars === first.series.bars + 1 && next.series.contiguous === true,
        "and it is read over exactly the bars the series holds, with no hole behind them");
}

/* ------------------------------------------------------------
 * 5. What cannot be read is counted, never guessed at
 * ---------------------------------------------------------- */

function refusalsAreCountedNotGuessed() {
    /* A window with room for one pivot is not a window: the module refuses the
     * number it cannot honour, and says so out loud. */
    const floored = createHarness({ minBars: 3 });
    const corrected = floored.engine.modules.priceAction.stats();

    ok(corrected.warnings.length === 1 && /below one swing neighbourhood/.test(corrected.warnings[0]),
        `a publish window shorter than one swing neighbourhood is corrected out loud (${corrected.warnings[0]})`);
    ok(corrected.bars.publish === STRENGTH * 2 + 1,
        `…to the smallest window that can hold a pivot (${corrected.bars.publish}), not to the number asked for`);

    for (let index = 0; index < STRENGTH * 2; index += 1) floored.publishCandle(index);
    ok(entriesOn(floored.published, topicOf("price_action_1m")).length === 0,
        "four bars are still not enough to read a structure");
    floored.publishCandle(STRENGTH * 2);
    ok(entriesOn(floored.published, topicOf("price_action_1m")).length === 1,
        "the fifth is: the corrected window is the one it reads by");

    /* Frames that are not bars: counted where they are refused, and silent. */
    const { engine, published, publishCandle, publishMarket } = createHarness();
    const stats = () => engine.modules.priceAction.stats();
    const readings = () => entriesOn(published, topicOf("price_action_1m")).length;

    for (let index = 0; index < 6; index += 1) publishCandle(index);

    const before = readings();

    publishCandle(6, candleFrame(6, "1m", { interval: undefined, barInterval: undefined }));
    ok(readings() === before && stats().counters.unknownInterval === 1,
        "a frame with no interval is refused, and publishes nothing — the route never invents one");

    publishCandle(6, candleFrame(6, "1m", { high: 0 }));
    ok(readings() === before && stats().counters.invalidBar === 1,
        "a bar with a price of zero is a missing price, not a price: refused, and counted");

    publishCandle(6, candleFrame(6, "1m", { high: 40, low: 12 }));
    ok(readings() === before && stats().counters.invalidBar === 2,
        "…and neither is a bar that cannot exist, whatever its four numbers look like");

    publishMarket(tickerReading(6, { open: undefined, high: undefined, low: undefined, close: undefined }), {
        symbol: "XAUUSD",
        exchange: "goldapi",
        assetClass: ASSET_CLASS.COMMODITIES
    });
    ok(readings() === before && stats().counters.invalidBar === 3,
        "…and a quote with no bar in it is legal input that is still not a bar");

    ok(engine.modules.priceAction.barsOf(SYMBOL, "1m").length === 6,
        "after all of that the series holds the six bars it held: nothing was repaired into it");
    ok(entriesOn(published, "analytics.commodities.xau.price_reading").length === 1,
        "while the quote itself was still read by the layer that reads quotes");

    publishCandle(7);
    ok(readings() === before + 1, "and the next real bar is read as if nothing had happened");

    /* A timeframe the module was not built with is not a timeframe it guesses. */
    ok(engine.modules.priceAction.reading(SYMBOL, "1h") === null
        && engine.modules.priceAction.pending(SYMBOL, "1h") === null,
        "a timeframe it does not serve answers nothing, rather than borrowing a neighbour's bars");
    ok(stats().timeframes.length === SERVED.length && !stats().timeframes.includes("1h"),
        "and it serves exactly the timeframes it was built with");
}

/* ------------------------------------------------------------
 * 6. The engine's own traffic, and the reads it answers
 * ---------------------------------------------------------- */

function theEngineKeepsItsOwnTrafficOut() {
    const { bus, engine, published, publishCandle } = createHarness();

    for (let index = 0; index < FEED; index += 1) publishCandle(index);

    const ownReading = bus.state.history.find((entry) => String(entry.channel).startsWith("analytics:"));

    ok(ownReading !== undefined && ownReading.payload.envelope.meta.sourceType === SOURCE_TYPE.ANALYTICS,
        "the readings do reach the bus the engine listens to, wrapped in the envelope that says what they are");
    ok(engine.counters.ingested === FEED && engine.counters.invalid === 0,
        `…and a frame was counted for every candle, and no more (${engine.counters.ingested})`);

    const before = engine.counters.ingested;
    const readings = entriesOn(published, topicOf("price_action_1m")).length;

    /* The engine's own output, published onto the bus it also listens to. */
    bus.publish(ownReading.payload, {});
    ok(engine.counters.ingested === before, "publishing one of its own readings again is not an input");
    ok(entriesOn(published, topicOf("price_action_1m")).length === readings,
        "…and it starts no second round of readings on the bar it came from");

    /* What the engine holds, and what it does not pretend to hold. */
    const snapshot = engine.snapshot({ symbol: SYMBOL });

    ok(snapshot.priceAction !== null && snapshot.priceAction.timeframes["5m"].series.bars === FEED / 5,
        `the snapshot shows the bars the module holds on a served timeframe (${FEED / 5} of 5m)`);
    ok(!Object.prototype.hasOwnProperty.call(snapshot.priceAction.timeframes, "1h"),
        "and the timeframes it was not built with are absent, not empty-looking");
    ok(engine.stats().modules.includes("priceAction") && engine.stats().subscribers > 0,
        "the engine counts the layer among its modules, and itself among the bus's subscribers");

    /* Reading on demand answers what the last edge answered, not a second opinion. */
    const reading = engine.modules.priceAction.reading(SYMBOL, "5m");
    const publishedFive = readingOf(entriesOn(published, topicOf("price_action_5m")).pop());

    ok(reading.source === "aggregated" && reading.builtFrom === 5,
        `a 5m bar states how many venue bars it was built from (${reading.builtFrom})`);
    ok(reading.structure.range.from === publishedFive.structure.range.from
        && reading.structure.counts.breaks === publishedFive.structure.counts.breaks
        && reading.structure.bias.side === publishedFive.structure.bias.side,
        "and the structure read now is the structure the last edge published");

    /* Forgetting an instrument forgets its bars — and so the structure on them. */
    const countersBefore = engine.modules.priceAction.stats().counters;
    const dropped = engine.reset({ symbol: SYMBOL });

    ok(dropped.priceAction === SERVED.length,
        `a reset drops the symbol's rings, one per served timeframe (${dropped.priceAction})`);
    ok(engine.modules.priceAction.snapshot(SYMBOL) === null && engine.modules.priceAction.reading(SYMBOL, "5m") === null,
        "…and with the bars gone the structure built on them goes too, rather than being remembered");
    ok(engine.modules.priceAction.stats().state.rings.total === 0
        && engine.modules.priceAction.stats().state.bars === 0,
        "the module holds no rings and no bars at all");
    ok(engine.modules.priceAction.stats().counters.published === countersBefore.published,
        "while the counters stay the history of what happened: a reset frees state, it does not rewrite it");
}

/* ------------------------------------------------------------
 * The seam, end to end
 * ---------------------------------------------------------- */

swingsNeedTheirNeighbourhood();
breaksNeedAClose();
gapsAreGaps();
blocksAreTheLegsOrigin();
oneInputTwoLayers();
structuresPointBackAtTheirBars();
publicationIsEdgeTriggered();
refusalsAreCountedNotGuessed();
theEngineKeepsItsOwnTrafficOut();

console.log(`A10 price-action seam: ${checks} checks passed`);

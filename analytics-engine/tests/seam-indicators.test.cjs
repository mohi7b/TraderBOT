/**
 * A9 — Seam: a bar on the bus → the indicator layer → indicators_* topics
 * collector/crypto/realtime + collector/liquidity_6markets + analytics-engine
 * ============================================================
 * The indicator module's own tests drive ingestCandle() directly. This test
 * walks the path a bar really takes: a frame on the Realtime event bus (the
 * shape the collector's candles.cjs emits, and the shape the six-market layer's
 * ticker carries), through the router's candle route, into the module, and out
 * again as analytics.<assetClass>.<asset>.indicators_<timeframe>.
 *
 * What it pins down, beyond "a reading came out":
 *
 *   1. one input frame → one reading per served timeframe, on that timeframe's
 *      own topic, and no topic at all for a timeframe the module does not serve
 *   2. the numbers are the numbers: RSI (Wilder), SMA, EMA, the Bollinger band
 *      and both VWAPs are re-computed here, from the same bars, and compared
 *   3. publication is edge-triggered: a duplicate bar, an unfinished bar and a
 *      late bar publish nothing; the next closed bar publishes exactly once
 *   4. a six-market ticker that carries a bar feeds the liquidity module and
 *      the indicator module at the same time (one input, several readings),
 *      while a quote-only ticker feeds the liquidity module alone — and the
 *      reading keeps the frame's asset class (gold stays commodities)
 *   5. refusals are counted, never guessed around: a frame with no interval, a
 *      bar that cannot exist, a flat market with no RSI, a ring still too short
 *   6. the engine's own analytics traffic never comes back in as an input —
 *      and the engine's reads around it (snapshot, stats, reset) keep working
 *
 * The one honest gap it also documents: the frame the realtime collector emits
 * today carries the bar's OHLCV but not the venue's interval word, so the
 * module counts it `unknownInterval` and publishes nothing (§6). The venues do
 * send one (binance's `candle.i`, the six-market `barInterval`), and the moment
 * it reaches the frame the same series reads; the module refuses to bridge that
 * last field with a guess, which is the point of the counters.
 *
 * Run: node analytics-engine/tests/seam-indicators.test.cjs
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
const { INDICATOR_TIMEFRAMES } = require(path.join(__dirname, "..", "topics.cjs"));

const MINUTE = 60_000;
const DAY = 86_400_000;
const START = Date.parse("2026-09-27T12:00:00.000Z");
const SERVED = ["1m", "5m", "15m"];
const FEED = 240;                    // four hours of one-minute bars
const ASSET = "btc";
const SYMBOL = "BTCUSDT";

let checks = 0;
const ok = (condition, message) => {
    assert.ok(condition, `A9: ${message}`);
    checks += 1;
};
const near = (left, right, message, tolerance = 1e-9) => {
    const same = typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= tolerance;
    assert.ok(same, `A9: ${message} (got ${left}, expected ${right})`);
    checks += 1;
};
/** The topic of one reading, spelled the way the topic table spells it. */
const topicOf = (event, asset = ASSET) => `analytics.crypto.${asset}.${event}`;

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
            const channel = [market, exchange, symbol, entry.event].join(":");
            const wrapped = {
                channel,
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
function candleFrame(index, interval = "1m") {
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
        interval
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

/* ------------------------------------------------------------
 * The same numbers, computed here — the test's own arithmetic
 * ---------------------------------------------------------- */

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => sum(values) / values.length;
const populationStd = (values) => {
    const average = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

/** Wilder's RSI, seeded with the first `period` changes — what tulind computes. */
function referenceRsi(closes, period) {
    let gain = 0;
    let loss = 0;

    for (let at = 1; at <= period; at += 1) {
        const change = closes[at] - closes[at - 1];
        if (change > 0) gain += change;
        else loss -= change;
    }

    let averageGain = gain / period;
    let averageLoss = loss / period;

    for (let at = period + 1; at < closes.length; at += 1) {
        const change = closes[at] - closes[at - 1];
        averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
        averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    }

    return averageGain + averageLoss === 0 ? null : 100 * (averageGain / (averageGain + averageLoss));
}

/**
 * tulind's EMA, as the library computes it: seeded with the FIRST close and
 * smoothed over every bar after it (its `start([period])` is 0, verified against
 * the binding: an EMA rung answers from the first bar of the ring, so it has no
 * warmup the way RSI and the bands do).
 */
function referenceEma(closes, period) {
    const weight = 2 / (period + 1);
    let ema = closes[0];

    for (let at = 1; at < closes.length; at += 1) ema = (closes[at] - ema) * weight + ema;
    return ema;
}

/** Volume-weighted average at the typical price ((high + low + close) / 3). */
function referenceVwap(bars) {
    let weighted = 0;
    let volume = 0;

    for (const bar of bars) {
        const typical = (bar.high + bar.low + bar.close) / 3;
        weighted += typical * bar.volume;
        volume += bar.volume;
    }

    return volume > 0 ? weighted / volume : null;
}

/** The same one-minute bars folded into `size`-bar UTC buckets. */
function aggregate(bars, size) {
    const buckets = [];

    for (let at = 0; at + size <= bars.length; at += size) {
        const slice = bars.slice(at, at + size);

        buckets.push({
            openTime: slice[0].openTime,
            closeTime: slice[slice.length - 1].closeTime,
            open: slice[0].open,
            high: Math.max(...slice.map((bar) => bar.high)),
            low: Math.min(...slice.map((bar) => bar.low)),
            close: slice[slice.length - 1].close,
            volume: sum(slice.map((bar) => bar.volume))
        });
    }

    return buckets;
}

/* ------------------------------------------------------------
 * The engine under test, wired to the bus it also publishes onto
 * ---------------------------------------------------------- */

function createHarness(indicators = {}) {
    let at = START;
    const bus = fakeBus(() => at);
    const published = [];

    const engine = createEngine({
        bus,
        now: () => at,
        /* Every published entry in order, with no ring buffer in the way. */
        sink: (entry) => published.push(entry),
        indicators: { timeframes: SERVED, minBars: 6, maxBars: 256, ...indicators }
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

    return { bus, engine, published, arriveAt: arrivesAt, publishCandle, publishMarket };
}

/** The publications of one topic, in order. */
const entriesOn = (published, topic) => published.filter((entry) => entry.topic === topic);
/** The reading inside one published analytics entry. */
const readingOf = (entry) => entry.envelope.payload;
/** The module's counters, asked for live — stats() answers with a snapshot. */
const countersOf = (engine) => engine.modules.indicators.stats().counters;

/* ------------------------------------------------------------
 * 1. Four hours of candles → the served timeframes, and only those
 * ---------------------------------------------------------- */

function candlesThroughTheBus() {
    const { engine, published, publishCandle } = createHarness();

    for (let index = 0; index < FEED; index += 1) publishCandle(index);

    const oneMinute = entriesOn(published, topicOf("indicators_1m"));
    const fiveMinute = entriesOn(published, topicOf("indicators_5m"));
    const fifteenMinute = entriesOn(published, topicOf("indicators_15m"));
    const readings = oneMinute.length + fiveMinute.length + fifteenMinute.length;

    ok(engine.counters.ingested === FEED, `every candle frame reached the engine (${engine.counters.ingested})`);
    ok(engine.counters.unrouted === 0, "every candle frame had a route");
    ok(engine.counters.skipped === 0 && engine.counters.errors === 0, "no candle frame was skipped and nothing threw");
    ok(engine.counters.ingested === FEED,
        `and none of the ${readings} readings the engine published came back in as an input`);

    /* One publication per closed bar of each timeframe: the first bar a
     * timeframe can be read from is `minBars`, and every closed bar after it. */
    const minBars = engine.modules.indicators.stats().bars.publish;
    ok(minBars === 6, `the module publishes from ${minBars} bars, as the engine was configured`);
    ok(oneMinute.length === FEED - minBars + 1, `1m published once per closed bar (${oneMinute.length})`);
    ok(fiveMinute.length === Math.floor(FEED / 5) - minBars + 1, `5m published once per closed 5m bar (${fiveMinute.length})`);
    ok(fifteenMinute.length === Math.floor(FEED / 15) - minBars + 1, `15m published once per closed 15m bar (${fifteenMinute.length})`);

    /* A timeframe the module does not serve has no topic and no publication,
     * even though the topic table names six of them. */
    ok(INDICATOR_TIMEFRAMES.length === 6 && !SERVED.includes("1h"),
        "the topic table knows six timeframes; the module was built with three");
    ok(!published.some((entry) => /\.indicators_(1h|4h|1d)$/.test(entry.topic || "")),
        "an unserved timeframe publishes nothing — no empty topic is announced");

    /* The topic, the channel and the envelope around one reading. */
    const last = oneMinute[oneMinute.length - 1];
    const reading = readingOf(last);
    const newest = feed[FEED - 1];

    ok(last.channel === "analytics:crypto:BTCUSDT:indicators_1m", `the reading rides the analytics channel (${last.channel})`);
    ok(last.topic === topicOf("indicators_1m"), "and the topic of its timeframe");
    ok(last.envelope.meta.sourceType === SOURCE_TYPE.ANALYTICS, "the frame names its own layer");
    ok(last.envelope.meta.provenance.sourceEvent === "candle", "provenance remembers the frame it was read from");
    ok(engine.publications({ topic: topicOf("indicators_1m"), limit: 1 }).length === 1, "the engine's own buffer answers per topic");

    ok(reading.symbol === SYMBOL && reading.timeframe === "1m", "the reading names its symbol and its timeframe");
    ok(reading.bar.openTime === newest.openTime, "and carries the bar it was computed on");
    ok(reading.bar.closeTime === newest.closeTime, "with the venue's own close time, not a guess");
    ok(reading.series.bars === FEED && reading.series.gaps === 0, `the ring holds all ${FEED} bars with no gap`);
    ok(reading.source === "native" && reading.builtFrom === 1, "a venue candle is a native bar, built from one frame");
    ok(reading.barAge === 1, "the bar was 1 ms old when the reading was taken (the closing bar's arrival)");

    return { engine, published, minBars, oneMinute, fiveMinute, fifteenMinute };
}

/* ------------------------------------------------------------
 * 2. The numbers, against the test's own arithmetic
 * ---------------------------------------------------------- */

function checkIndicators(reading, bars, { source, builtFrom }) {
    const params = reading.params;
    const closes = bars.map((bar) => bar.close);
    const newest = bars[bars.length - 1];
    const label = reading.timeframe;

    ok(reading.bar.openTime === newest.openTime && reading.bar.open === newest.open,
        `${label}: the reading carries the newest bar of the series it read`);
    ok(reading.bar.high === newest.high && reading.bar.low === newest.low && reading.bar.close === newest.close,
        `${label}: OHLC is the bars' own, never an average`);
    ok(reading.bar.volume === newest.volume, `${label}: and the volume is the venue's`);
    ok(reading.source === source && reading.builtFrom === builtFrom,
        `${label}: a ${source} bar, ${reading.builtFrom} one-minute bar(s) behind it`);
    ok(reading.indicators.bars === bars.length, `${label}: ${bars.length} bars behind the reading`);

    /* RSI — Wilder, exactly as tulind runs it. */
    const expectedRsi = referenceRsi(closes, params.rsi);
    if (expectedRsi === null) ok(reading.indicators.rsi === null, `${label}: a window with no movement has no RSI`);
    else near(reading.indicators.rsi, expectedRsi, `${label}: RSI(${params.rsi}) is Wilder's RSI`);

    /* The ladders, rung by rung: a rung the ring cannot fill is null, never a
     * shorter average wearing a longer period's name. */
    for (const [period, value] of Object.entries(reading.indicators.sma)) {
        const span = Number(period);
        if (closes.length < span) ok(value === null, `${label}: SMA(${period}) is null with ${closes.length} bars`);
        else near(value, mean(closes.slice(-span)), `${label}: SMA(${period}) is the mean of the last ${period} closes`);
    }
    for (const [period, value] of Object.entries(reading.indicators.ema)) {
        /* tulind's EMA starts at the first bar (start 0), so a rung has no
         * warmup to report: it answers over every bar the ring holds. */
        ok(value !== null, `${label}: EMA(${period}) answers from the first bar, as tulind's EMA does`);
        near(value, referenceEma(closes, Number(period)), `${label}: EMA(${period}) is tulind's EMA over the ring`);
    }

    /* MACD and its signal are the library's; the histogram is arithmetic. */
    const macd = reading.indicators.macd;
    if (macd === null) {
        const need = params.macd.slow + params.macd.signal;
        ok(bars.length < need, `${label}: MACD is null because ${bars.length} bars are under the ${need} it needs`);
    } else {
        ok(Number.isFinite(macd.macd) && Number.isFinite(macd.signal), `${label}: MACD and its signal are numbers`);
        near(macd.histogram, macd.macd - macd.signal, `${label}: the histogram is MACD minus its signal`);
    }

    /* Bollinger: the middle band is the SMA, the bands are symmetric and as wide
     * as the population standard deviation says. */
    const bollinger = reading.indicators.bollinger;
    const band = params.bollinger.period;
    if (bollinger === null) {
        ok(closes.length < band, `${label}: Bollinger(${band}) is null with ${closes.length} bars`);
    } else {
        const middle = mean(closes.slice(-band));
        near(bollinger.middle, middle, `${label}: the middle band is SMA(${band})`);
        near(bollinger.upper - middle, middle - bollinger.lower, `${label}: the bands are symmetric around it`);
        near(bollinger.upper - middle, params.bollinger.stdDev * populationStd(closes.slice(-band)),
            `${label}: and ${params.bollinger.stdDev} standard deviations wide`);
    }

    /* Both VWAPs, weighted at the typical price of every bar that carried one. */
    const vwap = reading.indicators.vwap;
    const windowBars = Math.min(params.vwap.window, bars.length);
    near(vwap.window, referenceVwap(bars.slice(-windowBars)), `${label}: the window VWAP weights each bar at its typical price`);
    ok(vwap.windowBars === windowBars, `${label}: ${windowBars} bars went into the window average`);
    ok(vwap.windowComplete === (bars.length >= params.vwap.window),
        `${label}: the window average says whether the whole window was there`);
    ok(vwap.volume === sum(bars.slice(-windowBars).map((bar) => bar.volume)), `${label}: and reports the volume it weighed`);

    const dayStart = Math.floor(newest.openTime / DAY) * DAY;
    if (params.vwap.session === false) {
        ok(vwap.session === null && vwap.sessionBars === 0, `${label}: no session VWAP was asked for, none was invented`);
    } else {
        ok(vwap.sessionDay === dayStart, `${label}: the session is the UTC day the newest bar belongs to`);
        near(vwap.session, referenceVwap(bars), `${label}: the session VWAP weights every bar of that day in the ring`);
        ok(vwap.sessionBars === bars.length && vwap.sessionFrom === bars[0].openTime,
            `${label}: ${bars.length} bars, from the oldest one held`);
        ok(vwap.sessionComplete === (bars[0].openTime === dayStart),
            `${label}: and says so when the day's first bars are missing (complete: ${vwap.sessionComplete})`);
    }
}

/** Four hours of 1m candles: the 1m, 5m and 15m readings, all three verified. */
function theNumbersAreTheNumbers() {
    const { published, publishCandle } = createHarness();

    for (let index = 0; index < FEED; index += 1) publishCandle(index);

    const oneMinute = readingOf(entriesOn(published, topicOf("indicators_1m")).pop());
    const fiveMinute = readingOf(entriesOn(published, topicOf("indicators_5m")).pop());
    const fifteenMinute = readingOf(entriesOn(published, topicOf("indicators_15m")).pop());

    checkIndicators(oneMinute, feed, { source: "native", builtFrom: 1 });
    checkIndicators(fiveMinute, aggregate(feed, 5), { source: "aggregated", builtFrom: 5 });
    checkIndicators(fifteenMinute, aggregate(feed, 15), { source: "aggregated", builtFrom: 15 });

    ok(oneMinute.indicators.ready === true && fiveMinute.indicators.ready === true,
        "1m and 5m carry the whole core set");
    ok(fifteenMinute.indicators.ready === false && fifteenMinute.indicators.warm === false,
        "15m says its ring is still short of the core set instead of pretending");
    ok(fifteenMinute.indicators.rsi !== null,
        "15m RSI is there all the same: sixteen bars are enough for RSI(14)");
    ok(fifteenMinute.indicators.bollinger === null,
        "15m Bollinger is null: sixteen bars are not enough for a 20-bar band");
    ok(oneMinute.series.capacity > oneMinute.series.bars,
        "the ring is a window with room left, not an ever-growing list");
}

/* ------------------------------------------------------------
 * 3. Publication is edge-triggered — one reading per closed bar
 * ---------------------------------------------------------- */

function edgeTriggered() {
    const { engine, published, publishCandle } = createHarness();

    for (let index = 0; index < 6; index += 1) publishCandle(index);

    ok(entriesOn(published, topicOf("indicators_1m")).length === 1,
        "the sixth bar is the first readable one for 1m: exactly one publication");
    ok(entriesOn(published, topicOf("indicators_5m")).length === 0,
        "and one closed 1m bar is not a closed 5m bar: no 5m publication");
    ok(countersOf(engine).invalidBar === 0 && countersOf(engine).open === 0,
        "and nothing had to be refused to get there");

    const before = published.length;

    publishCandle(5);                       // the same bar again
    ok(published.length === before && countersOf(engine).duplicate === 1,
        "a replayed bar publishes nothing and is counted a duplicate");

    publishCandle(6, { ...candleFrame(6), isClosed: false });
    ok(published.length === before && countersOf(engine).open === 1,
        "an unfinished bar publishes nothing, even though its close time has passed");

    publishCandle(4);                       // older than the newest bar
    ok(published.length === before && countersOf(engine).late === 2,
        "a late bar publishes nothing and rewrites no history — the 1m and the 5m ring both refuse it");

    publishCandle(6);                       // the same bar, now finished
    const after = entriesOn(published, topicOf("indicators_1m"));
    ok(after.length === 2 && published.length === before + 2,
        "the next closed bar publishes once per bar-reading module (indicators_1m · price_action_1m) — and only once each");
    ok(readingOf(after[1]).bar.openTime === barAt(6).openTime, "as a reading of that very bar");
    ok(readingOf(after[1]).series.bars === 7, "with seven bars in the ring behind it");
    ok(entriesOn(published, topicOf("indicators_5m")).length === 0, "and no 5m bar has closed yet");
}

/* ------------------------------------------------------------
 * 4. The six-market frame: one input, several readings
 * ---------------------------------------------------------- */

function sixMarketBar() {
    const { engine, published, publishMarket } = createHarness();

    /* Six minutes of gold tickers, each carrying the venue's last bar. */
    const gold = { symbol: "XAUUSD", exchange: "goldapi", assetClass: ASSET_CLASS.COMMODITIES };
    for (let index = 0; index < 6; index += 1) publishMarket(tickerReading(index), gold);

    const goldEntries = published.filter((entry) => entry.symbol === "XAUUSD");
    const foreign = goldEntries.filter((entry) => !String(entry.topic).startsWith("analytics.commodities.xau."));
    ok(goldEntries.length >= 6, `one gold frame produced several readings (${goldEntries.length})`);
    ok(foreign.length === 0,
        `and every one of them stays commodities/xau — the frame names its asset class (${foreign.map((entry) => entry.topic).join(", ")})`);
    ok(goldEntries.some((entry) => entry.topic === "analytics.commodities.xau.price_reading"),
        "the liquidity module read the quote (price_reading)");

    const xau = entriesOn(published, "analytics.commodities.xau.indicators_1m");
    ok(xau.length === 1, `the indicator module read the same bar, once, on its own topic (${xau.length})`);
    const reading = readingOf(xau[0]);
    ok(reading.symbol === "XAUUSD" && reading.timeframe === "1m", "under the frame's own symbol and timeframe");
    ok(reading.bar.openTime === barAt(5).openTime,
        "the bar keeps the frame's own stamp — the six-market reading's timestamp");
    ok(reading.bar.close === barAt(5).close, "with the venue's close, and its volume");
    ok(reading.interval === MINUTE && reading.bar.intervalMs === MINUTE,
        "and the interval the frame named (barInterval 1m), not a default");
    ok(xau[0].envelope.meta.provenance.sourceEvent === "ticker",
        "the frame is remembered as the ticker that carried the bar");
    ok(reading.source === "native" && reading.series.bars === 6, "six native bars were ringed, one per frame");

    /* A quote-only ticker: legal input, no bar in it. */
    const before = published.length;
    const skips = engine.counters.skipped;
    publishMarket(
        { kind: "quote", price: 2412.5, bid: 2412.4, ask: 2412.6, timestamp: barAt(6).openTime },
        gold
    );

    ok(engine.counters.skipped === skips, "a quote with no bar in it is not a route skip");
    ok(engine.counters.errors === 0, "and nothing threw on it");
    ok(entriesOn(published, "analytics.commodities.xau.indicators_1m").length === 1, "no indicator reading came of it");
    ok(engine.modules.indicators.stats().counters.unknownInterval === 1,
        "the module counted what was missing (no interval to build a bar with)");
    ok(published.length > before, "while the liquidity module still read the quote");
}

/* ------------------------------------------------------------
 * 5. Refusals are counted, never guessed around
 * ---------------------------------------------------------- */

function refusalsAreCounted() {
    const { engine, published, publishCandle } = createHarness();

    /* A bar that cannot exist: its high is below its low. */
    const broken = candleFrame(0);
    publishCandle(0, { ...broken, high: broken.low - 1, low: broken.high + 1 });
    ok(countersOf(engine).invalidBar === 1 && published.length === 0,
        "an impossible bar is refused and counted, not repaired");

    /* A frame with a timeframe but no prices at all. */
    publishCandle(0, { event: "candle", interval: "1m", timestamp: broken.timestamp, close: null });
    ok(countersOf(engine).invalidBar === 2 && published.length === 0, "a frame with no close is not a bar");

    /* A frame with prices but no interval word: nothing is invented for it. */
    publishCandle(0, {
        event: "candle",
        open: 1, high: 2, low: 0.5, close: 1.5, volume: 1,
        timestamp: broken.timestamp
    });
    ok(countersOf(engine).unknownInterval === 1 && published.length === 0,
        "a candle with no interval word is refused by the module, never read as a 1m bar");
    ok(engine.counters.skipped === 0, "and it is still not a route skip");

    /* A flat market: prices that did not move. Twenty bars, so every warmup is
     * behind us and none of these nulls can be blamed on a short ring. */
    const flat = { event: "candle", interval: "1m", isClosed: true, open: 100, high: 100, low: 100, close: 100, volume: 0 };
    for (let index = 0; index < 20; index += 1) {
        publishCandle(index, { ...flat, symbol: "FLATUSDT", timestamp: barAt(index).openTime });
    }

    const flatEntries = entriesOn(published, "analytics.crypto.flat.indicators_1m");
    const flatReading = readingOf(flatEntries[flatEntries.length - 1]);
    ok(flatReading.indicators.bars === 20 && flatReading.indicators.bars >= flatReading.params.rsi + 1,
        `the flat ring is past RSI(${flatReading.params.rsi})'s warmup, so its null is not "too few bars"`);
    ok(flatReading.indicators.rsi === null, "a market that did not move has no RSI (never a made-up 50)");
    ok(flatReading.indicators.atr === 0, "and an ATR of exactly zero, which is what a flat market is");
    ok(flatReading.indicators.bollinger.upper === 100 && flatReading.indicators.bollinger.lower === 100
        && flatReading.indicators.bollinger.middle === 100,
        "with Bollinger bands that collapse onto the price rather than inventing width");
    ok(flatReading.indicators.vwap.window === null && flatReading.indicators.vwap.volume === 0,
        "and no VWAP at all: a slice that carried no volume has no weighted average");
    ok(flatReading.bar.volume === 0 && flatReading.volumeComplete === true,
        "a sent zero volume is a volume, not a missing one");

    /* A symbol whose ring never reaches the publishable length. */
    for (let index = 0; index < 3; index += 1) {
        publishCandle(index, { ...candleFrame(index), symbol: "THINUSDT" }, "THINUSDT");
    }
    ok(!published.some((entry) => entry.symbol === "THINUSDT"), "three bars are not enough to read: nothing is published");
    ok(countersOf(engine).insufficient >= 3,
        `every refused attempt was counted (${countersOf(engine).insufficient} insufficient readings — an unreadable edge is retried, never consumed)`);
    ok(engine.counters.errors === 0, "nothing threw anywhere on the way");
}

/* ------------------------------------------------------------
 * 6. The frame the realtime collector emits today
 * ---------------------------------------------------------- */

function theCollectorFrameToday() {
    const { engine, published, publishCandle } = createHarness();

    /* collector/crypto/realtime/futures/candles/candles.cjs emits exactly this:
     * OHLCV and the bar's own stamp. The venue's interval and its isClosed word
     * do not survive the trip to the bus, and the module will not guess either. */
    const stripped = (index) => {
        const bar = barAt(index);

        return {
            event: "candle",
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            timestamp: bar.openTime
        };
    };

    for (let index = 0; index < 8; index += 1) publishCandle(index, stripped(index));

    ok(countersOf(engine).unknownInterval === 8,
        `all eight frames are counted (${countersOf(engine).unknownInterval}), none ringed`);
    ok(published.length === 0, "and no reading is published from a bar whose timeframe is unknown");
    ok(engine.counters.errors === 0 && engine.counters.skipped === 0,
        "the engine is not alarmed: this shows up in the module's counters, which is where it belongs");

    /* Add the one field the venue already sends (its interval) and the very same
     * series becomes readable — the difference between the collector's frame and
     * the venue packet is one field, and the module refuses to bridge it with a
     * guess. */
    for (let index = 0; index < 8; index += 1) publishCandle(index, { ...stripped(index), interval: "1m", isClosed: true });

    ok(countersOf(engine).unknownInterval === 8 && countersOf(engine).native === 8,
        "with the interval the same eight frames ring eight bars");
    ok(entriesOn(published, topicOf("indicators_1m")).length === 3,
        "and the 1m timeframe publishes from its sixth bar on (three readings)");
}

/* ------------------------------------------------------------
 * 7. The engine's own plumbing around the module
 * ---------------------------------------------------------- */

function theEnginesOwnPlumbing() {
    const { engine, published, publishCandle } = createHarness();

    for (let index = 0; index < FEED; index += 1) publishCandle(index);

    const snapshot = engine.snapshot({ symbol: SYMBOL });
    ok(snapshot.indicators !== null && snapshot.indicators.symbol === SYMBOL,
        "the engine's snapshot reaches into the indicator module");
    ok(snapshot.indicators.timeframes["1m"].series.bars === FEED,
        "with the series the readings came from");
    ok(snapshot.indicators.timeframes["1m"].reading.bar.openTime === barAt(FEED - 1).openTime,
        "and a reading on demand, without publishing one");
    ok(snapshot.indicators.timeframes["5m"].series.source === "aggregated"
        && snapshot.indicators.timeframes["5m"].series.bucketBars === 5,
        "the 5m ring says it was built from five 1m bars per bucket");
    ok(Object.keys(snapshot.indicators.timeframes).join(",") === SERVED.join(","),
        "and the snapshot knows exactly the timeframes the module serves");
    ok(engine.stats().modules.includes("indicators"), "the engine counts the indicator module among its own");

    const before = published.length;
    const dropped = engine.reset({ symbol: SYMBOL });

    ok(dropped.indicators === SERVED.length, `a reset drops one ring per served timeframe (${dropped.indicators})`);
    ok(dropped.indicators !== dropped.deltaFlow, "and reports it per module, not as one number");
    ok(engine.snapshot({ symbol: SYMBOL }).indicators === null,
        "the snapshot then says the symbol is gone instead of answering from a stale ring");
    ok(engine.modules.indicators.stats().counters.candles === FEED,
        "while the counters survive: they are history, not state");
    ok(published.length === before, "and a reset publishes nothing");
    ok(engine.modules.indicators.stats().library.loaded === true,
        `the library the numbers came from is tulind ${engine.modules.indicators.stats().library.version || ""}`.trim());
}

/* ------------------------------------------------------------
 * The seam, end to end
 * ---------------------------------------------------------- */

const through = candlesThroughTheBus();
ok(through.engine.counters.published > FEED,
    `the engine published more readings than it was fed frames (${through.engine.counters.published} > ${FEED})`);

theNumbersAreTheNumbers();
edgeTriggered();
sixMarketBar();
refusalsAreCounted();
theCollectorFrameToday();
theEnginesOwnPlumbing();

console.log(`A9 indicators seam: ${checks} checks passed`);

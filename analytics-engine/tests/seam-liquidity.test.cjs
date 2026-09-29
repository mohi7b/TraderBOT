/**
 * A6 — Seam: six-market liquidity collector → realtime bus → analytics engine
 * collector/liquidity_6markets/core/* + analytics-engine/{engine,core/router,
 * modules/liquidity}
 * ============================================================
 * The two halves of the system only meet on the Realtime event bus: the
 * liquidity collector publishes envelopes there (channel axis `liquidity`),
 * the engine subscribes and turns them into readings. This test walks that
 * path for all six markets at once, offline, with the real collector
 * pipeline (quote normalizer → flow engine → bus bridge → publisher) and the
 * real engine (attach → router → liquidity module → egress).
 *
 * What it pins down:
 *   1. every market reaches the engine: no unrouted, no invalid, no skipped
 *   2. the three readings the six-market layer exists for are produced and
 *      land on the published topics — analytics.<class>.<asset>.price_reading,
 *      …liquidity_flow and …candle — including the named examples
 *      analytics.crypto.btc.liquidity_flow and analytics.indices.spx.candle
 *   3. the asset class of the source frame is never relabelled to crypto
 *   4. a missing measurement stays null (an index has no book → no spread)
 *   5. the collector's own flow measurement travels verbatim, next to the one
 *      the engine computed, and the two are never blended
 *   6. a candle is edge-triggered: one event per bar, not one per sweep
 *   7. the engine's own output never comes back in as an input
 *
 * Note on names: the topic asset is the base asset of the symbol the reading
 * carried, so gold (instrument XAUUSD) reads analytics.commodities.xau.* —
 * `gold` is a commodity name, `XAU` is the asset.
 *
 * Run: node analytics-engine/tests/seam-liquidity.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { ASSET_CLASS, SOURCE_TYPE } = require(path.join(ROOT, "collector", "crypto", "common", "envelope.cjs"));
const { createReading } = require(path.join(ROOT, "collector", "liquidity_6markets", "core", "quote-normalizer.cjs"));
const { LiquidFlowEngine } = require(path.join(ROOT, "collector", "liquidity_6markets", "core", "flow-engine.cjs"));
const {
    createLiquidityBridge,
    createReadingPublisher,
    LIQUIDITY_MARKET
} = require(path.join(ROOT, "collector", "liquidity_6markets", "core", "bus-bridge.cjs"));
const { defaultCatalog } = require(path.join(ROOT, "collector", "liquidity_6markets", "instruments", "index.cjs"));
const { cadenceMap } = require(path.join(ROOT, "collector", "liquidity_6markets", "config", "providers.cjs"));
const { createEngine } = require(path.join(ROOT, "analytics-engine", "engine.cjs"));

const AT = Date.parse("2026-09-27T12:00:00Z");
let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A6: ${msg}`);
    checks++;
};

/** EventBus double that mimics collector/crypto/realtime/core/event-bus.cjs. */
function fakeBus(clock) {
    const state = { taps: new Set(), history: [], published: [] };

    return {
        state,
        subscribe(fn) {
            state.taps.add(fn);
            return () => state.taps.delete(fn);
        },
        publish(entry, context = {}) {
            const channel = [context.market, context.exchange, context.symbol, entry.event].join(":");
            const wrapped = {
                channel,
                event: entry.event,
                market: context.market || null,
                exchange: context.exchange || null,
                symbol: context.symbol || null,
                at: clock(),
                payload: entry
            };

            state.history.push(wrapped);
            state.published.push({ entry, context, channel });
            for (const tap of [...state.taps]) tap(wrapped);
            return wrapped;
        }
    };
}

/**
 * One provider round of all six markets, as the venues really answer:
 *   crypto      binance + okx (spelled "BTC-USDT", so the seam must canonicalise)
 *   forex       yahoo + stooq
 *   commodities yahoo + stooq
 *   indices     yahoo (with a daily bar) + stooq — an index has no book
 *   bonds       fred + stooq — a yield is a level, not a price you trade
 *   realestate  yahoo + stooq
 */
const SWEEP = Object.freeze([
    { id: "BTCUSDT", venue: "binance", price: 60_000, bid: 59_995, ask: 60_005, bidSize: 4, askSize: 5 },
    { id: "BTCUSDT", venue: "okx", price: 60_020, bid: 60_010, ask: 60_030, bidSize: 3, askSize: 2 },
    { id: "EURUSD", venue: "yahoo", price: 1.0855, bid: 1.0854, ask: 1.0856 },
    { id: "EURUSD", venue: "stooq", price: 1.0851, bid: 1.085, ask: 1.0852 },
    { id: "XAUUSD", venue: "yahoo", price: 2_400, bid: 2_399.5, ask: 2_400.5 },
    { id: "XAUUSD", venue: "stooq", price: 2_398, bid: 2_397.5, ask: 2_398.5 },
    /* The index carries a daily bar, and a bar keeps the time the venue put
     * on it: the same bar polled again is the same bar, not a new one. */
    { id: "SPX", venue: "yahoo", price: 5_800, open: 5_700, high: 5_830, low: 5_690, close: 5_800, volume: 1_000_000, barInterval: "1d", timestamp: AT },
    { id: "SPX", venue: "stooq", price: 5_795 },
    { id: "US10Y", venue: "fred", price: 4.15 },
    { id: "US10Y", venue: "stooq", price: 4.16 },
    { id: "VNQ", venue: "yahoo", price: 95.2, bid: 95.15, ask: 95.25 },
    { id: "VNQ", venue: "stooq", price: 95.1 }
]);

/** The venue spellings and the asset class of every instrument in the sweep. */
const EXPECTED_TOPICS = Object.freeze({
    BTCUSDT: "analytics.crypto.btc",
    EURUSD: "analytics.forex.eur",
    XAUUSD: "analytics.commodities.xau",
    SPX: "analytics.indices.spx",
    US10Y: "analytics.bonds.us10y",
    VNQ: "analytics.realestatecredit.vnq"
});


/** The real collector pipeline on one side, the real engine on the other. */
function harness() {
    let clock = AT;
    const bus = fakeBus(() => clock);
    const engine = createEngine({ bus, now: () => clock });
    engine.attach(bus);

    const flowEngine = new LiquidFlowEngine({ now: () => clock, cadenceMs: cadenceMap() });
    const catalog = defaultCatalog();
    const invalid = [];
    const bridge = createLiquidityBridge({
        bus,
        onInvalid: (errors, envelope) => invalid.push({ errors, envelope })
    });
    const publisher = createReadingPublisher({ bridge, engine: flowEngine, now: () => clock });

    return {
        bus,
        engine,
        catalog,
        invalid,
        flowEngine,
        tick(ms) { clock += ms; return clock; },
        at: () => clock,
        /** One provider round: readings → the collector's flow → the bus. */
        sweep({ rows = SWEEP, at = clock } = {}) {
            return rows.map((row) => {
                const reading = createReading({
                    instrument: catalog.get(row.id),
                    venue: row.venue,
                    price: row.price,
                    bid: row.bid,
                    ask: row.ask,
                    bidSize: row.bidSize,
                    askSize: row.askSize,
                    open: row.open,
                    high: row.high,
                    low: row.low,
                    close: row.close,
                    volume: row.volume,
                    barInterval: row.barInterval,
                    /* A bar keeps the time the venue stamped on it; `receivedAt`
                     * is when this poll saw it — which is why a daily bar polled
                     * again is the same bar, not a new one. */
                    timestamp: row.timestamp === undefined ? at : row.timestamp,
                    receivedAt: at
                });

                /* The orchestrator's own order: feed the collector's flow engine
                 * first, then publish the reading (which carries its snapshot). */
                if (reading !== null) flowEngine.ingest(reading);
                return { row, reading, entry: reading === null ? null : publisher(reading) };
            });
        }
    };
}

const topicsOf = (engine, limit = 50) => engine.publications({ limit }).map((item) => item.topic);


/** All six markets, end to end, in one assertion block. */
function allSixMarketsReachTheEngine() {
    const { bus, engine, invalid, sweep } = harness();
    const entries = sweep();
    const accepted = entries.filter((item) => item.entry !== null);

    ok(entries.length === SWEEP.length && accepted.length === SWEEP.length,
        `every read of the sweep became a bus entry (${accepted.length}/${SWEEP.length})`);
    ok(invalid.length === 0, "the collector's own egress refused none of them");
    ok(accepted.every((item) => item.entry.market === LIQUIDITY_MARKET),
        "all of them travel on the liquidity axis, never on the realtime spot/futures channels");
    ok(accepted.every((item) => item.entry.payload.envelope.meta.sourceType === SOURCE_TYPE.LIQUIDITY),
        "and every frame names the liquidity layer");

    const counters = engine.counters;
    ok(counters.ingested === SWEEP.length, `the engine ingested the whole sweep (${counters.ingested})`);
    ok(counters.unrouted === 0, "no reading was unrouted");
    ok(counters.invalid === 0, "no frame was invalid");
    ok(counters.errors === 0, "no route and no module threw");
    ok(counters.skipped === 0, "no route had to skip a reading");
    ok(counters.throttled === 18,
        `the second venue of every asset shared the first one's window (3 readings × 6 assets = ${counters.throttled})`);

    const topics = topicsOf(engine);
    for (const [instrument, base] of Object.entries(EXPECTED_TOPICS)) {
        ok(topics.includes(`${base}.price_reading`), `${instrument} produced a price reading (${base}.price_reading)`);
        ok(topics.includes(`${base}.liquidity_flow`), `${instrument} produced a flow reading (${base}.liquidity_flow)`);
    }

    /* The three readings this seam exists for, by name. */
    ok(topics.includes("analytics.crypto.btc.liquidity_flow"), "analytics.crypto.btc.liquidity_flow is published");
    ok(topics.includes("analytics.indices.spx.candle"), "analytics.indices.spx.candle is published");
    ok(topics.includes("analytics.commodities.xau.price_reading"),
        "analytics.commodities.xau.price_reading is published (gold = the XAU asset, not a commodity name)");

    ok(new Set(topics.filter((topic) => topic.endsWith(".price_reading"))).size === 6,
        "six markets, six price-reading topics — none left behind");
    ok(!topics.some((topic) => /usdt|btc-usdt|=x|\^gspc/.test(topic)),
        "no topic leaks a quote asset or a venue spelling");

    /* The asset class of the source frame is never relabelled (the engine's
     * own default is crypto, so a silent relabel would show up here). */
    for (const item of engine.publications({ limit: 50 })) {
        const symbol = item.entry.envelope.meta.symbol;
        const assetClass = item.entry.envelope.meta.assetClass;
        ok(assetClass === EXPECTED_TOPICS[symbol].split(".")[1],
            `${item.topic} kept assetClass "${assetClass}" of the ${symbol} frame`);
    }

    const analytics = bus.state.history.filter((event) => event.market === "analytics");
    ok(analytics.length > 0, "the readings went out on the bus, on the analytics axis");
    ok(analytics.every((event) => event.channel.startsWith(`analytics:${event.exchange}:`)),
        "each analytics channel is analytics:<assetClass>:<symbol>:<event>");
    ok(analytics.every((event) => event.payload.topic.startsWith("analytics.")),
        "and each bus entry carries its topic next to its channel");

    return { engine, bus };
}

/** The engine listens on a bus it also publishes on, without a feedback loop. */
function theEngineNeverFeedsItself() {
    const { engine, bus } = allSixMarketsReachTheEngine();
    const ingested = engine.counters.ingested;
    const liquidityEntries = bus.state.history.filter((event) => event.market === LIQUIDITY_MARKET).length;
    const analyticsEntries = bus.state.history.filter((event) => event.market === "analytics").length;

    ok(liquidityEntries === SWEEP.length, "the bus carries every liquidity frame");
    ok(analyticsEntries > 0, "and the analytics traffic next to it");
    ok(engine.counters.ingested === ingested, "none of the engine's own output came back in as an input");

    const own = bus.state.published.find((item) => item.context.market === "analytics");
    const replayed = engine.ingestBusEntry({
        market: "analytics",
        exchange: "crypto",
        symbol: "BTCUSDT",
        event: "liquidity_flow",
        envelope: own.entry.envelope
    });

    ok(replayed !== null && replayed.published.length === 0,
        "an analytics frame has no route, so it can never be re-ingested as an input");
    ok(engine.counters.unrouted === 1,
        "and the engine says so (unrouted) instead of pretending it consumed it");
}


/** A bar is an event, not a state: one publication per new bar. */
function candlesAreEdgeTriggered() {
    const { engine, bus, tick, sweep } = harness();
    const candleTopic = "analytics.indices.spx.candle";
    sweep();

    const first = engine.publications({ topic: candleTopic, limit: 10 });
    ok(first.length === 1, "one bar, one candle event");
    ok(first[0].entry.envelope.meta.exchange === "yahoo", "the candle names the venue that served the bar");
    ok(first[0].entry.envelope.meta.symbol === "SPX" && first[0].entry.envelope.meta.assetClass === ASSET_CLASS.INDICES,
        "and the market the bar belongs to");
    ok(first[0].entry.envelope.payload.interval === "1d", "an interval, not a guessed timeframe");
    ok(first[0].entry.envelope.payload.open === 5_700 && first[0].entry.envelope.payload.high === 5_830
        && first[0].entry.envelope.payload.low === 5_690 && first[0].entry.envelope.payload.close === 5_800,
        "OHLC as the venue served it");
    ok(first[0].entry.envelope.payload.volume === 1_000_000, "volume travelled with the bar");
    ok(first[0].entry.envelope.meta.provenance.stage === "analytics-engine", "the frame names the layer that produced it");

    ok(engine.publications({ topic: "analytics.forex.eur.candle", limit: 5 }).length === 0,
        "a market whose venues serve no bar gets no candle");

    /* Same bar, next sweep, 15 s later: no second candle — but the readings do refresh. */
    const pricesBefore = engine.publications({ topic: "analytics.crypto.btc.price_reading", limit: 9 }).length;
    tick(15_000);
    sweep({ at: AT + 15_000 });

    ok(engine.publications({ topic: candleTopic, limit: 10 }).length === 1,
        "polling the same bar again is not a second candle");
    ok(engine.publications({ topic: "analytics.crypto.btc.price_reading", limit: 9 }).length === pricesBefore + 1,
        "while the price reading refreshes in the next window");
    ok(engine.publications({ topic: "analytics.crypto.btc.liquidity_flow", limit: 9 }).length === 2,
        "and so does the flow reading");

    /* The next day's bar is a new candle — the open time moved, and that is the
     * only thing that makes a bar new. */
    tick(86_400_000);
    sweep({
        at: AT + 86_400_000 + 15_000,
        rows: [{
            id: "SPX", venue: "yahoo", price: 5_850, open: 5_800, high: 5_860, low: 5_790,
            close: 5_850, volume: 900_000, barInterval: "1d", timestamp: AT + 86_400_000
        }]
    });

    const candles = engine.publications({ topic: candleTopic, limit: 10 });
    ok(candles.length === 2, "a new bar is a new candle");
    ok(candles[1].entry.envelope.payload.close === 5_850, "with the new bar's close");
    ok(bus.state.history.length > SWEEP.length, "and the bus saw every one of them");
}

/** An absent measurement stays absent, and the collector's own numbers travel. */
function missingMeasurementsStayMissing() {
    const { engine, flowEngine, sweep, tick, at } = harness();
    sweep();

    const spxFlow = engine.snapshot({ symbol: "SPX" }).liquidity.flow;
    ok(spxFlow.engine.price === 5_797.5, "the index price is the median of the two venues");
    ok(spxFlow.engine.bidAskSpreadBps === null, "an index has no book, so it has no bid-ask spread — null, never 0");
    ok(spxFlow.engine.bidAskVenue === null && spxFlow.engine.tradableSpreadBps === null, "and nothing to cross");
    ok(spxFlow.evidence.bidAsk === false, "the evidence block says so instead of implying a book exists");
    ok(spxFlow.engine.priceSpreadBps > 0, "yet the two venues still disagree by a measurable amount");

    const spx = engine.publications({ topic: "analytics.indices.spx.liquidity_flow", limit: 1 })[0].entry.envelope.payload;
    const collector = flowEngine.snapshot("SPX", { at: at() });

    ok(spx.reported !== null, "the collector's own measurement is in the frame");
    ok(spx.reported.cvdProxy === 1_000_000 * ((5_800 - 5_700) / (5_830 - 5_690)),
        "the session proxy is the one the collector defined (body/range × volume) — recomputed nowhere");
    ok(spx.reported.cvdProxy === collector.cvdProxy && spx.reported.cvdMethod === collector.cvdMethod,
        "and it equals the collector's own snapshot, label included");
    ok(spx.reported.venueCount === 1 && spx.reported.priceSpreadBps === null,
        "this frame carries the collector's mid-sweep measurement: one venue seen, so no cross-venue spread — null, not 0");
    ok(spx.evidence.cvd === collector.cvdMethod, "the evidence block names the proxy as the collector's method");
    ok(spx.engine.price === 5_800, "the engine's own view held the one venue it had seen — it never borrows the collector's number");

    /* The next window: the collector has seen both venues too, and its number
     * travels as it is — separately from the one the engine computed. */
    tick(15_000);
    sweep({ at: at() });
    const later = engine.publications({ topic: "analytics.indices.spx.liquidity_flow", limit: 1 })[0].entry.envelope.payload;
    const collectorLater = flowEngine.snapshot("SPX", { at: at() });

    ok(later.reported.venueCount === 2, "in the next window the collector's measurement covers both venues");
    ok(later.reported.priceSpreadBps === collectorLater.priceSpreadBps, "and its spread is carried, never recomputed here");
    ok(later.engine.priceSpreadBps !== later.reported.priceSpreadBps,
        "while the engine's own spread stays a separate number (each measurement keeps its own reference)");
    ok(Math.abs(later.engine.priceSpreadBps - later.reported.priceSpreadBps) < 0.01,
        "both are close, because they measure the same market — and neither was averaged into the other");

    const btc = engine.snapshot({ symbol: "BTCUSDT" }).liquidity;
    ok(btc.reading.evidence.bidAsk === true, "a crypto book has both sides");
    ok(btc.reading.bidAskVenue === "binance", "the tightest venue is named");
    ok(Math.abs(btc.reading.bidAskSpreadBps - 1.6667) < 0.001, "and its spread is the number the venue served");
    ok(btc.flow.engine.tradableSpreadBps < 0,
        "the venues are crossed (best bid above best ask): a negative number says so, it is not clamped to 0");
    ok(btc.flow.engine.longVenue === "okx" && btc.flow.engine.shortVenue === "binance", "and each side names its venue");
}

/** Two venues of one asset meet in one bucket, one topic. */
function oneAssetOneTopic() {
    const { engine, sweep, tick, at } = harness();
    sweep();

    const xau = engine.snapshot({ symbol: "XAUUSD" }).liquidity;
    ok(xau.reading.venueCount === 2 && xau.reading.venues.length === 2,
        `both gold venues are in one bucket (${xau.reading.venueCount} venues, ${xau.reading.venues.length} views)`);
    ok(xau.reading.venues.map((view) => view.exchange).join(",") === "stooq,yahoo", "listed by venue, deterministically");
    ok(xau.assetClass === ASSET_CLASS.COMMODITIES, "the bucket knows its own asset class");
    ok(xau.reading.price === 2_399, "the price is the median of 2 400 and 2 398");
    ok(xau.reading.high.exchange === "yahoo" && xau.reading.low.exchange === "stooq",
        "the extremes name the venues you would actually trade");
    ok(Math.abs(xau.reading.priceSpreadBps - 8.3368) < 0.01, "≈8.3 bps apart");

    const xauFlow = engine.publications({ topic: "analytics.commodities.xau.liquidity_flow", limit: 1 })[0].entry.envelope.payload;
    ok(xauFlow.reported.cvdProxy === 0, "no gold venue sent a bar, so the collector's proxy is 0 — a fact, not a measurement");
    ok(xauFlow.reported.venueCount === 1 && xauFlow.venueCount === 1,
        "this frame was published when only the first venue had reported: both sides say one venue, neither invents the second");
    ok(xauFlow.evidence.candle === false, "and no candle is claimed for gold");

    tick(15_000);
    sweep({ at: at() });
    const laterFlow = engine.publications({ topic: "analytics.commodities.xau.liquidity_flow", limit: 1 })[0].entry.envelope.payload;
    ok(laterFlow.venueCount === 2 && laterFlow.reported.venueCount === 2,
        "in the next window both sides see both venues");
    ok(laterFlow.engine.price === 2_399 && laterFlow.reported.priceSpreadBps !== laterFlow.engine.priceSpreadBps,
        "and the engine's median sits next to the collector's spread, each with its own reference");

    const btc = engine.snapshot({ symbol: "BTC-USDT" });
    ok(btc.symbol === "BTCUSDT", "the okx spelling resolves to the same market");
    ok(btc.liquidity.reading.venueCount === 2, "and to the same two venues");
    const xauTopics = [...new Set(topicsOf(engine).filter((topic) => topic.startsWith("analytics.commodities.xau.")))];
    ok(xauTopics.length === 3 && !xauTopics.some((topic) => /yahoo|stooq/.test(topic)),
        `both gold venues share their asset's topics, whatever the venue: ${xauTopics.join(", ")}`);
}

allSixMarketsReachTheEngine();
theEngineNeverFeedsItself();
candlesAreEdgeTriggered();
missingMeasurementsStayMissing();
oneAssetOneTopic();

console.log(`A6 six-market seam: ${checks} checks passed`);

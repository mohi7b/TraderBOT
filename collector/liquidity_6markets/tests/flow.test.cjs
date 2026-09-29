/* ============================================================
 * File: collector/liquidity_6markets/tests/flow.test.cjs
 * Section: collector/liquidity_6markets/tests
 * Version: 1.0.0
 *
 * Role:
 *   Normalisation, the cross-venue flow state and the bus bridge, all
 *   offline: nothing here reaches the network. The point of these tests
 *   is that a missing number stays missing, a proxy is labelled, and a
 *   bar that is polled twice is counted once.
 *
 * Run:
 *   node --test collector/liquidity_6markets/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { ASSET_CLASS, MARKET_TYPES, SOURCE_TYPE, validateEnvelope } = require(path.join(ROOT, "..", "crypto", "common", "envelope.cjs"));
const { createInstrument } = require(path.join(ROOT, "core", "instrument.cjs"));
const { createReading, normalizeQuote } = require(path.join(ROOT, "core", "quote-normalizer.cjs"));
const { LiquidFlowEngine, CVD_METHOD } = require(path.join(ROOT, "core", "flow-engine.cjs"));
const { readingEnvelope, createLiquidityBridge, createReadingPublisher, LIQUIDITY_MARKET } = require(path.join(ROOT, "core", "bus-bridge.cjs"));
const { cadenceMap } = require(path.join(ROOT, "config", "providers.cjs"));

const AT = Date.parse("2026-09-27T12:00:00Z");

function fx() {
    return createInstrument({
        id: "EURUSD",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "USD",
        sourceMarket: "fx_spot",
        symbols: { yahoo: "EURUSD=X", stooq: "eurusd" }
    });
}

test("a reading is measured, or it is refused", () => {
    const instrument = fx();

    const quoted = createReading({ instrument, venue: "twelvedata", bid: 1.1, ask: 1.1002, timestamp: AT });
    assert.equal(quoted.price, (1.1 + 1.1002) / 2, "a quote with no last price uses the mid");
    assert.equal(quoted.depth, false, "bid/ask sizes were not served, so there is no depth");
    assert.ok(quoted.quoteSpreadBps > 0);

    /* One side of a book is not a price: a bid with no ask and no last
     * price is refused rather than published as a guess. */
    assert.equal(createReading({ instrument, venue: "yahoo", bid: 1.1, timestamp: AT }), null);

    const bidOnly = createReading({ instrument, venue: "yahoo", price: 1.1002, bid: 1.1, timestamp: AT });
    assert.equal(bidOnly.ask, null, "no ask was served, so none is claimed");
    assert.equal(bidOnly.quoteSpreadBps, null, "one side of a book is not a spread");
    assert.equal(bidOnly.price, 1.1002, "the venue's own last price is kept");

    assert.equal(createReading({ instrument, venue: "stooq", timestamp: AT }), null, "no price is not a reading");
    assert.throws(() => createReading({ instrument, venue: "stooq", price: 1, eventType: "candle", timestamp: AT }), /not routable/);
});

test("normalizeQuote keeps the venue's own numbers and its symbol", () => {
    const instrument = fx();
    const { reading, reason } = normalizeQuote(
        { providerSymbol: "eurusd", price: 1.0855, open: 1.08, high: 1.09, low: 1.079, close: 1.0855, volume: 1200, barInterval: "1d", timestamp: AT },
        { instrument, venue: "stooq", now: AT }
    );

    assert.equal(reason, null);
    assert.equal(reading.assetClass, ASSET_CLASS.FOREX);
    assert.equal(reading.marketType, null, "cash FX has no futures/spot frame word");
    assert.equal(reading.sourceMarket, "fx_spot");
    assert.equal(reading.provenance.providerSymbol, "eurusd");
    assert.equal(reading.timestamp, AT);
    assert.equal(reading.receivedAt, AT);
    assert.equal(normalizeQuote(null, { instrument, venue: "stooq" }).reading, null);
});

test("the session proxy counts a bar once, however often it is polled", () => {
    const engine = new LiquidFlowEngine({ now: () => AT, cadenceMs: cadenceMap() });
    const instrument = fx();
    const bar = createReading({
        instrument,
        venue: "stooq",
        price: 1.086,
        open: 1.08,
        high: 1.09,
        low: 1.079,
        close: 1.086,
        volume: 1000,
        barInterval: "1d",
        timestamp: AT,
        receivedAt: AT
    });

    engine.ingest(bar);
    const once = engine.snapshot("EURUSD", { at: AT });
    engine.ingest(bar);
    const twice = engine.snapshot("EURUSD", { at: AT });

    assert.equal(twice.cvdProxy, once.cvdProxy, "the same forming bar must not be added twice");
    assert.equal(twice.sessionBars, 1);
    assert.equal(twice.sessionVolume, 1000);
    assert.equal(once.cvdMethod, CVD_METHOD);
    assert.equal(once.direction, "up");
    assert.equal(once.cvdProxy, 1000 * ((1.086 - 1.08) / (1.09 - 1.079)), "body/range × volume, straight from the definition");

    const formed = createReading({ instrument, venue: "stooq", price: 1.0895, open: 1.08, high: 1.09, low: 1.079, close: 1.0895, volume: 400, barInterval: "1d", timestamp: AT, receivedAt: AT });
    engine.ingest(formed);
    const later = engine.snapshot("EURUSD", { at: AT });

    assert.equal(later.sessionBars, 1, "the bar was replaced, not appended");
    assert.equal(later.sessionVolume, 400, "the old bar's volume went with its proxy");
    assert.equal(later.cvdProxy, 400 * ((1.0895 - 1.08) / (1.09 - 1.079)));
    assert.ok(later.cvdProxy / later.sessionVolume > once.cvdProxy / once.sessionVolume, "same range, stronger body");
});

test("freshness follows the venue's cadence, not one global number", () => {
    const engine = new LiquidFlowEngine({ now: () => AT, cadenceMs: cadenceMap() });
    const instrument = fx();

    engine.ingest(createReading({ instrument, venue: "yahoo", price: 1.1, timestamp: AT - 5 * 60 * 1000, receivedAt: AT - 5 * 60 * 1000 }));
    engine.ingest(createReading({
        instrument,
        venue: "stooq",
        price: 1.101,
        open: 1.09,
        high: 1.11,
        low: 1.08,
        close: 1.101,
        volume: 10,
        barInterval: "1d",
        timestamp: AT - 5 * 60 * 1000,
        receivedAt: AT
    }));

    const partial = engine.snapshot("EURUSD", { at: AT });
    const byVenue = Object.fromEntries(partial.venues.map((venue) => [venue.venue, venue]));

    assert.equal(byVenue.yahoo.stale, true, "a 5-minute-old intraday quote is stale");
    assert.equal(byVenue.stooq.stale, false, "a 5-minute-old end-of-day series is not");
    assert.equal(partial.venueCount, 2);
    assert.equal(partial.freshCount, 1);
    assert.equal(partial.priceSpreadBps, null, "dispersion between fresh venues only — and one venue is not a spread");

    engine.ingest(createReading({ instrument, venue: "yahoo", price: 1.102, timestamp: AT, receivedAt: AT }));
    const both = engine.snapshot("EURUSD", { at: AT });

    assert.equal(both.freshCount, 2);
    assert.equal(both.mid, (1.101 + 1.102) / 2, "the median of the two fresh prices");
    assert.ok(both.priceSpreadBps > 0, "two fresh venues means a measurable dispersion");
    assert.equal(both.venues.length, 2, "one row per venue, the newest reading of each");
});

test("two quotes make a tradable spread; one does not", () => {
    const engine = new LiquidFlowEngine({ now: () => AT, cadenceMs: cadenceMap() });
    const instrument = fx();

    engine.ingest(createReading({ instrument, venue: "binance", bid: 1.1005, ask: 1.1015, bidSize: 2, askSize: 1, timestamp: AT, receivedAt: AT }));
    const alone = engine.snapshot("EURUSD", { at: AT });

    assert.equal(alone.tradableSpreadBps, null, "one venue cannot be arbitraged against itself");
    assert.equal(alone.mid, 1.101, "the mid of the only book");
    assert.equal(alone.bidAskVenue, "binance", "its own book is still the tightest of the one");

    engine.ingest(createReading({ instrument, venue: "okx", bid: 1.1002, ask: 1.1008, bidSize: 3, askSize: 1, timestamp: AT, receivedAt: AT }));
    const two = engine.snapshot("EURUSD", { at: AT });

    assert.equal(two.longVenue, "binance", "buy where the bid is highest");
    assert.equal(two.shortVenue, "okx", "sell where the ask is lowest");
    assert.ok(two.tradableSpreadBps > 0, "two books that do not overlap is a measurable edge");
    assert.equal(two.tradableSpreadBps, ((1.1008 - 1.1005) / ((1.1008 + 1.1005) / 2)) * 10_000);
    assert.equal(two.bidAskVenue, "okx", "okx quotes the tighter book");
    assert.equal(two.depthImbalance, (2 + 3 - (1 + 1)) / (2 + 3 + 1 + 1), "size-weighted, across the venues that served sizes");
    assert.deepEqual(two.depthVenues, ["binance", "okx"]);

    engine.ingest(createReading({ instrument, venue: "yahoo", price: 1.0998, bid: 1.0994, timestamp: AT, receivedAt: AT }));
    const three = engine.snapshot("EURUSD", { at: AT });

    assert.equal(three.venueCount, 3);
    assert.equal(three.longVenue, "binance", "a bid-only venue cannot win the borrow side");
    assert.deepEqual(three.depthVenues, ["binance", "okx"], "the venue with no sizes contributes no imbalance");
});

test("the bridge publishes a valid envelope on the liquidity axis", () => {
    const instrument = fx();
    const engine = new LiquidFlowEngine({ now: () => AT, cadenceMs: cadenceMap() });
    const entries = [];
    const invalid = [];
    const bridge = createLiquidityBridge({ sink: (entry) => entries.push(entry), onInvalid: (errors) => invalid.push(errors) });
    const publish = createReadingPublisher({ bridge, engine, now: () => AT });

    const reading = createReading({
        instrument,
        venue: "stooq",
        price: 1.0855,
        open: 1.08,
        high: 1.09,
        low: 1.079,
        close: 1.0855,
        volume: 10,
        barInterval: "1d",
        timestamp: AT
    });
    engine.ingest(reading);
    publish(reading);

    assert.equal(entries.length, 1);
    assert.equal(invalid.length, 0);

    const [entry] = entries;
    assert.equal(entry.market, LIQUIDITY_MARKET);
    assert.equal(entry.exchange, ASSET_CLASS.FOREX);
    assert.equal(entry.event, "ticker");

    const envelope = entry.envelope;
    assert.equal(validateEnvelope(envelope).ok, true);
    assert.equal(envelope.meta.assetClass, ASSET_CLASS.FOREX);
    assert.equal(envelope.meta.sourceType, SOURCE_TYPE.LIQUIDITY);
    assert.equal(envelope.meta.marketType, null);
    assert.ok(MARKET_TYPES.includes("spot") && envelope.meta.marketType !== "spot");
    assert.equal(envelope.meta.symbol, "EURUSD");
    assert.equal(envelope.meta.exchange, "stooq", "the venue stays the venue inside the frame");
    assert.equal(envelope.meta.eventType, "ticker");

    const payload = envelope.payload;
    assert.equal(payload.evidence.bidAsk, false, "the venue served no bid/ask and the envelope says so");
    assert.equal(payload.evidence.candle, true);
    assert.equal(payload.evidence.cvd, "proxy");
    assert.equal(payload.flow.venueCount, 1);
    assert.equal(payload.flow.cvdProxy, 10 * ((1.0855 - 1.08) / (1.09 - 1.079)));
    assert.equal(envelope.meta.provenance.origin, "liquidity-6markets");
    assert.equal(envelope.meta.provenance.kind, "fx");
    assert.equal(envelope.meta.provenance.sourceMarketType, "fx_spot", "the honest venue word travels as provenance");
    assert.equal(envelope.meta.provenance.providerSymbol, null, "no provider spelling was handed over, so none is claimed");

    const broken = { schemaVersion: 1, meta: { ...envelope.meta, assetClass: "equities" }, payload: null };
    assert.equal(bridge(broken), null);
    assert.equal(invalid.length, 1, "an envelope with a made-up asset class is refused, not forwarded");
    assert.equal(readingEnvelope(null), null);
});

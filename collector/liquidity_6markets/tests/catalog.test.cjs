/* ============================================================
 * File: collector/liquidity_6markets/tests/catalog.test.cjs
 * Section: collector/liquidity_6markets/tests
 * Version: 1.0.0
 *
 * Role:
 *   The data contract of the six-market collector: what the catalog
 *   claims, and whether the claims survive contact with the frame
 *   vocabulary (assetClass / marketType) and with the provider registry
 *   (keys, spellings, cadences).
 *
 * Run:
 *   node --test collector/liquidity_6markets/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { ASSET_CLASS, MARKET_TYPES, SOURCE_TYPE } = require(path.join(ROOT, "..", "crypto", "common", "envelope.cjs"));
const { createInstrumentCatalog, defaultCatalog, MARKET_IDS } = require(path.join(ROOT, "instruments", "index.cjs"));
const { createProviderRegistry, prepareRequest } = require(path.join(ROOT, "providers", "index.cjs"));
const { PROVIDER_IDS, providerConfig, cadenceMap } = require(path.join(ROOT, "config", "providers.cjs"));
const { INSTRUMENT_KINDS, canonicalInstrumentId, splitPair, provenanceOf } = require(path.join(ROOT, "core", "instrument.cjs"));

test("six markets, unique instruments, one catalog", () => {
    const catalog = defaultCatalog();

    assert.deepEqual(catalog.markets(), [...MARKET_IDS]);
    assert.equal(catalog.markets().length, 6);
    assert.ok(catalog.size() >= 24, `expected a full catalog, got ${catalog.size()}`);

    const coverage = catalog.coverage();
    assert.equal(coverage.length, 6);
    for (const market of coverage) {
        assert.ok(market.instruments > 0, `${market.market} has no instrument`);
        assert.ok(market.venues >= 1, `${market.market} has no venue`);
        assert.ok(Object.values(ASSET_CLASS).includes(market.assetClass), `${market.market} has an unknown asset class`);
    }
    assert.equal(coverage.reduce((sum, market) => sum + market.instruments, 0), catalog.size());

    const ids = catalog.instruments().map((instrument) => instrument.id);
    assert.equal(new Set(ids).size, ids.length, "instrument ids must be unique across the six markets");
});

test("every instrument speaks the frame vocabulary and nothing else", () => {
    const catalog = defaultCatalog();

    for (const market of catalog.marketModules()) {
        for (const instrument of market.instruments) {
            assert.equal(instrument.id, canonicalInstrumentId(instrument.id), `${instrument.id} is not canonical`);
            assert.equal(instrument.assetClass, market.assetClass, `${instrument.id} sits in the wrong market`);
            assert.ok(INSTRUMENT_KINDS.includes(instrument.kind), `${instrument.id} has kind ${instrument.kind}`);
            assert.ok(instrument.marketType === null || MARKET_TYPES.includes(instrument.marketType), `${instrument.id} marketType ${instrument.marketType}`);

            /* The honest venue word is provenance, never a frame value. */
            assert.ok(instrument.sourceMarket, `${instrument.id} has no sourceMarket`);
            assert.ok(!MARKET_TYPES.includes(instrument.sourceMarket), `${instrument.id}: "${instrument.sourceMarket}" is a frame word, not a venue word`);
            assert.notEqual(instrument.sourceMarket, instrument.marketType);
            assert.equal(provenanceOf(instrument).sourceMarketType, instrument.sourceMarket);

            const spellings = Object.entries(instrument.symbols);
            assert.ok(spellings.length >= 1, `${instrument.id} names no venue`);
            for (const [providerId, spelling] of spellings) {
                assert.ok(PROVIDER_IDS.includes(providerId), `${instrument.id} names an unknown venue ${providerId}`);
                assert.equal(typeof spelling, "string");
                assert.ok(spelling.trim() !== "", `${instrument.id}/${providerId} has an empty symbol`);
            }
        }
    }
});

test("pairs split into the two sides providers ask for", () => {
    const catalog = defaultCatalog();
    assert.deepEqual(splitPair("EURUSD", "USD"), { from: "EUR", to: "USD" });
    assert.deepEqual(splitPair("US10Y", null), { from: null, to: null });
    assert.equal(catalog.get("EURUSD").from, "EUR");
    assert.equal(catalog.get("USDJPY").to, "JPY");
    assert.equal(catalog.get("SPX").from, null, "an index is not a pair");
});

test("prepareRequest is honest about keys and about symbols", () => {
    const registry = createProviderRegistry();
    const catalog = defaultCatalog();
    const eurusd = catalog.get("EURUSD");

    const withKey = prepareRequest(registry.get("twelvedata"), eurusd, { env: { TWELVEDATA_API_KEY: "test-key" } });
    assert.equal(withKey.ok, true);
    assert.match(withKey.url, /symbol=EUR%2FUSD/);
    assert.equal(withKey.providerSymbol, "EUR/USD");

    const withoutKey = prepareRequest(registry.get("twelvedata"), eurusd, { env: {} });
    assert.equal(withoutKey.ok, false);
    assert.match(withoutKey.reason, /TWELVEDATA_API_KEY/);

    const wrongVenue = prepareRequest(registry.get("fred"), eurusd, { env: { FRED_API_KEY: "test-key" } });
    assert.equal(wrongVenue.ok, false);
    assert.match(wrongVenue.reason, /cannot quote EURUSD/);

    const keyFree = prepareRequest(registry.get("stooq"), eurusd, { env: {} });
    assert.equal(keyFree.ok, true);
    assert.match(keyFree.url, /s=eurusd/);
});

test("every venue declares a cadence, a budget and its markets", () => {
    for (const providerId of PROVIDER_IDS) {
        const config = providerConfig(providerId);
        assert.ok(Number.isFinite(config.cadenceMs) && config.cadenceMs > 0, `${providerId} has no cadenceMs`);
        assert.ok(config.maxRps > 0, `${providerId} has no rate budget`);
        assert.ok(config.markets === undefined || Array.isArray(config.markets), `${providerId} markets must be a list`);
    }

    const cadences = cadenceMap();
    assert.ok(cadences.yahoo < cadences.stooq, "an intraday venue must be polled far more often than an EOD one");
    assert.ok(cadences.fred >= 24 * 60 * 60 * 1000);
    assert.ok(cadences.binance <= 10_000, "a crypto venue publishes continuously");
});

test("a catalog can be built for one market without touching the collector", () => {
    const catalog = createInstrumentCatalog({ markets: [require(path.join(ROOT, "instruments", "forex.cjs"))] });

    assert.deepEqual(catalog.markets(), ["forex"]);
    assert.equal(catalog.coverage().length, 1);
    assert.ok(catalog.size() >= 4);
    for (const instrument of catalog.instruments()) assert.equal(instrument.assetClass, ASSET_CLASS.FOREX);
    assert.equal(catalog.forMarket("realestatecredit").length, 0);
    assert.throws(() => catalog.get("NOPE"), /unknown instrument/);
    assert.equal(SOURCE_TYPE.LIQUIDITY, "liquidity");
});

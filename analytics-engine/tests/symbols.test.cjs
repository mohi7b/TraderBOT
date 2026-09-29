/**
 * A0 — Symbol normalisation of the standard envelope
 * collector/crypto/common/envelope.cjs
 * ============================================================
 * The analytics modules bucket everything by `meta.symbol`, so one
 * market spelled three ways (binance BTCUSDT, okx BTC-USDT-SWAP, kucoin
 * XBTUSDTM) MUST collapse into one key — otherwise cross-venue analytics
 * silently split into partial buckets that still look plausible.
 *
 * Also guards the null-not-zero rule for timestamps: an envelope created
 * without a timestamp must NOT carry 0 (Number(null) === 0 is finite!).
 *
 * Run: node analytics-engine/tests/symbols.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const {
    ASSET_CLASS,
    SOURCE_TYPE,
    createEnvelope,
    isEnvelope,
    validateEnvelope,
    baseAssetOf,
    quoteAssetOf,
    normalizedSymbol,
    canonicalSymbol
} = require(path.join(__dirname, "..", "..", "collector", "crypto", "common", "envelope.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A0: ${msg}`);
    checks++;
};

function baseAssets() {
    ok(baseAssetOf("BTCUSDT") === "BTC", "BTCUSDT → BTC");
    ok(baseAssetOf("BTC-USDT-SWAP") === "BTC", "BTC-USDT-SWAP → BTC (contract marker)");
    ok(baseAssetOf("ETH_USDC") === "ETH", "ETH_USDC → ETH");
    ok(baseAssetOf("XBTUSDTM") === "BTC", "XBTUSDTM → BTC (kucoin XBT + M marker)");
    ok(baseAssetOf("btcusdt") === "BTC", "lower case is normalised");
    ok(baseAssetOf("1INCHUSDT") === "1INCH", "digit-leading base survives");
    ok(baseAssetOf("ADAM") === "ADAM", "a base ending in M is never cut");
    ok(baseAssetOf(null) === null, "null symbol → null base (not a fabricated value)");
    ok(baseAssetOf("   ") === null, "blank symbol → null base");
}

function quotes() {
    ok(quoteAssetOf("BTCUSDT") === "USDT", "BTCUSDT quote USDT");
    ok(quoteAssetOf("BTC-USDT-SWAP") === "USDT", "swap quote is USDT, not the marker");
    ok(quoteAssetOf("XBTUSDTM") === "USDT", "kucoin USDTM quote is USDT");
    ok(quoteAssetOf("ETHUSDC") === "USDC", "USDC is not mistaken for USD");
    ok(quoteAssetOf("BTC") === null, "no quote → null (not fabricated)");
}

function canonical() {
    ok(canonicalSymbol("BTCUSDT") === "BTCUSDT", "binance spot");
    ok(canonicalSymbol("BTC-USDT-SWAP") === "BTCUSDT", "okx swap lands on the same pair");
    ok(canonicalSymbol("BTCUSDT_PERP") === "BTCUSDT", "bybit perp lands on the same pair");
    ok(canonicalSymbol("XBTUSDTM") === "BTCUSDT", "kucoin contract lands on the same pair");
    ok(canonicalSymbol("ETHUSDC") === "ETHUSDC", "a different quote stays a different pair");
    ok(canonicalSymbol("BTC") === "BTC", "a bare base asset stays itself");
    ok(canonicalSymbol(null) === null, "null symbol → null");
    ok(normalizedSymbol("btc-usdt-swap") === "BTCUSDT", "normalizedSymbol strips markers too");
}

function timestamps() {
    const now = Date.now();
    const bare = createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.ANALYTICS,
        symbol: "BTCUSDT",
        eventType: "cvd",
        data: { net: 1 }
    });

    ok(bare.meta.timestamp !== 0, "no timestamp given → never 0");
    ok(Number.isFinite(bare.meta.timestamp) && bare.meta.timestamp >= now, "timestamp falls back to now");
    ok(bare.meta.receiveTimestamp === bare.meta.timestamp, "receiveTimestamp falls back to timestamp");
    ok(Number.isFinite(bare.meta.processedAt), "processedAt is a real clock read");

    const explicit = createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.ANALYTICS,
        symbol: "BTCUSDT",
        eventType: "cvd",
        data: null,
        timestamp: 1_700_000_000_000,
        receiveTimestamp: 1_700_000_000_500
    });

    ok(explicit.meta.timestamp === 1_700_000_000_000, "explicit timestamp is kept as-is");
    ok(explicit.meta.receiveTimestamp === 1_700_000_000_500, "explicit receiveTimestamp is kept as-is");
    ok(explicit.meta.baseAsset === "BTC", "meta.baseAsset is derived from the symbol");
    ok(isEnvelope(explicit), "isEnvelope accepts a created envelope");
    ok(validateEnvelope(explicit).ok === true, "a complete envelope validates");
    ok(validateEnvelope(null).ok === false, "null is not an envelope");
    ok(!isEnvelope({ meta: {} }), "an object without a payload is not an envelope");
}

baseAssets();
quotes();
canonical();
timestamps();

console.log(`A0 symbols: ${checks} checks passed`);

/* ============================================================
 * File: collector/liquidity_6markets/config/providers.cjs
 * Section: collector/liquidity_6markets/config
 * Version: 1.0.0
 *
 * Role:
 *   The endpoint + budget sheet of every quote provider used by the
 *   six-market liquidity engine. A provider is an address and a rate
 *   budget — the parsing lives next to it in providers/*.cjs, so a new
 *   venue is one config entry plus one pure function.
 *
 *   Endpoints are the ones already inventoried for this repo in
 *   collector/globalliquidity/config/api.config.cjs (twelvedata,
 *   alphavantage, FRED, EIA) plus the key-free public ones (Yahoo,
 *   Stooq) and the two crypto venues the realtime collector uses.
 *
 *   maxRps is deliberately conservative: these are public endpoints,
 *   and a rate-limit violation costs every later reading, not one.
 * ============================================================ */

const PROVIDER_CONFIG = Object.freeze({
    yahoo: Object.freeze({
        id: "yahoo",
        label: "Yahoo Finance",
        kind: "json",
        baseUrl: "https://query1.finance.yahoo.com/v8/finance/chart",
        apiKeyEnv: null,
        maxRps: 4,
        timeoutMs: 10000,
        maxRetries: 2,
        /* Data cadence: how long an answer from this venue stays meaningful. */
        cadenceMs: 120000,
        markets: Object.freeze(["forex", "commodities", "indices", "bonds", "realestatecredit", "crypto"])
    }),
    stooq: Object.freeze({
        id: "stooq",
        label: "Stooq",
        kind: "csv",
        baseUrl: "https://stooq.com/q/l/",
        apiKeyEnv: null,
        maxRps: 2,
        timeoutMs: 10000,
        maxRetries: 2,
        cadenceMs: 43200000, /* end-of-day only */
        markets: Object.freeze(["forex", "commodities", "indices", "bonds", "realestatecredit"])
    }),
    twelvedata: Object.freeze({
        id: "twelvedata",
        label: "Twelve Data",
        kind: "json",
        baseUrl: "https://api.twelvedata.com/quote",
        apiKeyEnv: "TWELVEDATA_API_KEY",
        maxRps: 8,
        timeoutMs: 10000,
        maxRetries: 2,
        /* Free tier: 8 requests/minute — the client's token bucket keeps us under. */
        maxRpm: 8,
        cadenceMs: 120000,
        markets: Object.freeze(["forex", "commodities", "indices", "crypto"])
    }),
    alphavantage: Object.freeze({
        id: "alphavantage",
        label: "Alpha Vantage",
        kind: "json",
        baseUrl: "https://www.alphavantage.co/query",
        apiKeyEnv: "ALPHAVANTAGE_API_KEY",
        maxRps: 1,
        timeoutMs: 10000,
        maxRetries: 2,
        maxRpm: 5,
        /* The FX exchange-rate function is live; GLOBAL_QUOTE is daily. The
         * generous value keeps an honest daily number from being called stale. */
        cadenceMs: 600000,
        markets: Object.freeze(["commodities", "forex", "indices"])
    }),
    fred: Object.freeze({
        id: "fred",
        label: "FRED (St. Louis Fed)",
        kind: "json",
        baseUrl: "https://api.stlouisfed.org/fred/series/observations",
        apiKeyEnv: "FRED_API_KEY",
        maxRps: 5,
        timeoutMs: 10000,
        maxRetries: 2,
        cadenceMs: 86400000, /* one official observation per business day */
        markets: Object.freeze(["bonds", "realestatecredit", "forex"])
    }),
    binance: Object.freeze({
        id: "binance",
        label: "Binance",
        kind: "json",
        baseUrl: "https://api.binance.com/api/v3/ticker/bookTicker",
        apiKeyEnv: null,
        maxRps: 8,
        timeoutMs: 8000,
        maxRetries: 2,
        cadenceMs: 5000,
        markets: Object.freeze(["crypto"])
    }),
    okx: Object.freeze({
        id: "okx",
        label: "OKX",
        kind: "json",
        baseUrl: "https://www.okx.com/api/v5/market/ticker",
        apiKeyEnv: null,
        maxRps: 8,
        timeoutMs: 8000,
        maxRetries: 2,
        cadenceMs: 5000,
        markets: Object.freeze(["crypto"])
    })
});

const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDER_CONFIG));

/** The config of one provider (throws on a typo instead of failing later). */
function providerConfig(id) {
    const config = PROVIDER_CONFIG[id];
    if (!config) throw new RangeError(`unknown provider "${id}" (known: ${PROVIDER_IDS.join(", ")})`);
    return config;
}

/** The API key of a provider, or null when it is key-free / not configured. */
function apiKeyFor(id, env = process.env) {
    const config = providerConfig(id);
    if (!config.apiKeyEnv) return null;
    const value = env ? env[config.apiKeyEnv] : null;
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Per-venue data cadence — the second half of an honest freshness test. */
function cadenceMap(ids = PROVIDER_IDS) {
    const out = {};
    for (const id of ids) out[id] = PROVIDER_CONFIG[id].cadenceMs || 0;
    return out;
}

module.exports = { PROVIDER_CONFIG, PROVIDER_IDS, providerConfig, apiKeyFor, cadenceMap };

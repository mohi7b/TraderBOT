/* ============================================================
 * File: collector/crypto/onchain/config/providers.cjs
 * Section: collector/crypto/onchain/config
 * Version: 1.0.0
 *
 * Role:
 *   The endpoint + budget sheet of the on-chain collector. Every entry
 *   here was reached *live* from this machine before it was written down
 *   (see README "what was verified"), so the sheet records what answers,
 *   not a wish list:
 *
 *     defillama             api.llama.fi         CEX transparency: reserves + net flows
 *     defillama-stablecoins stablecoins.llama.fi supply + 1d/1w/1m deltas per stablecoin
 *     defillama-yields      yields.llama.fi      lending pools (2,986 stablecoin pools)
 *     mempool               mempool.space        BTC blocks, transfers, mempool state
 *     blockchain-info       api.blockchain.info  BTC supply + estimated USD tx value
 *     yahoo                 query1.../v8/chart   fund price + volume (instrumentType "ETF")
 *     nasdaq                api.nasdaq.com       fund name, listing venue, last sale
 *
 *   Three obvious-looking sources were rejected on purpose:
 *     - farside.co.uk (the usual ETF-flow table) answers 403 behind Cloudflare
 *     - Yahoo v7/quote → 401 and v10/quoteSummary → 429 without a crumb
 *     - Blockchair blacklists the calling IP after a handful of queries; an
 *       endpoint that bans its caller cannot carry a daily series
 *
 *   Two different clocks live here and they are not the same thing:
 *     scheduleMs  how often we ask — a task-level decision, declared by the
 *                 subsystem that owns the task
 *     cadenceMs   how long an answer stays meaningful — a property of the
 *                 data itself (a fund's daily volume is a daily fact)
 * ============================================================ */

const ONCHAIN_SECTION = "onchain";

const PROVIDER_CONFIG = Object.freeze({
    defillama: Object.freeze({
        id: "defillama",
        label: "DefiLlama — CEX transparency",
        kind: "json",
        baseUrl: "https://api.llama.fi",
        apiKeyEnv: null,
        maxRps: 1,
        timeoutMs: 20000,
        maxRetries: 2,
        /* 88 exchanges with currentTvl / cleanAssetsTvl / inflows_24h|1w|1m. */
        cadenceMs: 600000,
        section: ONCHAIN_SECTION,
        measures: Object.freeze(["exchange_reserves"])
    }),
    "defillama-stablecoins": Object.freeze({
        id: "defillama-stablecoins",
        label: "DefiLlama — stablecoins",
        kind: "json",
        baseUrl: "https://stablecoins.llama.fi",
        apiKeyEnv: null,
        maxRps: 1,
        timeoutMs: 25000,
        maxRetries: 2,
        /* 427 pegged assets with circulatingPrevDay|Week|Month and a per-chain split. */
        cadenceMs: 900000,
        section: ONCHAIN_SECTION,
        measures: Object.freeze(["stablecoin_supply"])
    }),
    "defillama-yields": Object.freeze({
        id: "defillama-yields",
        label: "DefiLlama — yields",
        kind: "json",
        baseUrl: "https://yields.llama.fi",
        apiKeyEnv: null,
        maxRps: 1,
        timeoutMs: 45000,
        maxRetries: 1,
        /* 11.8 MB per answer (17,153 pools). The long cadence is politeness:
         * a lending rate does not need a fresh copy every minute. */
        cadenceMs: 14400000,
        section: ONCHAIN_SECTION,
        measures: Object.freeze(["lending_rate"])
    }),
    mempool: Object.freeze({
        id: "mempool",
        label: "mempool.space",
        kind: "json",
        baseUrl: "https://mempool.space",
        apiKeyEnv: null,
        maxRps: 1,
        timeoutMs: 15000,
        maxRetries: 2,
        /* A block arrives every ~10 minutes; the mempool changes every second. */
        cadenceMs: 60000,
        section: ONCHAIN_SECTION,
        measures: Object.freeze(["whale_transfer", "network_metrics"])
    }),
    "blockchain-info": Object.freeze({
        id: "blockchain-info",
        label: "Blockchain.com charts",
        kind: "json",
        baseUrl: "https://api.blockchain.info",
        apiKeyEnv: null,
        maxRps: 1,
        timeoutMs: 15000,
        maxRetries: 2,
        /* Daily series (BTC in circulation, estimated USD transaction value). */
        cadenceMs: 86400000,
        section: ONCHAIN_SECTION,
        measures: Object.freeze(["network_metrics"])
    }),
    yahoo: Object.freeze({
        id: "yahoo",
        label: "Yahoo Finance — charts",
        kind: "json",
        baseUrl: "https://query1.finance.yahoo.com/v8/finance/chart",
        apiKeyEnv: null,
        maxRps: 3,
        timeoutMs: 12000,
        maxRetries: 2,
        /* One bar per trading day. */
        cadenceMs: 86400000,
        section: ONCHAIN_SECTION,
        measures: Object.freeze(["etf_quote"])
    }),
    nasdaq: Object.freeze({
        id: "nasdaq",
        label: "Nasdaq quote API",
        kind: "json",
        baseUrl: "https://api.nasdaq.com",
        apiKeyEnv: null,
        maxRps: 1,
        timeoutMs: 12000,
        maxRetries: 2,
        cadenceMs: 86400000,
        section: ONCHAIN_SECTION,
        measures: Object.freeze(["etf_quote"])
    })
});

const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDER_CONFIG));

/** The config of one provider (a typo throws here, not three layers later). */
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

/**
 * Which providers are usable right now. On-chain data is public data, so
 * this is expected to be "all of them" — a provider that suddenly needs a
 * key shows up here instead of silently returning nothing.
 */
function providerReadiness(env = process.env) {
    return PROVIDER_IDS.map((id) => {
        const config = providerConfig(id);
        const key = config.apiKeyEnv ? apiKeyFor(id, env) : null;
        return Object.freeze({
            id,
            label: config.label,
            keyFree: !config.apiKeyEnv,
            ready: !config.apiKeyEnv || Boolean(key),
            missingEnv: config.apiKeyEnv && !key ? config.apiKeyEnv : null,
            cadenceMs: config.cadenceMs,
            measures: [...(config.measures || [])]
        });
    });
}

module.exports = { ONCHAIN_SECTION, PROVIDER_CONFIG, PROVIDER_IDS, providerConfig, apiKeyFor, providerReadiness };

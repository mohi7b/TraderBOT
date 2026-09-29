/* ============================================================
 * File: collector/liquidity_6markets/index.cjs
 * Section: collector/liquidity_6markets
 * Version: 1.0.0
 *
 * Role:
 *   Public surface of the six-market liquidity collector. This is the
 *   file the rest of the system (or a test) imports:
 *
 *     const liquidity = require("./collector/liquidity_6markets");
 *     const collector = liquidity.createCollector({ bus });
 *     await collector.run({ sweeps: 3 });
 *     collector.status();
 *
 *   The vocabulary stays in one place (core/instrument.cjs) and the
 *   catalog in one place (instruments/index.cjs), so "six markets" is a
 *   fact of the data rather than a claim in a comment.
 * ============================================================ */

const instrumentCore = require("./core/instrument.cjs");
const normalizer = require("./core/quote-normalizer.cjs");
const { LiquidFlowEngine, CVD_METHOD } = require("./core/flow-engine.cjs");
const { createFeedClient } = require("./core/feed-client.cjs");
const { createLiquidityBridge, createReadingPublisher, readingEnvelope, LIQUIDITY_MARKET } = require("./core/bus-bridge.cjs");
const { createOrchestrator, DEFAULT_INTERVAL_MS } = require("./core/orchestrator.cjs");

const { PROVIDER_CONFIG, PROVIDER_IDS, providerConfig, apiKeyFor, cadenceMap } = require("./config/providers.cjs");
const { createProviderRegistry, DEFAULT_PROVIDERS, prepareRequest } = require("./providers/index.cjs");
const { createInstrumentCatalog, defaultCatalog, MARKET_IDS } = require("./instruments/index.cjs");

/** The orchestrator with everything defaulted — the usual entry point. */
function createCollector(options = {}) {
    return createOrchestrator(options);
}

/** Which venues are usable right now (key present) and which are not. */
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
            cadenceMs: config.cadenceMs || null,
            markets: [...(config.markets || [])]
        });
    });
}

module.exports = {
    /* build */
    createCollector,
    createOrchestrator,
    createFeedClient,
    createProviderRegistry,
    createInstrumentCatalog,
    defaultCatalog,
    createLiquidityBridge,
    createReadingPublisher,

    /* data */
    readingEnvelope,
    normalizeQuote: normalizer.normalizeQuote,
    createReading: normalizer.createReading,
    CVD_METHOD,
    LIQUIDITY_MARKET,
    MARKET_IDS,
    DEFAULT_INTERVAL_MS,

    /* vocabulary */
    ...instrumentCore,

    /* providers */
    PROVIDER_CONFIG,
    PROVIDER_IDS,
    PROVIDER_KINDS: require("./providers/index.cjs").PROVIDER_KINDS,
    DEFAULT_PROVIDERS,
    providerConfig,
    apiKeyFor,
    cadenceMap,
    prepareRequest,
    providerReadiness,

    /* engines (constructible) */
    LiquidFlowEngine
};

/* ============================================================
 * File: collector/crypto/realtime/index.cjs
 * Section: collector/crypto/realtime  (section root / public API)
 * Version: 2.0.0
 *
 * Role:
 *   Single entry point of the standalone Realtime section.
 *   Nothing outside this folder should reach into sub-modules directly;
 *   everything a consumer needs is exported here.
 *
 *   const realtime = require("collector/crypto/realtime");
 *
 *   await realtime.request("BTCUSDT");                 // start on demand
 *   realtime.getState("BTCUSDT");                      // read-only
 *   realtime.status();                                 // health/telemetry
 *   realtime.subscribe(entry => ...);                  // live feed
 *   realtime.release("BTCUSDT");                       // stop watching
 *
 * Ownership boundary:
 *   collector/crypto/realtime owns its config (config/realtime.cjs,
 *   config/exchanges.cjs, config/charts.cjs). The orchestrator
 *   re-exports collector/crypto/realtime/config/exchanges.cjs so there is one
 *   shared activation matrix, and collector/crypto/realtime never requires
 *   anything from the orchestrator.
 * ============================================================ */

const CONFIG = require("./config/realtime.cjs");
const CORE = require("./core/index.cjs");
const VENUES = require("./venue-adapters/index.cjs");
const SERVICE = require("./service/index.cjs");
const EXCHANGE_CONFIG = require("./config/exchanges.cjs");
const CHART_CONFIG = require("./config/charts.cjs");
const spotHandler = require("./ingest/spot-handler.cjs");
const futuresHandler = require("./ingest/futures-handler.cjs");

/* ------------------------------------------------------------
 * Service (lazy singleton)
 * ---------------------------------------------------------- */
function getService(options) {
    return SERVICE.getService(options);
}

function setService(service) {
    return SERVICE.setService(service);
}

function resetService() {
    return SERVICE.resetService();
}

/* ------------------------------------------------------------
 * Lifecycle API
 * ---------------------------------------------------------- */
async function request(symbol, options = {}) {
    return getService().request(symbol, options);
}

function getState(symbol) {
    return getService().getState(symbol);
}

function status() {
    return getService().status();
}

function release(symbol, reason) {
    return getService().release(symbol, reason);
}

function releaseAll(reason) {
    return getService().releaseAll(reason);
}

/** Live feed of every bus entry (used by SSE / dashboards). */
function subscribe(fn) {
    return getService().subscribe(fn);
}

/** Latest value of every event for one symbol, or for a whole venue. */
function signals(filter = {}) {
    return getService().runtime.bus.snapshot(filter);
}

module.exports = {
    version: CONFIG.version,

    /* lifecycle */
    request,
    getState,
    status,
    release,
    releaseAll,
    subscribe,
    signals,

    /* singletons */
    getService,
    setService,
    resetService,
    RealtimeService: SERVICE.RealtimeService,
    ConnectionManager: SERVICE.ConnectionManager,

    /* ingest (also reachable through the legacy aanode/* shims) */
    spotHandler,
    futuresHandler,

    /* config + building blocks */
    config: CONFIG,
    exchangeConfig: EXCHANGE_CONFIG,
    chartConfig: CHART_CONFIG,
    core: CORE,
    venues: VENUES,
    service: SERVICE,

    /* convenience re-exports */
    buildVenuePlan: SERVICE.buildVenuePlan,
    normalizeSymbol: EXCHANGE_CONFIG.normalizeSymbol,
    getEnabledMarkets: EXCHANGE_CONFIG.getEnabledMarkets,
    getEnabledExchanges: EXCHANGE_CONFIG.getEnabledExchanges
};

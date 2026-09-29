/* ============================================================
 * File: collector/crypto/derivatives/venues/index.cjs
 * Section: collector/crypto/derivatives/venues
 * Version: 1.0.0
 *
 * Role:
 *   Registry of the derivatives venue adapters. This is the only place
 *   that knows the list of venues — everything else (collector, tests,
 *   CLI) asks this module.
 *
 *   Each adapter implements the same contract:
 *     name                     "binance" | ...
 *     capabilities             { openInterest, funding, predictedFunding,
 *                                longShortRatio, liquidations }
 *     symbolFor(symbol)        unified symbol → venue symbol
 *     requests(symbol, opts)   { openInterest|funding|fundingTime|longShortRatio: {url} | null }
 *     parse                    { <type>(body, ctx) → canonical input | null }
 *     liquidation              { url, subscribe, filter?, parse } | null
 * ============================================================ */

const ADAPTERS = Object.freeze({
    binance: require("./binance.cjs"),
    bybit: require("./bybit.cjs"),
    okx: require("./okx.cjs"),
    kucoin: require("./kucoin.cjs"),
    bitget: require("./bitget.cjs")
});

const VENUE_NAMES = Object.freeze(Object.keys(ADAPTERS));

function getAdapter(name) {
    const key = String(name || "").toLowerCase();
    return ADAPTERS[key] || null;
}

/** Resolve a list of names to adapters, skipping unknown venues silently. */
function resolveVenues(names = VENUE_NAMES) {
    return names
        .map((name) => getAdapter(name))
        .filter(Boolean);
}

/** Which REST data types a venue offers (streams excluded). */
function restCapabilities(adapter) {
    const requests = adapter.requests("BTCUSDT", { period: "5m" });
    return Object.entries(requests)
        .filter(([, request]) => !!request)
        .map(([type]) => type);
}

function capabilitiesMatrix() {
    const matrix = {};
    for (const [name, adapter] of Object.entries(ADAPTERS)) {
        matrix[name] = { ...adapter.capabilities, rest: restCapabilities(adapter) };
    }
    return matrix;
}

module.exports = { ADAPTERS, VENUE_NAMES, getAdapter, resolveVenues, restCapabilities, capabilitiesMatrix };

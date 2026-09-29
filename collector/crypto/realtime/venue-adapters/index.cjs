/* ============================================================
 * File: collector/crypto/realtime/venue-adapters/index.cjs
 * Section: collector/crypto/realtime/venue-adapters
 *
 * Role:
 *   Public surface over the static stream table: describe the streams
 *   of one (exchange, market) pair and turn them into startable
 *   adapters.
 * ============================================================ */

const { SPECS, FUTURES_STREAM_ORDER, SPOT_STREAM_ORDER } = require("./registry.cjs");
const { createAdapter, createHandle, isWsClass, resolveStop } = require("./wrappers.cjs");

function streamOrder(market) {
    return market === "futures" ? FUTURES_STREAM_ORDER : SPOT_STREAM_ORDER;
}

/** Serialisable description of the streams available for (exchange, market). */
function describeStreams(exchange, market) {
    const specs = (SPECS[market] && SPECS[market][exchange]) || [];

    return specs.map((spec) => ({
        id: `${exchange}:${market}:${spec.key}`,
        exchange,
        market,
        kind: spec.kind,
        intervalMs: spec.intervalMs || null,
        injectExchange: !!spec.injectExchange,
        load: spec.load
    }));
}

/** Strip loader thunks so a plan can be returned over HTTP/JSON. */
function serializeStream(stream) {
    const { load, ...rest } = stream;
    return rest;
}

function listVenues() {
    const all = new Set([
        ...Object.keys(SPECS.futures || {}),
        ...Object.keys(SPECS.spot || {})
    ]);
    return [...all];
}

function listMarkets(exchange) {
    return Object.keys(SPECS).filter((market) => (SPECS[market] || {})[exchange]);
}

/** Streams + markets + venues overview (used by GET /venues). */
function catalog() {
    const result = {};
    for (const exchange of listVenues()) {
        result[exchange] = {};
        for (const market of listMarkets(exchange)) {
            result[exchange][market] = describeStreams(exchange, market).map(serializeStream);
        }
    }
    return result;
}

module.exports = {
    SPECS,
    streamOrder,
    describeStreams,
    serializeStream,
    listVenues,
    listMarkets,
    catalog,
    createAdapter,
    createHandle,
    isWsClass,
    resolveStop
};

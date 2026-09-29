/* ============================================================
 * File: collector/crypto/realtime/service/venue-plan.cjs
 * Section: collector/crypto/realtime/service
 *
 * Role:
 *   Turn one symbol into the ordered list of streams that must be
 *   started, honouring:
 *     - the exchange activation matrix  (config/exchanges.cjs)
 *     - the stream start order          (venue-adapters/registry.cjs)
 *     - optional per-request filters    (markets / exchanges)
 * ============================================================ */

const CONFIG = require("../config/realtime.cjs");
const {
    normalizeSymbol,
    getEnabledExchanges,
    getEnabledMarkets
} = require("../config/exchanges.cjs");
const { describeStreams, streamOrder, serializeStream } = require("../venue-adapters/index.cjs");

function toFilter(value) {
    return Array.isArray(value) && value.length ? new Set(value) : null;
}

/**
 * @param {string} symbol
 * @param {{markets?: string[], exchanges?: string[]}} [options]
 * @returns {Array<object>} ordered stream descriptors (each with a lazy `load`)
 */
function buildVenuePlan(symbol, options = {}) {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return [];

    const markets = Array.isArray(options.markets) && options.markets.length
        ? options.markets
        : CONFIG.markets;
    const marketFilter = toFilter(markets);
    const exchangeFilter = toFilter(options.exchanges);

    const enabledExchanges = new Set(getEnabledExchanges(normalized));
    const plan = [];

    for (const market of markets) {
        if (marketFilter && !marketFilter.has(market)) continue;

        const ordered = streamOrder(market).filter((exchange) => enabledExchanges.has(exchange));

        for (const exchange of ordered) {
            if (exchangeFilter && !exchangeFilter.has(exchange)) continue;
            if (getEnabledMarkets(exchange, normalized)[market] !== true) continue;

            for (const stream of describeStreams(exchange, market)) {
                plan.push({ ...stream, symbol: normalized });
            }
        }
    }

    return plan;
}

/** JSON-safe view of a plan: no loader thunks, grouped per venue. */
function summarizePlan(plan) {
    return (plan || []).map((stream) => serializeStream(stream));
}

/** e.g. ["spot:binance:ws", "futures:bybit:ws", ...] */
function planStreamIds(plan) {
    return (plan || []).map((stream) => stream.id);
}

/** e.g. ["spot:binance", "futures:bybit", ...] */
function planVenues(plan) {
    return [...new Set((plan || []).map((stream) => `${stream.market}:${stream.exchange}`))];
}

module.exports = { buildVenuePlan, summarizePlan, planStreamIds, planVenues };

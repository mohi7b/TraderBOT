/* ============================================================
 * File: collector/liquidity_6markets/providers/twelvedata.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   Twelve Data /quote — one JSON object per instrument, and the only
 *   source here that reports bid/ask for FX, so it is what makes a
 *   *tradable* spread measurable outside crypto.
 *
 *   GET /quote?symbol=EUR/USD&apikey=KEY
 *   → { symbol, exchange, currency, datetime, timestamp, open, high,
 *       low, close, volume, bid, ask, ... }
 *
 *   The key is required (env TWELVEDATA_API_KEY); without it
 *   buildRequest refuses instead of firing a request that would be
 *   rejected and counted against the budget.
 * ============================================================ */

const ID = "twelvedata";

function buildUrl(instrument, { providerSymbol, apiKey, config }) {
    const url = new URL(config.baseUrl);
    url.searchParams.set("symbol", providerSymbol);
    url.searchParams.set("apikey", apiKey);
    return url.toString();
}

function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function parse(data, { providerSymbol = null } = {}) {
    if (!data || typeof data !== "object") return null;
    /* A quota/bad-symbol answer is an error object, not a quote. */
    if (data.code && data.message) return null;

    const price = numberOrNull(data.close);
    const bid = numberOrNull(data.bid);
    const ask = numberOrNull(data.ask);
    if (price === null && bid === null && ask === null) return null;

    const stamp = numberOrNull(data.timestamp);

    return {
        providerSymbol,
        price: price === null ? (bid === null ? ask : (bid + ask) / 2) : price,
        bid,
        ask,
        open: numberOrNull(data.open),
        high: numberOrNull(data.high),
        low: numberOrNull(data.low),
        close: numberOrNull(data.close),
        volume: numberOrNull(data.volume),
        barInterval: data.interval || null,
        timestamp: stamp === null ? null : stamp * 1000
    };
}

module.exports = { id: ID, kind: "json", requiresKey: true, buildUrl, parse };

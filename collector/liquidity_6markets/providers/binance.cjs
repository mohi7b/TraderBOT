/* ============================================================
 * File: collector/liquidity_6markets/providers/binance.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   The crypto leg of the six markets, taken from the same venues the
 *   realtime collector already covers, so the liquidity layer can line
 *   six markets up on one axis without inventing a second crypto feed.
 *
 *   GET /api/v3/ticker/bookTicker?symbol=BTCUSDT
 *   → { symbol, bidPrice, bidQty, askPrice, askQty }
 *
 *   This is a *top-of-book* quote with sizes: the reading therefore has
 *   bid/ask and can carry a depth imbalance, but it is published as a
 *   "ticker" event — one level is a BBO, not an orderbook, and the
 *   analytics side must not be told otherwise.
 * ============================================================ */

const ID = "binance";

function buildUrl(instrument, { providerSymbol, apiKey = null, config }) {
    const url = new URL(config.baseUrl);
    url.searchParams.set("symbol", providerSymbol);
    if (apiKey) url.searchParams.set("apiKey", apiKey);
    return url.toString();
}

function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function parse(data, { providerSymbol = null } = {}) {
    if (!data || typeof data !== "object") return null;
    if (data.code && data.msg) return null; /* venue error object */

    const bid = numberOrNull(data.bidPrice);
    const ask = numberOrNull(data.askPrice);
    if (bid === null && ask === null) return null;

    const price = bid !== null && ask !== null ? (bid + ask) / 2 : (bid === null ? ask : bid);

    return {
        providerSymbol,
        price,
        bid,
        ask,
        bidSize: numberOrNull(data.bidQty),
        askSize: numberOrNull(data.askQty),
        open: null,
        high: null,
        low: null,
        close: null,
        volume: null,
        barInterval: null,
        /* bookTicker carries no timestamp: the collector's receive time is
         * the only honest stamp, and it arrives through `now`. */
        timestamp: null
    };
}

module.exports = { id: ID, kind: "json", buildUrl, parse };

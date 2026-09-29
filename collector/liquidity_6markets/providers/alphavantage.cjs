/* ============================================================
 * File: collector/liquidity_6markets/providers/alphavantage.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   Alpha Vantage with two functions, because they answer two different
 *   questions:
 *
 *     CURRENCY_EXCHANGE_RATE — real bid/ask for an FX pair (when the
 *       instrument carries a `from`/`to` split), used for forex.
 *     GLOBAL_QUOTE           — last OHLCV for futures, metals and
 *       indices, used when no FX pair is defined.
 *
 *   Free tier is 5 requests/minute; config/providers.cjs enforces it.
 *   A note/Information answer (quota reached) parses to null so the
 *   collector records "venue refused", not a fake zero price.
 * ============================================================ */

const ID = "alphavantage";

function buildUrl(instrument, { providerSymbol, apiKey, config }) {
    const url = new URL(config.baseUrl);
    /* An FX instrument is identified as FROM+TO ("EUR"+"USD"). */
    if (instrument && instrument.from && instrument.to) {
        url.searchParams.set("function", "CURRENCY_EXCHANGE_RATE");
        url.searchParams.set("from_currency", instrument.from);
        url.searchParams.set("to_currency", instrument.to);
    } else {
        url.searchParams.set("function", "GLOBAL_QUOTE");
        url.searchParams.set("symbol", providerSymbol);
    }
    url.searchParams.set("apikey", apiKey);
    return url.toString();
}

function numberOrNull(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const number = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
}

/** "2026-08-31 22:00:00" (UTC) → epoch ms. */
function timestampOf(text) {
    if (typeof text !== "string" || text.trim() === "") return null;
    const parsed = Date.parse(`${text.trim()}Z`.replace(" ", "T"));
    return Number.isFinite(parsed) ? parsed : null;
}

function parse(data, { providerSymbol = null } = {}) {
    if (!data || typeof data !== "object") return null;

    const fx = data["Realtime Currency Exchange Rate"];
    if (fx) {
        const price = numberOrNull(fx["5. Exchange Rate"]);
        if (price === null) return null;
        return {
            providerSymbol,
            price,
            bid: numberOrNull(fx["8. Bid Price"]),
            ask: numberOrNull(fx["9. Ask Price"]),
            barInterval: null,
            timestamp: timestampOf(fx["6. Last Refreshed"])
        };
    }

    const quote = data["Global Quote"];
    if (quote) {
        const price = numberOrNull(quote["05. price"]);
        if (price === null) return null;
        return {
            providerSymbol,
            price,
            open: numberOrNull(quote["02. open"]),
            high: numberOrNull(quote["03. high"]),
            low: numberOrNull(quote["04. low"]),
            close: numberOrNull(quote["08. previous close"]),
            volume: numberOrNull(quote["06. volume"]),
            barInterval: "1d",
            timestamp: timestampOf(quote["07. latest trading day"])
        };
    }

    return null;
}

module.exports = { id: ID, kind: "json", requiresKey: true, buildUrl, parse };

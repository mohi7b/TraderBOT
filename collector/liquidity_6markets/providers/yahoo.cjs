/* ============================================================
 * File: collector/liquidity_6markets/providers/yahoo.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   Yahoo Finance chart endpoint — the broadest key-free source: it
 *   quotes FX pairs, metals, energy futures, cash indices, yields and
 *   REITs with the same shape, which is exactly what a six-market layer
 *   needs. It serves no bid/ask and no book, so a reading from here
 *   carries a price and a candle and says so (`evidence.bidAsk: false`).
 *
 *   URL:  /v8/finance/chart/<symbol>?interval=1m&range=1d
 *   The provider symbol is the provider's own spelling ("EURUSD=X",
 *   "GC=F", "^GSPC", "^TNX", "VNQ") and lives in the instrument.
 * ============================================================ */

const ID = "yahoo";

function buildUrl(instrument, { providerSymbol, config }) {
    const url = new URL(`${config.baseUrl}/${encodeURIComponent(providerSymbol)}`);
    url.searchParams.set("interval", "1m");
    url.searchParams.set("range", "1d");
    url.searchParams.set("includePrePost", "false");
    return url.toString();
}

/** Last non-null value of a Yahoo series (the API pads with nulls). */
function lastOf(series) {
    if (!Array.isArray(series)) return null;
    for (let index = series.length - 1; index >= 0; index -= 1) {
        if (Number.isFinite(series[index])) return series[index];
    }
    return null;
}

function parse(data, { providerSymbol = null } = {}) {
    const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
    if (!result) return null;

    const meta = result.meta || {};
    const quote = result.indicators && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
    const stamps = Array.isArray(result.timestamp) ? result.timestamp : [];

    const barClose = quote ? lastOf(quote.close) : null;
    const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : barClose;
    if (!Number.isFinite(price)) return null;

    const lastIndex = stamps.length ? stamps.length - 1 : -1;
    const barTime = lastIndex >= 0 ? stamps[lastIndex] * 1000 : null;
    const marketTime = Number.isFinite(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : null;

    return {
        providerSymbol,
        price,
        open: lastIndex >= 0 && quote ? quote.open[lastIndex] : null,
        high: lastIndex >= 0 && quote ? quote.high[lastIndex] : null,
        low: lastIndex >= 0 && quote ? quote.low[lastIndex] : null,
        close: barClose,
        volume: lastIndex >= 0 && quote ? quote.volume[lastIndex] : null,
        barInterval: meta.dataGranularity || "1m",
        timestamp: marketTime || barTime,
        currency: meta.currency || null
    };
}

module.exports = { id: ID, kind: "json", buildUrl, parse };

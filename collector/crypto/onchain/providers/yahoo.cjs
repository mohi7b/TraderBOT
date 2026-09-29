/* ============================================================
 * File: collector/crypto/onchain/providers/yahoo.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   Yahoo's chart endpoint for the fund half of the module: one bar per
 *   trading day, plus the previous close, which is what turns a price into
 *   a daily move.
 *
 *     /v8/finance/chart/<symbol>?interval=1d&range=5d&includePrePost=false
 *
 *   Verified live (2026-09): IBIT answers http 200 with
 *   meta.instrumentType "ETF", meta.exchangeName "NGM", meta.currency "USD",
 *   chartPreviousClose and a volume series.
 *
 *   Two neighbours of this endpoint are deliberately not used, because they
 *   answered "no" from this machine: v7/finance/quote → 401 Unauthorized,
 *   v10/finance/quoteSummary → 429. Without quoteSummary there is no
 *   shares-outstanding field, which is why the fund reading reports a price
 *   and a volume and *no* flow (see README known gaps).
 *
 *   The row says what the provider said (instrumentType, exchangeName); it
 *   never upgrades "ETF" into an asset class.
 * ============================================================ */

const { numberOrNull } = require("../core/reading.cjs");

const ID = "yahoo";

const endpoints = Object.freeze({ chart: Object.freeze({ path: "/v8/finance/chart" }) });

function buildUrl({ endpoint, params, subject, config }) {
    if (endpoint !== "chart") return null;
    const spelling = (params && params.symbol)
        || (subject && subject.symbols && subject.symbols[ID])
        || null;
    if (typeof spelling !== "string" || spelling.trim() === "") return null;

    const url = new URL(`${config.baseUrl}/${encodeURIComponent(spelling.trim())}`);
    url.searchParams.set("interval", "1d");
    url.searchParams.set("range", "5d");
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

function parse({ endpoint, data, params = {} }) {
    if (endpoint !== "chart") return [];
    const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
    if (!result) return [];

    const meta = result.meta || {};
    const quote = result.indicators && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
    const stamps = Array.isArray(result.timestamp) ? result.timestamp : [];
    const barClose = quote ? lastOf(quote.close) : null;
    const price = numberOrNull(meta.regularMarketPrice) === null ? barClose : numberOrNull(meta.regularMarketPrice);
    if (price === null) return [];

    const prevClose = numberOrNull(meta.chartPreviousClose);
    const lastIndex = stamps.length ? stamps.length - 1 : -1;
    const barTime = numberOrNull(meta.regularMarketTime) !== null
        ? numberOrNull(meta.regularMarketTime) * 1000
        : (lastIndex >= 0 ? stamps[lastIndex] * 1000 : null);

    return [{
        key: typeof meta.symbol === "string" && meta.symbol.trim() !== "" ? meta.symbol : (params.symbol || null),
        currency: meta.currency || null,
        instrumentType: meta.instrumentType || null,
        exchangeName: meta.exchangeName || null,
        fullExchangeName: meta.fullExchangeName || null,
        price,
        prevClose,
        dayChange: prevClose === null ? null : price - prevClose,
        volume: lastIndex >= 0 && quote ? numberOrNull(quote.volume && quote.volume[lastIndex]) : null,
        barTime,
        dataGranularity: meta.dataGranularity || null
    }];
}

module.exports = { id: ID, kind: "json", endpoints, buildUrl, parse, lastOf };
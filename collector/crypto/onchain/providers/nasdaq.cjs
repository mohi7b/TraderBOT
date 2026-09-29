/* ============================================================
 * File: collector/crypto/onchain/providers/nasdaq.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   Nasdaq's public quote API — the second, independent measurement of the
 *   funds. Two sources for one number is what makes the institutional
 *   reading checkable: Yahoo gives price + previous close, Nasdaq gives the
 *   last sale, the day change and the listing venue as the exchange
 *   describes itself.
 *
 *     GET /api/quote/<symbol>/info?assetclass=etf
 *
 *   Verified live (2026-09): IBIT answers http 200 with
 *   companyName "iShares Bitcoin Trust ETF", exchange "NASDAQ-GM",
 *   primaryData.lastSalePrice "$47.57", netChange "-0.24",
 *   percentageChange "-0.50%".
 *
 *   Two honest details:
 *     - prices arrive as formatted strings ("$47.57", "-0.50%"), so they are
 *       parsed explicitly: a string that is not a number stays null
 *     - /api/quote/<symbol>/historical answered 200 with
 *       {"data":null,"status":{"bCodeMessage":[{"code":2001,"errorMessage":
 *       "Error while calling vendor"}]}} — an empty answer that must not be
 *       mistaken for a flat day. The parser therefore reads `data` and never
 *       treats a missing payload as a zero.
 *
 *   The endpoint is picky about callers: it is asked with a browser-like
 *   User-Agent, which is why `headers` exists on a provider at all.
 * ============================================================ */

const { numberOrNull, usdOf } = require("../core/reading.cjs");

const ID = "nasdaq";

const endpoints = Object.freeze({ info: Object.freeze({ path: "/api/quote" }) });

const headers = Object.freeze({
    "user-agent": "Mozilla/5.0 (compatible; TraderBOT-onchain/1.0)",
    accept: "application/json, text/plain, */*"
});

function buildUrl({ endpoint, params, subject, config }) {
    if (endpoint !== "info") return null;
    const spelling = (params && params.symbol)
        || (subject && subject.symbols && subject.symbols[ID])
        || null;
    if (typeof spelling !== "string" || spelling.trim() === "") return null;

    const url = new URL(`${config.baseUrl}${endpoints.info.path}/${encodeURIComponent(spelling.trim())}/info`);
    url.searchParams.set("assetclass", (params && params.assetClass) || "etf");
    return url.toString();
}

function parse({ endpoint, data }) {
    if (endpoint !== "info") return [];
    const payload = data && data.data && typeof data.data === "object" ? data.data : null;
    /* An empty payload is an empty answer — not a fund with zero volume. */
    if (!payload || typeof payload.symbol !== "string") return [];

    const primary = payload.primaryData || {};
    const lastSalePrice = usdOf(primary.lastSalePrice);
    const netChange = usdOf(primary.netChange);
    const changePct = usdOf(primary.percentageChange);
    const prevClose = Number.isFinite(lastSalePrice) && Number.isFinite(netChange) ? lastSalePrice - netChange : null;

    return [{
        key: payload.symbol,
        name: payload.companyName || null,
        listing: payload.exchange || null,
        isNasdaqListed: payload.isNasdaqListed === true,
        lastSalePrice,
        netChange,
        changePct,
        prevClose,
        lastTradeTimestamp: primary.lastTradeTimestamp || null,
        deltaIndicator: primary.deltaIndicator || null,
        reportedBy: "nasdaq"
    }];
}

module.exports = { id: ID, kind: "json", endpoints, headers, buildUrl, parse };
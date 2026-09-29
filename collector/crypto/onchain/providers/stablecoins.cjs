/* ============================================================
 * File: collector/crypto/onchain/providers/stablecoins.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   DefiLlama's pegged-asset list — the stablecoin supply source. One
 *   answer carries 427 assets with their current circulating supply, the
 *   same supply one day / one week / one month ago, and a per-chain split.
 *   Those four points are what makes a supply reading a *flow* reading: the
 *   collector never has to remember yesterday's number to know the change.
 *
 *   Verified live (2026-09): 427 assets, http 200, fields circulating,
 *   circulatingPrevDay, circulatingPrevWeek, circulatingPrevMonth,
 *   chainCirculating (per chain, same three deltas), chains.
 *
 *   Rows are keyed by the asset symbol ("USDT", "USDe"); a symbol that is
 *   absent is dropped, and a supply that is not a number stays null.
 * ============================================================ */

const { numberOrNull } = require("../core/reading.cjs");

const ID = "defillama-stablecoins";

const endpoints = Object.freeze({ stablecoins: Object.freeze({ path: "/stablecoins" }) });

function buildUrl({ endpoint, config }) {
    if (endpoint !== "stablecoins") return null;
    /* Prices are not part of a supply reading, and asking for them would be
     * a heavier answer for numbers we deliberately do not use. */
    return `${config.baseUrl}${endpoints.stablecoins.path}?includePrices=false`;
}

/** One pegged value out of { peggedUSD: 183746553248.75427 }. */
function peggedOf(holder) {
    if (!holder || typeof holder !== "object") return null;
    if (Number.isFinite(holder.peggedUSD)) return holder.peggedUSD;
    const values = Object.values(holder).map(numberOrNull).filter((value) => value !== null);
    return values.length ? values[0] : null;
}

/** chainCirculating → the chains we can actually see a number for. */
function chainsOf(chainCirculating) {
    if (!chainCirculating || typeof chainCirculating !== "object") return [];
    return Object.entries(chainCirculating)
        .map(([chain, entry]) => ({
            chain,
            usd: peggedOf(entry && entry.current),
            prevDayUsd: peggedOf(entry && entry.circulatingPrevDay),
            prevWeekUsd: peggedOf(entry && entry.circulatingPrevWeek)
        }))
        .filter((entry) => entry.usd !== null);
}

function parse({ endpoint, data }) {
    if (endpoint !== "stablecoins") return [];
    const list = data && Array.isArray(data.peggedAssets) ? data.peggedAssets : [];

    return list
        .map((asset) => ({
            key: typeof asset.symbol === "string" && asset.symbol.trim() !== "" ? asset.symbol : null,
            name: asset.name || null,
            pegType: asset.pegType || null,
            pegMechanism: asset.pegMechanism || null,
            circulatingUsd: peggedOf(asset.circulating),
            prevDayUsd: peggedOf(asset.circulatingPrevDay),
            prevWeekUsd: peggedOf(asset.circulatingPrevWeek),
            prevMonthUsd: peggedOf(asset.circulatingPrevMonth),
            chainCount: Array.isArray(asset.chains) ? asset.chains.length : null,
            chains: chainsOf(asset.chainCirculating)
        }))
        .filter((row) => row.key !== null);
}

module.exports = { id: ID, kind: "json", endpoints, buildUrl, parse, peggedOf, chainsOf };
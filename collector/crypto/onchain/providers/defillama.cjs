/* ============================================================
 * File: collector/crypto/onchain/providers/defillama.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   DefiLlama's CEX transparency endpoint — the exchange reserves source.
 *   Exchanges publish proof-of-reserves wallets; DefiLlama aggregates them
 *   into one series per exchange, and those *inflows_24h|1w|1m* numbers are
 *   the closest thing to a measured exchange flow that exists without a
 *   paid account.
 *
 *   Verified live (2026-09): 88 exchanges, http 200, fields currentTvl,
 *   cleanAssetsTvl, inflows_24h, inflows_1w, inflows_1m, spotVolume, oi,
 *   derivVolume, leverage, walletsLink.
 *
 *   Rows are keyed by the exchange *name* because that is the provider's own
 *   noun; the subsystem decides which name is one of our holders. A row with
 *   no name is dropped rather than matched to something arbitrary.
 * ============================================================ */

const { numberOrNull } = require("../core/reading.cjs");

const ID = "defillama";

const endpoints = Object.freeze({ cexs: Object.freeze({ path: "/cexs" }) });

function buildUrl({ endpoint, config }) {
    if (endpoint !== "cexs") return null;
    return `${config.baseUrl}${endpoints.cexs.path}`;
}

function parse({ endpoint, data }) {
    if (endpoint !== "cexs") return [];
    const list = data && Array.isArray(data.cexs) ? data.cexs : [];

    return list
        .map((cex) => ({
            key: typeof cex.name === "string" && cex.name.trim() !== "" ? cex.name : null,
            slug: cex.slug || null,
            coin: cex.coin || null,
            reservesUsd: numberOrNull(cex.currentTvl),
            cleanAssetsUsd: numberOrNull(cex.cleanAssetsTvl),
            netFlow24hUsd: numberOrNull(cex.inflows_24h),
            netFlow1wUsd: numberOrNull(cex.inflows_1w),
            netFlow1mUsd: numberOrNull(cex.inflows_1m),
            spotVolumeUsd: numberOrNull(cex.spotVolume),
            openInterestUsd: numberOrNull(cex.oi),
            derivVolumeUsd: numberOrNull(cex.derivVolume),
            leverage: numberOrNull(cex.leverage),
            walletsLink: typeof cex.walletsLink === "string" ? cex.walletsLink : null
        }))
        .filter((row) => row.key !== null);
}

module.exports = { id: ID, kind: "json", endpoints, buildUrl, parse };
/* ============================================================
 * File: collector/crypto/onchain/providers/yields.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   DefiLlama's yields endpoint — where stablecoin supply is being *paid*
 *   to sit. A supply reading says money arrived; a lending rate says where
 *   it went and what it costs to borrow.
 *
 *   Verified live (2026-09): 17,153 pools, 11.8 MB, http 200, of which
 *   2,986 carry `stablecoin: true`. Only those rows are kept: a capsule
 *   about stablecoin plumbing has nothing to say about a memecoin farm, and
 *   dropping 14k rows before they reach the subsystem is what keeps an
 *   11.8 MB answer from becoming a 200 MB heap.
 *
 *   `apyBase` (the pool's own rate) and `apy` (including rewards) are kept
 *   apart, because "what the protocol pays" and "what the token subsidy
 *   pays" are different facts.
 * ============================================================ */

const { numberOrNull } = require("../core/reading.cjs");

const ID = "defillama-yields";

const endpoints = Object.freeze({ pools: Object.freeze({ path: "/pools" }) });

function buildUrl({ endpoint, config }) {
    if (endpoint !== "pools") return null;
    return `${config.baseUrl}${endpoints.pools.path}`;
}

function parse({ endpoint, data }) {
    if (endpoint !== "pools") return [];
    const list = data && Array.isArray(data.data) ? data.data : [];

    return list
        .filter((pool) => pool && pool.stablecoin === true)
        .map((pool) => ({
            key: typeof pool.symbol === "string" && pool.symbol.trim() !== "" ? pool.symbol : null,
            pool: pool.pool || null,
            project: pool.project || null,
            chain: pool.chain || null,
            apyBase: numberOrNull(pool.apyBase),
            apyReward: numberOrNull(pool.apyReward),
            apy: numberOrNull(pool.apy),
            tvlUsd: numberOrNull(pool.tvlUsd),
            exposure: pool.exposure || null,
            ilRisk: pool.ilRisk || null,
            apyPct7D: numberOrNull(pool.apyPct7D),
            apyMean30d: numberOrNull(pool.apyMean30d),
            volumeUsd7d: numberOrNull(pool.volumeUsd7d)
        }))
        .filter((row) => row.key !== null && row.pool !== null);
}

module.exports = { id: ID, kind: "json", endpoints, buildUrl, parse };
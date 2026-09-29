/* ============================================================
 * File: collector/crypto/onchain/subsystems/lending_rates.cjs
 * Section: collector/crypto/onchain/subsystems
 * Version: 1.0.0
 *
 * Role:
 *   Where the dollars go once they exist. A stablecoin supply reading says
 *   money arrived; a lending rate says what it costs to borrow it, and the
 *   distance between the two is the price of leverage in the system.
 *
 *     defillama-yields/pools   ~17k pools, of which ~3k are stablecoin pools
 *
 *   The provider answers 11.8 MB every call, so this capsule is deliberately
 *   the slowest in the module (a four-hour schedule): a lending rate is not a
 *   tick, and asking often would be the only thing the collector does.
 *
 *   Four rules keep the aggregation honest:
 *
 *     1. apyBase and apy stay apart. "What the protocol pays" and "what a
 *        token subsidy pays" are different facts, and a farm's 40% reward APY
 *        must not be quoted as an interest rate.
 *     2. A median and a TVL-weighted mean are both published. The median says
 *        what a typical pool pays; the weighted mean says what the market
 *        actually pays per dollar. They disagree exactly when a whale pool
 *        sits far from the crowd — which is the interesting case.
 *     3. A pool with no TVL is skipped by the weighted mean, not counted as
 *        zero, and a subject with no pool at all yields no reading.
 *     4. Every reading carries how many pools and projects were pooled, so
 *        "USDT pays 4.8%" can never be read as a market-wide claim.
 * ============================================================ */

const {
    numberOrNull,
    shareOf,
    sumOf,
    topEntries,
    createReading
} = require("../core/reading.cjs");
const { matchKey, medianOf, weightedMeanOf } = require("./aggregate.cjs");

const ID = "lending_rates";
const TITLE = "Stablecoin lending: what the dollars are paid";

/** The reading types this capsule may emit. */
const EVENT_TYPES = Object.freeze(["lending_rate"]);

/** How often the pool list is asked for (the provider's own cadence is 4h). */
const DEFAULT_SCHEDULES = Object.freeze({ pools: 14_400_000 });

/** How many projects of the per-project split are published per reading. */
const DEFAULT_TOP_PROJECTS = 3;

/**
 * @param {object} [options]
 * @param {object} [options.schedules]   per-endpoint scheduleMs overrides
 * @param {number} [options.topProjects] projects published per reading
 */
function createLendingRates({ schedules = {}, topProjects = DEFAULT_TOP_PROJECTS } = {}) {
    const schedule = { ...DEFAULT_SCHEDULES, ...schedules };

    /** The shape of the last answer, published by state() for the status page. */
    let last = null;

    function tasks() {
        return [
            {
                taskId: "defillama-yields/pools",
                providerId: "defillama-yields",
                endpoint: "pools",
                scheduleMs: schedule.pools,
                note: "stablecoin lending pools: apy, apyBase, apyReward, tvlUsd"
            }
        ];
    }

    /**
     * One reading per stablecoin that has at least one pool in the answer.
     * A stablecoin with no pool is a stablecoin our source does not lend:
     * nothing is emitted for it rather than a reading full of nulls.
     */
    function collect({ task, rows, catalog, at = Date.now(), receivedAt = null } = {}) {
        const list = Array.isArray(rows) ? rows : [];
        if (!task || !catalog || task.endpoint !== "pools") return [];

        /** subjectId → the pools whose symbol is exactly that stablecoin. */
        const bySubject = new Map();
        for (const subject of catalog.ofGroup("stablecoins")) bySubject.set(subject.id, []);
        for (const row of list) {
            const pools = bySubject.get(matchKey(row.key));
            if (pools) pools.push(row);
        }

        const universeTvlUsd = sumOf(list, (row) => row.tvlUsd);
        const matched = [...bySubject.entries()].filter(([, pools]) => pools.length > 0);
        const matchedTvlUsd = sumOf(matched.flatMap(([, pools]) => pools), (row) => row.tvlUsd);
        const pooled = sumOf(matched, ([, pools]) => pools.length);

        const readings = [];
        for (const [subjectId, pools] of matched) {
            const subject = catalog.get(subjectId);
            const projects = new Map();
            for (const pool of pools) {
                const project = typeof pool.project === "string" && pool.project !== "" ? pool.project : "unknown";
                projects.set(project, (numberOrNull(projects.get(project)) || 0) + (numberOrNull(pool.tvlUsd) || 0));
            }
            const chains = new Set(pools.map((pool) => pool.chain).filter((chain) => typeof chain === "string" && chain !== ""));
            const tvlUsd = sumOf(pools, (pool) => pool.tvlUsd);
            const rewarded = pools.filter((pool) => numberOrNull(pool.apyReward) !== null && pool.apyReward > 0);
            const ranked = [...pools].sort((a, b) => (numberOrNull(b.apy) === null ? -Infinity : b.apy) - (numberOrNull(a.apy) === null ? -Infinity : a.apy));
            const biggest = [...pools].sort((a, b) => (numberOrNull(b.tvlUsd) === null ? -Infinity : b.tvlUsd) - (numberOrNull(a.tvlUsd) === null ? -Infinity : a.tvlUsd));
            const top = topEntries(Object.fromEntries(projects), { count: topProjects })
                .map((entry) => Object.freeze({ project: entry.name, tvlUsd: entry.value, share: entry.share }));

            readings.push(createReading({
                subject,
                eventType: "lending_rate",
                exchange: subject.issuer || null,
                provider: "defillama-yields",
                data: {
                    /* The two averages that disagree when a whale pool is odd. */
                    apyMedian: medianOf(pools.map((pool) => pool.apy)),
                    apyWeightedByTvl: weightedMeanOf(pools, (pool) => pool.apy, (pool) => pool.tvlUsd),
                    apyBaseMedian: medianOf(pools.map((pool) => pool.apyBase)),
                    apyBaseWeightedByTvl: weightedMeanOf(pools, (pool) => pool.apyBase, (pool) => pool.tvlUsd),
                    apyRewardMedian: medianOf(pools.map((pool) => pool.apyReward)),
                    apyMedian30d: medianOf(pools.map((pool) => pool.apyMean30d)),
                    /* Where the rate is: the deepest pool, and the highest one. */
                    bestApyPool: ranked.length
                        ? Object.freeze({ pool: ranked[0].pool, project: ranked[0].project, chain: ranked[0].chain, apy: ranked[0].apy, apyBase: ranked[0].apyBase, tvlUsd: ranked[0].tvlUsd })
                        : null,
                    largestPool: biggest.length
                        ? Object.freeze({ pool: biggest[0].pool, project: biggest[0].project, chain: biggest[0].chain, tvlUsd: biggest[0].tvlUsd, apy: biggest[0].apy })
                        : null,
                    topProjects: Object.freeze(top),
                    /* How much of the pool list is behind this number. */
                    poolCount: pools.length,
                    projectCount: projects.size,
                    chainCount: chains.size,
                    poolsWithReward: rewarded.length,
                    rewardTvlUsd: sumOf(rewarded, (pool) => pool.tvlUsd),
                    tvlUsd,
                    volumeUsd7d: sumOf(pools, (pool) => pool.volumeUsd7d),
                    shareOfMatchedTvl: shareOf(tvlUsd, matchedTvlUsd),
                    shareOfUniverseTvl: shareOf(tvlUsd, universeTvlUsd),
                    scope: "stablecoin-lending-pools"
                },
                timestamp: at,
                receivedAt
            }));
        }

        last = Object.freeze({
            at,
            poolsSeen: list.length,
            poolsMatched: pooled,
            subjectsMatched: matched.length,
            subjectsInCatalog: bySubject.size,
            matchedTvlUsd,
            universeTvlUsd,
            /* Pools, not dollars: the two denominators are different things
             * and are named for what they count. */
            shareOfPoolsMatched: shareOf(pooled, list.length)
        });

        return readings;
    }

    function state() {
        return Object.freeze({ remembered: 0, last: last || null });
    }

    /* Nothing is remembered between polls: the answer carries its own truth. */
    function reset() {
        last = null;
        return true;
    }

    return { id: ID, title: TITLE, eventTypes: EVENT_TYPES, tasks, collect, followUps: () => [], state, reset };
}

module.exports = {
    ID,
    TITLE,
    EVENT_TYPES,
    DEFAULT_SCHEDULES,
    DEFAULT_TOP_PROJECTS,
    createLendingRates
};

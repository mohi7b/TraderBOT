/* ============================================================
 * File: collector/crypto/onchain/subsystems/stablecoin_flow.cjs
 * Section: collector/crypto/onchain/subsystems
 * Version: 1.0.0
 *
 * Role:
 *   The plumbing capsule: how many dollars are sitting on-chain, and where.
 *   A stablecoin supply is the closest thing crypto has to a money-supply
 *   number — dollars that can only leave by being redeemed — so the question
 *   "is risk being added or withdrawn" is answered here rather than in a
 *   price.
 *
 *     defillama-stablecoins/stablecoins   one answer, 427 pegged assets
 *
 *   The upstream answer is unusually generous: each asset carries its supply
 *   today, yesterday, a week ago and a month ago, plus a per-chain split with
 *   its own day and week deltas. That is why this capsule can report a *flow*
 *   without remembering anything — and why it still keeps one number per
 *   subject: the supply of the previous poll, which guards against reading a
 *   stale upstream copy as a change.
 *
 *   Four numbers travel with every reading so that no single one can be
 *   mistaken for the whole:
 *
 *     circulatingUsd          this asset
 *     trackedSupplyUsd        the eight assets this module follows
 *     listedSupplyUsd         all 427 assets the answer contained
 *     shareOfTrackedSupply    this asset's weight inside what we follow
 *
 *   A stablecoin whose symbol is not in the answer produces no reading at
 *   all, and the count of assets that were actually listed is published so
 *   "absent" can never be confused with "zero".
 * ============================================================ */

const {
    numberOrNull,
    deltaOf,
    shareOf,
    sumOf,
    topEntries,
    createReading
} = require("../core/reading.cjs");
const { matchKey } = require("./aggregate.cjs");

const ID = "stablecoin_flow";
const TITLE = "Stablecoin supply: the dollars that sit on-chain";

/** The reading types this capsule may emit. */
const EVENT_TYPES = Object.freeze(["stablecoin_supply"]);

/** How often the pegged-asset list is asked for. */
const DEFAULT_SCHEDULES = Object.freeze({ stablecoins: 900_000 });

/** How many chains of the per-chain split are published with a reading. */
const DEFAULT_TOP_CHAINS = 3;

/**
 * @param {object} [options]
 * @param {object} [options.schedules]  per-endpoint scheduleMs overrides
 * @param {number} [options.topChains]  chains published per reading
 */
function createStablecoinFlow({ schedules = {}, topChains = DEFAULT_TOP_CHAINS } = {}) {
    const schedule = { ...DEFAULT_SCHEDULES, ...schedules };

    /** subjectId → {usd, at}: the supply the previous poll saw. */
    const lastSupply = new Map();

    function tasks() {
        return [
            {
                taskId: "defillama-stablecoins/stablecoins",
                providerId: "defillama-stablecoins",
                endpoint: "stablecoins",
                scheduleMs: schedule.stablecoins,
                note: "pegged assets: supply + 1d/1w/1m deltas + per-chain split"
            }
        ];
    }

    /** Rows of one answer → readings; an odd payload yields nothing, never a throw. */
    function collect({ task, rows, catalog, at = Date.now(), receivedAt = null } = {}) {
        const list = Array.isArray(rows) ? rows : [];
        if (!task || !catalog || task.endpoint !== "stablecoins") return [];

        const byKey = new Map();
        for (const row of list) {
            const key = matchKey(row.key);
            if (key !== "" && !byKey.has(key)) byKey.set(key, row);
        }

        const tracked = catalog.ofGroup("stablecoins")
            .map((subject) => ({ subject, row: byKey.get(subject.id) || null }))
            .filter((entry) => entry.row !== null);
        const trackedSupplyUsd = sumOf(tracked, (entry) => entry.row.circulatingUsd);
        const listedSupplyUsd = sumOf(list, (row) => row.circulatingUsd);

        return tracked.map(({ subject, row }) => {
            const previous = lastSupply.get(subject.id) || null;
            const pollChange = previous ? deltaOf(row.circulatingUsd, previous.usd) : Object.freeze({ delta: null, pct: null });
            const day = deltaOf(row.circulatingUsd, row.prevDayUsd);
            const week = deltaOf(row.circulatingUsd, row.prevWeekUsd);
            const month = deltaOf(row.circulatingUsd, row.prevMonthUsd);

            const chains = Array.isArray(row.chains) ? row.chains : [];
            const top = topEntries(Object.fromEntries(chains.map((entry) => [entry.chain, entry.usd])), { count: topChains })
                .map((entry) => Object.freeze({ chain: entry.name, usd: entry.value, share: entry.share }));

            const reading = createReading({
                subject,
                eventType: "stablecoin_supply",
                exchange: subject.issuer || null,
                provider: "defillama-stablecoins",
                data: {
                    circulatingUsd: row.circulatingUsd,
                    prevDayUsd: row.prevDayUsd,
                    prevWeekUsd: row.prevWeekUsd,
                    prevMonthUsd: row.prevMonthUsd,
                    /* The flow, from the provider's own four points. */
                    dayDeltaUsd: day.delta,
                    dayDeltaPct: day.pct,
                    weekDeltaUsd: week.delta,
                    weekDeltaPct: week.pct,
                    monthDeltaUsd: month.delta,
                    monthDeltaPct: month.pct,
                    /* Our own memory, so a frozen upstream copy shows up as a
                     * zero poll delta instead of passing as a fresh move. */
                    previousSupplyUsd: previous ? previous.usd : null,
                    previousAt: previous ? previous.at : null,
                    pollDeltaUsd: pollChange.delta,
                    pollDeltaPct: pollChange.pct,
                    pegType: row.pegType || null,
                    pegMechanism: row.pegMechanism || null,
                    chainCount: numberOrNull(row.chainCount),
                    chainsReported: chains.length,
                    presentChainsUsd: sumOf(chains, (entry) => entry.usd),
                    topChains: Object.freeze(top),
                    largestChain: top.length ? top[0].chain : null,
                    largestChainShare: top.length ? top[0].share : null,
                    /* Four denominators, so no number has to stand for the
                     * whole market on its own. */
                    shareOfTrackedSupply: shareOf(row.circulatingUsd, trackedSupplyUsd),
                    trackedStablecoins: tracked.length,
                    listedAssets: list.length,
                    trackedSupplyUsd,
                    listedSupplyUsd,
                    scope: "stablecoin-supply"
                },
                timestamp: at,
                receivedAt
            });

            lastSupply.set(subject.id, { usd: row.circulatingUsd, at });
            return reading;
        });
    }

    function state() {
        const remembered = [...lastSupply.entries()].map(([subjectId, entry]) => Object.freeze({ subjectId, ...entry }));
        return Object.freeze({ remembered: remembered.length, supplies: Object.freeze(remembered.slice(-10)) });
    }

    function reset() {
        const cleared = lastSupply.size;
        lastSupply.clear();
        return cleared;
    }

    /* A supply list is one answer for the whole group: nothing to follow up. */
    return { id: ID, title: TITLE, eventTypes: EVENT_TYPES, tasks, collect, followUps: () => [], state, reset };
}

module.exports = {
    ID,
    TITLE,
    EVENT_TYPES,
    DEFAULT_SCHEDULES,
    DEFAULT_TOP_CHAINS,
    createStablecoinFlow
};

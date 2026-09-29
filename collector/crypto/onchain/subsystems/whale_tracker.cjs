/* ============================================================
 * File: collector/crypto/onchain/subsystems/whale_tracker.cjs
 * Section: collector/crypto/onchain/subsystems
 * Version: 1.0.0
 *
 * Role:
 *   The first capsule of the on-chain collector: who is holding, who is
 *   moving, and what the network itself is doing.
 *
 *     defillama/cexs                 exchange reserves + net flows (12 holders)
 *     mempool/mempool                queue depth, fee floor and ceiling
 *     mempool/blocks                 the last 15 blocks, plus a whale scan of
 *                                    every block that has not been scanned yet
 *     mempool/block-transactions     that scan — an on-demand task the block
 *                                    task discovers for itself (scheduleMs 0)
 *     blockchain-info/supply         BTC in circulation, yesterday vs today
 *     blockchain-info/tx-volume-usd  value moved on-chain per day
 *
 *   Three honesty rules are built into the numbers:
 *
 *     1. mempool.space's /txs endpoint answers with a *sample* (25 of a
 *        block's ~4,000 transfers). The reading therefore reports
 *        sampledTransactions next to blockTransactions and never turns a
 *        sample into "the block contained N whales".
 *     2. No key-free source here labels an address as exchange-owned, so a
 *        transfer carries no direction: evidence.direction is false instead
 *        of a guessed in/out.
 *     3. A holder whose reserves are not in the answer produces no reading,
 *        and every reading of that answer says how many holders were tracked
 *        out of how many were listed.
 *
 *   Memory across polls is deliberate and small: the last reserves of each
 *   holder (so a delta exists without a historical endpoint) and which block
 *   hashes were already scanned (so a block is published exactly once).
 * ============================================================ */

const {
    numberOrNull,
    deltaOf,
    shareOf,
    round,
    satsToBtc,
    sumOf,
    createReading
} = require("../core/reading.cjs");
const { matchKey, medianOf } = require("./aggregate.cjs");

const ID = "whale_tracker";
const TITLE = "Whales, exchange reserves and the Bitcoin network";

/** The reading types this capsule may emit. */
const EVENT_TYPES = Object.freeze(["exchange_reserves", "whale_transfer", "network_metrics"]);

/** One bitcoin: the smallest transfer worth calling a whale transfer. */
const DEFAULT_WHALE_THRESHOLD_BTC = 1;
const SATS_PER_BTC = 100_000_000;

/** How often each question is asked. `block-transactions` is on demand. */
const DEFAULT_SCHEDULES = Object.freeze({
    cexs: 600_000,
    mempool: 60_000,
    blocks: 60_000,
    supply: 900_000,
    "tx-volume-usd": 900_000
});

/** Block facts are kept for the whale scan of that block; the map is bounded. */
const MAX_KNOWN_BLOCKS = 128;
/** A block is scanned once; an unreachable block is retried this many times. */
const DEFAULT_MAX_SCAN_ATTEMPTS = 3;

/*
 * matchKey and medianOf live in ./aggregate.cjs — the same matching rule is
 * used by the stablecoin and lending capsules, and one rule has one home.
 */

/**
 * @param {object} [options]
 * @param {number} [options.whaleThresholdBtc] smallest transfer worth reporting
 * @param {number} [options.followUpBlocks]    unseen blocks one poll may scan
 * @param {number} [options.maxScanAttempts]   attempts before an unreadable block is dropped
 * @param {object} [options.schedules]         per-endpoint scheduleMs overrides
 */
function createWhaleTracker({
    whaleThresholdBtc = DEFAULT_WHALE_THRESHOLD_BTC,
    followUpBlocks = 1,
    maxScanAttempts = DEFAULT_MAX_SCAN_ATTEMPTS,
    schedules = {}
} = {}) {
    if (!(whaleThresholdBtc > 0)) throw new RangeError("whaleThresholdBtc must be positive");
    const schedule = { ...DEFAULT_SCHEDULES, ...schedules };
    const thresholdSats = Math.round(whaleThresholdBtc * SATS_PER_BTC);

    /** holderId → {usd, at}: the reserves the previous poll measured. */
    const lastReserves = new Map();
    /** blockHash → {height, txCount, blockTime}: what the block list told us. */
    const blocks = new Map();
    /** blockHash → {at, sampled, whales, whaleValueBtc}: scans already published. */
    const inspected = new Map();
    /** blockHash → attempts: a block that cannot be read is not retried forever. */
    const attempts = new Map();

    function rememberBlock(row) {
        if (!row || typeof row.blockId !== "string" || row.blockId === "") return;
        blocks.set(row.blockId, {
            height: numberOrNull(row.blockHeight),
            txCount: numberOrNull(row.txCount),
            blockTime: numberOrNull(row.blockTime)
        });
        /* The provider's block list is a rolling window; keep memory bounded. */
        while (blocks.size > MAX_KNOWN_BLOCKS) blocks.delete(blocks.keys().next().value);
    }

    /** What this capsule asks for, and how often. */
    function tasks() {
        return [
            { taskId: "defillama/cexs", providerId: "defillama", endpoint: "cexs", scheduleMs: schedule.cexs, note: "exchange reserves + net flows (one answer, 88 exchanges)" },
            { taskId: "mempool/mempool", providerId: "mempool", endpoint: "mempool", scheduleMs: schedule.mempool, note: "queue depth + fee floor/ceiling" },
            { taskId: "mempool/blocks", providerId: "mempool", endpoint: "blocks", scheduleMs: schedule.blocks, note: "recent blocks; each unseen one becomes an on-demand scan" },
            { taskId: "blockchain-info/supply", providerId: "blockchain-info", endpoint: "supply", scheduleMs: schedule.supply, note: "BTC in circulation (daily series)" },
            { taskId: "blockchain-info/tx-volume-usd", providerId: "blockchain-info", endpoint: "tx-volume-usd", scheduleMs: schedule["tx-volume-usd"], note: "value moved on-chain per day" }
        ];
    }

    /** Rows of one answer → readings. Never throws on an odd payload. */
    function collect({ task, rows, catalog, at = Date.now(), receivedAt = null } = {}) {
        const list = Array.isArray(rows) ? rows : [];
        if (!task || !catalog) return [];

        if (task.endpoint === "cexs") return collectReserves(list, catalog, at, receivedAt);
        if (task.endpoint === "mempool") return collectMempool(list, catalog, at, receivedAt);
        if (task.endpoint === "blocks") return collectBlocks(list, catalog, at, receivedAt);
        if (task.endpoint === "block-transactions") return collectTransfers(task, list, catalog, at, receivedAt);
        if (task.endpoint === "supply") return collectSupply(list, catalog, at, receivedAt);
        if (task.endpoint === "tx-volume-usd") return collectTxVolume(list, catalog, at, receivedAt);
        return [];
    }

    /* ----------------------------------------------------------
     * exchange_reserves — one reading per tracked holder
     * -------------------------------------------------------- */
    function collectReserves(rows, catalog, at, receivedAt) {
        const byKey = new Map();
        for (const row of rows) {
            const key = matchKey(row.key);
            if (key !== "" && !byKey.has(key)) byKey.set(key, row);
        }

        const tracked = catalog.ofGroup("holders")
            .map((holder) => ({ holder, row: byKey.get(holder.id) || null }))
            .filter((entry) => entry.row !== null);
        const trackedReservesUsd = sumOf(tracked, (entry) => entry.row.reservesUsd);
        const listedReservesUsd = sumOf(rows, (row) => row.reservesUsd);

        return tracked.map(({ holder, row }) => {
            const previous = lastReserves.get(holder.id) || null;
            const change = previous ? deltaOf(row.reservesUsd, previous.usd) : Object.freeze({ delta: null, pct: null });

            const reading = createReading({
                subject: holder,
                eventType: "exchange_reserves",
                exchange: holder.id.toLowerCase(),
                provider: "defillama",
                data: {
                    reservesUsd: row.reservesUsd,
                    cleanAssetsUsd: row.cleanAssetsUsd,
                    netFlow24hUsd: row.netFlow24hUsd,
                    netFlow1wUsd: row.netFlow1wUsd,
                    netFlow1mUsd: row.netFlow1mUsd,
                    spotVolumeUsd: row.spotVolumeUsd,
                    openInterestUsd: row.openInterestUsd,
                    derivVolumeUsd: row.derivVolumeUsd,
                    leverage: row.leverage,
                    /* Our own delta: the answer has upstream net flows but no
                     * "reserves one poll ago", and both are worth having. */
                    previousReservesUsd: previous ? previous.usd : null,
                    previousAt: previous ? previous.at : null,
                    pollDeltaUsd: change.delta,
                    pollDeltaPct: change.pct,
                    /* The same aggregates travel with every row, so "12
                     * tracked of 88 listed" is part of the report itself. */
                    trackedHolders: tracked.length,
                    listedHolders: rows.length,
                    trackedReservesUsd,
                    listedReservesUsd,
                    walletsLink: typeof row.walletsLink === "string" ? row.walletsLink : null,
                    scope: "holder-reserves"
                },
                timestamp: at,
                receivedAt
            });

            lastReserves.set(holder.id, { usd: row.reservesUsd, at });
            return reading;
        });
    }

    /* ----------------------------------------------------------
     * network_metrics — the mempool state and the chain's own numbers
     * -------------------------------------------------------- */
    function collectMempool(rows, catalog, at, receivedAt) {
        const chain = catalog.find("BTC");
        const row = rows[0] || null;
        if (!chain || !row) return [];

        const floor = numberOrNull(row.feeFloorSatsPerVb);
        const ceiling = numberOrNull(row.feeCeilingSatsPerVb);

        return [createReading({
            subject: chain,
            eventType: "network_metrics",
            exchange: chain.network || "bitcoin",
            provider: "mempool",
            data: {
                metric: "mempool",
                mempoolTx: row.mempoolTx,
                mempoolVsize: row.mempoolVsize,
                mempoolTotalFeeSats: row.mempoolTotalFeeSats,
                mempoolTotalFeeBtc: satsToBtc(row.mempoolTotalFeeSats),
                feeFloorSatsPerVb: floor,
                feeCeilingSatsPerVb: ceiling,
                feeSpreadSatsPerVb: floor === null || ceiling === null ? null : round(ceiling - floor, 6),
                scope: "mempool-state"
            },
            timestamp: at,
            receivedAt
        })];
    }

    function collectBlocks(rows, catalog, at, receivedAt) {
        const chain = catalog.find("BTC");
        if (!chain) return [];

        const usable = rows.filter((row) => numberOrNull(row.blockHeight) !== null);
        if (usable.length === 0) return [];

        /* mempool.space answers newest first; the tip is the highest height. */
        const latest = usable.reduce((best, row) => (numberOrNull(row.blockHeight) > numberOrNull(best.blockHeight) ? row : best));
        for (const row of usable) rememberBlock(row);

        const heights = usable.map((row) => numberOrNull(row.blockHeight));
        const newest = Math.max(...heights);
        const oldest = Math.min(...heights);
        const txCounts = usable.map((row) => numberOrNull(row.txCount));
        const counted = txCounts.filter((count) => count !== null);

        return [createReading({
            subject: chain,
            eventType: "network_metrics",
            exchange: chain.network || "bitcoin",
            provider: "mempool",
            data: {
                metric: "blocks",
                blockHeight: numberOrNull(latest.blockHeight),
                blockId: latest.blockId || null,
                blockTime: numberOrNull(latest.blockTime),
                txCount: numberOrNull(latest.txCount),
                sizeBytes: numberOrNull(latest.sizeBytes),
                weightUnits: numberOrNull(latest.weightUnits),
                medianFeeSatsPerVb: numberOrNull(latest.medianFeeSatsPerVb),
                rewardSats: numberOrNull(latest.rewardSats),
                rewardBtc: satsToBtc(latest.rewardSats),
                blocksSampled: usable.length,
                spanBlocks: newest - oldest + 1,
                staleBlocks: usable.filter((row) => row.stale === true).length,
                medianFeeAcrossBlocks: medianOf(usable.map((row) => row.medianFeeSatsPerVb)),
                averageTxPerBlock: counted.length === 0 ? null : round(counted.reduce((sum, count) => sum + count, 0) / counted.length, 2),
                scope: "recent-blocks"
            },
            timestamp: numberOrNull(latest.blockTime) === null ? at : numberOrNull(latest.blockTime),
            receivedAt
        })];
    }

    /* ----------------------------------------------------------
     * whale_transfer — the sample inside one block, said honestly
     * -------------------------------------------------------- */
    function collectTransfers(task, rows, catalog, at, receivedAt) {
        const chain = catalog.find("BTC");
        const hash = task && task.params && typeof task.params.blockHash === "string" ? task.params.blockHash : null;
        if (!chain || hash === null) return [];
        /* A block's transfers do not change, so publishing one twice would
         * count a transfer that happened once as two. */
        if (inspected.has(hash)) return [];

        attempts.set(hash, (attempts.get(hash) || 0) + 1);

        const known = blocks.get(hash) || null;
        const whales = rows
            .filter((row) => numberOrNull(row.valueSats) !== null && numberOrNull(row.valueSats) >= thresholdSats)
            .sort((a, b) => b.valueSats - a.valueSats);
        const sampled = rows.length;
        const sampledValueSats = sumOf(rows, (row) => row.valueSats);
        const whaleValueSats = sumOf(whales, (row) => row.valueSats);
        const blockTransactions = known ? numberOrNull(known.txCount) : null;
        const coverage = shareOf(sampled, blockTransactions);
        const largest = whales.length ? whales[0] : null;

        const reading = createReading({
            subject: chain,
            eventType: "whale_transfer",
            exchange: chain.network || "bitcoin",
            provider: "mempool",
            data: {
                blockHash: hash,
                blockHeight: known ? numberOrNull(known.height) : null,
                blockTime: known ? numberOrNull(known.blockTime) : null,
                /* The endpoint answers with a sample: both numbers are explicit,
                 * so the sample can never be read as the whole block. */
                sampledTransactions: sampled,
                blockTransactions,
                coverage,
                thresholdBtc: whaleThresholdBtc,
                thresholdSats,
                whaleCount: whales.length,
                whaleValueSats,
                whaleValueBtc: satsToBtc(whaleValueSats),
                sampledValueBtc: satsToBtc(sampledValueSats),
                /* Share of the *sampled* value — never of the whole block. */
                whaleValueShare: shareOf(whaleValueSats, sampledValueSats),
                largestBtc: largest ? largest.valueBtc : null,
                largestTxid: largest ? largest.txid : null,
                largestFeeSats: largest ? largest.feeSats : null,
                averageWhaleBtc: whaleValueSats === null || whales.length === 0 ? null : satsToBtc(whaleValueSats / whales.length),
                /* No key-free source labels an exchange address, so a transfer
                 * carries no side: the flag says so rather than guessing. */
                evidence: Object.freeze({ direction: false, blockComplete: coverage !== null && coverage >= 1 }),
                scope: "sampled-block-transactions"
            },
            timestamp: known && numberOrNull(known.blockTime) !== null ? numberOrNull(known.blockTime) : at,
            receivedAt
        });

        inspected.set(hash, {
            at,
            sampled,
            whales: whales.length,
            whaleValueBtc: satsToBtc(whaleValueSats),
            height: known ? numberOrNull(known.height) : null
        });
        return [reading];
    }

    /* ----------------------------------------------------------
     * The chain's own daily series: supply and value moved
     * -------------------------------------------------------- */
    function collectSupply(rows, catalog, at, receivedAt) {
        const chain = catalog.find("BTC");
        const row = rows[0] || null;
        if (!chain || !row) return [];

        const change = deltaOf(row.supplyBtc, row.prevSupplyBtc);

        return [createReading({
            subject: chain,
            eventType: "network_metrics",
            exchange: chain.network || "bitcoin",
            provider: "blockchain-info",
            data: {
                metric: "supply",
                supplyBtc: row.supplyBtc,
                prevSupplyBtc: row.prevSupplyBtc,
                supplyDeltaBtc: change.delta,
                supplyDeltaPct: change.pct,
                seriesAt: numberOrNull(row.at),
                prevSeriesAt: numberOrNull(row.prevAt),
                /* What goes in must come out: the daily issuance is the
                 * supply series' own delta, not a separate endpoint. */
                dailyIssuanceBtc: change.delta,
                issuancePerHourBtc: change.delta !== null && Number.isFinite(row.at) && Number.isFinite(row.prevAt) && row.at > row.prevAt
                    ? round(change.delta / ((row.at - row.prevAt) / 3_600_000), 6)
                    : null,
                scope: "chain-supply-daily"
            },
            timestamp: numberOrNull(row.at) === null ? at : numberOrNull(row.at),
            receivedAt
        })];
    }

    function collectTxVolume(rows, catalog, at, receivedAt) {
        const chain = catalog.find("BTC");
        const row = rows[0] || null;
        if (!chain || !row) return [];

        const change = deltaOf(row.txVolumeUsd, row.prevTxVolumeUsd);

        return [createReading({
            subject: chain,
            eventType: "network_metrics",
            exchange: chain.network || "bitcoin",
            provider: "blockchain-info",
            data: {
                metric: "tx-volume-usd",
                txVolumeUsd: row.txVolumeUsd,
                prevTxVolumeUsd: row.prevTxVolumeUsd,
                txVolumeDeltaUsd: change.delta,
                txVolumeDeltaPct: change.pct,
                seriesAt: numberOrNull(row.at),
                prevSeriesAt: numberOrNull(row.prevAt),
                scope: "chain-tx-volume-usd-daily"
            },
            timestamp: numberOrNull(row.at) === null ? at : numberOrNull(row.at),
            receivedAt
        })];
    }

    /**
     * The block list discovers work that was not in the plan: the transfers
     * inside every block this capsule has not looked at yet. One block per
     * poll keeps the on-demand queue short and the rate limits happy.
     */
    function followUps({ task, rows } = {}) {
        if (!task || task.endpoint !== "blocks") return [];
        const list = Array.isArray(rows) ? rows : [];
        const out = [];

        for (const row of list) {
            const hash = typeof row.blockId === "string" && row.blockId !== "" ? row.blockId : null;
            if (hash === null || inspected.has(hash)) continue;
            if ((attempts.get(hash) || 0) >= maxScanAttempts) continue;

            out.push({
                taskId: `mempool/block-transactions/${hash}`,
                providerId: "mempool",
                endpoint: "block-transactions",
                params: { blockHash: hash },
                scheduleMs: 0,
                onDemand: true,
                note: `whale scan of block ${hash.slice(0, 12)}…`
            });
            if (out.length >= followUpBlocks) break;
        }
        return out;
    }

    function state() {
        return Object.freeze({
            thresholdBtc: whaleThresholdBtc,
            holdersRemembered: lastReserves.size,
            knownBlocks: blocks.size,
            scannedBlocks: inspected.size,
            pendingBlockScans: [...blocks.keys()].filter((hash) => !inspected.has(hash) && (attempts.get(hash) || 0) < maxScanAttempts).length,
            recentScans: Object.freeze([...inspected.entries()].slice(-5).map(([blockHash, scan]) => Object.freeze({ blockHash, ...scan })))
        });
    }

    function reset() {
        const cleared = { holders: lastReserves.size, blocks: blocks.size, scans: inspected.size, attempts: attempts.size };
        lastReserves.clear();
        blocks.clear();
        inspected.clear();
        attempts.clear();
        return cleared;
    }

    return { id: ID, title: TITLE, eventTypes: EVENT_TYPES, tasks, collect, followUps, state, reset };
}

module.exports = {
    ID,
    TITLE,
    EVENT_TYPES,
    DEFAULT_WHALE_THRESHOLD_BTC,
    DEFAULT_SCHEDULES,
    DEFAULT_MAX_SCAN_ATTEMPTS,
    MAX_KNOWN_BLOCKS,
    matchKey,
    medianOf,
    createWhaleTracker
};

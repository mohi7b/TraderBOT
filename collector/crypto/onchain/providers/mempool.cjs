/* ============================================================
 * File: collector/crypto/onchain/providers/mempool.cjs
 * Section: collector/crypto/onchain/providers
 * Version: 1.0.0
 *
 * Role:
 *   mempool.space — the live view of the Bitcoin network, and the only
 *   source here that answers in seconds rather than minutes.
 *
 *     mempool             /api/mempool            how full the queue is
 *     blocks              /api/v1/blocks          the last 15 blocks
 *     block-transactions  /api/block/<hash>/txs   transfers inside one block
 *
 *   Verified live (2026-09): all three answer http 200; a block carries
 *   tx_count, size, weight, extras.medianFee, extras.reward and the
 *   /txs endpoint returned 25 transactions of that block, the largest worth
 *   4.85 BTC.
 *
 *   That 25-of-4,117 is the single most important honest detail here: the
 *   endpoint is a *sample*, not the whole block. The reading therefore
 *   carries `sampledTransactions` next to `blockTransactions`, and the whale
 *   threshold is applied to what was seen — never extrapolated into "the
 *   block contained N whales".
 *
 *   A value is reported in sats exactly as the API gives it, and converted
 *   to BTC with the same round-trip precision the chain uses (8 digits).
 * ============================================================ */

const { numberOrNull, satsToBtc } = require("../core/reading.cjs");

const ID = "mempool";

const endpoints = Object.freeze({
    mempool: Object.freeze({ path: "/api/mempool" }),
    blocks: Object.freeze({ path: "/api/v1/blocks" }),
    "block-transactions": Object.freeze({ path: "/api/block" })
});

function buildUrl({ endpoint, params, config }) {
    if (endpoint === "mempool") return `${config.baseUrl}${endpoints.mempool.path}`;
    if (endpoint === "blocks") return `${config.baseUrl}${endpoints.blocks.path}`;
    if (endpoint === "block-transactions") {
        const hash = params && typeof params.blockHash === "string" ? params.blockHash.trim() : "";
        /* Without a hash there is no question to ask. */
        if (hash === "") return null;
        return `${config.baseUrl}${endpoints["block-transactions"].path}/${encodeURIComponent(hash)}/txs`;
    }
    return null;
}

/** Output value of one transaction, summed exactly over its outputs. */
function valueOf(tx) {
    if (!Array.isArray(tx.vout)) return null;
    let total = null;
    for (const output of tx.vout) {
        const value = numberOrNull(output && output.value);
        if (value === null) continue;
        total = (total === null ? 0 : total) + value;
    }
    return total;
}

function parse({ endpoint, data }) {
    if (endpoint === "mempool") {
        if (!data || typeof data !== "object") return [];
        const histogram = Array.isArray(data.fee_histogram) ? data.fee_histogram : [];
        const rates = histogram.map((pair) => numberOrNull(Array.isArray(pair) ? pair[0] : null)).filter((rate) => rate !== null);
        return [{
            key: "bitcoin",
            mempoolTx: numberOrNull(data.count),
            mempoolVsize: numberOrNull(data.vsize),
            mempoolTotalFeeSats: numberOrNull(data.total_fee),
            feeFloorSatsPerVb: rates.length ? Math.min(...rates) : null,
            feeCeilingSatsPerVb: rates.length ? Math.max(...rates) : null
        }];
    }

    if (endpoint === "blocks") {
        const list = Array.isArray(data) ? data : [];
        return list.map((block) => ({
            key: "bitcoin",
            blockId: block.id || null,
            blockHeight: numberOrNull(block.height),
            txCount: numberOrNull(block.tx_count),
            sizeBytes: numberOrNull(block.size),
            weightUnits: numberOrNull(block.weight),
            blockTime: numberOrNull(block.timestamp) === null ? null : numberOrNull(block.timestamp) * 1000,
            medianFeeSatsPerVb: numberOrNull(block.extras && block.extras.medianFee),
            rewardSats: numberOrNull(block.extras && block.extras.reward),
            stale: block.stale === true
        }));
    }

    if (endpoint === "block-transactions") {
        const list = Array.isArray(data) ? data : [];
        return list.map((tx) => {
            const valueSats = valueOf(tx);
            return {
                key: "bitcoin",
                txid: tx.txid || null,
                valueSats,
                valueBtc: satsToBtc(valueSats),
                outputs: Array.isArray(tx.vout) ? tx.vout.length : null,
                inputs: Array.isArray(tx.vin) ? tx.vin.length : null,
                feeSats: numberOrNull(tx.fee),
                sizeBytes: numberOrNull(tx.size),
                weightUnits: numberOrNull(tx.weight),
                confirmed: Boolean(tx.status && tx.status.confirmed)
            };
        }).filter((row) => row.txid !== null);
    }

    return [];
}

module.exports = { id: ID, kind: "json", endpoints, buildUrl, parse, valueOf };
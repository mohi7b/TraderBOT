/* ============================================================
 * File: collector/crypto/onchain/subsystems/aggregate.cjs
 * Section: collector/crypto/onchain/subsystems
 * Version: 1.0.0
 *
 * Role:
 *   The two things every capsule of this module needs and none of them should
 *   re-invent:
 *
 *     matchKey   a provider's noun → the id of the subject we already have.
 *                "Crypto.com" (DefiLlama), "binance" (mempool) and "IBIT"
 *                (Yahoo) all normalise the same way subject ids do, so a
 *                match is exact and never fuzzy-guessed.
 *
 *     medianOf / weightedMeanOf
 *                an average over a list of pools or blocks, where a missing
 *                number is skipped instead of counted as zero, and a rate
 *                weighted by the money actually behind it is told apart from
 *                the plain average of quotes.
 * ============================================================ */

const { numberOrNull, round } = require("../core/reading.cjs");
const { canonicalSubjectId } = require("../core/subject.cjs");

/** Upper case, alphanumeric — the same shape subject ids have. */
function matchKey(value) {
    return canonicalSubjectId(value);
}

/** Median of the numbers that are actually there; null when none is. */
function medianOf(values) {
    const numbers = (Array.isArray(values) ? values : [])
        .map(numberOrNull)
        .filter((value) => value !== null)
        .sort((a, b) => a - b);
    if (numbers.length === 0) return null;
    const middle = Math.floor(numbers.length / 2);
    return numbers.length % 2 === 1 ? numbers[middle] : round((numbers[middle - 1] + numbers[middle]) / 2, 6);
}

/**
 * Mean of `pick(row)` weighted by `weightPick(row)` — the honest average of a
 * lending rate, where a $2m pool must not weigh as much as a $2bn one. A row
 * whose weight is missing or not positive is skipped, and a list with no
 * weight at all yields null rather than an unweighted number wearing a
 * "weighted" label.
 */
function weightedMeanOf(rows, pick, weightPick) {
    let weighted = null;
    let weights = null;

    for (const row of Array.isArray(rows) ? rows : []) {
        const value = numberOrNull(pick(row));
        const weight = numberOrNull(weightPick(row));
        if (value === null || weight === null || weight <= 0) continue;
        weighted = (weighted === null ? 0 : weighted) + value * weight;
        weights = (weights === null ? 0 : weights) + weight;
    }

    return weighted === null || weights === null || weights === 0 ? null : round(weighted / weights, 6);
}

module.exports = { matchKey, medianOf, weightedMeanOf };

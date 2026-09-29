/* ============================================================
 * File: analytics-engine/core/math.cjs
 * Section: analytics-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   The numeric vocabulary of the analytical layer. Same contract as
 *   the collector's core/canonical.cjs: every function returns a finite
 *   number or null — never NaN, never Infinity, never a fabricated 0
 *   ("no data" must stay distinguishable from "zero").
 * ============================================================ */

function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
    const parsed = finite(value);
    return parsed !== null && parsed > 0 ? parsed : null;
}

/** Sum of the finite values; null when nothing is finite. */
function sum(values = []) {
    let total = null;
    for (const value of values) {
        const parsed = finite(value);
        if (parsed === null) continue;
        total = (total || 0) + parsed;
    }
    return total;
}

function mean(values = []) {
    const usable = values.map(finite).filter((v) => v !== null);
    if (!usable.length) return null;
    return usable.reduce((acc, v) => acc + v, 0) / usable.length;
}

/**
 * Median of the finite values (null when none). Uses linear interpolation
 * between the two middle samples for an even count, so a two-venue median
 * is their mean — the value the venues actually straddle.
 */
function median(values = []) {
    const usable = values.map(finite).filter((v) => v !== null).sort((a, b) => a - b);
    if (!usable.length) return null;

    const middle = usable.length / 2;
    if (usable.length % 2 === 1) return usable[Math.floor(middle)];
    return (usable[middle - 1] + usable[middle]) / 2;
}

/** Population standard deviation (the venues are the whole universe here). */
function stdev(values = []) {
    const avg = mean(values);
    if (avg === null) return null;
    const usable = values.map(finite).filter((v) => v !== null);
    const variance = usable.reduce((acc, v) => acc + (v - avg) ** 2, 0) / usable.length;
    return Math.sqrt(variance);
}

/** Weighted mean: pairs of [value, weight]; zero/negative weights are skipped. */
function weightedMean(pairs = []) {
    let weightTotal = 0;
    let acc = 0;

    for (const [value, weight] of pairs) {
        const v = finite(value);
        const w = finite(weight);
        if (v === null || w === null || w <= 0) continue;
        acc += v * w;
        weightTotal += w;
    }

    return weightTotal > 0 ? acc / weightTotal : null;
}

function divide(numerator, denominator) {
    const a = finite(numerator);
    const b = finite(denominator);
    if (a === null || b === null || b === 0) return null;
    return a / b;
}

/** Relative difference in basis points: (a - b) / |b| * 10000 */
function bpsDiff(a, b) {
    const x = finite(a);
    const y = finite(b);
    if (x === null || y === null || y === 0) return null;
    return ((x - y) / Math.abs(y)) * 10_000;
}

/** bps of a dimensionless ratio: 0.0025 → 25 bps */
function toBps(ratio) {
    const parsed = finite(ratio);
    return parsed === null ? null : parsed * 10_000;
}

function clamp(value, min, max) {
    const parsed = finite(value);
    if (parsed === null) return null;
    return Math.min(max, Math.max(min, parsed));
}

/** Numeric-safe multiplication; null propagates. */
function multiply(a, b) {
    const x = finite(a);
    const y = finite(b);
    return x === null || y === null ? null : x * y;
}

/**
 * Pearson product-moment correlation of two series, read pairwise.
 *
 * The two series are paired by index (sample 0 with sample 0, sample 1 with
 * sample 1, …) and a pair counts only when BOTH sides are finite: a sample one
 * side does not have is dropped, never filled with 0 and never carried over from
 * its neighbour. What remains is the overlap, and the coefficient describes that
 * overlap — the caller knows how many pairs it handed over, so a coefficient
 * over four points is never read as one over four hundred.
 *
 * null — never 0 — when the answer is not a measurement:
 *   - fewer than `minSamples` complete pairs,
 *   - either side has no movement at all (zero variance): a flat series has no
 *     direction, and 0 would claim it had one.
 *
 * @param {Array}  left
 * @param {Array}  right
 * @param {object} [options]
 * @param {number} [options.minSamples] pairs required (floor 2)
 * @returns {number|null} r in [-1, 1], or null
 */
function pearson(left = [], right = [], { minSamples = 2 } = {}) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    const floor = Math.max(2, Math.floor(positive(minSamples) || 2));
    const count = Math.min(a.length, b.length);

    const xs = [];
    const ys = [];
    for (let at = 0; at < count; at += 1) {
        const x = finite(a[at]);
        const y = finite(b[at]);
        if (x === null || y === null) continue;
        xs.push(x);
        ys.push(y);
    }

    const samples = xs.length;
    if (samples < floor) return null;

    const meanX = xs.reduce((acc, v) => acc + v, 0) / samples;
    const meanY = ys.reduce((acc, v) => acc + v, 0) / samples;

    let covariance = 0;
    let varianceX = 0;
    let varianceY = 0;
    for (let at = 0; at < samples; at += 1) {
        const dx = xs[at] - meanX;
        const dy = ys[at] - meanY;
        covariance += dx * dy;
        varianceX += dx * dx;
        varianceY += dy * dy;
    }

    /* A window without movement has no direction to correlate. */
    if (varianceX === 0 || varianceY === 0) return null;

    const r = covariance / Math.sqrt(varianceX * varianceY);
    return Number.isFinite(r) ? clamp(r, -1, 1) : null;
}

/** Exponential weights for the most recent `count` slots (halfLife in slots). */
function decayWeights(count, halfLife = null) {
    const weights = [];
    const half = positive(halfLife);
    for (let i = 0; i < count; i += 1) {
        weights.push(half === null ? 1 : 0.5 ** (i / half));
    }
    return weights;
}

module.exports = {
    finite,
    positive,
    sum,
    mean,
    median,
    stdev,
    weightedMean,
    divide,
    bpsDiff,
    toBps,
    clamp,
    multiply,
    decayWeights,
    pearson
};

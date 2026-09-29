/* ============================================================
 * File: collector/crypto/onchain/core/reading.cjs
 * Section: collector/crypto/onchain/core
 * Version: 1.0.0
 *
 * Role:
 *   The arithmetic layer, and the place where "missing" is defined. Every
 *   on-chain provider is a JSON soup of optional fields, and the honest
 *   handling of an absent number is the whole point of this file:
 *
 *     - a number that is not there stays null — never 0, never "0.0"
 *     - a percentage whose denominator is 0 is null, not Infinity
 *     - a share of a whole that is 0 is null, not NaN
 *     - text that merely looks numeric is parsed explicitly (usdOf), so
 *       "$47.57" is a price while "N/A" is nothing at all
 *
 *   A reading is the frozen result: one subject, one event, one data bag,
 *   and the provenance words that must not leak into the frame.
 * ============================================================ */

const { ASSET_CLASS } = require("../../common/envelope.cjs");
const { provenanceOf } = require("./subject.cjs");

/** The six on-chain event types this module is allowed to publish. */
const EVENT_TYPES = Object.freeze([
    "exchange_reserves",
    "whale_transfer",
    "network_metrics",
    "stablecoin_supply",
    "lending_rate",
    "etf_quote"
]);

/** A number, a numeric string, or null. Nothing else. */
function numberOrNull(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/** "$47.57" | "1,234.5" | "12.3%" | 47.57 → 47.57 ; "N/A" → null. */
function usdOf(value) {
    if (typeof value !== "string") return numberOrNull(value);
    const cleaned = value.replace(/[^0-9.eE+-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === "+" || cleaned === ".") return null;
    return numberOrNull(cleaned);
}

/** current − previous, and the same change as a percentage of |previous|. */
function deltaOf(current, previous) {
    const now = numberOrNull(current);
    const before = numberOrNull(previous);
    if (now === null || before === null) return Object.freeze({ delta: null, pct: null });
    const delta = now - before;
    const pct = before === 0 ? null : (delta / Math.abs(before)) * 100;
    return Object.freeze({ delta, pct });
}

/** part / whole, or null when the whole is missing or empty. */
function shareOf(part, whole) {
    const numerator = numberOrNull(part);
    const denominator = numberOrNull(whole);
    if (numerator === null || denominator === null || denominator === 0) return null;
    return numerator / denominator;
}

/** Round to a number of digits — null in, null out. */
function round(value, digits = 6) {
    const number = numberOrNull(value);
    if (number === null) return null;
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
}

function satsToBtc(sats) {
    const value = numberOrNull(sats);
    return value === null ? null : round(value / 100000000, 8);
}

/** Sum of a mapped field, skipping what is missing; null when nothing is there. */
function sumOf(rows, pick) {
    let total = null;
    for (const row of Array.isArray(rows) ? rows : []) {
        const value = numberOrNull(pick(row));
        if (value === null) continue;
        total = (total === null ? 0 : total) + value;
    }
    return total;
}

/**
 * The largest entries of a map ({name → number}), each with its share of the
 * total that was actually present — so an incomplete upstream payload shows
 * up as a smaller denominator instead of a wrong percentage.
 */
function topEntries(map, { count = 3 } = {}) {
    const entries = Object.entries(map || {})
        .map(([name, value]) => [name, numberOrNull(value)])
        .filter(([, value]) => value !== null && value > 0)
        .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    return entries.slice(0, count).map(([name, value]) => Object.freeze({ name, value, share: shareOf(value, total) }));
}

/**
 * @param {object} spec
 * @param {object} spec.subject       the subject this reading is about
 * @param {string} spec.eventType     EVENT_TYPES member
 * @param {string|null} spec.exchange the venue/holder/chain/issuer the value belongs to
 * @param {string} spec.provider      provider id (also provenance)
 * @param {object} spec.data          the measured values (numbers stay numbers)
 * @param {number} spec.timestamp     provider time of the datum (ms)
 * @param {number|null} [spec.receivedAt]
 * @param {string|null} [spec.sourceMarketType] the provider's own word for the market
 * @param {object|null} [spec.provenance] extra provenance facts
 */
function createReading(spec = {}) {
    const subject = spec.subject;
    if (!subject || typeof subject !== "object") throw new TypeError("reading.subject is required");
    if (!EVENT_TYPES.includes(spec.eventType)) {
        throw new RangeError(`unknown eventType "${spec.eventType}" (expected one of ${EVENT_TYPES.join(", ")})`);
    }
    if (typeof spec.provider !== "string" || spec.provider.trim() === "") {
        throw new TypeError(`reading of ${subject.id}/${spec.eventType}: provider is required`);
    }
    if (!spec.data || typeof spec.data !== "object") {
        throw new TypeError(`reading of ${subject.id}/${spec.eventType}: data must be an object`);
    }
    const timestamp = numberOrNull(spec.timestamp);
    if (timestamp === null) throw new TypeError(`reading of ${subject.id}/${spec.eventType}: timestamp must be a number`);
    const receivedAt = numberOrNull(spec.receivedAt);

    return Object.freeze({
        subjectId: subject.id,
        subject,
        eventType: spec.eventType,
        exchange: spec.exchange || null,
        provider: spec.provider,
        assetClass: subject.assetClass || ASSET_CLASS.CRYPTO,
        /* On-chain data is neither spot nor futures: the frame says null. */
        marketType: null,
        data: Object.freeze({ ...spec.data }),
        timestamp,
        receivedAt: receivedAt === null ? timestamp : receivedAt,
        sourceMarketType: spec.sourceMarketType || null,
        provenance: provenanceOf(subject, {
            provider: spec.provider,
            ...(spec.provenance || {})
        })
    });
}

module.exports = {
    EVENT_TYPES,
    numberOrNull,
    usdOf,
    deltaOf,
    shareOf,
    round,
    satsToBtc,
    sumOf,
    topEntries,
    createReading
};
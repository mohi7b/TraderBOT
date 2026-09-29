/* ============================================================
 * Role:
 *   Central retention policy — how long raw vs rolled-up data
 *   is kept before pruning, per timeframe tier.
 * ============================================================ */

const RETENTION = Object.freeze({
    tick: { maxAgeMs: 15 * 60 * 1000 },          // raw trade/depth events
    "1s": { maxAgeMs: 60 * 60 * 1000 },
    "1m": { maxAgeMs: 24 * 60 * 60 * 1000 },
    "5m": { maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
    "1h": { maxAgeMs: 365 * 24 * 60 * 60 * 1000 },
    "1d": { maxAgeMs: Infinity },                 // never pruned
    "1w": { maxAgeMs: Infinity },
    "1M": { maxAgeMs: Infinity },
    "1Y": { maxAgeMs: Infinity }
});

function isExpired(interval, timestamp, now = Date.now()) {
    const rule = RETENTION[interval];
    if (!rule || !Number.isFinite(rule.maxAgeMs)) return false;
    return now - Number(timestamp) > rule.maxAgeMs;
}

function prune(records, { interval, getTimestamp = (r) => r.timestamp }, now = Date.now()) {
    return records.filter((record) => !isExpired(interval, getTimestamp(record), now));
}

module.exports = { RETENTION, isExpired, prune };

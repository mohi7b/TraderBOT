// Dynamic Timeframe utilities.
//
// The dynamic engine does not persist any higher timeframe: it reads raw 1m candles and groups them
// on the fly. This module centralises the timeframe taxonomy (name -> bucket width in ms) and the
// bucketing math so build-tf.cjs and clients share one canonical definition.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Supported timeframe keys -> bucket width in milliseconds.
//
// Calendar-ish labels (1mo/3mo/6mo/1y/4y) are approximated with fixed epoch-aligned widths so the system
// stays deterministic and history is comparable across symbols/venues:
//   1mo = 30 days, 3mo = 90 days, 6mo = 180 days, 1y = 365 days, 4y = 1460 days.
const TIMEFRAMES = Object.freeze({
    "1m": MINUTE_MS,
    "5m": 5 * MINUTE_MS,
    "15m": 15 * MINUTE_MS,
    "30m": 30 * MINUTE_MS,
    "1h": HOUR_MS,
    "4h": 4 * HOUR_MS,
    "1d": DAY_MS,
    "3d": 3 * DAY_MS,
    "5d": 5 * DAY_MS,
    "7d": 7 * DAY_MS,
    "1w": 7 * DAY_MS,
    "2w": 14 * DAY_MS,
    "1mo": 30 * DAY_MS,
    "3mo": 90 * DAY_MS,
    "6mo": 180 * DAY_MS,
    "1y": 365 * DAY_MS,
    "4y": 4 * 365 * DAY_MS,
});

// Normalises a timeframe token to a canonical key, or throws when unsupported.
function assertTf(tf) {
    if (typeof tf !== "string") throw new TypeError("tf must be a string");
    const key = tf.trim().toLowerCase();
    if (!Object.hasOwn(TIMEFRAMES, key)) {
        throw new RangeError(`Unsupported timeframe: ${tf} (expected one of ${Object.keys(TIMEFRAMES).join(", ")})`);
    }
    return key;
}

// Bucket width in ms for a canonical timeframe key.
function tfWidthMs(tf) {
    return TIMEFRAMES[assertTf(tf)];
}

// Floors an open-time epoch-ms to the start of its bucket for the given timeframe. Buckets are UTC
// epoch-aligned (bucketStart = floor(t / width) * width), matching the raw 1m timestamps verbatim.
function bucketFloor(timestampMs, tf) {
    if (!Number.isInteger(timestampMs)) throw new TypeError("timestampMs must be an integer epoch-ms");
    const width = tfWidthMs(tf);
    return Math.floor(timestampMs / width) * width;
}

// Bucket end (exclusive) for an open-time epoch-ms.
function bucketCeil(timestampMs, tf) {
    return bucketFloor(timestampMs, tf) + tfWidthMs(tf);
}

module.exports = { TIMEFRAMES, MINUTE_MS, HOUR_MS, DAY_MS, assertTf, tfWidthMs, bucketFloor, bucketCeil };

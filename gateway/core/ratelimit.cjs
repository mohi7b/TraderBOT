/* ============================================================
 * File: gateway/core/ratelimit.cjs
 * Section: gateway/core (Phase 5, step 4 — the door)
 * Version: 1.0.0
 *
 * Role:
 *   A token bucket, and the whole point of it is that it is arithmetic on an
 *   injected clock rather than a timer: `now()` moves, the bucket moves with
 *   it, and a test can spend an hour of budget without waiting an hour.
 *
 *   A bucket is per key — an address, or a workspace — and it starts FULL, so
 *   the first request from a key nobody has seen is allowed. What the key is
 *   and what happens when it is empty is the caller's decision, not this
 *   file's: this file only knows how to say "you may" and "not yet, and here
 *   is how long".
 *
 *   `retryAfterMs` is computed, never guessed: it is the time it takes to earn
 *   back the one token the request needed, which is exactly what the
 *   `Retry-After` header promises the caller.
 *
 *   Buckets are bounded. A limiter whose memory grows with the number of
 *   addresses that ever knocked is itself a denial of service, so the least
 *   recently seen key is dropped when the ceiling is reached — and a dropped
 *   key comes back full, which is the only forgiving thing here on purpose.
 * ============================================================ */

const { CODES, accept, refuse, fail } = require("../../identity/core/errors.cjs");

const DEFAULT_MAX_BUCKETS = 10_000;

function createRateLimiter(options = {}) {
    const {
        now,
        capacity,
        refillPerSec,
        maxBuckets = DEFAULT_MAX_BUCKETS,
        name = "bucket"
    } = options;

    if (typeof now !== "function") {
        fail(CODES.NO_CLOCK, "a bucket is given a clock, never reads one");
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
        fail(CODES.BAD_ENTRY, "a bucket's capacity is a number greater than zero");
    }
    if (!Number.isFinite(refillPerSec) || refillPerSec <= 0) {
        fail(CODES.BAD_ENTRY, "a bucket refills at a positive rate");
    }
    if (!Number.isInteger(maxBuckets) || maxBuckets <= 0) {
        fail(CODES.BAD_ENTRY, "a limiter holds a positive, whole number of buckets");
    }

    const buckets = new Map();
    let allowed = 0;
    let refused = 0;

    /** The bucket for a key, refilled up to the instant it is asked about. */
    function bucketFor(key) {
        const at = now();
        const seen = buckets.get(key);
        if (seen) {
            /* Re-inserted so the newest key is the last one in the map, which
             * is what makes the eviction below "least recently seen". */
            buckets.delete(key);
            const earned = Math.max(0, at - seen.at) * (refillPerSec / 1000);
            buckets.set(key, { tokens: Math.min(capacity, seen.tokens + earned), at });
            return buckets.get(key);
        }

        if (buckets.size >= maxBuckets) {
            buckets.delete(buckets.keys().next().value);
        }
        const fresh = { tokens: capacity, at };
        buckets.set(key, fresh);
        return fresh;
    }

    /**
     * Spend one token on a key. `{ ok: true, remaining, retryAfterMs: 0 }`, or
     * a refusal that names the scope and how long the caller must wait — which
     * is the only number in this file a caller gets to see.
     */
    function take(key, cost = 1) {
        if (typeof key !== "string" || key.length === 0) {
            fail(CODES.BAD_ENTRY, "a bucket is keyed by something");
        }
        if (!Number.isFinite(cost) || cost <= 0) {
            fail(CODES.BAD_ENTRY, "a token costs a positive amount");
        }

        const state = bucketFor(key);
        if (state.tokens >= cost) {
            state.tokens -= cost;
            allowed += 1;
            return accept({
                scope: name,
                remaining: Math.floor(state.tokens),
                retryAfterMs: 0
            });
        }

        refused += 1;
        const missing = cost - state.tokens;
        const retryAfterMs = Math.max(1, Math.ceil((missing / refillPerSec) * 1000));

        return refuse(CODES.RATE_LIMITED, `the ${name} budget for this caller is spent`, {
            scope: name,
            remaining: 0,
            retryAfterMs,
            resetAt: now() + retryAfterMs
        });
    }

    /** What a key has left, without spending anything. */
    function peek(key) {
        const seen = buckets.get(key);
        if (!seen) return Object.freeze({ known: false, remaining: Math.floor(capacity) });
        const earned = Math.max(0, now() - seen.at) * (refillPerSec / 1000);
        return Object.freeze({ known: true, remaining: Math.floor(Math.min(capacity, seen.tokens + earned)) });
    }

    /** Let a key start over. Not a test-only door: a caller whose lease ended. */
    function forget(key) {
        return buckets.delete(key);
    }

    return Object.freeze({
        take,
        peek,
        forget,
        name,
        capacity,
        refillPerSec,
        stats: () => Object.freeze({ name, capacity, refillPerSec, keys: buckets.size, maxBuckets, allowed, refused })
    });
}

module.exports = { createRateLimiter, DEFAULT_MAX_BUCKETS };

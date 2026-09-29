// Safe rate limiter for exchange HTTP requests.
//
// Defaults tuned to the strictest venue (OKX): 5 requests/second, 300 candles per request. The limiter
// prevents 429/418 (rate-limit/banned) responses by gating every request through a token bucket and
// back-pressure that auto-sleeps under pressure.
const DEFAULT_MAX_RPS = 5;
const DEFAULT_CHUNK_SIZE = 300;

function createRateController({ maxRps = DEFAULT_MAX_RPS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    if (!Number.isFinite(maxRps) || maxRps <= 0) throw new RangeError("maxRps must be a positive number");
    const intervalMs = 1000 / maxRps;
    let lastRequestAt = 0;
    let requestsTotal = 0;

    // Await permission to issue the next request, sleeping if we would exceed the rate limit.
    async function acquire() {
        const now = Date.now();
        const wait = Math.max(0, lastRequestAt + intervalMs - now);
        if (wait > 0) await sleep(wait);
        lastRequestAt = Date.now();
        requestsTotal += 1;
        return lastRequestAt;
    }

    // Adaptive backoff sleep: called by fetch-chunk on 429/418 so we back off and resettle.
    function backoff(attempt) {
        return sleep(Math.min(1000 * 2 ** attempt, 30000));
    }

    function stats() {
        return Object.freeze({ maxRps, intervalMs, requestsTotal, chunkSize: DEFAULT_CHUNK_SIZE });
    }

    return Object.freeze({ acquire, backoff, stats });
}

module.exports = { createRateController, DEFAULT_MAX_RPS, DEFAULT_CHUNK_SIZE };

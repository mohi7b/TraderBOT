/* ============================================================
 * File: collector/liquidity_6markets/core/feed-client.cjs
 * Section: collector/liquidity_6markets/core
 * Version: 1.0.0
 *
 * Role:
 *   The single way this module talks to the outside world: one
 *   rate-limited, retrying, never-throwing GET.
 *
 *   - The budget comes from config/providers.cjs (maxRps, maxRpm), so
 *     the polite spacing of a provider lives in exactly one place.
 *   - A 429 or a 5xx is retried with exponential backoff and honours
 *     Retry-After; a 4xx (a bad symbol, a missing key) is *returned*,
 *     not retried — hammering a wrong request is how a key gets banned.
 *   - Every attempt is bounded by the provider's own timeoutMs (config/
 *     providers.cjs), and every wait is cancellable: a venue that accepts
 *     the connection and then says nothing must not hold a sweep open,
 *     and neither must a pause between two sweeps.
 *   - Failure is a value ({ok:false, reason}), never an exception: one
 *     dead venue must not take the other five markets down with it.
 * ============================================================ */

const { providerConfig, apiKeyFor } = require("../config/providers.cjs");

const MAX_BACKOFF_MS = 8000;

function retryAfterMs(headers) {
    if (!headers || typeof headers.get !== "function") return null;
    const raw = headers.get("retry-after");
    if (raw === null) return null;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/** Cancellable pause: resolves false when the signal fired first. */
function sleepWith(sleep, ms, signal) {
    if (!signal) return Promise.resolve(sleep(ms)).then(() => true);
    if (signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            resolve(value);
        };
        const onAbort = () => done(false);
        signal.addEventListener("abort", onAbort, { once: true });
        Promise.resolve(sleep(ms)).then(() => done(true));
    });
}

/**
 * @param {object} [options]
 * @param {Function} [options.fetchImpl]   global fetch (injectable for tests)
 * @param {Function} [options.sleep]       injectable clock pause
 * @param {Function} [options.now]         injectable clock
 * @param {Function} [options.onEvent]     (event) => void, for logging/telemetry
 */
function createFeedClient({
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    onEvent = null
} = {}) {
    if (typeof fetchImpl !== "function") {
        throw new TypeError("createFeedClient: no fetch implementation (Node 18+ global fetch is expected)");
    }

    const gates = new Map();

    function gateOf(providerId) {
        if (!gates.has(providerId)) {
            gates.set(providerId, { lastAt: 0, requests: 0, failures: 0, retries: 0, timeouts: 0, cancelled: 0, lastStatus: null, lastError: null });
        }
        return gates.get(providerId);
    }

    /** Wanted spacing between two requests of one provider (ms). */
    function intervalOf(config) {
        const perSecond = config.maxRps ? 1000 / config.maxRps : 0;
        const perMinute = config.maxRpm ? 60_000 / config.maxRpm : 0;
        return Math.max(perSecond, perMinute);
    }

    /**
     * Wait for this provider's turn (serialised per provider).
     * @returns {Promise<number|null>} the request number, or null when the
     *   caller's signal fired while waiting — the caller was never served.
     */
    async function acquire(providerId, { signal = null } = {}) {
        const config = providerConfig(providerId);
        const gate = gateOf(providerId);
        const interval = intervalOf(config);
        const wait = Math.max(0, gate.lastAt + interval - now());
        if (wait > 0 && !(await sleepWith(sleep, wait, signal))) return null;
        if (signal && signal.aborted) return null;
        gate.lastAt = now();
        gate.requests += 1;
        return gate.requests;
    }

    /** One GET with a hard timeout; returns a response or a failure note. */
    async function fetchOnce(url, { headers, timeoutMs, signal }) {
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener("abort", onAbort, { once: true });
        }
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return { ok: true, response: await fetchImpl(url, { headers, signal: controller.signal }) };
        } catch (err) {
            const cancelled = signal && signal.aborted;
            return {
                ok: false,
                reason: cancelled
                    ? "cancelled"
                    : (controller.signal.aborted ? `timeout after ${timeoutMs} ms` : (err && err.message ? err.message : "request failed"))
            };
        } finally {
            clearTimeout(timer);
            if (signal) signal.removeEventListener("abort", onAbort);
        }
    }

    /**
     * One rate-limited, timed-out GET.
     * @param {object} [options]
     * @param {AbortSignal} [options.signal] caller's stop signal (cancels the
     *   request in flight, not only the next one)
     * @param {number} [options.timeoutMs] override of the provider's own budget
     * @returns {Promise<{ok:boolean, status:number|null, data:any, reason:string|null, url:string}>}
     */
    async function get(providerId, url, { parse = "json", attempts = null, headers = {}, signal = null, timeoutMs = null } = {}) {
        const config = providerConfig(providerId);
        const gate = gateOf(providerId);
        const budget = Number.isFinite(timeoutMs) ? timeoutMs : (config.timeoutMs || 15_000);
        const total = Number.isInteger(attempts) && attempts > 0 ? attempts : (config.maxRetries || 0) + 1;
        let lastReason = "no attempt was made";
        let status = null;

        for (let attempt = 1; attempt <= total; attempt += 1) {
            const turn = await acquire(providerId, { signal });
            if (turn === null) {
                gate.cancelled += 1;
                return { ok: false, status, data: null, reason: "cancelled", url };
            }

            const outcome = await fetchOnce(url, { headers, timeoutMs: budget, signal });
            if (!outcome.ok) {
                lastReason = outcome.reason;
                if (lastReason === "cancelled") { gate.cancelled += 1; break; }
                if (lastReason.startsWith("timeout")) gate.timeouts += 1;
                if (attempt === total) break;
                gate.retries += 1;
                const waited = await sleepWith(sleep, Math.min(MAX_BACKOFF_MS, 250 * 2 ** (attempt - 1)), signal);
                if (!waited) { lastReason = "cancelled"; gate.cancelled += 1; break; }
                continue;
            }

            const response = outcome.response;
            status = response && Number.isFinite(response.status) ? response.status : null;

            if (response && response.ok) {
                try {
                    const data = parse === "text" ? await response.text() : await response.json();
                    gate.lastStatus = status;
                    gate.lastError = null;
                    if (onEvent) onEvent({ kind: "request", provider: providerId, status, url, attempt });
                    return { ok: true, status, data, reason: null, url };
                } catch (err) {
                    lastReason = `unreadable ${parse}: ${err && err.message ? err.message : "parse failed"}`;
                    break;
                }
            }

            lastReason = `HTTP ${status}`;
            const retryable = status === null || status === 429 || status >= 500;
            if (!retryable || attempt === total) break;

            const hinted = retryAfterMs(response.headers) || Math.min(MAX_BACKOFF_MS, 250 * 2 ** (attempt - 1));
            gate.retries += 1;
            if (onEvent) onEvent({ kind: "retry", provider: providerId, status, url, attempt, waitMs: hinted });
            const waited = await sleepWith(sleep, hinted, signal);
            if (!waited) { lastReason = "cancelled"; gate.cancelled += 1; break; }
        }

        gate.failures += 1;
        gate.lastStatus = status;
        gate.lastError = lastReason;
        if (onEvent) onEvent({ kind: "failure", provider: providerId, status, url, reason: lastReason });
        return { ok: false, status, data: null, reason: lastReason, url };
    }

    function stats() {
        const out = {};
        for (const [providerId, gate] of gates) {
            out[providerId] = { ...gate };
        }
        return out;
    }

    function reset() {
        const removed = gates.size;
        gates.clear();
        return removed;
    }

    return { get, acquire, intervalOf, stats, reset, apiKeyFor };
}

module.exports = { createFeedClient, retryAfterMs, MAX_BACKOFF_MS, sleepWith };

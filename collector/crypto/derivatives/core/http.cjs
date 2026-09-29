/* ============================================================
 * File: collector/crypto/derivatives/core/http.cjs
 * Section: collector/crypto/derivatives/core
 * Version: 1.0.0
 *
 * Role:
 *   One tiny JSON client for the derivatives REST endpoints.
 *   Everything is injectable (fetch + clock) because the tests must run
 *   without touching the network.
 *
 *   Behaviour:
 *     - per-request timeout (AbortSignal.timeout, the project pattern
 *       already used by venues/binance/futures/open-interest.cjs)
 *     - at most `retries` extra attempts, only for network errors,
 *       408/425/429 and 5xx (a 4xx is a programming/param error and is
 *       surfaced immediately)
 *     - exponential backoff with a cap
 *     - the response body is parsed to JSON and returned with metadata
 *       (status, latencyMs)
 * ============================================================ */

class HttpError extends Error {
    constructor(message, { url = null, status = null, body = null, attempts = 1, cause = null } = {}) {
        super(message);
        this.name = "HttpError";
        this.url = url;
        this.status = status;
        this.body = body;
        this.attempts = attempts;
        if (cause) this.cause = cause;
    }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);

function isRetryableStatus(status) {
    return RETRYABLE_STATUS.has(Number(status));
}

function sleep(ms, timer = setTimeout) {
    return new Promise((resolve) => timer(resolve, Math.max(0, ms)));
}

/**
 * @returns {Promise<{data:any,status:number,url:string,latencyMs:number,attempts:number}>}
 * @throws  {HttpError}
 */
async function fetchJson(url, {
    fetchImpl = globalThis.fetch,
    timeoutMs = 6000,
    retries = 1,
    backoffMs = 400,
    maxBackoffMs = 5000,
    headers = { accept: "application/json" },
    now = Date.now,
    timer = setTimeout
} = {}) {
    if (typeof fetchImpl !== "function") throw new HttpError("no fetch implementation available", { url });

    const attemptsAllowed = Math.max(1, Number(retries) + 1 || 1);
    let attempt = 0;
    let lastError = null;

    while (attempt < attemptsAllowed) {
        attempt += 1;
        const startedAt = now();

        try {
            const response = await fetchImpl(url, {
                headers,
                signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout
                    ? AbortSignal.timeout(timeoutMs)
                    : undefined
            });

            const latencyMs = now() - startedAt;
            const text = await response.text();
            let data = null;

            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    if (!response.ok) throw new HttpError(`HTTP ${response.status} (non-JSON body)`, { url, status: response.status, body: text.slice(0, 200) });
                    throw new HttpError("invalid JSON body", { url, status: response.status, body: text.slice(0, 200), cause: err });
                }
            }

            if (!response.ok) {
                const error = new HttpError(`HTTP ${response.status}`, { url, status: response.status, body: data, attempts: attempt });
                if (!isRetryableStatus(response.status) || attempt >= attemptsAllowed) throw error;
                lastError = error;
            } else {
                return { data, status: response.status, url, latencyMs, attempts: attempt };
            }
        } catch (err) {
            if (err instanceof HttpError && !isRetryableStatus(err.status) && err.status !== null) throw err;
            lastError = err instanceof HttpError
                ? err
                : new HttpError(err && err.message ? err.message : "network error", { url, cause: err });
            if (attempt >= attemptsAllowed) break;
        }

        const backoff = Math.min(maxBackoffMs, backoffMs * 2 ** (attempt - 1));
        await sleep(backoff, timer);
    }

    const failure = lastError || new HttpError("request failed", { url });
    failure.attempts = attempt;
    throw failure;
}

module.exports = { HttpError, fetchJson, isRetryableStatus, RETRYABLE_STATUS };

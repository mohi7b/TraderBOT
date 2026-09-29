function createHttpClient({
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000,
    maxRetries = 2,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("timeoutMs must be a positive integer");
    if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new RangeError("maxRetries must be a non-negative integer");
    if (typeof sleep !== "function") throw new TypeError("sleep must be a function");

    async function requestJson(url, options = {}) {
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetchImpl(url, {
                    ...options,
                    signal: options.signal || controller.signal,
                    headers: {
                        // OKX (and some venues) 403 bare requests without a browser-like User-Agent.
                        "User-Agent": "Mozilla/5.0 (TraderBOT historical collector)",
                        ...(options && options.headers ? options.headers : {}),
                    },
                });
                if (!response || typeof response.ok !== "boolean") throw new TypeError("fetchImpl must return a Response-like object");
                if (response.ok) return response.json();
                const retryable = response.status === 429 || response.status >= 500;
                if (!retryable || attempt === maxRetries) throw new Error(`HTTP ${response.status} for ${url}`);
                const retryAfter = Number(response.headers && response.headers.get && response.headers.get("retry-after"));
                const delayMs = Number.isFinite(retryAfter) && retryAfter >= 0
                    ? retryAfter * 1000
                    : (attempt + 1) * 1000;
                await sleep(delayMs);
            } catch (error) {
                if (attempt === maxRetries || error.name === "TypeError") throw error;
                await sleep((attempt + 1) * 1000);
            } finally {
                clearTimeout(timeout);
            }
        }
    }
    return Object.freeze({ requestJson });
}

module.exports = { createHttpClient };
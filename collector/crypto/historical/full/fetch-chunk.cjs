// Fetches a single small chunk of candles (default 300), retries with exponential backoff on transient
// failures, validates each candle, and standardizes it into the raw candles_1m shape. It performs no
// time adjustment and no computation — it only normalizes the shape the exchange already returned.
//
// `exchange` is the standard key "<venue>_<marketType>" (e.g. "binance_spot", "binance_futures"). It
// selects the correct API by suffix: "_spot" -> spot API, anything else ("_futures"/"_swap"/..."_delivery"/
// "_inverse") -> the venue's futures API.
const { createVenueFetchers } = require("../_engine/fetch/venues.cjs");
const { standardizeCandle, validateCandle } = require("./merge-into-1m-db.cjs");
const { DEFAULT_CHUNK_SIZE } = require("./rate-controller.cjs");
const { splitExchangeKey, apiMarketOf } = require("./markets.cjs");

async function fetchChunk({ symbol, exchange, startTime, endTime, fetchImpl, timeoutMs, rateController, limit = DEFAULT_CHUNK_SIZE, maxRetries = 5, sleep } = {}) {
    if (typeof exchange !== "string" || exchange.trim() === "") throw new TypeError("exchange is required");
    if (!Number.isInteger(startTime) || startTime < 0) throw new TypeError("startTime must be a non-negative integer");

    const { venue } = splitExchangeKey(exchange);
    const market = apiMarketOf(exchange);

    const fetcher = createVenueFetchers({ venues: [venue], fetchImpl, timeoutMs })[0];
    if (!fetcher) throw new RangeError(`Unknown exchange: ${venue}`);

    const backoff = rateController && typeof rateController.backoff === "function" ? rateController.backoff : (attempt) => (sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(Math.min(1000 * 2 ** attempt, 30000));

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            if (rateController && typeof rateController.acquire === "function") await rateController.acquire();

            const candles = await fetcher.fetchRange({ symbol, market, startTime, endTime, limit });

            const valid = candles.filter((candle) => validateCandle(candle));
            const rows = valid.map((candle) => standardizeCandle({ ...candle, exchange }));

            return Object.freeze({
                exchange,
                startTime,
                endTime: endTime ?? null,
                fetched: candles.length,
                valid: valid.length,
                rows,
            });
        } catch (error) {
            const retryable = error && (error.status === 429 || error.status === 418 || error.status >= 500 || error.name === "fetch" || /429|418|rate limit|too many/i.test(error.message || ""));
            if (!retryable || attempt === maxRetries) throw error;
            await backoff(attempt);
        }
    }
    throw new Error(`fetchChunk failed after ${maxRetries} retries for ${exchange}`);
}

module.exports = { fetchChunk };

const { createHttpClient } = require("../client.cjs");
const { assertMarket, assertRange, normalizeKline } = require("../interface.cjs");

const BASE_URLS = Object.freeze({ spot: "https://api.binance.com/api/v3/klines", futures: "https://fapi.binance.com/fapi/v1/klines" });
const MAX_LIMIT = 1000;
const ONE_MINUTE_MS = 60 * 1000;

class BinanceHistoricalFetcher {
    constructor({ httpClient, fetchImpl, timeoutMs = 10000 } = {}) { this.httpClient = httpClient || createHttpClient({ fetchImpl, timeoutMs }); }

    async fetchKlines({ symbol, market = "spot", startTime, endTime, limit = MAX_LIMIT } = {}) {
        if (typeof symbol !== "string" || symbol.trim() === "") throw new TypeError("symbol must be a non-empty string");
        assertMarket(market); assertRange({ startTime, endTime });
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RangeError(`limit must be between 1 and ${MAX_LIMIT}`);
        const query = new URLSearchParams({ symbol: symbol.toUpperCase(), interval: "1m", limit: String(limit), startTime: String(startTime) });
        if (endTime !== undefined) query.set("endTime", String(endTime));
        const rows = await this.httpClient.requestJson(`${BASE_URLS[market]}?${query}`);
        if (!Array.isArray(rows)) throw new TypeError("Binance kline response must be an array");
        return rows.map((row) => normalizeKline(row, { symbol, market, venue: "binance" }));
    }

    async fetchRange({ symbol, market = "spot", startTime, endTime, limit = MAX_LIMIT } = {}) {
        assertRange({ startTime, endTime }); const result = []; let cursor = startTime;
        while (cursor <= (endTime ?? Number.MAX_SAFE_INTEGER)) {
            const page = await this.fetchKlines({ symbol, market, startTime: cursor, endTime, limit });
            if (page.length === 0) break; result.push(...page);
            const nextCursor = Math.max(...page.map((candle) => candle.openTime)) + ONE_MINUTE_MS;
            if (nextCursor <= cursor) throw new Error("Binance pagination did not advance");
            cursor = nextCursor; if (page.length < limit) break;
        }
        const unique = new Map();
        for (const candle of result) {
            if (candle.openTime >= startTime && (endTime === undefined || candle.openTime <= endTime)) {
                unique.set(candle.openTime, candle);
            }
        }
        return [...unique.values()].sort((left, right) => left.openTime - right.openTime);
    }
}

module.exports = { BASE_URLS, BinanceHistoricalFetcher, MAX_LIMIT, ONE_MINUTE_MS };
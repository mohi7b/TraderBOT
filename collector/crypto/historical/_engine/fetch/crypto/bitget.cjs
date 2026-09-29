const { createCryptoAdapter } = require("./adapter.cjs");

// Bitget has TWO candle endpoints with very different history depth (verified live):
//   - /market/candles          : recent only (~30 days of 1m)
//   - /market/history-candles  : full history (2+ years of 1m), but REQUIRES `endTime`
// We use history-candles so we can retrieve deep history like the other venues.
const URLS = Object.freeze({
    spot: "https://api.bitget.com/api/v2/spot/market/history-candles",
    futures: "https://api.bitget.com/api/v2/mix/market/history-candles",
});

// history-candles returns ASC (oldest -> newest) and caps `limit` at 200.
const MAX_LIMIT = 200;

function buildQuery({ symbol, market, startTime, endTime, limit }) {
    const granularity = market === "futures" ? "1m" : "1min";
    const params = { symbol, granularity };
    // `endTime` is REQUIRED by history-candles; default it to "now" so single-page calls still work.
    params.endTime = String(endTime !== undefined && endTime !== Number.MAX_SAFE_INTEGER ? endTime : Date.now());
    if (startTime !== undefined) params.startTime = String(startTime);
    params.limit = String(Math.min(limit, MAX_LIMIT));
    if (market === "futures") params.productType = "USDT-FUTURES";
    return new URLSearchParams(params);
}

function mapSymbol(symbol) { return symbol.toUpperCase().replace(/[-_]/g, ""); }

function parseRows(data) {
    if (!data || data.code !== "00000" || !Array.isArray(data.data)) throw new TypeError("Invalid Bitget kline response");
    // Bitget candle: [ts, open, high, low, close, baseVolume, quoteVolume] (no closeTime/trades).
    // Map to canonical [openTime, open, high, low, close, volume, closeTime, quoteVolume].
    return data.data.map((row) => {
        const openTime = Number(row[0]);
        return [openTime, row[1], row[2], row[3], row[4], row[5], openTime + 59999, row[6]];
    });
}

module.exports = ({ httpClient, fetchImpl, timeoutMs } = {}) => {
    const adapter = createCryptoAdapter({ venue: "bitget", urls: URLS, buildQuery, parseRows, mapSymbol, httpClient, fetchImpl, timeoutMs });

    // Find the oldest served candle via binary search over `endTime` (history-candles returns data ≤ endTime).
    async function earliestOpenTime({ symbol, market = "spot" } = {}) {
        const newest = (await adapter.fetchKlines({ symbol, market, startTime: undefined, endTime: undefined, limit: 1, mode: "update" }))[0];
        if (!newest) return null;
        const newestOpen = newest.openTime;

        // history-candles returns "the last `limit` candles before endTime", monoticic in endTime.
        let lo = 1;
        let hi = newestOpen;
        let oldestKnown = newestOpen;
        let guard = 60;
        while (lo <= hi && guard-- > 0) {
            const mid = lo + Math.floor((hi - lo) / 2);
            const page = await adapter.fetchKlines({ symbol, market, startTime: undefined, endTime: mid, limit: 1, mode: "update" });
            if (page.length === 0) lo = mid + 1;
            else { oldestKnown = page[0].openTime; hi = mid - 1; }
        }
        return oldestKnown;
    }

    // Custom fetchRange: history-candles IGNORES `startTime` and always returns "the last N candles before
    // endTime" (ASC, newest last). So we walk BACKWARD with an `endTime` cursor (one minute before the
    // oldest candle seen each page), exactly like OKX uses `after`. The shared adapter's asc/desc range
    // logic does not apply here, which is why we override fetchRange.
    // IMPORTANT: Bitget futures rejects a [startTime,endTime] span wider than ~90 days, so each page must
    // carry a startTime close to (not "now - 90 days" from) the endTime cursor — hence startTime = endTime - 90d.
    async function fetchRange({ symbol, market = "spot", startTime, endTime, limit = 200, mode = "full" } = {}) {
        if (mode !== "full") return adapter.fetchKlines({ symbol, market, limit, mode });
        const { assertRange } = require("../interface.cjs");
        assertRange({ startTime, endTime });
        const upper = endTime ?? Date.now();
        const DAY90 = 90 * 24 * 60 * 60 * 1000;
        const collected = [];
        let cursorEnd = upper;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // Limit the window start so the [startTime,endTime] span never exceeds 90 days (Bitget futures
            // caps it). history-candles ignores startTime for the actual rows anyway — this just satisfies
            // the API's span validation.
            const winStart = Math.max(1, cursorEnd - DAY90);
            const page = await adapter.fetchKlines({ symbol, market, startTime: winStart, endTime: cursorEnd, limit, mode: "full" });
            if (page.length === 0) break;
            collected.push(...page);
            const oldest = Math.min(...page.map(({ openTime }) => openTime));
            if (oldest <= startTime) break;
            const next = oldest - 60000; // step one minute older to avoid re-fetching the same candle
            if (next >= cursorEnd) break; // no older progress
            cursorEnd = next;
        }
        const unique = new Map();
        for (const c of collected) if (c.openTime >= startTime && c.openTime <= upper) unique.set(c.openTime, c);
        return [...unique.values()].sort((a, b) => a.openTime - b.openTime);
    }

    return Object.freeze({ venue: "bitget", fetchKlines: adapter.fetchKlines, fetchRange, earliestOpenTime });
};

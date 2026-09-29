const { createHttpClient } = require("../client.cjs");
const { assertRange, normalizeKline } = require("../interface.cjs");
const { getVenueConfig } = require("../venues-config.cjs");

const URLS = Object.freeze({ spot: "https://www.okx.com/api/v5/market/history-candles", futures: "https://www.okx.com/api/v5/market/history-candles" });

function mapSymbol(symbol, market) { const base = symbol.toUpperCase().replace(/[-_]/g, "").replace(/USDT$/, ""); return `${base}-USDT${market === "futures" ? "-SWAP" : ""}`; }

function parseRows(data) {
    if (!data || data.code !== "0" || !Array.isArray(data.data)) throw new TypeError("Invalid OKX kline response");
    return data.data.map((row) => {
        const openTime = Number(row[0]);
        // [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
        return [openTime, row[1], row[2], row[3], row[4], row[5], openTime + 59999, row[7]];
    });
}

// OKX is newest-first and paginates with `after` (returns candles at/after that ts, i.e. older pages).
// It has no date-range params, so it cannot use the shared backward `fetchRange`; implement it here.
module.exports = ({ httpClient, fetchImpl, timeoutMs, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) => {
    const client = httpClient || createHttpClient({ fetchImpl, timeoutMs });
    const config = getVenueConfig("okx");
    let lastCallAt = 0;

    async function acquire() {
        const interval = 1000 / (config.rateLimit?.maxRps || 3);
        const wait = Math.max(0, lastCallAt + interval - Date.now());
        if (wait > 0) await sleep(wait);
        lastCallAt = Date.now();
    }

    async function fetchKlines({ symbol, market = "spot", limit = 100, mode = "full", after } = {}) {
        const instId = mapSymbol(symbol, market);
        // OKX caps at 300 candles/request on /market/history-candles (verified live: 1000 -> 300).
        const params = { instId, bar: "1m", limit: String(Math.min(limit, 300)) };
        if (after !== undefined && after > 0) params.after = String(after);
        await acquire();
        const rows = await client.requestJson(`${URLS[market]}?${new URLSearchParams(params)}`);
        return parseRows(rows).map((row) => normalizeKline(row, { symbol: symbol.toUpperCase(), market, venue: "okx" }));
    }

    async function fetchRange({ symbol, market = "spot", startTime, endTime, limit = 100, mode = "full" } = {}) {
        if (mode !== "full") return fetchKlines({ symbol, market, limit, mode });
        assertRange({ startTime, endTime });
        const collected = [];
        // Start the backward walk at `endTime` (NOT the newest candle). OKX's `after=T` returns candles
        // OLDER than T, so beginning at `endTime` lets us fetch exactly the [startTime, endTime] window
        // without walking all the way from "now" (which would be millions of requests for a single chunk).
        let after = endTime ?? undefined;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const page = after === undefined
                ? await fetchKlines({ symbol, market, limit, mode: "full" })
                : await fetchKlines({ symbol, market, limit, mode: "full", after });
            if (page.length === 0) break;
            collected.push(...page);
            const oldest = Math.min(...page.map(({ openTime }) => openTime));
            if (oldest <= startTime) break;
            const next = oldest - 60000; // `after` is inclusive; step one minute older to avoid re-including
            if (next >= after) throw new Error("okx pagination did not advance");
            after = next;
        }
        const unique = new Map();
        for (const c of collected) if (c.openTime >= startTime && c.openTime <= endTime) unique.set(c.openTime, c);
        return [...unique.values()].sort((a, b) => a.openTime - b.openTime);
    }

    // OKX has no startTime/endTime params (only the `after` cursor), so the shared `earliestRemote`
    // probe (fetchKlines({ startTime: 0, limit: 1 })) would wrongly return the NEWEST candle.
    //
    // `after=T` returns the candles OLDER than T (newest-first), and yields [] when T is beyond OKX's
    // retention. So "does `after=T` return data?" is monotonic in T: true for recent T, false for ancient
    // T. Binary search over T finds the oldest candle in ~log2(history) requests instead of walking it.
    async function earliestOpenTime({ symbol, market = "spot" } = {}) {
        const newest = (await fetchKlines({ symbol, market, limit: 1, mode: "full" }))[0];
        if (!newest) return null;

        let lo = 0;                 // after=0 -> data=[] (0 <= earliest)  [verified live]
        let hi = newest.openTime;   // after=newest -> data exists (newest > earliest)
        // Find the first T where `after=T` returns data (i.e. T > earliestOpenTime).
        while (hi - lo > 60000) {
            const mid = lo + Math.floor((hi - lo) / 2);
            const page = await fetchKlines({ symbol, market, limit: 1, mode: "full", after: mid });
            if (page.length === 0) lo = mid;   // T <= earliest -> move up toward earliest
            else hi = mid;                     // T > earliest -> move down
        }
        // `hi` is now ~ earliest + delta; the single oldest candle sits just before it.
        const page = await fetchKlines({ symbol, market, limit: 1, mode: "full", after: hi });
        return page.length ? page[0].openTime : newest.openTime;
    }

    return Object.freeze({ venue: "okx", fetchKlines, fetchRange, earliestOpenTime });
};



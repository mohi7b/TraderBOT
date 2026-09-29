const { createCryptoAdapter } = require("./adapter.cjs");
const URLS = Object.freeze({ spot: "https://api.kucoin.com/api/v1/market/candles", futures: "https://api-futures.kucoin.com/api/v1/kline/query" });
function mapSymbol(symbol, market) { const normalized = symbol.toUpperCase().replace(/[-_]/g, ""); return market === "futures" ? `${normalized.replace(/^BTC/, "XBT")}M` : normalized.replace(/USDT$/, "-USDT"); }
function buildQuery({ symbol, market, startTime, endTime, limit, mode }) {
    if (market === "futures") {
        // KuCoin futures kline/query uses `from`/`to` in ms, `granularity` = minutes. No `limit` param;
        // it returns at most ~200 rows, so backward pagination moves via `to`.
        const values = { symbol, granularity: "1" };
        if (startTime !== undefined) values.from = String(startTime);
        if (endTime !== undefined && endTime !== Number.MAX_SAFE_INTEGER) values.to = String(endTime);
        return values;
    }
    // Spot: seconds timestamps, startAt/endAt, explicit limit + type.
    const values = { symbol, type: "1min", startAt: String(Math.max(0, Math.floor(startTime / 1000) - 60)) };
    if (endTime !== undefined && endTime !== Number.MAX_SAFE_INTEGER) values.endAt = String(Math.floor(endTime / 1000) + 60);
    values.limit = String(Math.min(limit, 1500));
    return values;
}
// KuCoin candle arrays differ between spot and futures:
//   spot    /market/candles:  [time(sec), open, close, high, low, volume, turnover]   (open/close/high/low)
//   futures /kline/query:    [time(ms),  open, high, low, close, volume, turnover]     (standard OHLC order)
// We auto-detect the market by time magnitude (seconds ~1.7e9 vs milliseconds ~1.7e12) since the shared
// adapter calls parseRows without market context, and remap to the canonical
// [openTime, open, high, low, close, volume, closeTime, quoteVolume] shape.
function parseRows(data) {
    if (!data || data.code !== "200000" || !Array.isArray(data.data)) throw new TypeError("Invalid KuCoin kline response");
    return data.data.map((row) => {
        const time = Number(row[0]);
        const isFutures = Math.abs(time) > 1e11;              // futures already ms; spot is seconds
        const openTime = isFutures ? time : time * 1000;
        const open = Number(row[1]);
        const high = Number(isFutures ? row[2] : row[3]);
        const low = Number(isFutures ? row[3] : row[4]);
        const close = Number(isFutures ? row[4] : row[2]);
        const volume = Number(row[5]);
        const turnover = Number(row[6]);
        return [openTime, open, high, low, close, volume, openTime + 59999, turnover];
    });
}

module.exports = ({ httpClient, fetchImpl, timeoutMs } = {}) => {
    const adapter = createCryptoAdapter({ venue: "kucoin", urls: URLS, buildQuery, parseRows, mapSymbol, maxLimit: 1500, httpClient, fetchImpl, timeoutMs });

    // The shared earliestRemote probe (startTime=0, limit=1) is wrong for KuCoin: spot uses seconds and
    // rejects startAt=0, while futures `from` must be a real millisecond value. KuCoin returns candles in
    // an ascending [start, end] window: `start=1`(or a small non-zero value) + a small `end=T` yields the
    // oldest candle <= T, and [] when T is before the retained history. We binary-search the `end` boundary
    // to find the oldest served open time (works for both spot-seconds and futures-milliseconds).
    async function earliestOpenTime({ symbol, market = "spot" } = {}) {
        if (market === "futures") {
            // KuCoin futures /kline/query uses `from` in ms and returns candles ASC from that point. A `from`
            // far in the past yields the oldest candle directly (verified live: from=1500000000000 -> 2024-12).
            // `from=1` is rejected ("must be milliseconds"), hence the large, real value here.
            const page = await adapter.fetchKlines({ symbol, market, startTime: 1500000000000, endTime: undefined, limit: 1 });
            return page.length ? page[0].openTime : null;
        }
        // Spot /market/candles uses `startAt`/`endAt` in seconds and returns an ascending [start,end] window.
        // We binary-search `endAt` (the `endTime`) to find the oldest served candle.
        const newest = (await adapter.fetchKlines({ symbol, market, startTime: 120000, endTime: undefined, limit: 1 }))[0];
        if (!newest) return null;
        const newestOpen = newest.openTime;

        let lo = 120000;          // startTime=120000 maps to startAt=60s (the smallest valid startAt)
        let hi = newestOpen;      // definitely has data
        let oldestKnown = newestOpen;
        let guard = 60;
        while (lo <= hi && guard-- > 0) {
            const mid = lo + Math.floor((hi - lo) / 2);
            const page = await adapter.fetchKlines({ symbol, market, startTime: 120000, endTime: mid, limit: 1, mode: "full" });
            if (page.length === 0) lo = mid + 1;           // no data at/before mid -> newer
            else { oldestKnown = page[0].openTime; hi = mid - 1; } // data -> try older
        }
        return oldestKnown;
    }

    return Object.freeze({ venue: "kucoin", ...adapter, earliestOpenTime });
};

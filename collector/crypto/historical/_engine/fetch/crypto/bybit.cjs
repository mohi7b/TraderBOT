const { createCryptoAdapter } = require("./adapter.cjs");
const URLS = Object.freeze({ spot: "https://api.bybit.com/v5/market/kline", futures: "https://api.bybit.com/v5/market/kline" });

function buildQuery({ symbol, market, startTime, endTime, limit }) { return new URLSearchParams({ category: market === "spot" ? "spot" : "linear", symbol, interval: "1", start: String(startTime), ...(endTime === undefined ? {} : { end: String(endTime) }), limit: String(Math.min(limit, 1000)) }); }
function parseRows(data) { if (!data || data.retCode !== 0 || !data.result || !Array.isArray(data.result.list)) throw new TypeError("Invalid Bybit kline response"); return data.result.list.map((row) => [row[0], row[1], row[2], row[3], row[4], row[5], Number(row[0]) + 59999]); }

module.exports = ({ httpClient, fetchImpl, timeoutMs } = {}) => {
    const adapter = createCryptoAdapter({ venue: "bybit", urls: URLS, buildQuery, parseRows, httpClient, fetchImpl, timeoutMs });
    // Bybit is newest-first (desc) and ignores `start=0` (falls back to the newest candle). Crucially,
    // `start=1` only works for spot; for `linear` (futures) it also returns the newest candle. However,
    // Bybit's `start` is an *ascending* filter: `start=T` returns the nearest candle with openTime >= T.
    // So a `start` far in the past (before any retained history) yields the venue's OLDEST candle with a
    // single request (verified live: spot -> 2021-07-05, linear -> 2020-03-25 for start=1500000000000).
    async function earliestOpenTime({ symbol, market = "spot" } = {}) {
        // 1500000000000 = 2017-07-14, before every Bybit 1m series we care about.
        const page = await adapter.fetchKlines({ symbol, market, startTime: 1500000000000, endTime: undefined, limit: 1 });
        return page.length ? page[0].openTime : null;
    }
    return Object.freeze({ venue: "bybit", ...adapter, earliestOpenTime });
};
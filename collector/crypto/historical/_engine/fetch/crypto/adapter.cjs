const { createHttpClient } = require("../client.cjs");
const { assertRange, normalizeKline } = require("../interface.cjs");
const { getVenueConfig } = require("../venues-config.cjs");

// Shared crypto adapter. Two modes:
//   - "full": backward pagination from endTime to startTime (venues return newest-first), full limit.
//   - "update": latest-only (small limit), no range needed.
// Every venue's buildQuery/parseRows still defines HOW to render its request/response; the adapter owns
// the shared pagination + rate limiting + canonical normalization.
function createCryptoAdapter({ venue, urls, buildQuery, parseRows, mapSymbol = (symbol) => symbol.toUpperCase(), maxLimit = 1000, httpClient, fetchImpl, timeoutMs = 10000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    if (typeof venue !== "string" || !urls || typeof buildQuery !== "function" || typeof parseRows !== "function") throw new TypeError("Invalid crypto adapter definition");
    const client = httpClient || createHttpClient({ fetchImpl, timeoutMs });
    const config = getVenueConfig(venue);
    const limit = Math.min(maxLimit, config.limit || maxLimit);

    // Rate limiter (respect production budget; still honored even if the venue config is stricter).
    let lastCallAt = 0;
    async function acquire() {
        const interval = 1000 / (config.rateLimit?.maxRps || 5);
        const wait = Math.max(0, lastCallAt + interval - Date.now());
        if (wait > 0) await sleep(wait);
        lastCallAt = Date.now();
    }

    async function fetchKlines({ symbol, market = "spot", startTime, endTime, limit: reqLimit, mode = "full" } = {}) {
        if (mode === "full") assertRange({ startTime, endTime });
        if (!urls[market]) throw new RangeError(`Unsupported ${venue} market: ${market}`);
        const effLimit = mode === "full" ? limit : Math.min(limit, 3); // update: only latest few
        await acquire();
        const q = buildQuery({ symbol: mapSymbol(symbol, market), market, startTime, endTime, limit: effLimit, mode });
        const rows = await client.requestJson(`${urls[market]}?${new URLSearchParams(q)}`);
        return parseRows(rows, { market, mode }).map((row) => normalizeKline(row, { symbol, market, venue }));
    }

    // Full mode: paginate the whole [startTime, endTime]. Direction depends on the venue's order:
    //   - "asc"  (Binance/KuCoin): walk forward from startTime.
    //   - "desc" (Bybit/Bitget/others): walk backward from endTime.
    async function fetchRange({ symbol, market = "spot", startTime, endTime, limit: reqLimit = limit, mode = "full" } = {}) {
        if (mode !== "full") return fetchKlines({ symbol, market, startTime, endTime, limit: reqLimit, mode });
        assertRange({ startTime, endTime });
        const upper = endTime ?? Number.MAX_SAFE_INTEGER;
        const collected = [];
        const unique = new Map();
        const addCandle = (c) => { if (c.openTime >= startTime && c.openTime <= upper) unique.set(c.openTime, c); };

        if (config.order === "asc") {
            let cursor = startTime;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                if (cursor > upper) break;
                const page = await fetchKlines({ symbol, market, startTime: cursor, endTime: upper, limit: reqLimit, mode: "full" });
                if (page.length === 0) break;
                page.forEach(addCandle);
                const newest = Math.max(...page.map(({ openTime }) => openTime));
                const next = newest + 60000;
                if (next <= cursor) break; // no forward progress -> done
                cursor = next;
            }
            return [...unique.values()].sort((a, b) => a.openTime - b.openTime);
        }

        // desc: walk backward from endTime (Bybit/Bitget et al return newest-first).
        let cursorEnd = upper;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (cursorEnd < startTime) break;
            const page = await fetchKlines({ symbol, market, startTime, endTime: cursorEnd, limit: reqLimit, mode: "full" });
            if (page.length === 0) break;
            collected.push(...page);
            const oldest = Math.min(...page.map(({ openTime }) => openTime));
            if (oldest <= startTime) break;
            const nextEnd = oldest - 60000;
            if (nextEnd >= cursorEnd) throw new Error(`${venue} pagination did not advance`);
            cursorEnd = nextEnd;
        }
        const uniq2 = new Map();
        for (const c of collected) if (c.openTime >= startTime && c.openTime <= upper) uniq2.set(c.openTime, c);
        return [...uniq2.values()].sort((a, b) => a.openTime - b.openTime);
    }

    return Object.freeze({ venue, fetchKlines, fetchRange });
}

module.exports = { createCryptoAdapter };

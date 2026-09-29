// Centralized per-venue / per-market configuration for the historical fetch layer.
//
// One place defines, for every venue, how to map the venue's REST candles into the canonical shape and
// how fast we may call it (rate limit at half the official capacity, so we stay safe):
//   - marketTypes: which markets the venue supports and their per-market specifics
//   - limit: max candles per request (the venue's API cap)
//   - timeUnit: "ms" | "s"  (the unit the venue's timestamp/date params use)
//   - dateParams: the venue's actual query-param names for [start, end], plus "before" for backward-only
//     venues (OKX has no date range, only a `before` pagination cursor)
//   - order: "asc" | "desc" (direction the venue returns candles)
//   - rateLimit: { maxRps, weight } — request budget (half-capacity safe values)
//   - mapSymbol: how to render the symbol per market (see adapter symbols)
const VENUES = Object.freeze({
    binance: Object.freeze({
        limit: 1000,
        timeUnit: "ms",
        dateParams: Object.freeze({ start: "startTime", end: "endTime" }),
        order: "asc",
        rateLimit: Object.freeze({ maxRps: 4, weight: 20 }),
    }),
    bybit: Object.freeze({
        limit: 1000,
        timeUnit: "ms",
        dateParams: Object.freeze({ start: "start", end: "end" }),
        order: "desc",
        rateLimit: Object.freeze({ maxRps: 5, weight: 1 }),
    }),
    okx: Object.freeze({
        // OKX serves up to 300 candles per request on BOTH endpoints (verified live):
        //   - /api/v5/market/candles         (recent only; returns [] beyond ~few months)
        //   - /api/v5/market/history-candles (full history; supports `after` cursor back 1y+)
        // The adapter uses history-candles, so 300 is the correct cap (not 100).
        limit: 300,
        timeUnit: "ms",
        dateParams: Object.freeze({ start: null, end: null, before: "before" }), // no date range; `after` cursor
        order: "desc",
        rateLimit: Object.freeze({ maxRps: 3, weight: 2 }),
    }),
    kucoin: Object.freeze({
        limit: 1500,
        timeUnit: "s", // spot uses seconds; futures uses ms (handled in adapter buildQuery)
        dateParams: Object.freeze({ start: "startAt", end: "endAt" }),
        order: "asc",
        rateLimit: Object.freeze({ maxRps: 6, weight: 1 }),
    }),
    bitget: Object.freeze({
        limit: 1000,
        timeUnit: "ms",
        dateParams: Object.freeze({ start: "startTime", end: "endTime" }),
        // history-candles returns ASC (oldest -> newest), unlike the old `candles` endpoint which was desc.
        order: "asc",
        rateLimit: Object.freeze({ maxRps: 5, weight: 1 }),
    }),
});

function getVenueConfig(venue) {
    const config = VENUES[venue];
    if (!config) throw new RangeError(`Unknown venue: ${venue}`);
    return config;
}

module.exports = { VENUES, getVenueConfig };

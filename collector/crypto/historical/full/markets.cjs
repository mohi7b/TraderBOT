// Exchange + market taxonomy for the Full Downloader.
//
// The `exchange` value stored in candles_1m is always "<venue>_<marketType>", so spot and futures (and
// swap/delivery/inverse) are never mixed. The marketType maps onto the venue's actual API market:
//   spot                -> spot API
//   futures/swap/delivery/inverse -> futures API (the venue adapters only expose spot/futures endpoints;
//                          the richer labels preserve the logical book type in the exchange key).
const MARKET_TYPES = Object.freeze(["spot", "futures", "swap", "delivery", "inverse"]);

const VENUES = Object.freeze(["binance", "okx", "bybit", "coinbase", "kraken", "kucoin", "bitget"]);

function assertMarketType(marketType) {
    if (!MARKET_TYPES.includes(marketType)) throw new RangeError(`Unsupported market type: ${marketType} (expected one of ${MARKET_TYPES.join(", ")})`);
    return marketType;
}

function assertVenue(venue) {
    const v = venue.toLowerCase();
    if (!VENUES.includes(v)) throw new RangeError(`Unsupported venue: ${venue}`);
    return v;
}

// Builds the standard exchange key "<venue>_<marketType>".
function buildExchangeKey(venue, marketType) {
    return `${assertVenue(venue)}_${assertMarketType(marketType)}`;
}

// Splits a standard exchange key "<venue>_<marketType>" into its parts.
function splitExchangeKey(exchange) {
    if (typeof exchange !== "string" || exchange.trim() === "") throw new TypeError("exchange is required");
    const idx = exchange.lastIndexOf("_");
    if (idx <= 0) throw new RangeError(`Invalid exchange key (expected <venue>_<marketType>): ${exchange}`);
    const venue = assertVenue(exchange.slice(0, idx));
    const marketType = assertMarketType(exchange.slice(idx + 1));
    return Object.freeze({ venue, marketType });
}

// The API market the venue adapter expects ("spot" | "futures") for a given exchange key.
function apiMarketOf(exchange) {
    const { marketType } = splitExchangeKey(exchange);
    return marketType === "spot" ? "spot" : "futures";
}

module.exports = { MARKET_TYPES, VENUES, assertMarketType, assertVenue, buildExchangeKey, splitExchangeKey, apiMarketOf };

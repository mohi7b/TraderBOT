const adapters = require("./crypto/index.cjs");

// Resolves a list of live venue fetchers for a symbol, ordered by the default venue preference.
// Each entry exposes { venue, fetchKlines, fetchRange }, matching createCryptoAdapter / the Binance
// HistoricalFetcher contract. Used by detect-missing to discover the newest available candle on the
// exchange without downloading the whole history.
function createVenueFetchers({ venues, fetchImpl, timeoutMs } = {}) {
    const names = Array.isArray(venues) && venues.length ? venues : Object.keys(adapters);
    return names.map((venue) => {
        const factory = adapters[venue];
        if (typeof factory !== "function") throw new RangeError(`Unknown crypto venue: ${venue}`);
        const fetcher = factory({ fetchImpl, timeoutMs });
        return Object.freeze({ venue, ...fetcher });
    });
}

module.exports = { createVenueFetchers };

const MARKETS = Object.freeze(["spot", "futures"]);

function assertMarket(market) {
    if (!MARKETS.includes(market)) throw new RangeError(`Unsupported crypto market: ${market}`);
    return market;
}

function assertRange({ startTime, endTime }) {
    if (!Number.isInteger(startTime) || startTime < 0) throw new TypeError("startTime must be a non-negative integer epoch-ms");
    if (endTime !== undefined && (!Number.isInteger(endTime) || endTime < startTime)) throw new RangeError("Invalid epoch-ms range");
}

function normalizeKline(row, { symbol, market, venue }) {
    if (!Array.isArray(row) || row.length < 7) throw new TypeError("Invalid kline row");
    const values = row.slice(0, 12).map(Number);
    if (values.slice(0, 7).some((value) => !Number.isFinite(value))) throw new TypeError("Invalid numeric kline value");
    return Object.freeze({
        venue, market: assertMarket(market), symbol: symbol.toUpperCase(),
        openTime: values[0], open: values[1], high: values[2], low: values[3], close: values[4],
        volume: values[5], closeTime: values[6], quoteVolume: values[7], trades: values[8],
    });
}

module.exports = { MARKETS, assertMarket, assertRange, normalizeKline };
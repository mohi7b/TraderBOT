/* ============================================================
 * File: collector/liquidity_6markets/providers/okx.cjs
 * Section: collector/liquidity_6markets/providers
 * Version: 1.0.0
 *
 * Role:
 *   The second crypto venue, and the only provider in this module whose
 *   answer carries a real exchange timestamp and a 24h candle:
 *
 *   GET /api/v5/market/ticker?instId=BTC-USDT
 *   → { code: "0", data: [ { instId, last, lastSz, askPx, askSz,
 *       bidPx, bidSz, open24h, high24h, low24h, vol24h, volCcy24h, ts } ] }
 *
 *   Feed with the venue's own instId ("BTC-USDT", "BTC-USDT-SWAP"), so
 *   the same instrument can be quoted spot or swap by adding a spelling.
 * ============================================================ */

const ID = "okx";

function buildUrl(instrument, { providerSymbol, config }) {
    const url = new URL(config.baseUrl);
    url.searchParams.set("instId", providerSymbol);
    return url.toString();
}

function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function parse(data, { providerSymbol = null } = {}) {
    if (!data || typeof data !== "object") return null;
    if (data.code !== undefined && String(data.code) !== "0") return null;
    const row = Array.isArray(data.data) ? data.data[0] : null;
    if (!row) return null;

    const bid = numberOrNull(row.bidPx);
    const ask = numberOrNull(row.askPx);
    const last = numberOrNull(row.last);
    const price = last === null ? (bid !== null && ask !== null ? (bid + ask) / 2 : (bid === null ? ask : bid)) : last;
    if (price === null) return null;

    const stamp = numberOrNull(row.ts);

    return {
        providerSymbol,
        price,
        bid,
        ask,
        bidSize: numberOrNull(row.bidSz),
        askSize: numberOrNull(row.askSz),
        open: numberOrNull(row.open24h),
        high: numberOrNull(row.high24h),
        low: numberOrNull(row.low24h),
        close: last,
        volume: numberOrNull(row.vol24h),
        quoteVolume: numberOrNull(row.volCcy24h),
        barInterval: "24h",
        timestamp: stamp
    };
}

module.exports = { id: ID, kind: "json", buildUrl, parse };

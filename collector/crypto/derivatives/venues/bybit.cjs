/* ============================================================
 * File: collector/crypto/derivatives/venues/bybit.cjs
 * Section: collector/crypto/derivatives/venues
 * Version: 1.0.0
 *
 * Role:
 *   Bybit v5 linear (USDT perp) adapter for the derivatives collector.
 *
 * Endpoints (verified live 2026-09-26, all HTTP 200):
 *   OI      v5/market/open-interest   → list[0].openInterest (base coin),
 *                                       openInterestValue (USD), timestamp
 *   funding v5/market/tickers         → fundingRate, nextFundingTime, markPrice,
 *                                       indexPrice, fundingIntervalHour, bid1Price/ask1Price
 *   LSR     v5/market/account-ratio   → buyRatio, sellRatio, timestamp
 *   stream  wss://stream.bybit.com/v5/public/linear  (topic allLiquidation.<SYMBOL>)
 *
 * Liquidation side semantics (Bybit docs, allLiquidation):
 *   "When you receive a Buy update, this means that a long position has
 *    been liquidated" → S:"Buy" ⇒ liquidated side = long.
 *
 * v5 answers are wrapped in {retCode, retMsg, result} — every adapter
 * checks retCode so a venue-side rejection is an error, not empty data.
 * ============================================================ */

const NAME = "bybit";
const REST = "https://api.bybit.com";
const WS = "wss://stream.bybit.com/v5/public/linear";
const CATEGORY = "linear";

const CAPABILITIES = Object.freeze({
    openInterest: true,
    funding: true,
    predictedFunding: false,
    longShortRatio: true,
    liquidations: true
});

function symbolFor(symbol) {
    return String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* v5 returns HTTP 200 for business errors too — fail loudly instead. */
function unwrap(body, source) {
    if (!body || typeof body !== "object") return null;
    if (Number(body.retCode) !== 0) {
        throw new Error(`bybit ${source} retCode=${body.retCode} ${body.retMsg || ""}`.trim());
    }
    return body.result || null;
}

function requests(symbol, { period = "5m" } = {}) {
    const venueSymbol = symbolFor(symbol);
    return {
        openInterest: {
            url: `${REST}/v5/market/open-interest?category=${CATEGORY}&symbol=${venueSymbol}&intervalTime=5min&limit=1`
        },
        funding: {
            url: `${REST}/v5/market/tickers?category=${CATEGORY}&symbol=${venueSymbol}`
        },
        longShortRatio: {
            url: `${REST}/v5/market/account-ratio?category=${CATEGORY}&symbol=${venueSymbol}&period=${period === "5m" ? "5min" : period}&limit=1`
        }
    };
}

function parseOpenInterest(body) {
    const result = unwrap(body, "open-interest");
    const row = result && Array.isArray(result.list) ? result.list[0] : null;
    if (!row) return null;

    return {
        oiContracts: row.openInterest,
        oiBase: row.openInterest,
        oiUsd: row.openInterestValue,
        timestamp: row.timestamp
    };
}

function parseFunding(body) {
    const result = unwrap(body, "tickers");
    const row = result && Array.isArray(result.list) ? result.list[0] : null;
    if (!row) return null;

    return {
        rate: row.fundingRate,
        nextFundingTime: row.nextFundingTime,
        intervalHours: row.fundingIntervalHour,
        markPrice: row.markPrice,
        indexPrice: row.indexPrice,
        timestamp: body.time
    };
}

function parseLongShortRatio(body) {
    const result = unwrap(body, "account-ratio");
    const row = result && Array.isArray(result.list) ? result.list[0] : null;
    if (!row) return null;

    return {
        longAccount: row.buyRatio,
        shortAccount: row.sellRatio,
        timestamp: row.timestamp
    };
}

function parseLiquidation(message) {
    const row = message && Array.isArray(message.data) ? message.data[0] : null;
    if (!row || !row.s) return null;

    return {
        symbol: row.s,
        orderSide: String(row.S || "").toLowerCase() || null,
        liquidatedSide: String(row.S || "").toLowerCase() === "buy" ? "long" : "short",
        price: row.p,
        qty: row.v,
        timestamp: row.T || message.ts
    };
}

module.exports = {
    name: NAME,
    capabilities: CAPABILITIES,
    symbolFor,
    requests,
    parse: { openInterest: parseOpenInterest, funding: parseFunding, longShortRatio: parseLongShortRatio },
    liquidation: {
        url: WS,
        subscribe: (symbol) => ({ op: "subscribe", args: [`allLiquidation.${symbolFor(symbol)}`] }),
        /* Bybit pushes snapshots of every symbol on the topic; keep ours only. */
        filter: (message, ctx) => !ctx || !ctx.venueSymbol || !message || message.topic === `allLiquidation.${ctx.venueSymbol}`,
        parse: parseLiquidation
    }
};

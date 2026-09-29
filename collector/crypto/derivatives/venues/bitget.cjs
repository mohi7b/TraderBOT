/* ============================================================
 * File: collector/crypto/derivatives/venues/bitget.cjs
 * Section: collector/crypto/derivatives/venues
 * Version: 1.0.0
 *
 * Role:
 *   Bitget USDT-FUTURES adapter for the derivatives collector.
 *
 * Endpoints (verified live 2026-09-26, all HTTP 200):
 *   OI      v2/mix/market/open-interest    → data.openInterestList[0].size (coin), ts
 *   funding v2/mix/market/ticker           → fundingRate, markPrice, indexPrice,
 *                                            holdingAmount, lastPr, ts
 *           v2/mix/market/funding-time     → nextFundingTime, ratePeriod (hours)
 *   LSR     v2/mix/market/position-long-short
 *                                          → rows with longPositionRatio,
 *                                            shortPositionRatio,
 *                                            longShortPositionRatio, ts (oldest first)
 *   stream  wss://ws.bitget.com/v2/ws/public  (channel "liquidation")
 *
 * Liquidation side semantics: the liquidation push carries the LIQUIDATION
 * ORDER side (buy/sell); a long position is closed out by a sell order.
 * If Bitget ever publishes the *position* side instead, flip the single
 * constant LONG_LIQUIDATION_ORDER_SIDE below.
 *
 * Bitget answers {code:"00000"} on success; anything else is an error.
 * ============================================================ */

const NAME = "bitget";
const REST = "https://api.bitget.com";
const WS = "wss://ws.bitget.com/v2/ws/public";
const PRODUCT_TYPE = "usdt-futures";

const LONG_LIQUIDATION_ORDER_SIDE = "sell";

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

function unwrap(body, source) {
    if (!body || typeof body !== "object") return null;
    if (String(body.code) !== "00000") {
        throw new Error(`bitget ${source} code=${body.code} ${body.msg || ""}`.trim());
    }
    return body.data === undefined ? null : body.data;
}

function requests(symbol, { period = "5m" } = {}) {
    const venueSymbol = symbolFor(symbol);
    return {
        openInterest: {
            url: `${REST}/api/v2/mix/market/open-interest?symbol=${venueSymbol}&productType=${PRODUCT_TYPE}`
        },
        funding: {
            url: `${REST}/api/v2/mix/market/ticker?symbol=${venueSymbol}&productType=${PRODUCT_TYPE}`
        },
        fundingTime: {
            url: `${REST}/api/v2/mix/market/funding-time?symbol=${venueSymbol}&productType=${PRODUCT_TYPE}`
        },
        longShortRatio: {
            url: `${REST}/api/v2/mix/market/position-long-short?symbol=${venueSymbol}&productType=${PRODUCT_TYPE}&period=${period}`
        }
    };
}

function parseOpenInterest(body) {
    const data = unwrap(body, "open-interest");
    const row = data && Array.isArray(data.openInterestList) ? data.openInterestList[0] : null;
    if (!row) return null;

    return {
        oiBase: row.size,
        timestamp: data.ts
    };
}

function parseFunding(body) {
    const data = unwrap(body, "ticker");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
        rate: row.fundingRate,
        markPrice: row.markPrice,
        indexPrice: row.indexPrice,
        timestamp: row.ts
    };
}

function parseFundingTime(body) {
    const data = unwrap(body, "funding-time");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return { nextFundingTime: row.nextFundingTime, intervalHours: row.ratePeriod };
}

/* Rows are oldest-first — the newest bucket is the last one. */
function parseLongShortRatio(body) {
    const data = unwrap(body, "position-long-short");
    const rows = Array.isArray(data) ? data : [];
    const newest = rows[rows.length - 1];
    if (!newest) return null;

    return {
        longAccount: newest.longPositionRatio,
        shortAccount: newest.shortPositionRatio,
        ratio: newest.longShortPositionRatio,
        timestamp: newest.ts
    };
}

function parseLiquidation(message) {
    const row = message && Array.isArray(message.data) ? message.data[0] : null;
    if (!row) return null;

    const orderSide = String(row.side || "").toLowerCase() || null;
    return {
        symbol: row.instId,
        orderSide,
        liquidatedSide: orderSide === LONG_LIQUIDATION_ORDER_SIDE ? "long" : "short",
        price: row.px,
        qty: row.sz,
        timestamp: row.ts
    };
}

module.exports = {
    name: NAME,
    capabilities: CAPABILITIES,
    symbolFor,
    requests,
    parse: {
        openInterest: parseOpenInterest,
        funding: parseFunding,
        fundingTime: parseFundingTime,
        longShortRatio: parseLongShortRatio
    },
    liquidation: {
        url: WS,
        subscribe: (symbol) => ({
            op: "subscribe",
            args: [{ instType: "USDT-FUTURES", channel: "liquidation", instId: symbolFor(symbol) }]
        }),
        filter: (message, ctx) => !ctx || !ctx.venueSymbol || !message || !message.data
            || message.data.some((row) => row.instId === ctx.venueSymbol),
        parse: parseLiquidation
    }
};

/* ============================================================
 * File: collector/crypto/derivatives/venues/binance.cjs
 * Section: collector/crypto/derivatives/venues
 * Version: 1.0.0
 *
 * Role:
 *   Binance USDT-M futures adapter for the derivatives collector.
 *
 * Endpoints (verified live 2026-09-26, all HTTP 200):
 *   OI      fapi/v1/openInterest                       → openInterest (base coin), time
 *   funding fapi/v1/premiumIndex                       → lastFundingRate, nextFundingTime,
 *                                                        markPrice, indexPrice, time
 *   LSR     futures/data/globalLongShortAccountRatio    → longAccount, shortAccount,
 *                                                        longShortRatio, timestamp
 *   stream  wss://fstream.binance.com/ws/!forceOrder@arr
 *
 * Liquidation side semantics:
 *   forceOrder.o.S is the side of the LIQUIDATION ORDER.
 *   A long position is liquidated by selling → S:"SELL" ⇒ liquidated side = long.
 *
 * The parse* functions are pure: they take an already-fetched body and
 * return the canonical *input* fields. The collector then runs them
 * through core/canonical.cjs, which is the single place that enforces
 * the "finite number or null" contract.
 * ============================================================ */

const NAME = "binance";
const REST = "https://fapi.binance.com";
const WS = "wss://fstream.binance.com/ws/!forceOrder@arr";

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

function requests(symbol, { period = "5m" } = {}) {
    const venueSymbol = symbolFor(symbol);
    return {
        openInterest: { url: `${REST}/fapi/v1/openInterest?symbol=${venueSymbol}` },
        funding: { url: `${REST}/fapi/v1/premiumIndex?symbol=${venueSymbol}` },
        longShortRatio: {
            url: `${REST}/futures/data/globalLongShortAccountRatio?symbol=${venueSymbol}&period=${period}&limit=1`
        }
    };
}

/* OI is reported in the base coin, the mark price turns it into USD. */
function parseOpenInterest(body) {
    if (!body || !body.symbol) return null;
    return {
        oiContracts: body.openInterest,
        oiBase: body.openInterest,
        timestamp: body.time
    };
}

/* premiumIndex merges funding + mark/index price, so it also feeds OI in USD. */
function parseFunding(body) {
    if (!body || !body.symbol) return null;
    return {
        rate: body.lastFundingRate,
        nextFundingTime: body.nextFundingTime,
        intervalHours: 8,
        markPrice: body.markPrice,
        indexPrice: body.indexPrice,
        timestamp: body.time
    };
}

/* The API returns an array; the first row is the newest bucket. */
function parseLongShortRatio(body) {
    const row = Array.isArray(body) ? body[0] : null;
    if (!row) return null;
    return {
        longAccount: row.longAccount,
        shortAccount: row.shortAccount,
        ratio: row.longShortRatio,
        timestamp: row.timestamp
    };
}

function parseLiquidation(message) {
    const order = message && (message.o || (message.data && message.data.o));
    if (!order || !order.s) return null;

    return {
        symbol: order.s,
        orderSide: String(order.S || "").toLowerCase() || null,
        liquidatedSide: String(order.S || "").toUpperCase() === "SELL" ? "long" : "short",
        price: order.ap || order.p,
        qty: order.q,
        timestamp: message.E
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
        /* !forceOrder@arr is a global stream: subscribing is the connect itself. */
        subscribe: () => null,
        parse: parseLiquidation
    }
};

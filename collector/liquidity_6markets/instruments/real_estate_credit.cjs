/* ============================================================
 * File: collector/liquidity_6markets/instruments/real_estate_credit.cjs
 * Section: collector/liquidity_6markets/instruments
 * Version: 1.0.0
 *
 * Role:
 *   The macro leg that a tradable price feed cannot cover: credit
 *   spreads and housing. FRED carries these as official series, so they
 *   arrive as levels (percent / index), never as a fake quote:
 *
 *     HY OAS / IG OAS        corporate credit stress (%)
 *     MORTGAGE30US           30-year mortgage rate (%)
 *     CSUSHPINSA             Case-Shiller national home price index
 *     VNQ                    an actual tradable REIT (has a real quote)
 *
 *   VNQ is the one instrument here with a market price, so it is also the
 *   one with a second venue (stooq) and therefore a spread. The macro
 *   series stay single-source on purpose — a spread between "the OAS"
 *   and a differently-constructed index would be noise dressed as signal.
 * ============================================================ */

const { ASSET_CLASS } = require("../../crypto/common/envelope.cjs");
const { createInstrument } = require("../core/instrument.cjs");

const MARKET_ID = "real_estate_credit";
const EOD = 24 * 60 * 60 * 1000;

const INSTRUMENTS = Object.freeze([
    createInstrument({
        id: "USHYOAS",
        assetClass: ASSET_CLASS.REAL_ESTATE_CREDIT,
        kind: "credit",
        quote: null,
        sourceMarket: "credit_spread_percent",
        freshnessMs: EOD,
        symbols: { fred: "BAMLH0A0HYM2" }
    }),
    createInstrument({
        id: "USIGOAS",
        assetClass: ASSET_CLASS.REAL_ESTATE_CREDIT,
        kind: "credit",
        quote: null,
        sourceMarket: "credit_spread_percent",
        freshnessMs: EOD,
        symbols: { fred: "BAMLC0A0CM" }
    }),
    createInstrument({
        id: "MORTGAGE30",
        assetClass: ASSET_CLASS.REAL_ESTATE_CREDIT,
        kind: "rate",
        quote: null,
        sourceMarket: "mortgage_rate_percent",
        freshnessMs: EOD,
        symbols: { fred: "MORTGAGE30US" }
    }),
    createInstrument({
        id: "HOMEPRICE",
        assetClass: ASSET_CLASS.REAL_ESTATE_CREDIT,
        kind: "housing",
        quote: null,
        sourceMarket: "home_price_index",
        freshnessMs: 32 * 24 * 60 * 60 * 1000, /* Case-Shiller is monthly */
        symbols: { fred: "CSUSHPINSA" }
    }),
    createInstrument({
        id: "VNQ",
        assetClass: ASSET_CLASS.REAL_ESTATE_CREDIT,
        kind: "reit",
        quote: "USD",
        sourceMarket: "reit_etf",
        symbols: { yahoo: "VNQ", stooq: "vnq.us" }
    })
]);

module.exports = { MARKET_ID, ASSET_CLASS: ASSET_CLASS.REAL_ESTATE_CREDIT, INSTRUMENTS };

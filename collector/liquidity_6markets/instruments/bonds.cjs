/* ============================================================
 * File: collector/liquidity_6markets/instruments/bonds.cjs
 * Section: collector/liquidity_6markets/instruments
 * Version: 1.0.0
 *
 * Role:
 *   The sovereign curve, as *yields in percent* — the number the market
 *   actually quotes and the number the macro layer means by "the 10-year".
 *
 *   Every instrument carries the FRED series id (DGS2/DGS5/DGS10/DGS30)
 *   and Stooq's EOD yield series, so each tenor has two independent
 *   sources and the spread between them is a real dislocations reading.
 *
 *   Deliberately NOT mapped: Yahoo's ^TNX/^FVX/^TYX. Those are CBOE
 *   *index* quotes (scaled, index-style) sitting next to percent-quoted
 *   series; mixing the two in one instrument would manufacture a spread
 *   of thousands of basis points out of a unit mismatch. The liquidity
 *   layer refuses to invent a dislocation.
 *
 *   Yield series publish once per business day, so both the instrument
 *   and the venues declare long freshness windows.
 * ============================================================ */

const { ASSET_CLASS } = require("../../crypto/common/envelope.cjs");
const { createInstrument } = require("../core/instrument.cjs");

const MARKET_ID = "bonds";
const EOD = 24 * 60 * 60 * 1000;

const INSTRUMENTS = Object.freeze([
    createInstrument({
        id: "US02Y",
        assetClass: ASSET_CLASS.BONDS,
        kind: "yield",
        quote: null,
        sourceMarket: "yield_percent",
        freshnessMs: EOD,
        symbols: { fred: "DGS2", stooq: "2usy.b" }
    }),
    createInstrument({
        id: "US05Y",
        assetClass: ASSET_CLASS.BONDS,
        kind: "yield",
        quote: null,
        sourceMarket: "yield_percent",
        freshnessMs: EOD,
        symbols: { fred: "DGS5", stooq: "5usy.b" }
    }),
    createInstrument({
        id: "US10Y",
        assetClass: ASSET_CLASS.BONDS,
        kind: "yield",
        quote: null,
        sourceMarket: "yield_percent",
        freshnessMs: EOD,
        symbols: { fred: "DGS10", stooq: "10usy.b" }
    }),
    createInstrument({
        id: "US30Y",
        assetClass: ASSET_CLASS.BONDS,
        kind: "yield",
        quote: null,
        sourceMarket: "yield_percent",
        freshnessMs: EOD,
        symbols: { fred: "DGS30", stooq: "30usy.b" }
    })
]);

module.exports = { MARKET_ID, ASSET_CLASS: ASSET_CLASS.BONDS, INSTRUMENTS };

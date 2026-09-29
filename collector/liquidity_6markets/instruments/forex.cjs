/* ============================================================
 * File: collector/liquidity_6markets/instruments/forex.cjs
 * Section: collector/liquidity_6markets/instruments
 * Version: 1.0.0
 *
 * Role:
 *   The FX leg: the seven majors plus the Fed's broad trade-weighted
 *   dollar index. Every pair is spelled once per provider, which is what
 *   makes a genuine cross-venue spread measurable (yahoo intraday,
 *   stooq EOD, Twelve Data with real bid/ask, Alpha Vantage's
 *   exchange-rate function).
 *
 *   USDTWI is quoted by FRED only: the broad index and the DXY are
 *   different baskets, so putting them in one instrument would create a
 *   fake spread. A single-source instrument reports no spread — which is
 *   the truth, not a gap.
 * ============================================================ */

const { ASSET_CLASS } = require("../../crypto/common/envelope.cjs");
const { createInstrument } = require("../core/instrument.cjs");

const MARKET_ID = "forex";
const EOD = 12 * 60 * 60 * 1000; /* a daily series must not look stale at 90s */

const INSTRUMENTS = Object.freeze([
    createInstrument({
        id: "EURUSD",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "USD",
        sourceMarket: "fx_spot",
        tickSize: 0.00001,
        symbols: { yahoo: "EURUSD=X", stooq: "eurusd", twelvedata: "EUR/USD", alphavantage: "EURUSD" }
    }),
    createInstrument({
        id: "GBPUSD",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "USD",
        sourceMarket: "fx_spot",
        tickSize: 0.00001,
        symbols: { yahoo: "GBPUSD=X", stooq: "gbpusd", twelvedata: "GBP/USD", alphavantage: "GBPUSD" }
    }),
    createInstrument({
        id: "USDJPY",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "JPY",
        sourceMarket: "fx_spot",
        tickSize: 0.001,
        /* Yahoo spells the dollar leg as the bare counter currency. */
        symbols: { yahoo: "JPY=X", stooq: "usdjpy", twelvedata: "USD/JPY", alphavantage: "USDJPY" }
    }),
    createInstrument({
        id: "AUDUSD",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "USD",
        sourceMarket: "fx_spot",
        tickSize: 0.00001,
        symbols: { yahoo: "AUDUSD=X", stooq: "audusd", twelvedata: "AUD/USD", alphavantage: "AUDUSD" }
    }),
    createInstrument({
        id: "USDCAD",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "CAD",
        sourceMarket: "fx_spot",
        tickSize: 0.00001,
        symbols: { yahoo: "CAD=X", stooq: "usdcad", twelvedata: "USD/CAD", alphavantage: "USDCAD" }
    }),
    createInstrument({
        id: "USDCHF",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "CHF",
        sourceMarket: "fx_spot",
        tickSize: 0.00001,
        symbols: { yahoo: "CHF=X", stooq: "usdchf", twelvedata: "USD/CHF" }
    }),
    createInstrument({
        id: "USDCNH",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: "CNH",
        sourceMarket: "fx_offshore",
        tickSize: 0.0001,
        symbols: { yahoo: "CNH=X", stooq: "usdcnh", twelvedata: "USD/CNH" }
    }),
    createInstrument({
        id: "USDTWI",
        assetClass: ASSET_CLASS.FOREX,
        kind: "fx",
        quote: null,
        sourceMarket: "fx_index",
        freshnessMs: EOD,
        symbols: { fred: "DTWEXBGS" }
    })
]);

module.exports = { MARKET_ID, ASSET_CLASS: ASSET_CLASS.FOREX, INSTRUMENTS };

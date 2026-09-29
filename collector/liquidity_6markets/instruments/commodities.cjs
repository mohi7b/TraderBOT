/* ============================================================
 * File: collector/liquidity_6markets/instruments/commodities.cjs
 * Section: collector/liquidity_6markets/instruments
 * Version: 1.0.0
 *
 * Role:
 *   Gold, silver, and the two crude grades plus natural gas. The metals
 *   are quoted as spot pairs (the same way FX is quoted, so providers
 *   that split a pair can serve them) while the energy legs are the
 *   front-month futures contract, which is what the market actually
 *   trades — and the instrument says so through sourceMarket.
 *
 * Symbols are the providers' own spellings; a provider that cannot carry
 * an instrument is simply not listed for it, and the instrument then
 * reports a spread only over the venues that do.
 * ============================================================ */

const { ASSET_CLASS } = require("../../crypto/common/envelope.cjs");
const { createInstrument } = require("../core/instrument.cjs");

const MARKET_ID = "commodities";

const INSTRUMENTS = Object.freeze([
    createInstrument({
        id: "XAUUSD",
        assetClass: ASSET_CLASS.COMMODITIES,
        kind: "metal",
        quote: "USD",
        sourceMarket: "metal_spot",
        tickSize: 0.01,
        symbols: { yahoo: "GC=F", stooq: "xauusd", twelvedata: "XAU/USD", alphavantage: "XAUUSD" }
    }),
    createInstrument({
        id: "XAGUSD",
        assetClass: ASSET_CLASS.COMMODITIES,
        kind: "metal",
        quote: "USD",
        sourceMarket: "metal_spot",
        tickSize: 0.001,
        symbols: { yahoo: "SI=F", stooq: "xagusd", twelvedata: "XAG/USD" }
    }),
    createInstrument({
        id: "WTIUSD",
        assetClass: ASSET_CLASS.COMMODITIES,
        kind: "energy",
        quote: "USD",
        marketType: "futures",
        sourceMarket: "energy_futures",
        tickSize: 0.01,
        /* Front-month WTI: Yahoo's CL=F continuous contract, Stooq's cl.f. */
        symbols: { yahoo: "CL=F", stooq: "cl.f", twelvedata: "WTI/USD" }
    }),
    createInstrument({
        id: "BRENTUSD",
        assetClass: ASSET_CLASS.COMMODITIES,
        kind: "energy",
        quote: "USD",
        marketType: "futures",
        sourceMarket: "energy_futures",
        tickSize: 0.01,
        symbols: { yahoo: "BZ=F", stooq: "cb.f" }
    }),
    createInstrument({
        id: "NATGAS",
        assetClass: ASSET_CLASS.COMMODITIES,
        kind: "energy",
        quote: "USD",
        marketType: "futures",
        sourceMarket: "energy_futures",
        tickSize: 0.001,
        symbols: { yahoo: "NG=F", stooq: "ng.f" }
    })
]);

module.exports = { MARKET_ID, ASSET_CLASS: ASSET_CLASS.COMMODITIES, INSTRUMENTS };

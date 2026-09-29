/* ============================================================
 * File: collector/liquidity_6markets/instruments/indices.cjs
 * Section: collector/liquidity_6markets/instruments
 * Version: 1.0.0
 *
 * Role:
 *   Cash equity indices. These are the instruments where "liquidity"
 *   means the depth of the *index future/ETF complex* rather than a
 *   quotable book, so the frame says marketType null and the provenance
 *   word says cash_index: nothing downstream should assume an index
 *   level is a tradable price.
 *
 *   Symbols are spelled per venue (yahoo ^GSPC, stooq ^spx). A daily
 *   venue (stooq) and an intraday one (yahoo) coexist inside the same
 *   instrument; the flow engine judges each venue by its own cadence.
 * ============================================================ */

const { ASSET_CLASS } = require("../../crypto/common/envelope.cjs");
const { createInstrument } = require("../core/instrument.cjs");

const MARKET_ID = "indices";

const INSTRUMENTS = Object.freeze([
    createInstrument({
        id: "SPX",
        assetClass: ASSET_CLASS.INDICES,
        kind: "index",
        quote: null,
        sourceMarket: "cash_index",
        symbols: { yahoo: "^GSPC", stooq: "^spx" }
    }),
    createInstrument({
        id: "NDX",
        assetClass: ASSET_CLASS.INDICES,
        kind: "index",
        quote: null,
        sourceMarket: "cash_index",
        symbols: { yahoo: "^NDX", stooq: "^ndx" }
    }),
    createInstrument({
        id: "DJI",
        assetClass: ASSET_CLASS.INDICES,
        kind: "index",
        quote: null,
        sourceMarket: "cash_index",
        symbols: { yahoo: "^DJI", stooq: "^dji" }
    }),
    createInstrument({
        id: "DAX",
        assetClass: ASSET_CLASS.INDICES,
        kind: "index",
        quote: null,
        sourceMarket: "cash_index",
        symbols: { yahoo: "^GDAXI", stooq: "^dax" }
    }),
    createInstrument({
        id: "NIKKEI",
        assetClass: ASSET_CLASS.INDICES,
        kind: "index",
        quote: null,
        sourceMarket: "cash_index",
        symbols: { yahoo: "^N225", stooq: "^nkx" }
    })
]);

module.exports = { MARKET_ID, ASSET_CLASS: ASSET_CLASS.INDICES, INSTRUMENTS };

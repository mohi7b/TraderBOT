/* ============================================================
 * File: collector/liquidity_6markets/instruments/index.cjs
 * Section: collector/liquidity_6markets/instruments
 * Version: 1.0.0
 *
 * Role:
 *   The six-market catalog: the directory word (real_estate_credit), the
 *   frame word (realestatecredit) and the instruments that belong to each
 *   market live together here, so "how many markets do we cover" is one
 *   function call instead of a grep.
 *
 *   A catalog is data, not behaviour: it can be built with a subset of
 *   markets (a test, a single-market deployment) and merged with extra
 *   instruments without touching the collector.
 * ============================================================ */

const crypto = require("./crypto.cjs");
const forex = require("./forex.cjs");
const commodities = require("./commodities.cjs");
const indices = require("./indices.cjs");
const bonds = require("./bonds.cjs");
const realEstateCredit = require("./real_estate_credit.cjs");

/** The six market modules, in the order the roadmap lists them. */
const MARKET_MODULES = Object.freeze([crypto, forex, commodities, indices, bonds, realEstateCredit]);

/** Directory ids (they are also the keys of the roadmap's tree). */
const MARKET_IDS = Object.freeze(MARKET_MODULES.map((market) => market.MARKET_ID));

/**
 * @param {object} [options]
 * @param {Array} [options.markets]    market modules (default: all six)
 * @param {Array} [options.instruments] extra instruments to append
 */
function createInstrumentCatalog({ markets = MARKET_MODULES, instruments = [] } = {}) {
    const marketList = markets.map((market) => Object.freeze({
        id: market.MARKET_ID,
        assetClass: market.ASSET_CLASS,
        instruments: Object.freeze(market.INSTRUMENTS)
    }));

    const all = [];
    for (const market of marketList) all.push(...market.instruments);
    all.push(...instruments);

    const byId = new Map();
    for (const instrument of all) {
        if (byId.has(instrument.id)) throw new Error(`duplicate instrument id "${instrument.id}"`);
        byId.set(instrument.id, instrument);
    }

    return {
        markets: () => marketList.map((market) => market.id),
        marketModules: () => marketList,
        instruments: () => all,
        ids: () => [...byId.keys()],
        size: () => byId.size,
        has: (id) => byId.has(id),
        get(id) {
            const instrument = byId.get(id);
            if (!instrument) throw new RangeError(`unknown instrument "${id}"`);
            return instrument;
        },
        /** Instruments of one market (by directory id or frame asset class). */
        forMarket(marketId) {
            const market = marketList.find((entry) => entry.id === marketId || entry.assetClass === marketId);
            return market ? [...market.instruments] : [];
        },
        /** Counts per market — the honest version of "6 markets covered". */
        coverage() {
            return marketList.map((market) => Object.freeze({
                market: market.id,
                assetClass: market.assetClass,
                instruments: market.instruments.length,
                venues: new Set(market.instruments.flatMap((instrument) => Object.keys(instrument.symbols))).size
            }));
        }
    };
}

/** The default six-market catalog. */
function defaultCatalog() {
    return createInstrumentCatalog();
}

module.exports = { MARKET_MODULES, MARKET_IDS, createInstrumentCatalog, defaultCatalog };

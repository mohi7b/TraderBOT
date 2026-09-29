/* ============================================================
 * File: collector/liquidity_6markets/core/instrument.cjs
 * Section: collector/liquidity_6markets/core
 * Version: 1.0.0
 *
 * Role:
 *   One instrument = one tradable thing inside one of the six
 *   liquidity markets, described in the vocabulary the rest of the
 *   system already speaks:
 *
 *     assetClass   crypto | forex | commodities | indices | bonds |
 *                  realestatecredit        (envelope ASSET_CLASS)
 *     symbol       canonical, alphanumeric (EURUSD, XAUUSD, SPX, US10Y)
 *     marketType   spot | futures | null   (envelope MARKET_TYPE only!)
 *     sourceMarket  the honest word of the venue: "fx_spot", "cash",
 *                   "yield", "credit_spread" — it travels as
 *                   provenance.sourceMarketType, never as a frame value.
 *
 *   symbols{} is the per-provider spelling of the same instrument
 *   (yahoo "EURUSD=X", stooq "eurusd", fred "DGS10"). Two providers on
 *   one instrument is what makes the cross-market spread real.
 * ============================================================ */

const { ASSET_CLASS, MARKET_TYPES } = require("../../crypto/common/envelope.cjs");

/** What the thing *is* (the flow maths differs per kind, not the frame). */
const INSTRUMENT_KINDS = Object.freeze(["crypto", "fx", "metal", "energy", "index", "yield", "credit", "rate", "housing", "reit"]);

/** Canonical instrument id: upper case, alphanumeric, no separators. */
function canonicalInstrumentId(id) {
    return String(id === null || id === undefined ? "" : id)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function assertAssetClass(assetClass) {
    if (!Object.values(ASSET_CLASS).includes(assetClass)) {
        throw new RangeError(`unknown assetClass "${assetClass}" (expected one of ${Object.values(ASSET_CLASS).join(", ")})`);
    }
    return assetClass;
}

/**
 * Splits a pair id into its two sides ("EURUSD" + quote "USD" → EUR/USD).
 * Some providers ask for the two currencies separately, so the split has
 * to be derivable from the canonical id alone.
 */
function splitPair(id, quote) {
    if (!quote || !id.endsWith(quote) || id.length <= quote.length) return { from: null, to: quote || null };
    return { from: id.slice(0, -quote.length), to: quote };
}

/**
 * @param {object} spec
 * @param {string} spec.id                  canonical symbol (EURUSD)
 * @param {string} spec.assetClass          envelope asset class
 * @param {string} spec.kind                INSTRUMENT_KINDS member
 * @param {string|null} [spec.quote]        quote currency / unit (USD)
 * @param {string|null} [spec.from]         base side for pair-style providers
 *                                          (default: id minus the quote suffix)
 * @param {string|null} [spec.to]           quote side (default: spec.quote)
 * @param {string|null} [spec.marketType]   spot | futures | null — frame value only
 * @param {string|null} [spec.sourceMarket] the venue's own word for the market
 * @param {object} [spec.symbols]           providerId → provider spelling
 * @param {number|null} [spec.tickSize]     smallest tradable increment
 * @param {number|null} [spec.freshnessMs]  how long a reading stays fresh
 *                                          (90s for a live quote, hours for
 *                                          an end-of-day series)
 */
function createInstrument(spec = {}) {
    const id = canonicalInstrumentId(spec.id);
    if (!id) throw new TypeError("instrument.id is required");

    const assetClass = assertAssetClass(spec.assetClass);
    if (!INSTRUMENT_KINDS.includes(spec.kind)) {
        throw new RangeError(`unknown kind "${spec.kind}" (expected one of ${INSTRUMENT_KINDS.join(", ")})`);
    }

    const marketType = spec.marketType === undefined ? null : spec.marketType;
    if (marketType !== null && !MARKET_TYPES.includes(marketType)) {
        throw new RangeError(`marketType "${marketType}" is not a frame value (${MARKET_TYPES.join("|")} or null)`);
    }

    const symbols = { ...(spec.symbols || {}) };
    for (const [providerId, spelling] of Object.entries(symbols)) {
        if (typeof spelling !== "string" || spelling.trim() === "") {
            throw new TypeError(`instrument ${id}: symbol for provider "${providerId}" must be a non-empty string`);
        }
    }

    const pair = splitPair(id, spec.quote || null);

    return Object.freeze({
        id,
        assetClass,
        kind: spec.kind,
        quote: spec.quote || null,
        from: spec.from || pair.from,
        to: spec.to || pair.to,
        marketType,
        /* The honest venue word; null means "the frame word covers it". */
        sourceMarket: spec.sourceMarket || null,
        symbols: Object.freeze(symbols),
        tickSize: Number.isFinite(spec.tickSize) && spec.tickSize > 0 ? spec.tickSize : null,
        freshnessMs: Number.isFinite(spec.freshnessMs) && spec.freshnessMs > 0 ? spec.freshnessMs : null
    });
}

/** Every provider that can quote this instrument. */
function providersOf(instrument) {
    return Object.keys((instrument && instrument.symbols) || {});
}

/** The provider's spelling of the instrument, or null when it cannot quote it. */
function symbolFor(instrument, providerId) {
    const spelling = (instrument && instrument.symbols) || {};
    return Object.prototype.hasOwnProperty.call(spelling, providerId) ? spelling[providerId] : null;
}

/** Envelope provenance for a reading of this instrument (never a frame field). */
function provenanceOf(instrument, extra = null) {
    return {
        origin: "liquidity-6markets",
        kind: instrument.kind,
        sourceMarketType: instrument.sourceMarket || null,
        ...(extra || {})
    };
}

module.exports = {
    INSTRUMENT_KINDS,
    canonicalInstrumentId,
    assertAssetClass,
    splitPair,
    createInstrument,
    providersOf,
    symbolFor,
    provenanceOf
};

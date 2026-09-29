/* ============================================================
 * File: collector/crypto/onchain/core/subject.cjs
 * Section: collector/crypto/onchain/core
 * Version: 1.0.0
 *
 * Role:
 *   One subject = the thing an on-chain reading is *about*. Four kinds
 *   exist, because the four answer different questions:
 *
 *     chain       BTC            the network itself (mempool, blocks, supply)
 *     holder      BINANCE        an exchange whose reserves we follow
 *     stablecoin  USDT           a pegged asset's supply and lending rates
 *     fund        IBIT           a listed fund that holds the asset
 *
 *   A subject carries the frame vocabulary (envelope ASSET_CLASS) plus the
 *   honest words that do *not* belong in the frame: the network, the issuer,
 *   the listing venue, the underlying asset. Those travel as provenance, the
 *   same way the liquidity collector keeps "cash"/"yield" out of marketType.
 *
 *   `symbols{}` is the per-provider spelling (defillama "Binance",
 *   mempool "bitcoin", yahoo "IBIT"), because the on-chain providers are
 *   list-shaped APIs whose nouns are the providers' own.
 * ============================================================ */

const { ASSET_CLASS } = require("../../common/envelope.cjs");

/** What the subject *is* — the provenance word, never a frame value. */
const SUBJECT_KINDS = Object.freeze(["chain", "holder", "stablecoin", "fund"]);

/** Canonical subject id: upper case, alphanumeric (CRYPTOCOM, USDT, IBIT). */
function canonicalSubjectId(id) {
    return String(id === null || id === undefined ? "" : id)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function assertAssetClass(assetClass) {
    const known = Object.values(ASSET_CLASS);
    if (!known.includes(assetClass)) {
        throw new RangeError(`unknown assetClass "${assetClass}" (expected one of ${known.join(", ")})`);
    }
    return assetClass;
}

/**
 * @param {object} spec
 * @param {string} spec.id            canonical subject id (BTC, BINANCE, USDT, IBIT)
 * @param {string} spec.kind          SUBJECT_KINDS member
 * @param {string} spec.name          human name as the world writes it
 * @param {string} [spec.assetClass]  envelope asset class (default crypto)
 * @param {string|null} [spec.network] chain the subject lives on ("bitcoin")
 * @param {string|null} [spec.issuer]  issuer/operator ("tether", "blackrock")
 * @param {string|null} [spec.listing] listing venue of a fund ("nasdaq")
 * @param {string|null} [spec.underlying] asset a fund holds ("BTC")
 * @param {object} [spec.symbols]      providerId → provider spelling
 */
function createSubject(spec = {}) {
    const id = canonicalSubjectId(spec.id);
    if (!id) throw new TypeError("subject.id is required");
    if (!SUBJECT_KINDS.includes(spec.kind)) {
        throw new RangeError(`unknown kind "${spec.kind}" (expected one of ${SUBJECT_KINDS.join(", ")})`);
    }

    const symbols = { ...(spec.symbols || {}) };
    for (const [providerId, spelling] of Object.entries(symbols)) {
        if (typeof spelling !== "string" || spelling.trim() === "") {
            throw new TypeError(`subject ${id}: symbol for provider "${providerId}" must be a non-empty string`);
        }
    }

    return Object.freeze({
        id,
        kind: spec.kind,
        name: spec.name || id,
        assetClass: assertAssetClass(spec.assetClass || ASSET_CLASS.CRYPTO),
        /* Honest words that must never be squeezed into the frame: */
        network: spec.network || null,
        issuer: spec.issuer || null,
        listing: spec.listing || null,
        underlying: spec.underlying || null,
        symbols: Object.freeze(symbols)
    });
}

/** Every provider that can speak about this subject. */
function providersOf(subject) {
    return Object.keys((subject && subject.symbols) || {});
}

/** The provider's spelling of the subject, or null when it cannot speak of it. */
function symbolFor(subject, providerId) {
    const spelling = (subject && subject.symbols) || {};
    return Object.prototype.hasOwnProperty.call(spelling, providerId) ? spelling[providerId] : null;
}

/** Envelope provenance for a reading of this subject (never a frame field). */
function provenanceOf(subject, extra = null) {
    return {
        origin: "onchain",
        subjectKind: subject.kind,
        network: subject.network || null,
        issuer: subject.issuer || null,
        listing: subject.listing || null,
        underlying: subject.underlying || null,
        ...(extra || {})
    };
}

module.exports = {
    SUBJECT_KINDS,
    canonicalSubjectId,
    assertAssetClass,
    createSubject,
    providersOf,
    symbolFor,
    provenanceOf
};
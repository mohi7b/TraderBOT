/* ============================================================
 * File: collector/crypto/onchain/subjects/stablecoins.cjs
 * Section: collector/crypto/onchain/subjects
 * Version: 1.0.0
 *
 * Role:
 *   The pegged assets whose supply is the crypto market's own liquidity
 *   plumbing: new USDT/USDC is buying power, redeemed USDT/USDC is dry
 *   powder leaving. Each subject names its issuer, because *who* mints
 *   matters more than the symbol when a supply jump is judged.
 *
 *   The issuer is provenance, not a frame value: the envelope only has the
 *   seven asset classes, and a stablecoin is a crypto asset like any other.
 * ============================================================ */

const { ASSET_CLASS } = require("../../common/envelope.cjs");
const { createSubject } = require("../core/subject.cjs");

const GROUP_ID = "stablecoins";
const SUBJECT_KIND = "stablecoin";

const SUBJECTS = Object.freeze([
    createSubject({ id: "USDT", kind: SUBJECT_KIND, name: "Tether", issuer: "tether", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "USDT" } }),
    createSubject({ id: "USDC", kind: SUBJECT_KIND, name: "USD Coin", issuer: "circle", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "USDC" } }),
    createSubject({ id: "USDS", kind: SUBJECT_KIND, name: "Sky Dollar", issuer: "sky", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "USDS" } }),
    createSubject({ id: "DAI", kind: SUBJECT_KIND, name: "Dai", issuer: "sky", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "DAI" } }),
    createSubject({ id: "USDE", kind: SUBJECT_KIND, name: "Ethena USDe", issuer: "ethena", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "USDe" } }),
    createSubject({ id: "FDUSD", kind: SUBJECT_KIND, name: "First Digital USD", issuer: "first-digital", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "FDUSD" } }),
    createSubject({ id: "PYUSD", kind: SUBJECT_KIND, name: "PayPal USD", issuer: "paxos", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "PYUSD" } }),
    createSubject({ id: "TUSD", kind: SUBJECT_KIND, name: "TrueUSD", issuer: "trueusd", assetClass: ASSET_CLASS.CRYPTO, symbols: { "defillama-stablecoins": "TUSD" } })
]);

module.exports = { GROUP_ID, SUBJECT_KIND, SUBJECTS };

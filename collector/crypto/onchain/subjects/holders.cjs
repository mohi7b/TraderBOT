/* ============================================================
 * File: collector/crypto/onchain/subjects/holders.cjs
 * Section: collector/crypto/onchain/subjects
 * Version: 1.0.0
 *
 * Role:
 *   The custodians whose reserves we follow — the "whale/exchange flow"
 *   half of the module. A holder is matched against a *list* endpoint
 *   (DefiLlama's CEX transparency) by its provider spelling, normalised:
 *   "Crypto.com" and the id CRYPTOCOM are the same holder.
 *
 *   The list is curated on purpose. DefiLlama reports 88 exchanges; some
 *   are tiny, and a reserve series whose membership changes with every
 *   upstream edit cannot be compared over time. The collector therefore
 *   reports "12 tracked of 88 listed" instead of pretending to cover all
 *   of them — the number of untracked entries is part of every report.
 *
 *   Reserves are held in many assets at once and the upstream API does not
 *   split them per asset, so a holder reading carries no single-asset claim:
 *   the subject is the *holder*, not a coin.
 * ============================================================ */

const { ASSET_CLASS } = require("../../common/envelope.cjs");
const { createSubject } = require("../core/subject.cjs");

const GROUP_ID = "holders";
const SUBJECT_KIND = "holder";

const SUBJECTS = Object.freeze([
    createSubject({ id: "BINANCE", kind: SUBJECT_KIND, name: "Binance", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Binance" } }),
    createSubject({ id: "COINBASE", kind: SUBJECT_KIND, name: "Coinbase", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Coinbase" } }),
    createSubject({ id: "OKX", kind: SUBJECT_KIND, name: "OKX", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "OKX" } }),
    createSubject({ id: "BYBIT", kind: SUBJECT_KIND, name: "Bybit", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Bybit" } }),
    createSubject({ id: "KRAKEN", kind: SUBJECT_KIND, name: "Kraken", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Kraken" } }),
    createSubject({ id: "BITFINEX", kind: SUBJECT_KIND, name: "Bitfinex", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Bitfinex" } }),
    createSubject({ id: "GATE", kind: SUBJECT_KIND, name: "Gate.io", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Gate.io" } }),
    createSubject({ id: "HTX", kind: SUBJECT_KIND, name: "HTX", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "HTX" } }),
    createSubject({ id: "KUCOIN", kind: SUBJECT_KIND, name: "KuCoin", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "KuCoin" } }),
    createSubject({ id: "BITGET", kind: SUBJECT_KIND, name: "Bitget", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Bitget" } }),
    createSubject({ id: "MEXC", kind: SUBJECT_KIND, name: "MEXC", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "MEXC" } }),
    createSubject({ id: "CRYPTOCOM", kind: SUBJECT_KIND, name: "Crypto.com", assetClass: ASSET_CLASS.CRYPTO, symbols: { defillama: "Crypto.com" } })
]);

module.exports = { GROUP_ID, SUBJECT_KIND, SUBJECTS };

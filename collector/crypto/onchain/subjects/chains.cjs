/* ============================================================
 * File: collector/crypto/onchain/subjects/chains.cjs
 * Section: collector/crypto/onchain/subjects
 * Version: 1.0.0
 *
 * Role:
 *   The networks this collector can measure. One member today — Bitcoin —
 *   because mempool.space answers without a key. Ethereum is deliberately
 *   absent: the key-free sources that answered for BTC (mempool-style block
 *   and transfer feeds) have no equally honest counterpart yet, and a chain
 *   listed here is a promise that a real number follows.
 * ============================================================ */

const { ASSET_CLASS } = require("../../common/envelope.cjs");
const { createSubject } = require("../core/subject.cjs");

const GROUP_ID = "chains";
const SUBJECT_KIND = "chain";

const SUBJECTS = Object.freeze([
    createSubject({
        id: "BTC",
        kind: SUBJECT_KIND,
        name: "Bitcoin",
        assetClass: ASSET_CLASS.CRYPTO,
        network: "bitcoin",
        symbols: { mempool: "bitcoin", "blockchain-info": "BTC" }
    })
]);

module.exports = { GROUP_ID, SUBJECT_KIND, SUBJECTS };

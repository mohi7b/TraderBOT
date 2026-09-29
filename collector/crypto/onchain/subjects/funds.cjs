/* ============================================================
 * File: collector/crypto/onchain/subjects/funds.cjs
 * Section: collector/crypto/onchain/subjects
 * Version: 1.0.0
 *
 * Role:
 *   The listed funds that hold the asset — the institutional doorway. The
 *   subject is the *fund* (IBIT), the underlying is provenance (BTC), and
 *   the listing venue is carried per fund rather than assumed: the spot
 *   bitcoin funds are split across Nasdaq, NYSE Arca and Cboe.
 *
 *   A fund is not a coin. Its price is a share price, its volume is share
 *   volume, and neither is a bitcoin price — which is exactly why the
 *   frame keeps the fund as the symbol and the underlying in provenance.
 *
 *   What is *not* claimed here: net creations/redemptions. See README
 *   "known gaps" — every key-free source of shares outstanding that was
 *   tried refused, so the flow stays null with the reason attached instead
 *   of being estimated from price and volume.
 * ============================================================ */

const { ASSET_CLASS } = require("../../common/envelope.cjs");
const { createSubject } = require("../core/subject.cjs");

const GROUP_ID = "funds";
const SUBJECT_KIND = "fund";

function fund(id, name, issuer, listing, underlying, symbols) {
    return createSubject({ id, kind: SUBJECT_KIND, name, issuer, listing, underlying, assetClass: ASSET_CLASS.CRYPTO, symbols });
}

const SUBJECTS = Object.freeze([
    /* Spot bitcoin funds */
    fund("IBIT", "iShares Bitcoin Trust ETF", "blackrock", "nasdaq", "BTC", { yahoo: "IBIT", nasdaq: "IBIT" }),
    fund("FBTC", "Fidelity Wise Origin Bitcoin Fund", "fidelity", "cboe", "BTC", { yahoo: "FBTC", nasdaq: "FBTC" }),
    fund("GBTC", "Grayscale Bitcoin Trust ETF", "grayscale", "nysearca", "BTC", { yahoo: "GBTC", nasdaq: "GBTC" }),
    fund("BITB", "Bitwise Bitcoin ETF", "bitwise", "nysearca", "BTC", { yahoo: "BITB", nasdaq: "BITB" }),
    fund("ARKB", "ARK 21Shares Bitcoin ETF", "ark", "cboe", "BTC", { yahoo: "ARKB", nasdaq: "ARKB" }),
    fund("HODL", "VanEck Bitcoin ETF", "vaneck", "cboe", "BTC", { yahoo: "HODL", nasdaq: "HODL" }),
    fund("BTCO", "Invesco Galaxy Bitcoin ETF", "invesco", "cboe", "BTC", { yahoo: "BTCO", nasdaq: "BTCO" }),
    fund("BRRR", "Valkyrie Bitcoin Fund", "valkyrie", "nasdaq", "BTC", { yahoo: "BRRR", nasdaq: "BRRR" }),
    fund("EZBC", "Franklin Bitcoin ETF", "franklin", "cboe", "BTC", { yahoo: "EZBC", nasdaq: "EZBC" }),
    fund("BTCW", "WisdomTree Bitcoin Fund", "wisdomtree", "cboe", "BTC", { yahoo: "BTCW", nasdaq: "BTCW" }),
    /* Spot ether funds — same shape, different underlying */
    fund("ETHA", "iShares Ethereum Trust ETF", "blackrock", "nasdaq", "ETH", { yahoo: "ETHA", nasdaq: "ETHA" }),
    fund("FETH", "Fidelity Ethereum Fund", "fidelity", "cboe", "ETH", { yahoo: "FETH", nasdaq: "FETH" }),
    fund("ETHE", "Grayscale Ethereum Trust ETF", "grayscale", "nysearca", "ETH", { yahoo: "ETHE", nasdaq: "ETHE" }),
    fund("ETHW", "Bitwise Ethereum ETF", "bitwise", "nysearca", "ETH", { yahoo: "ETHW", nasdaq: "ETHW" }),
    /* 21Shares renamed CETH → TETH; Yahoo 404s on the old ticker and Nasdaq
     * answers the new one ("21Shares Ethereum ETF", BATS), verified 2026-09. */
    fund("TETH", "21Shares Ethereum ETF", "21shares", "cboe", "ETH", { yahoo: "TETH", nasdaq: "TETH" })
]);

module.exports = { GROUP_ID, SUBJECT_KIND, SUBJECTS };

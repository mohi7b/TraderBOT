/* ============================================================
 * File: collector/liquidity_6markets/instruments/crypto.cjs
 * Section: collector/liquidity_6markets/instruments
 * Version: 1.0.0
 *
 * Role:
 *   The crypto leg of the six markets. It is deliberately *not* a second
 *   crypto feed: these instruments point at the same public venues the
 *   realtime collector uses (binance, okx) so the liquidity layer can put
 *   all six markets on one axis, and they add a key-free daily series
 *   (yahoo) only to make a cross-venue spread exist.
 *
 *   The deep orderflow side of crypto (CVD, imbalance, liquidations)
 *   already lives in collector/crypto + analytics-engine; nothing here
 *   duplicates it.
 * ============================================================ */

const { ASSET_CLASS } = require("../../crypto/common/envelope.cjs");
const { createInstrument } = require("../core/instrument.cjs");

const MARKET_ID = "crypto";

const INSTRUMENTS = Object.freeze([
    createInstrument({
        id: "BTCUSDT",
        assetClass: ASSET_CLASS.CRYPTO,
        kind: "crypto",
        quote: "USDT",
        marketType: "spot",
        sourceMarket: "crypto_spot",
        cadenceMs: null,
        symbols: { binance: "BTCUSDT", okx: "BTC-USDT", twelvedata: "BTC/USDT", yahoo: "BTC-USD" }
    }),
    createInstrument({
        id: "ETHUSDT",
        assetClass: ASSET_CLASS.CRYPTO,
        kind: "crypto",
        quote: "USDT",
        marketType: "spot",
        sourceMarket: "crypto_spot",
        symbols: { binance: "ETHUSDT", okx: "ETH-USDT", twelvedata: "ETH/USDT", yahoo: "ETH-USD" }
    }),
    createInstrument({
        id: "SOLUSDT",
        assetClass: ASSET_CLASS.CRYPTO,
        kind: "crypto",
        quote: "USDT",
        marketType: "spot",
        sourceMarket: "crypto_spot",
        symbols: { binance: "SOLUSDT", okx: "SOL-USDT" }
    })
]);

module.exports = { MARKET_ID, ASSET_CLASS: ASSET_CLASS.CRYPTO, INSTRUMENTS };

/**
 * ============================================================
 *  File: exchange_root.cjs
 *  Path: collector/realtime/futures/exchanges/exchange_root.cjs
 *  Version: 5.0.1
 *
 *  Description:
 *      Root configuration for Binance Futures exchange.
 *      Provides WebSocket + REST endpoints for realtime collectors.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

module.exports = {
    ws: {
        primary: "wss://fstream.binance.com/ws",
        backup:  "wss://fstream.binance.com/stream"
    },

    rest: {
        base: "https://fapi.binance.com"
    }
};

/**
 * ============================================================
 *  File: exchange_root.cjs
 *  Path: collector/realtime/spot/exchanges/exchange_root.cjs
 *  Version: 3.0.0 (Cluster Mode)
 *
 *  Description:
 *      Root configuration for Binance Spot exchange.
 *      Provides WS endpoints for WSFailover engine.
 * ============================================================
 */

module.exports = {
    ws: {
        primary: "wss://stream.binance.com:9443/ws",
        backup:  "wss://stream.binance.com:443/ws"
    },

    rest: {
        base: "https://api.binance.com"
    }
};

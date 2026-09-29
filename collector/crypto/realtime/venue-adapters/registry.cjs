/* ============================================================
 * File: collector/crypto/realtime/venue-adapters/registry.cjs
 * Section: collector/crypto/realtime/venue-adapters
 *
 * Role:
 *   Static table of every realtime stream the section can start.
 *
 *   Every stream is reached through a lazy `load()` thunk so that no
 *   exchange module is evaluated until a request actually needs it.
 *
 *   `FUTURES_STREAM_ORDER` / `SPOT_STREAM_ORDER` reproduce the exact
 *   order used by the legacy collector/crypto/realtime/aanode/bootstrap.cjs
 *   (bybit first, then binance with its two REST pollers, then the
 *   rest), so a request produces the same upstream connection pattern.
 * ============================================================ */

const FUTURES_STREAM_ORDER = ["bybit", "binance", "bitget", "kucoin", "okx"];
const SPOT_STREAM_ORDER = ["bybit", "binance", "bitget", "kucoin", "okx"];

const SPECS = {
    /* ======================= FUTURES ======================= */
    futures: {
        bybit: [
            {
                key: "ws",
                kind: "websocket",
                load: () => require("../venues/bybit/futures/ws.cjs")
            }
        ],

        binance: [
            {
                key: "ws",
                kind: "websocket",
                load: () => require("../venues/binance/futures/ws.cjs")
            },
            {
                key: "open-interest",
                kind: "poller",
                intervalMs: 5000,
                load: () => require("../venues/binance/futures/open-interest.cjs")
            },
            {
                key: "market-poller",
                kind: "poller",
                intervalMs: 5000,
                load: () => require("../venues/binance/futures/market-poller.cjs")
            }
        ],

        bitget: [
            {
                key: "ws",
                kind: "websocket",
                load: () => require("../venues/bitget/futures/ws.cjs")
            }
        ],

        kucoin: [
            {
                key: "ws",
                kind: "websocket",
                load: () => require("../venues/kucoin/futures/ws.cjs")
            }
        ],

        okx: [
            {
                key: "ws",
                kind: "websocket",
                load: () => require("../venues/okx/futures/ws.cjs")
            }
        ]
    },

    /* ========================= SPOT ======================== */
    spot: {
        bybit: [
            {
                key: "ws",
                kind: "websocket",
                injectExchange: true,
                load: () => require("../venues/bybit/spot/ws.cjs")
            }
        ],

        binance: [
            {
                key: "ws",
                kind: "websocket",
                injectExchange: true,
                load: () => require("../venues/binance/spot/ws.cjs")
            }
        ],

        bitget: [
            {
                key: "ws",
                kind: "websocket",
                injectExchange: true,
                load: () => require("../venues/bitget/spot/ws.cjs")
            }
        ],

        kucoin: [
            {
                key: "ws",
                kind: "websocket",
                injectExchange: true,
                load: () => require("../venues/kucoin/spot/ws.cjs")
            }
        ],

        okx: [
            {
                key: "ws",
                kind: "websocket",
                injectExchange: true,
                load: () => require("../venues/okx/spot/ws.cjs")
            }
        ]
    }
};

module.exports = { SPECS, FUTURES_STREAM_ORDER, SPOT_STREAM_ORDER };

/**
 * Binance Spot WebSocket – FINAL STANDARD VERSION (Depth + Trades + Candles)
 */

const wsControl = require("../../shared/ws-control.cjs");
const wsHeartbeat = require("../../shared/ws-heartbeat.cjs");

module.exports = function wsBinanceSpot({ symbol, handler, onCritical }) {

    console.log("BINANCE SPOT MODULE LOADED");

    const s = symbol.toLowerCase();

    const url =
        `wss://stream.binance.com:9443/stream?streams=` +
        `${s}@trade/` +
        `${s}@depth20@100ms/` +
        `${s}@kline_1m`;

    wsControl({
        url,

        onConnect(ws) {

            console.log("BINANCE SPOT CONNECTED");

            wsHeartbeat(ws);

            ws.on("message", raw => {

                let msg;
                try { msg = JSON.parse(raw); } catch { return; }

                const data = msg.data;
                if (!data) return;

                /* ============================
                 * TRADE
                 * ============================ */
                if (data.e === "trade") {
                    handler({
                        symbol,
                        data: {
                            price: Number(data.p),
                            qty: Number(data.q),
                            side: data.m ? "sell" : "buy",
                            timestamp: data.T
                        }
                    });
                }

                /* ============================
                 * DEPTH (STANDARDIZED)
                 * ============================ */
                if (data.e === "depthUpdate" || (Array.isArray(data.bids) && Array.isArray(data.asks))) {

                    const sourceBids = data.bids || data.b || [];
                    const sourceAsks = data.asks || data.a || [];

                    const bids = sourceBids.map(l => ({
                        price: Number(l[0]),
                        qty: Number(l[1])
                    }));

                    const asks = sourceAsks.map(l => ({
                        price: Number(l[0]),
                        qty: Number(l[1])
                    }));

                    handler({
                        symbol,
                        data: {
                            bids,
                            asks,
                            timestamp: data.E || Date.now()
                        }
                    });
                }

                /* ============================
                 * CANDLE
                 * ============================ */
                if (data.e === "kline") {
                    const k = data.k;

                    handler({
                        symbol,
                        data: {
                            open: Number(k.o),
                            high: Number(k.h),
                            low: Number(k.l),
                            close: Number(k.c),
                            volume: Number(k.v),
                            timestamp: k.t
                        }
                    });
                }
            });
        },

        onCritical
    });
};

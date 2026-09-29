/**
 * ============================================================
 * File: ws-bitget-spot.cjs
 * Path: collector/crypto/realtime/venues/bitget/spot/ws.cjs
 * Version: v2.0.0 (Final Stable)
 * Description:
 *   Bitget Spot WebSocket plugin (Compatible with Spot Handler)
 * ============================================================
 */

const wsControl = require("../../shared/ws-control.cjs");
const wsHeartbeat = require("../../shared/ws-heartbeat.cjs");

module.exports = function wsBitgetSpot({ symbol, handler, onCritical }) {

    console.log("BITGET SPOT MODULE LOADED");

    const s = symbol.toUpperCase();

    const url = "wss://ws.bitget.com/v2/ws/public";

    wsControl({
        url,

        onConnect(ws) {

            console.log("BITGET SPOT CONNECTED");

            wsHeartbeat(ws);

            ws.send(JSON.stringify({
                op: "subscribe",
                args: [
                    { instType: "SPOT", channel: "trade", instId: s },
                    { instType: "SPOT", channel: "books", instId: s },
                    { instType: "SPOT", channel: "candle1m", instId: s }
                ]
            }));

            ws.on("message", raw => {

                let msg;
                try { msg = JSON.parse(raw); } catch { return; }

                if (!msg.data) return;

                /* TRADE */
                if (msg.arg?.channel === "trade") {
                    const d = msg.data[0];
                    handler({
                        symbol,
                        data: {
                            price: Number(d.price),
                            qty: Number(d.size),
                            side: d.side,
                            timestamp: d.ts
                        }
                    });
                }

                /* DEPTH */
                if (msg.arg?.channel === "books") {
                    const d = msg.data[0];
                    handler({
                        symbol,
                        data: {
                            bids: (d.bids || []).map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
                            asks: (d.asks || []).map(([p, q]) => ({ price: Number(p), qty: Number(q) })),
                            timestamp: Number(d.ts) || Date.now()
                        }
                    });
                }

                /* KLINE */
                if (msg.arg?.channel === "candle1m") {
                    const d = msg.data[0];
                    handler({
                        symbol,
                        data: {
                            open: Number(d[1]),
                            high: Number(d[2]),
                            low: Number(d[3]),
                            close: Number(d[4]),
                            volume: Number(d[5]),
                            timestamp: Number(d[0])
                        }
                    });
                }
            });
        },

        onCritical
    });
};

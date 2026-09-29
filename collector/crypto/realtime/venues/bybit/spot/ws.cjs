/**
 * ============================================================
 * File: ws-bybit-spot.cjs
 * Path: collector/crypto/realtime/venues/bybit/spot/ws.cjs
 * Version: v10.0.0 (Final Stable)
 * Description:
 *   Bybit Spot WebSocket plugin (REAL Spot API - v5)
 *   - سازگار با Spot Handler
 *   - سازگار با HealthMonitor
 *   - ساختار پیام‌ها مطابق API جدید
 *   - بدون هیچ چیز اضافی
 * ============================================================
 */

const wsControl = require("../../shared/ws-control.cjs");
const wsHeartbeat = require("../../shared/ws-heartbeat.cjs");

module.exports = function wsBybitSpot({ symbol, handler, onCritical }) {

    console.log("BYBIT SPOT MODULE LOADED");

    const s = symbol.toUpperCase();   // جفت صحیح

    // REAL SPOT ENDPOINT (v5)
    const url = `wss://stream.bybit.com/v5/public/spot`;

    wsControl({
        url,

        onConnect(ws) {

            console.log("BYBIT SPOT CONNECTED");

            wsHeartbeat(ws);

            ws.send(JSON.stringify({
                op: "subscribe",
                args: [
                    `publicTrade.${s}`,
                    `orderbook.50.${s}`,
                    `kline.1.${s}`   // کانال صحیح
                ]
            }));

            ws.on("message", raw => {

                let msg;
                try { msg = JSON.parse(raw); } catch { return; }

                if (!msg.topic || !msg.data) return;

                /* ============================
                 * TRADE (v5 format)
                 * ============================ */
                if (msg.topic.startsWith("publicTrade")) {
                    const d = msg.data[0];
                    handler({
                        symbol,
                        data: {
                            price: Number(d.p),
                            qty: Number(d.v),
                            side: d.S.toLowerCase(),
                            timestamp: d.t
                        }
                    });
                }

                /* ============================
                 * DEPTH (v5 format)
                 * ============================ */
                if (msg.topic.startsWith("orderbook")) {
                    const d = msg.data;
                    handler({
                        symbol,
                        data: {
                            bids: d.b.map(([p, q]) => [Number(p), Number(q)]),
                            asks: d.a.map(([p, q]) => [Number(p), Number(q)]),
                            timestamp: msg.ts
                        }
                    });
                }

                /* ============================
                 * KLINE (v5 format)
                 * ============================ */
                if (msg.topic.startsWith("kline")) {
                    const d = msg.data[0];
                    handler({
                        symbol,
                        data: {
                            open: Number(d.open),
                            high: Number(d.high),
                            low: Number(d.low),
                            close: Number(d.close),
                            volume: Number(d.volume),
                            timestamp: d.timestamp
                        }
                    });
                }
            });
        },

        onCritical: onCritical || ((err) => {
            console.error("BYBIT SPOT CRITICAL ERROR:", err);
        })
    });
};

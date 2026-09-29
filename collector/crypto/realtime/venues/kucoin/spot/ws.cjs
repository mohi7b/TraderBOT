/**
 * ============================================================
 * File: ws-kucoin-spot.cjs
 * Path: collector/crypto/realtime/venues/kucoin/spot/ws.cjs
 * Version: v1.0.0 (Final Stable)
 * Description:
 *   KuCoin Spot WebSocket plugin (REAL Spot API)
 *   - سازگار با Spot Handler
 *   - سازگار با HealthMonitor
 *   - سازگار با Orchestrator Pipeline
 *   - گرفتن توکن → اتصال → SUBSCRIBE
 * ============================================================
 */

const https = require("https");
const wsControl = require("../../shared/ws-control.cjs");
const wsHeartbeat = require("../../shared/ws-heartbeat.cjs");

// گرفتن توکن از KuCoin
function getKucoinToken() {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "api.kucoin.com",
            path: "/api/v1/bullet-public",
            method: "POST"
        }, res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.data);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on("error", reject);
        req.end();
    });
}

module.exports = async function wsKucoinSpot({ symbol, handler, onCritical }) {

    console.log("KUCOIN SPOT MODULE LOADED");

    const s = symbol.replace("USDT", "USDT").replace("USDC", "USDC").replace(/USDT$/, "-USDT");

    // مرحله ۱: گرفتن توکن
    let tokenData;
    try {
        tokenData = await getKucoinToken();
    } catch (err) {
        console.error("KUCOIN TOKEN ERROR:", err);
        return;
    }

    const endpoint = tokenData.instanceServers[0].endpoint + "?token=" + tokenData.token + "&connectId=" + Date.now();

    wsControl({
        url: endpoint,

        onConnect(ws) {

            console.log("KUCOIN SPOT CONNECTED");

            wsHeartbeat(ws);

            // SUBSCRIBE
            ws.send(JSON.stringify({
                id: Date.now(),
                type: "subscribe",
                topic: `/market/ticker:${s}`,
                privateChannel: false,
                response: true
            }));
            ws.send(JSON.stringify({
                id: Date.now(),
                type: "subscribe",
                topic: `/market/match:${s}`,
                privateChannel: false,
                response: true
            }));
            ws.send(JSON.stringify({
                id: Date.now(),
                type: "subscribe",
                topic: `/spotMarket/level2Depth50:${s}`,
                privateChannel: false,
                response: true
            }));
            ws.send(JSON.stringify({
                id: Date.now(),
                type: "subscribe",
                topic: `/market/candles:${s}_1min`,
                privateChannel: false,
                response: true
            }));

            ws.on("message", raw => {

                let msg;
                try { msg = JSON.parse(raw); } catch { return; }

                if (!msg.topic || !msg.data) return;

                /* ============================
                 * TICKER (Spot)
                 * ============================ */
                if (msg.topic.startsWith("/market/ticker")) {
                    const d = msg.data;
                    handler({
                        symbol,
                        data: {
                            price: Number(d.price),
                            bestBid: Number(d.bestBid),
                            bestAsk: Number(d.bestAsk),
                            volume: Number(d.size),
                            timestamp: d.time
                        }
                    });
                }

                if (msg.topic.startsWith("/market/match")) {
                    const d = msg.data;
                    handler({
                        symbol,
                        data: {
                            price: Number(d.price),
                            qty: Number(d.size),
                            side: d.side,
                            timestamp: Number(d.time) / 1e6 || Date.now()
                        }
                    });
                }

                if (msg.topic.startsWith("/spotMarket/level2Depth50")) {
                    const d = msg.data;
                    handler({
                        symbol,
                        data: {
                            bids: (d.bids || []).map(([price, qty]) => ({ price: Number(price), qty: Number(qty) })),
                            asks: (d.asks || []).map(([price, qty]) => ({ price: Number(price), qty: Number(qty) })),
                            timestamp: Number(d.timestamp) || Date.now()
                        }
                    });
                }

                if (msg.topic.startsWith("/market/candles")) {
                    const d = msg.data;
                    const candle = d.candles;
                    if (!Array.isArray(candle) || candle.length < 6) return;
                    handler({
                        symbol,
                        data: {
                            open: Number(candle[1]),
                            high: Number(candle[3]),
                            low: Number(candle[4]),
                            close: Number(candle[2]),
                            volume: Number(candle[5]),
                            timestamp: Number(candle[0]) * 1000
                        }
                    });
                }
            });
        },

        onCritical: onCritical || ((err) => {
            console.error("KUCOIN SPOT CRITICAL ERROR:", err);
        })
    });
};

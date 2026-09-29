/**
 * ============================================================
 * File: ws-okx-spot.cjs
 * Path: collector/crypto/realtime/venues/okx/spot/ws.cjs
 * Version: v1.0.0 (Final Stable)
 * Description:
 *   OKX Spot WebSocket plugin (REAL Spot API)
 *   - سازگار با Spot Handler
 *   - سازگار با HealthMonitor
 *   - سازگار با Orchestrator Pipeline
 * ============================================================
 */

const wsControl = require("../../shared/ws-control.cjs");
const wsHeartbeat = require("../../shared/ws-heartbeat.cjs");

module.exports = function wsOKXSpot({ symbol, handler, onCritical }) {

    console.log("OKX SPOT MODULE LOADED");

    const s = symbol.replace("USDT", "USDT").replace(/USDT$/, "-USDT");
    let candlePoller = null;
    let candlePollInFlight = false;

    const url = "wss://ws.okx.com:8443/ws/v5/public";

    async function fetchCandle() {
        if (candlePollInFlight) return;
        candlePollInFlight = true;

        try {
            const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${s}&bar=1m&limit=1`, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`OKX Spot candle HTTP ${response.status}`);

            const result = await response.json();
            const candle = result.code === "0" && result.data ? result.data[0] : null;
            if (!Array.isArray(candle) || candle.length < 6) throw new Error("Invalid OKX Spot candle response");

            handler({
                symbol,
                data: {
                    exchange: "okx",
                    source: "rest",
                    open: Number(candle[1]),
                    high: Number(candle[2]),
                    low: Number(candle[3]),
                    close: Number(candle[4]),
                    volume: Number(candle[5]),
                    timestamp: Number(candle[0]),
                    isClosed: candle[8] === "1"
                }
            });
        } catch (error) {
            (onCritical || console.error)(error);
        } finally {
            candlePollInFlight = false;
        }
    }

    wsControl({
        url,

        onConnect(ws) {

            console.log("OKX SPOT CONNECTED");

            wsHeartbeat(ws);

            // SUBSCRIBE
            ws.send(JSON.stringify({
                op: "subscribe",
                args: [
                    {
                        channel: "tickers",
                        instId: s
                    },
                    {
                        channel: "books",
                        instId: s
                    },
                    {
                        channel: "trades",
                        instId: s
                    }
                ]
            }));

            fetchCandle();
            candlePoller = setInterval(fetchCandle, 15000);

            ws.on("close", () => {
                clearInterval(candlePoller);
                candlePoller = null;
            });

            ws.on("message", raw => {

                let msg;
                try { msg = JSON.parse(raw); } catch { return; }

                if (!msg.arg || !msg.data) return;

                const d = msg.data[0];

                if (msg.arg.channel === "tickers") {
                    handler({
                        symbol,
                        data: {
                            price: Number(d.last),
                            bestBid: Number(d.bidPx),
                            bestAsk: Number(d.askPx),
                            volume: Number(d.lastSz),
                            timestamp: Number(d.ts)
                        }
                    });
                }

                if (msg.arg.channel === "books") {
                    handler({
                        symbol,
                        data: {
                            bids: (d.bids || []).map(([price, qty]) => ({ price: Number(price), qty: Number(qty) })),
                            asks: (d.asks || []).map(([price, qty]) => ({ price: Number(price), qty: Number(qty) })),
                            timestamp: Number(d.ts) || Date.now()
                        }
                    });
                }

                if (msg.arg.channel === "trades") {
                    handler({
                        symbol,
                        data: {
                            price: Number(d.px),
                            qty: Number(d.sz),
                            side: d.side,
                            timestamp: Number(d.ts) || Date.now()
                        }
                    });
                }
            });
        },

        onCritical: onCritical || ((err) => {
            console.error("OKX SPOT CRITICAL ERROR:", err);
        })
    });
};

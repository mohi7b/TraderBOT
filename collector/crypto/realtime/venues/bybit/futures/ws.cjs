/**
 * Bybit Futures WebSocket – FINAL CLEAN VERSION
 * collector/crypto/realtime/venues/bybit/futures/ws.cjs
 */

const WebSocket = require("ws");
const { createMarketPacket } = require("../../../../common/market-packet.cjs");
const BybitOrderBookSync = require("./orderbook-sync.cjs");

class BybitFuturesWS {

    constructor({ symbol, handler, onCritical }) {
        this.symbol = symbol;
        this.handler = handler;
        this.onCritical = onCritical || (() => {});
        this.url = "wss://stream.bybit.com/v5/public/linear";
        this.ws = null;
        this.candlePoller = null;
        this.candlePollInFlight = false;
        this.orderBookSync = new BybitOrderBookSync({
            fetchSnapshot: async () => {
                const response = await fetch(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${this.symbol.toUpperCase()}&limit=200`);
                if (!response.ok) throw new Error(`Bybit snapshot HTTP ${response.status}`);
                const result = await response.json();
                if (result.retCode !== 0 || !result.result) throw new Error("Invalid Bybit snapshot");
                return { ...result.result, ts: Date.now() };
            },
            onSnapshot: snapshot => this.emitDepth("depth_full_snapshot", snapshot),
            onUpdate: update => this.emitDepth("depth_full_diff", update),
            onStateChange: (status, error) => { if (status === "invalid" && error) { this.onCritical(error); this.orderBookSync.start(); } }
        });
    }

    emitMarketEvent(eventType, timestamp, payload, source = "websocket") {
        const symbol = this.symbol.toUpperCase();
        this.handler({
            symbol,
            data: {
                type: eventType,
                event: eventType,
                source,
                ...payload,
                timestamp,
                packet: createMarketPacket({
                    exchange: "bybit",
                    market: "futures",
                    symbol,
                    eventType,
                    timestamp,
                    receiveTimestamp: Date.now(),
                    source,
                    payload
                })
            }
        });
    }

    async fetchCandleFallback() {
        if (this.candlePollInFlight) return;
        this.candlePollInFlight = true;

        try {
            const response = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${this.symbol.toUpperCase()}&interval=1&limit=1`, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`Bybit candle HTTP ${response.status}`);

            const result = await response.json();
            const candle = result.retCode === 0 && result.result?.list?.[0];
            if (!Array.isArray(candle) || candle.length < 6) throw new Error("Invalid Bybit candle response");

            this.emitMarketEvent("candle", Number(candle[0]), {
                interval: "1m",
                open: Number(candle[1]),
                high: Number(candle[2]),
                low: Number(candle[3]),
                close: Number(candle[4]),
                volume: Number(candle[5])
            }, "rest");
        } catch (error) {
            this.onCritical(error);
        } finally {
            this.candlePollInFlight = false;
        }
    }

    startCandleFallback() {
        if (this.candlePoller) return;
        this.fetchCandleFallback();
        this.candlePoller = setInterval(() => this.fetchCandleFallback(), 15000);
    }

    connect() {
        console.log(`[BYBIT-WS] Connecting to ${this.url} ...`);

        try {
            this.ws = new WebSocket(this.url);

            /* -----------------------------
             * OPEN
             * ----------------------------- */
            this.ws.on("open", () => {
                console.log("[BYBIT-WS] Connected.");
                global.wsConnected = true;

                const sub = {
                    op: "subscribe",
                    args: [
                        `orderbook.50.${this.symbol}`,
                        `publicTrade.${this.symbol}`,
                        `tickers.${this.symbol}`,
                        `kline.1.${this.symbol}`,
                        `allLiquidation.${this.symbol}`
                    ]
                };

                console.log("[BYBIT-WS] Subscribing →", sub);
                this.ws.send(JSON.stringify(sub));
                this.startCandleFallback();
            });

            /* -----------------------------
             * MESSAGE
             * ----------------------------- */
            this.ws.on("message", raw => {
                try {
                    const msg = JSON.parse(raw);
                    const topic = msg.topic;

                    if (global.CONFIG?.debugVerbose) console.log("[BYBIT-WS] Incoming →", topic);

                    if (!topic || !msg.data) return;

                    const data = msg.data;

                    /* -----------------------------
                     * DEPTH
                     * ----------------------------- */
                    if (topic.startsWith("orderbook.50")) {
                        const bids = (data.b || []).map(l => ({
                            price: Number(l[0]),
                            qty: Number(l[1])
                        }));

                        const asks = (data.a || []).map(l => ({
                            price: Number(l[0]),
                            qty: Number(l[1])
                        }));

                        if (global.CONFIG?.debugVerbose) console.log(`[BYBIT-WS] Depth Update (${msg.type})`);

                        const receiveTimestamp = Date.now();
                        const depth = {
                            type: "depth_partial", event: "depth_partial",
                            depthType: msg.type === "snapshot" ? "native_top_n" : "native_patch",
                            exchange: "bybit", market: "futures", symbol: this.symbol.toUpperCase(),
                            exchangeTimestamp: Number(data.ts || data.cts) || receiveTimestamp, receiveTimestamp,
                            sequence: { updateId: Number(data.u), previousUpdateId: Number(data.pu) || null, seq: Number(data.seq) || null },
                            sequenceStatus: this.orderBookSync.status, timestamp: Number(data.ts || data.cts) || receiveTimestamp, bids, asks
                        };
                        this.handler({
                            symbol: this.symbol,
                            data: depth
                        });
                        if (msg.type === "snapshot") this.orderBookSync.setSnapshot(data);
                        else this.orderBookSync.push(data);
                    }

                    /* -----------------------------
                     * TRADES
                     * ----------------------------- */
                    if (topic.startsWith("publicTrade")) {
                        const t = data[0];
                        if (global.CONFIG?.debugVerbose) console.log("[BYBIT-WS] Trade Update");

                        this.emitMarketEvent("trade", Number(t.T) || Date.now(), {
                            price: Number(t.price),
                            tradeQty: Number(t.qty),
                            tradeSide: t.side
                        });
                    }

                    /* -----------------------------
                     * TICKER
                     * ----------------------------- */
                    if (topic.startsWith("tickers")) {
                        if (global.CONFIG?.debugVerbose) console.log("[BYBIT-WS] Ticker Update");
                        const timestamp = Number(data.ts) || Date.now();
                        const price = Number(data.lastPrice);
                        const markPrice = Number(data.markPrice);
                        const fundingRate = Number(data.fundingRate);
                        const oi = Number(data.openInterest);
                        const oiUsd = Number(data.openInterestValue);

                        if (Number.isFinite(price)) this.emitMarketEvent("price", timestamp, { price });
                        if (Number.isFinite(markPrice)) this.emitMarketEvent("mark_price", timestamp, {
                            price: markPrice,
                            indexPrice: Number(data.indexPrice)
                        });
                        if (Number.isFinite(fundingRate)) this.emitMarketEvent("funding", timestamp, {
                            rate: fundingRate,
                            nextFundingTime: Number(data.nextFundingTime)
                        });
                        if (Number.isFinite(oi)) this.emitMarketEvent("oi", timestamp, {
                            oi,
                            oiBase: oi,
                            oiUsd: Number.isFinite(oiUsd) ? oiUsd : null
                        });
                    }

                    if (topic.startsWith("kline.1")) {
                        const candle = data[0];
                        if (!candle) return;
                        this.emitMarketEvent("candle", Number(candle.start) || Date.now(), {
                            interval: "1m",
                            open: Number(candle.open),
                            high: Number(candle.high),
                            low: Number(candle.low),
                            close: Number(candle.close),
                            volume: Number(candle.volume),
                            closeTime: Number(candle.end),
                            isClosed: candle.confirm === true
                        });
                    }

                    if (topic.startsWith("allLiquidation")) {
                        const liquidation = data[0];
                        if (!liquidation) return;
                        this.emitMarketEvent("liquidation", Number(liquidation.T) || Date.now(), {
                            price: Number(liquidation.p),
                            qty: Number(liquidation.v),
                            side: String(liquidation.S || "").toLowerCase(),
                            liquidationId: liquidation.i || null
                        });
                    }

                } catch (err) {
                    console.log("[BYBIT-WS] ERROR parsing message:", err);
                    this.onCritical(err);
                }
            });

            /* -----------------------------
             * CLOSE
             * ----------------------------- */
            this.ws.on("close", () => {
                console.log("[BYBIT-WS] Connection closed. Reconnecting...");
                global.wsConnected = false;
                clearInterval(this.candlePoller);
                this.candlePoller = null;
                setTimeout(() => this.connect(), 1500);
            });

            /* -----------------------------
             * ERROR
             * ----------------------------- */
            this.ws.on("error", err => {
                console.log("[BYBIT-WS] ERROR:", err);
                global.wsConnected = false;
                this.onCritical(err);
            });

        } catch (err) {
            console.log("[BYBIT-WS] CRITICAL ERROR:", err);
            this.onCritical(err);
        }
    }

    emitDepth(type, snapshot) {
        const receiveTimestamp = Date.now();
        const symbol = this.symbol.toUpperCase();
        this.handler({ symbol, data: {
            type, event: type, depthType: "full", exchange: "bybit", market: "futures", symbol,
            exchangeTimestamp: snapshot.eventTimestamp, receiveTimestamp, timestamp: snapshot.eventTimestamp,
            sequence: snapshot.sequence, sequenceStatus: "synchronized", bids: snapshot.bids, asks: snapshot.asks,
            mediumBids: snapshot.bids.slice(0, 100), mediumAsks: snapshot.asks.slice(0, 100),
            packet: createMarketPacket({ exchange: "bybit", market: "futures", symbol, eventType: type, timestamp: snapshot.eventTimestamp, receiveTimestamp, sequence: snapshot.sequence, payload: { bids: snapshot.bids, asks: snapshot.asks } })
        }});
    }
}

module.exports = BybitFuturesWS;

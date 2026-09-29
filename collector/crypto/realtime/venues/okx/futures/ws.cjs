/**
 * OKX Futures WebSocket – FIXED VERSION
 */

const WebSocket = require("ws");
const { createMarketPacket } = require("../../../../common/market-packet.cjs");
const OKXOrderBookSync = require("./orderbook-sync.cjs");

class OKXFuturesWS {

    constructor({ symbol, handler, onCritical }) {
        this.symbol = symbol.toUpperCase();
        this.handler = handler;
        this.onCritical = onCritical || (() => {});
        this.ws = null;
        this.marketPoller = null;
        this.marketPollInFlight = false;

        this.url = "wss://ws.okx.com:8443/ws/v5/public";

        // FIX: OKX instId format
        this.instId = this.symbol.replace("USDT", "") + "-USDT-SWAP";
        // Example:
        // BTCUSDT → BTC-USDT-SWAP
        // ETHUSDT → ETH-USDT-SWAP
        this.orderBookSync = new OKXOrderBookSync({
            fetchSnapshot: async () => {
                const response = await fetch(`https://www.okx.com/api/v5/market/books?instId=${this.instId}&sz=400`);
                if (!response.ok) throw new Error(`OKX snapshot HTTP ${response.status}`);
                const result = await response.json();
                if (result.code !== "0" || !result.data || !result.data[0]) throw new Error("Invalid OKX snapshot");
                return result.data[0];
            },
            onSnapshot: snapshot => this.emitDepth("depth_full_snapshot", snapshot),
            onUpdate: update => this.emitDepth("depth_full_diff", update),
            onStateChange: (status, error) => { if (status === "invalid" && error) { this.onCritical(error); this.orderBookSync.start(); } }
        });
    }

    emitMarketEvent(eventType, timestamp, payload, source = "websocket") {
        this.handler({
            symbol: this.symbol,
            data: {
                type: eventType,
                event: eventType,
                source,
                ...payload,
                timestamp,
                packet: createMarketPacket({
                    exchange: "okx",
                    market: "futures",
                    symbol: this.symbol,
                    eventType,
                    timestamp,
                    receiveTimestamp: Date.now(),
                    source,
                    payload
                })
            }
        });
    }

    async fetchMarketFallbacks() {
        if (this.marketPollInFlight) return;
        this.marketPollInFlight = true;

        try {
            const [fundingResponse, markPriceResponse, oiResponse, candleResponse] = await Promise.all([
                fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${this.instId}`, { signal: AbortSignal.timeout(5000) }),
                fetch(`https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=${this.instId}`, { signal: AbortSignal.timeout(5000) }),
                fetch(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${this.instId}`, { signal: AbortSignal.timeout(5000) }),
                fetch(`https://www.okx.com/api/v5/market/candles?instId=${this.instId}&bar=1m&limit=1`, { signal: AbortSignal.timeout(5000) })
            ]);

            const [fundingResult, markPriceResult, oiResult, candleResult] = await Promise.all([
                fundingResponse.ok ? fundingResponse.json() : null,
                markPriceResponse.ok ? markPriceResponse.json() : null,
                oiResponse.ok ? oiResponse.json() : null,
                candleResponse.ok ? candleResponse.json() : null
            ]);
            const funding = fundingResult && fundingResult.code === "0" ? fundingResult.data[0] : null;
            const markPrice = markPriceResult && markPriceResult.code === "0" ? markPriceResult.data[0] : null;
            const oi = oiResult && oiResult.code === "0" ? oiResult.data[0] : null;
            const candle = candleResult && candleResult.code === "0" ? candleResult.data[0] : null;

            if (funding && Number.isFinite(Number(funding.fundingRate))) {
                this.emitMarketEvent("funding", Number(funding.ts) || Date.now(), {
                    rate: Number(funding.fundingRate),
                    nextFundingTime: Number(funding.nextFundingTime)
                }, "rest");
            }

            if (markPrice && Number.isFinite(Number(markPrice.markPx))) {
                this.emitMarketEvent("mark_price", Number(markPrice.ts) || Date.now(), {
                    price: Number(markPrice.markPx)
                }, "rest");
            }

            if (oi && Number.isFinite(Number(oi.oi))) {
                this.emitMarketEvent("oi", Number(oi.ts) || Date.now(), {
                    oi: Number(oi.oi),
                    oiCcy: Number(oi.oiCcy),
                    oiUsd: Number(oi.oiUsd)
                }, "rest");
            }

            if (Array.isArray(candle) && candle.length >= 6) {
                this.emitMarketEvent("candle", Number(candle[0]), {
                    interval: "1m",
                    open: Number(candle[1]),
                    high: Number(candle[2]),
                    low: Number(candle[3]),
                    close: Number(candle[4]),
                    volume: Number(candle[5]),
                    isClosed: candle[8] === "1"
                }, "rest");
            }
        } catch (err) {
            this.onCritical(err);
        } finally {
            this.marketPollInFlight = false;
        }
    }

    startMarketFallbacks() {
        if (this.marketPoller) return;
        this.fetchMarketFallbacks();
        this.marketPoller = setInterval(() => this.fetchMarketFallbacks(), 15000);
    }

    handleMessage(raw) {
        try {
            const msg = JSON.parse(raw);

            if (!msg.arg || !msg.data) return;

            const channel = msg.arg.channel;
            const data = msg.data[0];
            if (!data) return;

            if (channel === "books") {
                const bids = data.bids.map(l => ({
                    price: Number(l[0]),
                    qty: Number(l[1])
                }));

                const asks = data.asks.map(l => ({
                    price: Number(l[0]),
                    qty: Number(l[1])
                }));

                const receiveTimestamp = Date.now();
                this.handler({
                    symbol: this.symbol,
                    data: { type: "depth_partial", event: "depth_partial", depthType: msg.action === "snapshot" ? "native_top_n" : "native_patch", exchange: "okx", market: "futures", symbol: this.symbol, exchangeTimestamp: Number(data.ts) || receiveTimestamp, receiveTimestamp, timestamp: Number(data.ts) || receiveTimestamp, sequence: { seqId: Number(data.seqId), previousSeqId: Number(data.prevSeqId) || null, checksum: Number(data.checksum) || null }, sequenceStatus: this.orderBookSync.status, bids, asks }
                });
                if (msg.action === "snapshot") this.orderBookSync.setSnapshot(data);
                else this.orderBookSync.push(data);
                return;
            }

            if (channel === "trades") {
                this.emitMarketEvent("trade", Number(data.ts) || Date.now(), {
                    price: Number(data.px),
                    tradeQty: Number(data.sz),
                    tradeSide: data.side
                });
                return;
            }

            if (channel === "tickers") {
                this.emitMarketEvent("price", Number(data.ts) || Date.now(), {
                    price: Number(data.last)
                });
                return;
            }

            if (channel === "candle1m" && Array.isArray(data) && data.length >= 6) {
                this.emitMarketEvent("candle", Number(data[0]), {
                    interval: "1m",
                    open: Number(data[1]),
                    high: Number(data[2]),
                    low: Number(data[3]),
                    close: Number(data[4]),
                    volume: Number(data[5]),
                    isClosed: data[8] === "1"
                });
            }
        } catch (err) {
            this.onCritical(err);
        }
    }

    connect() {
        console.log(`[OKX-WS] Connecting to ${this.url} ...`);

        try {
            this.ws = new WebSocket(this.url);

            this.ws.on("open", () => {
                console.log("[OKX-WS] Connected.");
                global.wsConnected = true;

                const sub = {
                    op: "subscribe",
                    args: [
                        { channel: "books", instId: this.instId },
                        { channel: "trades", instId: this.instId },
                        { channel: "tickers", instId: this.instId },
                        { channel: "candle1m", instId: this.instId }
                    ]
                };

                console.log("[OKX-WS] Subscribing →", sub);
                this.ws.send(JSON.stringify(sub));
                this.startMarketFallbacks();
            });

            this.ws.on("message", raw => this.handleMessage(raw));

            this.ws.on("close", () => {
                global.wsConnected = false;
                clearInterval(this.marketPoller);
                this.marketPoller = null;
                setTimeout(() => this.connect(), 1500);
            });

            this.ws.on("error", err => {
                global.wsConnected = false;
                this.onCritical(err);
            });

        } catch (err) {
            this.onCritical(err);
        }
    }

    emitDepth(type, snapshot) {
        const receiveTimestamp = Date.now();
        const symbol = this.symbol;
        this.handler({ symbol, data: { type, event: type, depthType: "full", exchange: "okx", market: "futures", symbol, exchangeTimestamp: snapshot.eventTimestamp, receiveTimestamp, timestamp: snapshot.eventTimestamp, sequence: snapshot.sequence, sequenceStatus: "synchronized", bids: snapshot.bids, asks: snapshot.asks, mediumBids: snapshot.bids.slice(0, 100), mediumAsks: snapshot.asks.slice(0, 100), packet: createMarketPacket({ exchange: "okx", market: "futures", symbol, eventType: type, timestamp: snapshot.eventTimestamp, receiveTimestamp, sequence: snapshot.sequence, payload: { bids: snapshot.bids, asks: snapshot.asks } }) }});
    }
}

module.exports = OKXFuturesWS;

const WebSocket = require("ws");
const { createMarketPacket } = require("../../../../common/market-packet.cjs");
const KucoinOrderBookSync = require("./orderbook-sync.cjs");

class KucoinFuturesWS {
    constructor({ symbol, handler, onCritical }) {
        this.symbol = symbol.toUpperCase().endsWith("M") ? symbol.toUpperCase() : `${symbol.toUpperCase()}M`;
        this.canonicalSymbol = symbol.toUpperCase();
        const baseSymbol = this.canonicalSymbol.replace(/USDTM?$/, "");
        const kucoinBase = baseSymbol === "BTC" ? "XBT" : baseSymbol;
        this.symbol = `${kucoinBase}USDTM`;
        this.handler = handler;
        this.onCritical = onCritical || (() => {});
        this.ws = null;
        this.heartbeat = null;
        this.marketPoller = null;
        this.marketPollInFlight = false;
        this.orderBookSync = new KucoinOrderBookSync({
            fetchSnapshot: async () => {
                const response = await fetch(`https://api-futures.kucoin.com/api/v1/level2/snapshot?symbol=${this.symbol}`);
                if (response.ok) {
                    const result = await response.json();
                    if (result.code === "200000" && result.data) return result.data;
                }
                const fallback = await fetch(`https://api-futures.kucoin.com/api/v1/level2/depth20?symbol=${this.symbol}`);
                if (!fallback.ok) throw new Error(`KuCoin snapshot HTTP ${fallback.status}`);
                const fallbackResult = await fallback.json();
                if (fallbackResult.code !== "200000" || !fallbackResult.data) throw new Error("Invalid KuCoin snapshot");
                return fallbackResult.data;
            },
            onSnapshot: snapshot => this.emitDepth("depth_full_snapshot", snapshot),
            onUpdate: update => this.emitDepth("depth_full_diff", update),
            onStateChange: (status, error) => {
                if (status !== "invalid") return;
                if (error) this.onCritical(error);
                this.orderBookSync.start();
            }
        });
    }

    emitMarketEvent(eventType, timestamp, payload, source = "websocket") {
        this.handler({
            symbol: this.canonicalSymbol,
            data: {
                type: eventType,
                event: eventType,
                source,
                ...payload,
                timestamp,
                packet: createMarketPacket({
                    exchange: "kucoin",
                    market: "futures",
                    symbol: this.canonicalSymbol,
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
            const [contractResponse, candleResponse] = await Promise.all([
                fetch(`https://api-futures.kucoin.com/api/v1/contracts/${this.symbol}`, { signal: AbortSignal.timeout(5000) }),
                fetch(`https://api-futures.kucoin.com/api/v1/kline/query?symbol=${this.symbol}&granularity=1`, { signal: AbortSignal.timeout(5000) })
            ]);

            if (contractResponse.ok) {
                const contractResult = await contractResponse.json();
                const contract = contractResult.code === "200000" ? contractResult.data : null;
                if (contract) {
                    const timestamp = Number(contract.ts) || Date.now();
                    const markPrice = Number(contract.markPrice);
                    const fundingRate = Number(contract.fundingFeeRate);
                    const oi = Number(contract.openInterest);
                    const multiplier = Number(contract.multiplier);

                    if (Number.isFinite(markPrice)) {
                        this.emitMarketEvent("mark_price", timestamp, {
                            price: markPrice,
                            indexPrice: Number(contract.indexPrice)
                        }, "rest");
                    }

                    if (Number.isFinite(fundingRate)) {
                        this.emitMarketEvent("funding", timestamp, {
                            rate: fundingRate,
                            fundingRateGranularity: Number(contract.currentFundingRateGranularity || contract.fundingRateGranularity)
                        }, "rest");
                    }

                    if (Number.isFinite(oi)) this.emitMarketEvent("oi", timestamp, {
                        oi,
                        oiBase: Number.isFinite(multiplier) ? oi * multiplier : null,
                        oiUsd: Number.isFinite(multiplier) && Number.isFinite(markPrice) ? oi * multiplier * markPrice : null
                    }, "rest");
                }
            }

            if (candleResponse.ok) {
                const candleResult = await candleResponse.json();
                const candles = candleResult.code === "200000" && Array.isArray(candleResult.data) ? candleResult.data : [];
                const candle = candles[candles.length - 1];
                if (Array.isArray(candle) && candle.length >= 6) {
                    this.emitMarketEvent("candle", Number(candle[0]), {
                        interval: "1m",
                        open: Number(candle[1]),
                        high: Number(candle[2]),
                        low: Number(candle[3]),
                        close: Number(candle[4]),
                        volume: Number(candle[5])
                        }, "rest");
                }
            }
        } catch (error) {
            this.onCritical(error);
        } finally {
            this.marketPollInFlight = false;
        }
    }

    startMarketFallbacks() {
        if (this.marketPoller) return;
        this.fetchMarketFallbacks();
        this.marketPoller = setInterval(() => this.fetchMarketFallbacks(), 15000);
    }

    async connect() {
        try {
            const response = await fetch("https://api-futures.kucoin.com/api/v1/bullet-public", { method: "POST" });
            const result = await response.json();
            if (result.code !== "200000" || !result.data) throw new Error("Invalid KuCoin bullet response");

            const server = result.data.instanceServers[0];
            this.ws = new WebSocket(`${server.endpoint}?token=${result.data.token}&connectId=${Date.now()}`);
            this.ws.on("open", () => {
                global.wsConnected = true;
                this.ws.send(JSON.stringify({ id: Date.now(), type: "subscribe", topic: `/contractMarket/level2:${this.symbol}`, response: true }));
                this.ws.send(JSON.stringify({ id: Date.now(), type: "subscribe", topic: `/contractMarket/ticker:${this.symbol}`, response: true }));
                this.ws.send(JSON.stringify({ id: Date.now(), type: "subscribe", topic: `/contractMarket/execution:${this.symbol}`, response: true }));
                this.heartbeat = setInterval(() => {
                    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ id: Date.now(), type: "ping" }));
                }, Number(result.data.keepAliveInterval || 15000));
                this.orderBookSync.start();
                this.startMarketFallbacks();
            });
            this.ws.on("message", raw => this.handleMessage(raw));
            this.ws.on("close", () => {
                global.wsConnected = false;
                clearInterval(this.heartbeat);
                clearInterval(this.marketPoller);
                this.marketPoller = null;
                setTimeout(() => this.connect(), 1500);
            });
            this.ws.on("error", error => this.onCritical(error));
        } catch (error) {
            this.onCritical(error);
            setTimeout(() => this.connect(), 3000);
        }
    }

    handleMessage(raw) {
        try {
            const message = JSON.parse(raw);
            if (message.type !== "message" || !message.data) return;

            if (message.topic === `/contractMarket/ticker:${this.symbol}`) {
                const data = message.data;
                const price = Number(data.price);
                if (Number.isFinite(price)) this.emitMarketEvent("price", Number(data.ts) / 1e6 || Date.now(), { price });
                return;
            }

            if (message.topic === `/contractMarket/execution:${this.symbol}`) {
                const data = Array.isArray(message.data) ? message.data[0] : message.data;
                const price = Number(data.price);
                const tradeQty = Number(data.size);
                if (Number.isFinite(price) && Number.isFinite(tradeQty)) {
                    this.emitMarketEvent("trade", Number(data.ts) / 1e6 || Date.now(), {
                        price,
                        tradeQty,
                        tradeSide: data.side
                    });
                }
                return;
            }

            if (message.topic !== `/contractMarket/level2:${this.symbol}`) return;

            const data = message.data;
            const receiveTimestamp = Date.now();
            const sequence = Number(data.sequence);
            const change = KucoinOrderBookSync.parseChange(data.change);
            if (!Number.isFinite(sequence) || !change) return;

            const level = { price: change.price, qty: change.size };
            const bids = change.side === "buy" ? [level] : [];
            const asks = change.side === "sell" ? [level] : [];
            this.handler({ symbol: this.canonicalSymbol, data: {
                type: "depth_partial", event: "depth_partial", depthType: "native_patch",
                exchange: "kucoin", market: "futures", symbol: this.canonicalSymbol, sourceSymbol: this.symbol,
                exchangeTimestamp: Number(data.timestamp) || receiveTimestamp,
                receiveTimestamp, timestamp: Number(data.timestamp) || receiveTimestamp,
                sequence: { sequence, previousSequence: sequence - 1 },
                sequenceStatus: this.orderBookSync.status, bids, asks
            }});
            this.orderBookSync.push(data);
        } catch (error) {
            this.onCritical(error);
        }
    }

    emitDepth(type, depth) {
        const receiveTimestamp = Date.now();
        const symbol = this.canonicalSymbol;
        this.handler({ symbol, data: {
            type, event: type, depthType: "full", exchange: "kucoin", market: "futures", symbol,
            exchangeTimestamp: depth.eventTimestamp, receiveTimestamp, timestamp: depth.eventTimestamp,
            sequence: depth.sequence, sequenceStatus: "synchronized", bids: depth.bids, asks: depth.asks,
            mediumBids: depth.bids.slice(0, 100), mediumAsks: depth.asks.slice(0, 100),
            packet: createMarketPacket({ exchange: "kucoin", market: "futures", symbol, eventType: type,
                timestamp: depth.eventTimestamp, receiveTimestamp, sequence: depth.sequence,
                payload: { bids: depth.bids, asks: depth.asks } })
        }});
    }
}

module.exports = KucoinFuturesWS;

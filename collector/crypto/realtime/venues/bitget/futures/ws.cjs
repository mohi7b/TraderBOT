/**
 * Bitget Futures WebSocket – FINAL WORKING VERSION (v2 API)
 */

const WebSocket = require("ws");
const { createMarketPacket } = require("../../../../common/market-packet.cjs");
const BitgetOrderBookSync = require("./orderbook-sync.cjs");

class BitgetFuturesWS {

    constructor({ symbol, handler, onCritical }) {
        this.symbol = symbol.toUpperCase();
        this.handler = handler;
        this.onCritical = onCritical || (() => {});
        this.ws = null;
        this.restPoller = null;
        this.restInFlight = false;
        this.pendingSnapshot = null;

        this.url = "wss://ws.bitget.com/v2/ws/public";
        this.orderBookSync = new BitgetOrderBookSync({
            // Bitget publishes `seq`/`pseq` only on the websocket `books` snapshot, so the
            // REST merge-depth payload (no sequence at all) cannot seed a verifiable book.
            // The snapshot promise is resolved by the first `action:"snapshot"` message.
            fetchSnapshot: () => this.waitForWsSnapshot(),
            onSnapshot: snapshot => this.emitDepth("depth_full_snapshot", snapshot),
            onUpdate: update => this.emitDepth("depth_full_diff", update),
            onStateChange: (status, error) => {
                if (status !== "invalid") return;
                if (error) this.onCritical(error);
                // A gap in `seq`/`pseq` cannot be repaired from the live stream: force a
                // reconnect so the exchange replays a fresh `books` snapshot.
                if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
                this.orderBookSync.start();
            }
        });
    }

    waitForWsSnapshot(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            this.pendingSnapshot = { resolve, reject };
            setTimeout(() => {
                if (!this.pendingSnapshot || this.pendingSnapshot.resolve !== resolve) return;
                this.pendingSnapshot = null;
                reject(new Error("Bitget books snapshot timeout"));
            }, timeoutMs);
        });
    }

    resolveSnapshotMessage(data) {
        if (!this.pendingSnapshot) {
            this.orderBookSync.setSnapshot(data);
            return;
        }
        const pending = this.pendingSnapshot;
        this.pendingSnapshot = null;
        pending.resolve(data);
    }

    rejectPendingSnapshot(reason) {
        if (!this.pendingSnapshot) return;
        const pending = this.pendingSnapshot;
        this.pendingSnapshot = null;
        pending.reject(new Error(reason));
    }

    async fetchRestFallbacks() {
        if (this.restInFlight) return;
        this.restInFlight = true;

        try {
            const [oiResponse, candleResponse] = await Promise.all([
                fetch(`https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${this.symbol}&productType=USDT-FUTURES`, { signal: AbortSignal.timeout(5000) }),
                fetch(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${this.symbol}&productType=USDT-FUTURES&granularity=1m&limit=1`, { signal: AbortSignal.timeout(5000) })
            ]);

            if (oiResponse.ok) {
                const oiResult = await oiResponse.json();
                const oiList = oiResult && oiResult.data && oiResult.data.openInterestList ? oiResult.data.openInterestList : [];
                const oiValue = oiList.find(item => item.symbol === this.symbol) || oiList[0];
                const oi = Number(oiValue && (oiValue.size || oiValue.openInterest));
                if (Number.isFinite(oi)) {
                    this.handler({
                        symbol: this.symbol,
                        data: {
                            type: "oi",
                            event: "oi",
                            source: "rest",
                            oi,
                            timestamp: Number(oiResult.data && oiResult.data.ts) || Date.now(),
                            packet: createMarketPacket({
                                exchange: "bitget",
                                market: "futures",
                                symbol: this.symbol,
                                eventType: "oi",
                                timestamp: Number(oiResult.data && oiResult.data.ts) || Date.now(),
                                receiveTimestamp: Date.now(),
                                source: "rest",
                                payload: { oi }
                            })
                        }
                    });
                }
            }

            if (candleResponse.ok) {
                const candleResult = await candleResponse.json();
                const candle = candleResult && candleResult.data && Array.isArray(candleResult.data) ? candleResult.data[0] : null;
                if (Array.isArray(candle) && candle.length >= 6) {
                    const timestamp = Number(candle[0]);
                    this.handler({
                        symbol: this.symbol,
                        data: {
                            type: "candle",
                            event: "candle",
                            source: "rest",
                            interval: "1m",
                            open: Number(candle[1]),
                            high: Number(candle[2]),
                            low: Number(candle[3]),
                            close: Number(candle[4]),
                            volume: Number(candle[5]),
                            timestamp,
                            packet: createMarketPacket({
                                exchange: "bitget",
                                market: "futures",
                                symbol: this.symbol,
                                eventType: "candle",
                                timestamp,
                                receiveTimestamp: Date.now(),
                                source: "rest",
                                payload: {
                                    interval: "1m",
                                    open: Number(candle[1]),
                                    high: Number(candle[2]),
                                    low: Number(candle[3]),
                                    close: Number(candle[4]),
                                    volume: Number(candle[5])
                                }
                            })
                        }
                    });
                }
            }
        } catch (err) {
            this.onCritical(err);
        } finally {
            this.restInFlight = false;
        }
    }

    startRestFallbacks() {
        if (this.restPoller) return;
        this.fetchRestFallbacks();
        this.restPoller = setInterval(() => this.fetchRestFallbacks(), 15000);
    }

    handleMessage(raw) {
        try {
            const msg = JSON.parse(raw);

            if (!msg.arg || !msg.data) return;

            const channel = msg.arg.channel;
            const payload = Array.isArray(msg.data) ? msg.data[0] : msg.data;
            if (!payload) return;

            if (channel === "books") {
                const data = payload;

                if (msg.action === "snapshot") {
                    this.resolveSnapshotMessage(data);
                    return;
                }

                const bids = (data.bids || []).map(l => ({
                    price: Number(l[0]),
                    qty: Number(l[1])
                }));

                const asks = (data.asks || []).map(l => ({
                    price: Number(l[0]),
                    qty: Number(l[1])
                }));

                const receiveTimestamp = Date.now();
                this.handler({
                    symbol: this.symbol,
                    data: { type: "depth_partial", event: "depth_partial", depthType: "native_patch", exchange: "bitget", market: "futures", symbol: this.symbol, exchangeTimestamp: Number(data.ts) || receiveTimestamp, receiveTimestamp, timestamp: Number(data.ts) || receiveTimestamp, sequence: { seq: Number(data.seq || data.seqNum), previousSeq: Number(data.pseq || data.prevSeqNum || data.prevSeq) || null, checksum: Number(data.checksum) || null }, sequenceStatus: this.orderBookSync.status, bids, asks }
                });
                this.orderBookSync.push(data);
                return;
            }

            if (channel === "trade") {
                this.handler({
                    symbol: this.symbol,
                    data: {
                        type: "trade",
                        event: "trade",
                        price: Number(payload.price),
                        tradeQty: Number(payload.size),
                        tradeSide: payload.side,
                        timestamp: Number(payload.ts) || Date.now(),
                        packet: createMarketPacket({
                            exchange: "bitget",
                            market: "futures",
                            symbol: this.symbol,
                            eventType: "trade",
                            timestamp: Number(payload.ts) || Date.now(),
                            receiveTimestamp: Date.now(),
                            payload: {
                                price: Number(payload.price),
                                qty: Number(payload.size),
                                side: payload.side
                            }
                        })
                    }
                });
                return;
            }

            if (channel === "ticker") {
                const timestamp = Number(payload.ts) || Date.now();
                const lastPrice = Number(payload.lastPr || payload.last || payload.lastPrice);
                const markPrice = Number(payload.markPrice || payload.lastPr || lastPrice);
                const fundingRate = Number(payload.fundingRate);
                const nextFundingTime = Number(payload.nextFundingTime);
                const oi = Number(payload.openInterest || payload.holdingAmount);

                if (Number.isFinite(lastPrice)) {
                    this.handler({
                        symbol: this.symbol,
                        data: {
                            type: "price",
                            event: "price",
                            price: lastPrice,
                            timestamp,
                            packet: createMarketPacket({
                                exchange: "bitget",
                                market: "futures",
                                symbol: this.symbol,
                                eventType: "price",
                                timestamp,
                                receiveTimestamp: Date.now(),
                                payload: { price: lastPrice }
                            })
                        }
                    });
                }

                if (Number.isFinite(markPrice)) {
                    this.handler({
                        symbol: this.symbol,
                        data: {
                            type: "mark_price",
                            event: "mark_price",
                            price: markPrice,
                            indexPrice: Number(payload.indexPrice),
                            timestamp,
                            packet: createMarketPacket({
                                exchange: "bitget",
                                market: "futures",
                                symbol: this.symbol,
                                eventType: "mark_price",
                                timestamp,
                                receiveTimestamp: Date.now(),
                                payload: {
                                    price: markPrice,
                                    indexPrice: Number(payload.indexPrice)
                                }
                            })
                        }
                    });
                }

                if (Number.isFinite(fundingRate)) {
                    this.handler({
                        symbol: this.symbol,
                        data: {
                            type: "funding",
                            event: "funding",
                            rate: fundingRate,
                            nextFundingTime,
                            timestamp,
                            packet: createMarketPacket({
                                exchange: "bitget",
                                market: "futures",
                                symbol: this.symbol,
                                eventType: "funding",
                                timestamp,
                                receiveTimestamp: Date.now(),
                                payload: { rate: fundingRate, nextFundingTime }
                            })
                        }
                    });
                }

                if (Number.isFinite(oi)) {
                    this.handler({
                        symbol: this.symbol,
                        data: {
                            type: "oi",
                            event: "oi",
                            oi,
                            oiBase: oi,
                            oiUsd: Number.isFinite(markPrice) ? oi * markPrice : null,
                            timestamp,
                            packet: createMarketPacket({
                                exchange: "bitget",
                                market: "futures",
                                symbol: this.symbol,
                                eventType: "oi",
                                timestamp,
                                receiveTimestamp: Date.now(),
                                payload: { oi, oiBase: oi, oiUsd: Number.isFinite(markPrice) ? oi * markPrice : null }
                            })
                        }
                    });
                }
                return;
            }

            if (channel === "liquidation") {
                const price = Number(payload.price || payload.liquidationPrice || payload.liqPrice || payload.liqPx);
                const qty = Number(payload.size || payload.qty || payload.amount || payload.volume);
                if (!Number.isFinite(price) || !Number.isFinite(qty)) return;

                const side = String(payload.side || payload.positionSide || "").toLowerCase();
                const timestamp = Number(payload.ts) || Date.now();
                this.handler({
                    symbol: this.symbol,
                    data: {
                        type: "liquidation",
                        event: "liquidation",
                        price,
                        qty,
                        side,
                        timestamp,
                        packet: createMarketPacket({
                            exchange: "bitget",
                            market: "futures",
                            symbol: this.symbol,
                            eventType: "liquidation",
                            timestamp,
                            receiveTimestamp: Date.now(),
                            payload: { price, qty, side }
                        })
                    }
                });
            }

        } catch (err) {
            this.onCritical(err);
        }
    }

    connect() {
        console.log(`[BITGET-WS] Connecting to ${this.url} ...`);

        try {
            this.ws = new WebSocket(this.url);

            this.ws.on("open", () => {
                console.log("[BITGET-WS] Connected.");
                global.wsConnected = true;

                const sub = {
                    op: "subscribe",
                    args: [
                        { instType: "USDT-FUTURES", channel: "books", instId: this.symbol },
                        { instType: "USDT-FUTURES", channel: "trade", instId: this.symbol },
                        { instType: "USDT-FUTURES", channel: "ticker", instId: this.symbol },
                        { instType: "USDT-FUTURES", channel: "liquidation", instId: this.symbol }
                    ]
                };

                console.log("[BITGET-WS] Subscribing →", sub);
                this.ws.send(JSON.stringify(sub));

                this.orderBookSync.start();
                this.startRestFallbacks();
            });

            this.ws.on("message", raw => this.handleMessage(raw));

            this.ws.on("close", () => {
                global.wsConnected = false;
                this.rejectPendingSnapshot("Bitget socket closed while waiting for books snapshot");
                if (this.restPoller) {
                    clearInterval(this.restPoller);
                    this.restPoller = null;
                }
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
        this.handler({ symbol, data: { type, event: type, depthType: "full", exchange: "bitget", market: "futures", symbol, exchangeTimestamp: snapshot.eventTimestamp, receiveTimestamp, timestamp: snapshot.eventTimestamp, sequence: snapshot.sequence, sequenceStatus: "synchronized", bids: snapshot.bids, asks: snapshot.asks, mediumBids: snapshot.bids.slice(0, 100), mediumAsks: snapshot.asks.slice(0, 100), packet: createMarketPacket({ exchange: "bitget", market: "futures", symbol, eventType: type, timestamp: snapshot.eventTimestamp, receiveTimestamp, sequence: snapshot.sequence, payload: { bids: snapshot.bids, asks: snapshot.asks } }) }});
    }
}

module.exports = BitgetFuturesWS;

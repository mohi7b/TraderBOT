/**
 * Binance Futures WebSocket – Depth + Trades + MarkPrice + Funding + Liquidation
 * collector/crypto/realtime/venues/binance/futures/ws.cjs
 */

const WebSocket = require("ws");
const { createMarketPacket } = require("../../../../common/market-packet.cjs");
const BinanceOrderBookSynchronizer = require("./orderbook-sync.cjs");

class BinanceFuturesWS {

    constructor({ symbol, handler, onCritical }) {
        this.symbol = symbol.toLowerCase(); // binance uses lowercase
        this.handler = handler;
        this.onCritical = onCritical || (() => {});
        this.ws = null;
        this.book = { bids: new Map(), asks: new Map() };
        this.fullBook = {
            synced: false,
            syncing: false,
            lastUpdateId: null,
            buffered: []
        };

        this.orderBookSync = new BinanceOrderBookSynchronizer({
            snapshotUrl: `https://fapi.binance.com/fapi/v1/depth?symbol=${this.symbol.toUpperCase()}&limit=1000`,
            onSnapshot: snapshot => this.emitFullSnapshot(snapshot),
            onUpdate: update => this.emitFullUpdate(update),
            onStateChange: (status, error) => {
                this.fullBook.synced = status === "healthy";
                this.fullBook.syncing = status === "syncing";
                this.fullBook.lastUpdateId = this.orderBookSync.lastUpdateId;
                this.traceDebug("fullbook_state", {
                    status,
                    lastUpdateId: this.orderBookSync.lastUpdateId,
                    error: error && error.message
                });
            }
        });

        this.url = "wss://fstream.binance.com/stream?streams=" +
            `${this.symbol}@depth20@100ms/` +
            `${this.symbol}@depth@100ms/` +
            `${this.symbol}@trade/` +
            `${this.symbol}@markPrice@1s/` +
            `${this.symbol}@forceOrder/` +
            `${this.symbol}@kline_1m`;
    }

    traceDebug(kind, payload = {}) {
        if (global.debugTrace) {
            global.debugTrace(kind, {
                symbol: this.symbol.toUpperCase(),
                ...payload
            });
        }
    }

    syncFullBook() {
        this.traceDebug("fullbook_sync_start", { lastUpdateId: null });
        this.orderBookSync.start();
    }

    applyLevels(levels, side) {
        const target = side === "bid" ? this.book.bids : this.book.asks;

        for (const level of levels || []) {
            const price = Number(level[0]);
            const qty = Number(level[1]);

            if (!Number.isFinite(price)) continue;

            if (!Number.isFinite(qty) || qty <= 0) {
                target.delete(price);
            } else {
                target.set(price, qty);
            }
        }
    }

    handleFullDepth(data) {
        if (!data) return;
        this.orderBookSync.push(data);
    }

    emitFullSnapshot(snapshot) {
        const symbol = this.symbol.toUpperCase();
        const timestamp = snapshot.eventTimestamp || Date.now();
        this.handler({
            symbol: this.symbol.toUpperCase(),
            data: {
                type: "depth_full_snapshot",
                event: "depth_full_snapshot",
                timestamp,
                bids: snapshot.bids,
                asks: snapshot.asks,
                mediumBids: snapshot.bids.slice(0, 100),
                mediumAsks: snapshot.asks.slice(0, 100),
                packet: createMarketPacket({
                    exchange: "binance",
                    market: "futures",
                    symbol,
                    eventType: "depth_full_snapshot",
                    timestamp,
                    receiveTimestamp: Date.now(),
                    sequence: {
                        lastUpdateId: snapshot.lastUpdateId
                    },
                    payload: {
                        bids: snapshot.bids,
                        asks: snapshot.asks
                    }
                })
            }
        });
    }

    emitFullUpdate(update) {
        const symbol = this.symbol.toUpperCase();
        const timestamp = update.eventTimestamp || Date.now();
        this.handler({
            symbol,
            data: {
                type: "depth_full_diff",
                event: "depth_full_diff",
                timestamp,
                bids: update.bids,
                asks: update.asks,
                mediumBids: update.bids.slice(0, 100),
                mediumAsks: update.asks.slice(0, 100),
                packet: createMarketPacket({
                    exchange: "binance",
                    market: "futures",
                    symbol,
                    eventType: "depth_full_diff",
                    timestamp,
                    receiveTimestamp: Date.now(),
                    sequence: {
                        firstUpdateId: update.firstUpdateId,
                        lastUpdateId: update.lastUpdateId,
                        previousUpdateId: update.previousUpdateId
                    },
                    payload: {
                        bids: update.bids,
                        asks: update.asks
                    }
                })
            }
        });
    }

    connect() {
        console.log(`[BINANCE-WS] Connecting to ${this.url} ...`);

        try {
            this.ws = new WebSocket(this.url);

            /* OPEN */
            this.ws.on("open", () => {
                console.log("[BINANCE-WS] Connected.");
                global.wsConnected = true;
                this.syncFullBook();
            });

            /* MESSAGE */
            this.ws.on("message", raw => {
                try {
                    const msg = JSON.parse(raw);

                    if (!msg.stream || !msg.data) return;

                    const stream = msg.stream;
                    const data = msg.data;
                    const receiveTimestamp = Date.now();

                    /* DEPTH */
                    if (stream.includes("@depth20")) {
                        const bids = data.b.map(l => ({
                            price: Number(l[0]),
                            qty: Number(l[1])
                        }));

                        const asks = data.a.map(l => ({
                            price: Number(l[0]),
                            qty: Number(l[1])
                        }));

                        console.log("[BINANCE-WS] Depth Update");

                        this.handler({
                            symbol: this.symbol.toUpperCase(),
                            data: {
                                type: "depth_partial",
                                event: "depth_partial",
                                /* Binance partial-book streams push the complete top-20
                                 * book on every message → it is a native book, not a patch. */
                                depthType: "native_top_n",
                                exchange: "binance",
                                market: "futures",
                                timestamp: data.E,
                                bids,
                                asks,
                                packet: createMarketPacket({
                                    exchange: "binance",
                                    market: "futures",
                                    symbol: this.symbol.toUpperCase(),
                                    eventType: "depth_partial",
                                    timestamp: data.E,
                                    receiveTimestamp,
                                    sequence: {
                                        firstUpdateId: data.U,
                                        lastUpdateId: data.u,
                                        previousUpdateId: data.pu
                                    },
                                    payload: { bids, asks }
                                })
                            }
                        });
                    }

                    /* FULL ORDER BOOK DIFF */
                    if (stream.includes("@depth@")) {
                        this.handleFullDepth(data);
                    }

                    /* TRADES */
                    if (stream.includes("@trade")) {
                        console.log("[BINANCE-WS] Trade Update");

                        this.handler({
                            symbol: this.symbol.toUpperCase(),
                            data: {
                                type: "trade",
                                event: "trade",
                                price: Number(data.p),
                                qty: Number(data.q),
                                side: data.m ? "sell" : "buy",
                                timestamp: data.T,
                                packet: createMarketPacket({
                                    exchange: "binance",
                                    market: "futures",
                                    symbol: this.symbol.toUpperCase(),
                                    eventType: "trade",
                                    timestamp: data.T,
                                    receiveTimestamp,
                                    sequence: data.t,
                                    payload: {
                                        price: Number(data.p),
                                        qty: Number(data.q),
                                        side: data.m ? "sell" : "buy"
                                    }
                                })
                            }
                        });
                    }

                    /* MARK PRICE + FUNDING */
                    if (stream.includes("@markPrice")) {
                        const symbol = this.symbol.toUpperCase();

                        console.log("[BINANCE-WS] Mark Price Update");

                        this.handler({
                            symbol,
                            data: {
                                type: "mark_price",
                                event: "mark_price",
                                price: Number(data.p),
                                indexPrice: Number(data.i),
                                timestamp: data.E,
                                packet: createMarketPacket({
                                    exchange: "binance",
                                    market: "futures",
                                    symbol,
                                    eventType: "mark_price",
                                    timestamp: data.E,
                                    receiveTimestamp,
                                    payload: {
                                        price: Number(data.p),
                                        indexPrice: Number(data.i)
                                    }
                                })
                            }
                        });

                        this.handler({
                            symbol,
                            data: {
                                type: "funding",
                                event: "funding",
                                rate: Number(data.r),
                                nextFundingTime: data.T,
                                timestamp: data.E,
                                packet: createMarketPacket({
                                    exchange: "binance",
                                    market: "futures",
                                    symbol,
                                    eventType: "funding",
                                    timestamp: data.E,
                                    receiveTimestamp,
                                    payload: {
                                        rate: Number(data.r),
                                        nextFundingTime: data.T
                                    }
                                })
                            }
                        });
                    }

                    /* LIQUIDATION */
                    if (stream.includes("@forceOrder")) {
                        const order = data.o || data;
                        const symbol = this.symbol.toUpperCase();

                        console.log("[BINANCE-WS] Liquidation Update");

                        this.handler({
                            symbol,
                            data: {
                                type: "liquidation",
                                event: "liquidation",
                                price: Number(order.ap || order.p),
                                qty: Number(order.z || order.q),
                                side: order.S === "BUY" ? "buy" : "sell",
                                timestamp: data.E || order.T,
                                packet: createMarketPacket({
                                    exchange: "binance",
                                    market: "futures",
                                    symbol,
                                    eventType: "liquidation",
                                    timestamp: data.E || order.T,
                                    receiveTimestamp,
                                    sequence: order.i,
                                    payload: {
                                        price: Number(order.ap || order.p),
                                        qty: Number(order.z || order.q),
                                        side: order.S === "BUY" ? "buy" : "sell",
                                        orderType: order.o,
                                        status: order.X
                                    }
                                })
                            }
                        });
                    }

                    /* CANDLE */
                    if (stream.includes("@kline_1m")) {
                        const candle = data.k;
                        const symbol = this.symbol.toUpperCase();

                        if (!candle) return;

                        console.log("[BINANCE-WS] Candle Update");

                        this.handler({
                            symbol,
                            data: {
                                type: "candle",
                                event: "candle",
                                open: Number(candle.o),
                                high: Number(candle.h),
                                low: Number(candle.l),
                                close: Number(candle.c),
                                volume: Number(candle.v),
                                timestamp: candle.t,
                                closeTime: candle.T,
                                isClosed: candle.x,
                                packet: createMarketPacket({
                                    exchange: "binance",
                                    market: "futures",
                                    symbol,
                                    eventType: "candle",
                                    timestamp: candle.t,
                                    receiveTimestamp,
                                    payload: {
                                        interval: candle.i,
                                        open: Number(candle.o),
                                        high: Number(candle.h),
                                        low: Number(candle.l),
                                        close: Number(candle.c),
                                        volume: Number(candle.v),
                                        closeTime: candle.T,
                                        isClosed: candle.x
                                    }
                                })
                            }
                        });
                    }

                } catch (err) {
                    console.log("[BINANCE-WS] ERROR parsing message:", err);
                    this.onCritical(err);
                }
            });

            /* CLOSE */
            this.ws.on("close", () => {
                console.log("[BINANCE-WS] Connection closed. Reconnecting...");
                global.wsConnected = false;
                setTimeout(() => this.connect(), 1500);
            });

            /* ERROR */
            this.ws.on("error", err => {
                console.log("[BINANCE-WS] ERROR:", err);
                global.wsConnected = false;
                this.onCritical(err);
            });

        } catch (err) {
            console.log("[BINANCE-WS] CRITICAL ERROR:", err);
            this.onCritical(err);
        }
    }
}

module.exports = BinanceFuturesWS;

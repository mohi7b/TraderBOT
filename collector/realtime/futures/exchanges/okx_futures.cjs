/**
 * ============================================================
 *  File: okx_futures.cjs
 *  Version: 10.0.0 (ENTERPRISE OKX FUTURES COLLECTOR)
 * ============================================================
 */

const WebSocket = require("ws");

// MARKET COLLECTORS
const FuturesTradesCollector     = require("../market/trades.cjs");
const FuturesAggTradesCollector  = require("../market/aggtrade.cjs");
const FuturesCandlesCollector    = require("../market/candles.cjs");
const FuturesMarkPriceCollector  = require("../market/mark_price.cjs");
const FuturesFundingCollector    = require("../market/funding.cjs");
const FuturesOICollector         = require("../market/oi.cjs");

// ORDERBOOK COLLECTORS
const FuturesDepthCollector      = require("../orderbook/depth.cjs");
const FuturesDepthNormalizer     = require("../orderbook/depth_normalizer.cjs");
const FuturesDepthLevels         = require("../orderbook/depth_levels.cjs");
const FuturesDepthSpeed          = require("../orderbook/depth_speed.cjs");
const FuturesDepthPressure       = require("../orderbook/depth_pressure.cjs");
const FuturesDepthLiquidity      = require("../orderbook/depth_liquidity.cjs");
const FuturesDepthImbalance      = require("../orderbook/depth_imbalance.cjs");
const FuturesDepthAbsorption     = require("../orderbook/depth_absorption.cjs");

class OKXFuturesCollector {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "okx_futures";
        this.symbol = null;

        this.ws = null;

        // MARKET COLLECTORS
        this.tradesCollector     = new FuturesTradesCollector();
        this.aggTradesCollector  = new FuturesAggTradesCollector();
        this.candlesCollector    = new FuturesCandlesCollector();
        this.markPriceCollector  = new FuturesMarkPriceCollector();
        this.fundingCollector    = new FuturesFundingCollector();
        this.oiCollector         = new FuturesOICollector();

        // ORDERBOOK COLLECTORS
        this.depthCollector      = new FuturesDepthCollector();
        this.depthNormalizer     = new FuturesDepthNormalizer();
        this.depthLevels         = new FuturesDepthLevels();
        this.depthSpeed          = new FuturesDepthSpeed();
        this.depthPressure       = new FuturesDepthPressure();
        this.depthLiquidity      = new FuturesDepthLiquidity();
        this.depthImbalance      = new FuturesDepthImbalance();
        this.depthAbsorption     = new FuturesDepthAbsorption();
    }

    setSymbol(symbol) {
        this.symbol = symbol;
    }

    connect() {
        if (!this.symbol) throw new Error("Symbol not set before connect()");

        const instId = this.symbol.replace("USDT", "-USDT-SWAP");

        const url = `wss://ws.okx.com:8443/ws/v5/public`;

        this.log.info(`Connecting WS → OKX Futures (${instId})`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → OKX Futures (${instId})`);

            const sub = {
                op: "subscribe",
                args: [
                    { channel: "trades", instId },
                    { channel: "tickers", instId },
                    { channel: "candle1m", instId },
                    { channel: "funding-rate", instId },
                    { channel: "open-interest", instId },
                    { channel: "books", instId, sz: "50" },
                    { channel: "books", instId, sz: "200" },
                    { channel: "books-l2-tbt", instId }
                ]
            };

            this.ws.send(JSON.stringify(sub));
        });

        this.ws.on("message", (msg) => {
            try {
                const event = JSON.parse(msg);

                if (!event.arg || !event.data) return;

                const channel = event.arg.channel;
                const payload = event.data[0];
                const market  = this.exchange;
                const symbol  = this.symbol;

                // -----------------------------
                // MARKET STREAMS
                // -----------------------------

                if (channel === "trades") {
                    this.tradesCollector.handle(market, symbol, payload);
                    this.aggTradesCollector.handle(market, symbol, payload);
                    return;
                }

                if (channel === "tickers") {
                    this.markPriceCollector.handle(market, symbol, payload);
                    return;
                }

                if (channel === "candle1m") {
                    this.candlesCollector.handle(market, symbol, payload);
                    return;
                }

                if (channel === "funding-rate") {
                    this.fundingCollector.handle(market, symbol, payload);
                    return;
                }

                if (channel === "open-interest") {
                    this.oiCollector.handle(market, symbol, payload);
                    return;
                }

                // -----------------------------
                // ORDERBOOK STREAMS
                // -----------------------------

                if (channel === "books" && event.arg.sz === "50") {
                    this.depthCollector.handle(market, symbol, payload);
                    return;
                }

                if (channel === "books" && event.arg.sz === "200") {
                    this.depthCollector.handle(market, symbol, payload);
                    return;
                }

                if (channel === "books-l2-tbt") {
                    const delta = {
                        symbol,
                        updateId: payload.seqId,
                        eventTime: Date.now(),
                        bids: payload.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
                        asks: payload.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
                    };

                    const snapshot = this.depthNormalizer.handle(market, symbol, delta);
                    if (!snapshot) return;

                    const levels = this.depthLevels.handle(market, symbol, snapshot);
                    if (!levels) return;

                    this.depthSpeed.handle(market, symbol, levels);
                    this.depthPressure.handle(market, symbol, levels);
                    this.depthLiquidity.handle(market, symbol, levels);
                    this.depthImbalance.handle(market, symbol, levels);
                    this.depthAbsorption.handle(market, symbol, levels);

                    return;
                }

            } catch (err) {
                this.log.error(`WS Message Error → ${err.message}`);
            }
        });

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → OKX Futures (${instId})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
}

module.exports = OKXFuturesCollector;

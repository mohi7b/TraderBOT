/**
 * ============================================================
 *  File: bybit_futures.cjs
 *  Version: 10.0.0 (ENTERPRISE BYBIT FUTURES COLLECTOR)
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

class BybitFuturesCollector {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "bybit_futures";
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

        const instId = this.symbol; // Bybit uses BTCUSDT directly

        const url = `wss://stream.bybit.com/v5/public/linear`;

        this.log.info(`Connecting WS → Bybit Futures (${instId})`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → Bybit Futures (${instId})`);

            const sub = {
                op: "subscribe",
                args: [
                    `publicTrade.${instId}`,
                    `tickers.${instId}`,
                    `kline.1.${instId}`,
                    `fundingRate.${instId}`,
                    `openInterest.${instId}`,
                    `orderbook.50.${instId}`,
                    `orderbook.200.${instId}`,
                    `orderbook.500.${instId}`,
                    `orderbook.1000.${instId}`,
                    `orderbookL2.${instId}`
                ]
            };

            this.ws.send(JSON.stringify(sub));
        });

        this.ws.on("message", (msg) => {
            try {
                const event = JSON.parse(msg);

                if (!event.topic || !event.data) return;

                const topic = event.topic;
                const payload = event.data;
                const market  = this.exchange;
                const symbol  = this.symbol;

                // -----------------------------
                // MARKET STREAMS
                // -----------------------------

                if (topic.startsWith("publicTrade")) {
                    payload.forEach(t => {
                        this.tradesCollector.handle(market, symbol, t);
                        this.aggTradesCollector.handle(market, symbol, t);
                    });
                    return;
                }

                if (topic.startsWith("tickers")) {
                    this.markPriceCollector.handle(market, symbol, payload[0]);
                    return;
                }

                if (topic.startsWith("kline")) {
                    this.candlesCollector.handle(market, symbol, payload[0]);
                    return;
                }

                if (topic.startsWith("fundingRate")) {
                    this.fundingCollector.handle(market, symbol, payload[0]);
                    return;
                }

                if (topic.startsWith("openInterest")) {
                    this.oiCollector.handle(market, symbol, payload[0]);
                    return;
                }

                // -----------------------------
                // ORDERBOOK STREAMS
                // -----------------------------

                if (topic.startsWith("orderbook.") && !topic.includes("L2")) {
                    this.depthCollector.handle(market, symbol, payload);
                    return;
                }

                if (topic.startsWith("orderbookL2")) {
                    const delta = {
                        symbol,
                        updateId: Date.now(),
                        eventTime: Date.now(),
                        bids: payload.b.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
                        asks: payload.a.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
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
            this.log.warn(`WS Closed → Bybit Futures (${instId})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
}

module.exports = BybitFuturesCollector;

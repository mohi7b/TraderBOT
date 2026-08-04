/**
 * ============================================================
 *  File: okx_spot.cjs
 *  Version: 10.0.0 (ENTERPRISE OKX SPOT COLLECTOR)
 * ============================================================
 */

const WebSocket = require("ws");

// MARKET COLLECTORS
const SpotTradesCollector     = require("../market/trades.cjs");
const SpotAggTradesCollector  = require("../market/aggTrades.cjs");
const SpotBookTickerCollector = require("../market/bookTicker.cjs");
const SpotCandlesCollector    = require("../market/candles.cjs");
const SpotPriceCollector      = require("../market/price.cjs");
const SpotFundingCollector    = require("../market/funding.cjs");
const SpotOICollector         = require("../market/oi.cjs");

// ORDERBOOK COLLECTORS
const SpotDepthCollector      = require("../orderbook/depth.cjs");
const SpotDepthNormalizer     = require("../orderbook/depth_normalizer.cjs");
const SpotDepthLevels         = require("../orderbook/depth_levels.cjs");
const SpotDepthSpeed          = require("../orderbook/depth_speed.cjs");
const SpotDepthPressure       = require("../orderbook/depth_pressure.cjs");
const SpotDepthLiquidity      = require("../orderbook/depth_liquidity.cjs");
const SpotDepthImbalance      = require("../orderbook/depth_imbalance.cjs");
const SpotDepthAbsorption     = require("../orderbook/depth_absorption.cjs");

class OKXSpotCollector {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "okx_spot";
        this.symbol = null;

        this.ws = null;

        // MARKET COLLECTORS
        this.tradesCollector     = new SpotTradesCollector();
        this.aggTradesCollector  = new SpotAggTradesCollector();
        this.bookTickerCollector = new SpotBookTickerCollector();
        this.candlesCollector    = new SpotCandlesCollector();
        this.priceCollector      = new SpotPriceCollector();
        this.fundingCollector    = new SpotFundingCollector();
        this.oiCollector         = new SpotOICollector();

        // ORDERBOOK COLLECTORS
        this.depthCollector      = new SpotDepthCollector();
        this.depthNormalizer     = new SpotDepthNormalizer();
        this.depthLevels         = new SpotDepthLevels();
        this.depthSpeed          = new SpotDepthSpeed();
        this.depthPressure       = new SpotDepthPressure();
        this.depthLiquidity      = new SpotDepthLiquidity();
        this.depthImbalance      = new SpotDepthImbalance();
        this.depthAbsorption     = new SpotDepthAbsorption();
    }

    setSymbol(symbol) {
        this.symbol = symbol;
    }

    connect() {
        if (!this.symbol) throw new Error("Symbol not set before connect()");

        const instId = this.symbol.replace("USDT", "-USDT");

        const url = `wss://ws.okx.com:8443/ws/v5/public`;

        this.log.info(`Connecting WS → OKX Spot (${instId})`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → OKX Spot (${instId})`);

            const sub = {
                op: "subscribe",
                args: [
                    { channel: "trades", instId },
                    { channel: "tickers", instId },
                    { channel: "candle1m", instId },
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
                const data = event.data[0];
                const market = this.exchange;
                const symbol = this.symbol;

                // -----------------------------
                // MARKET STREAMS
                // -----------------------------

                if (channel === "trades") {
                    this.tradesCollector.handle(market, symbol, data);
                    this.aggTradesCollector.handle(market, symbol, data);
                    return;
                }

                if (channel === "tickers") {
                    this.priceCollector.handle(market, symbol, data);
                    return;
                }

                if (channel === "candle1m") {
                    this.candlesCollector.handle(market, symbol, data);
                    return;
                }

                // Funding & OI (always zero)
                this.fundingCollector.handle(market, symbol);
                this.oiCollector.handle(market, symbol);

                // -----------------------------
                // ORDERBOOK STREAMS
                // -----------------------------

                if (channel === "books" && event.arg.sz === "50") {
                    this.depthCollector.handle(market, symbol, data);
                    return;
                }

                if (channel === "books" && event.arg.sz === "200") {
                    this.depthCollector.handle(market, symbol, data);
                    return;
                }

                if (channel === "books-l2-tbt") {
                    const delta = {
                        symbol,
                        updateId: data.seqId,
                        eventTime: Date.now(),
                        bids: data.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
                        asks: data.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
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
            this.log.warn(`WS Closed → OKX Spot (${instId})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
}

module.exports = OKXSpotCollector;

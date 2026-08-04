/**
 * ============================================================
 *  File: binance_spot.cjs
 *  Version: 10.0.0 (ENTERPRISE SPOT COLLECTOR — FINAL)
 *
 *  Description:
 *      Full Enterprise-Level Spot Collector
 *      ✔ یک WS واحد با تمام streamها
 *      ✔ depth50 / depth200 / depth1000
 *      ✔ Full Depth واقعی (merge incremental updates)
 *      ✔ اتصال کامل به تمام Market Collectors
 *      ✔ اتصال کامل به تمام Orderbook Collectors
 *      ✔ سازگار با Cluster و Single-Process
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

class SpotDepthFullBuilder {
    constructor() {
        this.bids = {};
        this.asks = {};
    }

    applyUpdate(update) {
        update.bids.forEach(([price, qty]) => {
            if (qty === "0") delete this.bids[price];
            else this.bids[price] = qty;
        });

        update.asks.forEach(([price, qty]) => {
            if (qty === "0") delete this.asks[price];
            else this.asks[price] = qty;
        });
    }

    getFullDepth() {
        return {
            bids: Object.entries(this.bids)
                .map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
                .sort((a, b) => b.price - a.price),

            asks: Object.entries(this.asks)
                .map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
                .sort((a, b) => a.price - b.price)
        };
    }
}

class BinanceSpotCollector {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "binance_spot";
        this.symbol = null;

        this.ws = null;

        this.fullDepthBuilder = new SpotDepthFullBuilder();

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
        if (!this.symbol) {
            throw new Error("Symbol not set before connect()");
        }

        const s = this.symbol.toLowerCase();

        const streams = [
            `${s}@trade`,
            `${s}@aggTrade`,
            `${s}@bookTicker`,
            `${s}@kline_1m`,
            `${s}@ticker`,
            `${s}@depth50`,
            `${s}@depth200`,
            `${s}@depth1000`
        ];

        const url = `wss://stream.binance.com:9443/stream?streams=${streams.join("/")}`;

        this.log.info(`Connecting WS → ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → Binance Spot (${this.symbol})`);
        });

        this.ws.on("message", (msg) => {
            try {
                const event = JSON.parse(msg);
                const { stream, data } = event;

                if (!stream || !data) return;

                const market = this.exchange;
                const symbol = this.symbol;

                // -----------------------------
                // MARKET STREAMS
                // -----------------------------

                if (stream.endsWith("@trade"))
                    return this.tradesCollector.handle(market, symbol, data);

                if (stream.endsWith("@aggTrade"))
                    return this.aggTradesCollector.handle(market, symbol, data);

                if (stream.endsWith("@bookTicker"))
                    return this.bookTickerCollector.handle(market, symbol, data);

                if (stream.includes("@kline"))
                    return this.candlesCollector.handle(market, symbol, data);

                if (stream.endsWith("@ticker"))
                    return this.priceCollector.handle(market, symbol, data);

                // Funding & OI (always zero)
                this.fundingCollector.handle(market, symbol);
                this.oiCollector.handle(market, symbol);

                // -----------------------------
                // ORDERBOOK STREAMS
                // -----------------------------

                if (stream.endsWith("@depth50"))
                    return this.depthCollector.handle(market, symbol, data);

                if (stream.endsWith("@depth200"))
                    return this.depthCollector.handle(market, symbol, data);

                // FULL DEPTH REAL (depth1000)
                if (stream.endsWith("@depth1000")) {

                    this.fullDepthBuilder.applyUpdate(data);

                    const fullDepth = this.fullDepthBuilder.getFullDepth();

                    const delta = {
                        symbol,
                        updateId: data.u,
                        eventTime: data.E,
                        bids: fullDepth.bids,
                        asks: fullDepth.asks
                    };

                    // Normalize → Full Snapshot
                    const snapshot = this.depthNormalizer.handle(market, symbol, delta);
                    if (!snapshot) return;

                    // Levels
                    const levels = this.depthLevels.handle(market, symbol, snapshot);
                    if (!levels) return;

                    // Speed
                    this.depthSpeed.handle(market, symbol, levels);

                    // Pressure
                    this.depthPressure.handle(market, symbol, levels);

                    // Liquidity
                    this.depthLiquidity.handle(market, symbol, levels);

                    // Imbalance
                    this.depthImbalance.handle(market, symbol, levels);

                    // Absorption
                    this.depthAbsorption.handle(market, symbol, levels);

                    return;
                }

            } catch (err) {
                this.log.error(`WS Message Error → ${err.message}`);
            }
        });

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → Binance Spot (${this.symbol})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
}

module.exports = BinanceSpotCollector;

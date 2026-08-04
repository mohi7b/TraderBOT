/**
 * ============================================================
 *  File: binance_spot-realtime.cjs
 *  Path: collector/realtime/spot/exchanges/binance_spot-realtime.cjs
 *  Version: 10.0.0 (Enterprise Spot)
 *
 *  Description:
 *      Full realtime WebSocket collector for Binance Spot.
 *      Enterprise version — fully aligned with Futures Enterprise.
 *
 *      Streams:
 *          - @trade
 *          - @aggTrade
 *          - @bookTicker
 *          - @kline_1m
 *          - @depth5 / 50 / 200
 *          - @depth (Full Depth Incremental)
 *
 *      Includes ALL processors:
 *          - Price (delta, speed, trend)
 *          - AggTrade (delta, speed, trend)
 *          - Depth (all enterprise processors)
 *
 *      Aggregators:
 *          - Spot Symbol Aggregator
 *          - Spot Exchange Aggregator
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

const WebSocket = require("ws");

// MARKET PROCESSORS
const Price              = require("../market/price.cjs");
const PriceDelta         = require("../market/price_delta.cjs");
const PriceSpeed         = require("../market/price_speed.cjs");
const PriceTrend         = require("../market/price_trend.cjs");

const AggTradeDelta      = require("../market/aggtrade_delta.cjs");
const AggTradeSpeed      = require("../market/aggtrade_speed.cjs");
const AggTradeTrend      = require("../market/aggtrade_trend.cjs");

// DEPTH PROCESSORS
const Depth              = require("../orderbook/depth.cjs");
const DepthAbsorption    = require("../orderbook/depth_absorption.cjs");
const DepthAgg           = require("../orderbook/depth_agg.cjs");
const DepthSpeed         = require("../orderbook/depth_speed.cjs");
const DepthPressure      = require("../orderbook/depth_pressure.cjs");
const DepthLiquidity     = require("../orderbook/depth_liquidity.cjs");
const DepthImbalance     = require("../orderbook/depth_imbalance.cjs");
const DepthLevels        = require("../orderbook/depth_levels.cjs");
const DepthHeatmap       = require("../orderbook/depth_heatmap.cjs");
const DepthNormalizer    = require("../orderbook/depth_normalizer.cjs");
const DepthClusters      = require("../orderbook/depth_clusters.cjs");

const Depth5             = require("../orderbook/depth_5.cjs");
const Depth50            = require("../orderbook/depth_50.cjs");
const Depth200           = require("../orderbook/depth_200.cjs");
const DepthFull          = require("../orderbook/depth_full.cjs");

// AGGREGATORS
const SymbolAggregator   = require("../aggregator/realtime-spot-symbol-aggregator.cjs");
const ExchangeAggregator = require("../aggregator/realtime-spot-exchange-aggregator.cjs");
class BinanceSpotRealtime {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "binance_spot";
        this.symbol = null;

        this.ws = null;

        // MARKET
        this.price              = new Price();
        this.priceDelta         = new PriceDelta();
        this.priceSpeed         = new PriceSpeed();
        this.priceTrend         = new PriceTrend();

        this.aggTradeDelta      = new AggTradeDelta();
        this.aggTradeSpeed      = new AggTradeSpeed();
        this.aggTradeTrend      = new AggTradeTrend();

        // DEPTH
        this.depth              = new Depth();
        this.depthAbsorption    = new DepthAbsorption();
        this.depthAgg           = new DepthAgg();
        this.depthSpeed         = new DepthSpeed();
        this.depthPressure      = new DepthPressure();
        this.depthLiquidity     = new DepthLiquidity();
        this.depthImbalance     = new DepthImbalance();
        this.depthLevels        = new DepthLevels();
        this.depthHeatmap       = new DepthHeatmap();
        this.depthNormalizer    = new DepthNormalizer();
        this.depthClusters      = new DepthClusters();

        this.depth5             = new Depth5();
        this.depth50            = new Depth50();
        this.depth200           = new Depth200();
        this.depthFull          = new DepthFull();

        // AGGREGATORS
        this.symbolAgg          = new SymbolAggregator();
        this.exchangeAgg        = new ExchangeAggregator(this.exchange);
    }

    setSymbol(symbol) {
        this.symbol = symbol;
    }
    connect() {
        if (!this.symbol)
            throw new Error("Symbol not set before connect()");

        const s = this.symbol.toLowerCase();

        const streams = [
            `${s}@trade`,
            `${s}@aggTrade`,
            `${s}@bookTicker`,
            `${s}@kline_1m`,
            `${s}@depth5`,
            `${s}@depth50`,
            `${s}@depth200`,
            `${s}@depth`
        ];

        const url = `wss://stream.binance.com:9443/stream?streams=${streams.join("/")}`;

        this.log.info(`Connecting Binance Spot WS → ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → Binance Spot (${this.symbol})`);
        });

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → Binance Spot (${this.symbol})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
    handleMarketStream(stream, data) {
        const market = this.exchange;
        const symbol = this.symbol;

        if (stream.includes("@trade")) {
            this.price.handle(market, symbol, data);
            this.priceDelta.handle(market, symbol, data);
            this.priceSpeed.handle(market, symbol, data);
            this.priceTrend.handle(market, symbol, data);
            return;
        }

        if (stream.includes("@aggTrade")) {
            this.aggTradeDelta.handle(market, symbol, data);
            this.aggTradeSpeed.handle(market, symbol, data);
            this.aggTradeTrend.handle(market, symbol, data);
            return;
        }

        if (stream.includes("@bookTicker")) {
            this.price.handle(market, symbol, data);
            this.priceDelta.handle(market, symbol, data);
            this.priceSpeed.handle(market, symbol, data);
            this.priceTrend.handle(market, symbol, data);
            return;
        }

        if (stream.includes("@kline")) {
            this.candlesCollector?.handle?.(market, symbol, data);
            return;
        }
    }
    handleOrderbookStream(stream, data) {
        const market = this.exchange;
        const symbol = this.symbol;

        if (stream.includes("@depth") && !stream.includes("@depth@")) {

            this.depth.handle(market, symbol, data);

            this.depthAbsorption.handle(market, symbol, data);
            this.depthAgg.handle(market, symbol, data);
            this.depthSpeed.handle(market, symbol, data);
            this.depthPressure.handle(market, symbol, data);
            this.depthLiquidity.handle(market, symbol, data);
            this.depthImbalance.handle(market, symbol, data);
            this.depthLevels.handle(market, symbol, data);
            this.depthHeatmap.handle(market, symbol, data);
            this.depthClusters.handle(market, symbol, data);

            if (stream.includes("depth5"))
                this.depth5.handle(market, symbol, data);

            if (stream.includes("depth50"))
                this.depth50.handle(market, symbol, data);

            if (stream.includes("depth200"))
                this.depth200.handle(market, symbol, data);

            return;
        }

        if (stream.endsWith("@depth")) {

            const delta = {
                symbol,
                updateId: data.lastUpdateId,
                eventTime: Date.now(),
                bids: data.b.map(([p, q]) => ({
                    price: parseFloat(p),
                    quantity: parseFloat(q)
                })),
                asks: data.a.map(([p, q]) => ({
                    price: parseFloat(p),
                    quantity: parseFloat(q)
                }))
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
            this.depthHeatmap.handle(market, symbol, levels);
            this.depthClusters.handle(market, symbol, levels);

            this.depthFull.handle(market, symbol, snapshot);

            return;
        }
    }

    handleMessage(packet) {
        try {
            const stream = packet.stream;
            const data   = packet.data;

            if (!stream || !data) return;

            this.handleMarketStream(stream, data);
            this.handleOrderbookStream(stream, data);

        } catch (err) {
            this.log.error(`Binance Spot WS Error → ${err.message}`);
        }
    }

    bind() {
        this.ws.on("message", (msg) => {
            try {
                const packet = JSON.parse(msg);
                this.handleMessage(packet);
            } catch (err) {
                this.log.error(`WS Parse Error → ${err.message}`);
            }
        });
    }

    start() {
        this.connect();
        this.bind();
        this.log.success(`Binance Spot Enterprise Collector Started → ${this.symbol}`);
    }
}

module.exports = BinanceSpotRealtime;

/**
 * ============================================================
 *  File: bybit_spot-realtime.cjs
 *  Path: collector/realtime/spot/exchanges/bybit_spot-realtime.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Full realtime WebSocket collector for Bybit Spot (USDT pairs).
 *      Enterprise version with full stream support + full processor support.
 *
 *      Streams:
 *          - publicTrade
 *          - tickers
 *          - kline.1
 *          - orderbook.50 / 200
 *          - orderbookL2 (Full Depth Incremental)
 *
 *      Includes ALL processors:
 *          - Price Advanced
 *          - Depth Advanced
 *          - Depth 50 / 200 / Full
 *
 *      Aggregators:
 *          - Symbol Aggregator
 *          - Exchange Aggregator
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

const Depth50            = require("../orderbook/depth_50.cjs");
const Depth200           = require("../orderbook/depth_200.cjs");
const DepthFull          = require("../orderbook/depth_full.cjs");

// AGGREGATORS
const SymbolAggregator   = require("../aggregator/realtime-spot-symbol-aggregator.cjs");
const ExchangeAggregator = require("../aggregator/realtime-spot-exchange-aggregator.cjs");
class BybitSpotRealtime {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "bybit_spot";
        this.symbol = null;

        this.ws = null;

        // MARKET
        this.price              = new Price();
        this.priceDelta         = new PriceDelta();
        this.priceSpeed         = new PriceSpeed();
        this.priceTrend         = new PriceTrend();

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

        const instId = this.symbol;
        const url = `wss://stream.bybit.com/v5/public/spot`;

        this.log.info(`Connecting Spot WS → ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → Bybit Spot (${instId})`);

            const sub = {
                op: "subscribe",
                args: [
                    `publicTrade.${instId}`,
                    `tickers.${instId}`,
                    `kline.1.${instId}`,
                    `orderbook.50.${instId}`,
                    `orderbook.200.${instId}`,
                    `orderbookL2.${instId}`
                ]
            };

            this.ws.send(JSON.stringify(sub));
        });

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → Bybit Spot (${instId})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
    handleMarketStream(topic, payload) {
        const market = this.exchange;
        const symbol = this.symbol;

        // TRADES
        if (topic.startsWith("publicTrade")) {
            payload.forEach(t => {
                this.price.handle(market, symbol, t);
                this.priceDelta.handle(market, symbol, t);
                this.priceSpeed.handle(market, symbol, t);
                this.priceTrend.handle(market, symbol, t);
            });
            return;
        }

        // TICKERS
        if (topic.startsWith("tickers")) {
            const data = payload[0];
            this.price.handle(market, symbol, data);
            this.priceDelta.handle(market, symbol, data);
            this.priceSpeed.handle(market, symbol, data);
            this.priceTrend.handle(market, symbol, data);
            return;
        }

        // KLINE
        if (topic.startsWith("kline")) {
            const data = payload[0];
            this.candlesCollector?.handle?.(market, symbol, data);
            return;
        }
    }
    handleOrderbookStream(topic, payload) {
        const market = this.exchange;
        const symbol = this.symbol;

        // DEPTH 50 / 200
        if (topic.startsWith("orderbook.") && !topic.includes("L2")) {

            this.depth.handle(market, symbol, payload);

            this.depthAbsorption.handle(market, symbol, payload);
            this.depthAgg.handle(market, symbol, payload);
            this.depthSpeed.handle(market, symbol, payload);
            this.depthPressure.handle(market, symbol, payload);
            this.depthLiquidity.handle(market, symbol, payload);
            this.depthImbalance.handle(market, symbol, payload);
            this.depthLevels.handle(market, symbol, payload);
            this.depthHeatmap.handle(market, symbol, payload);
            this.depthClusters.handle(market, symbol, payload);

            if (topic.includes("50"))
                this.depth50.handle(market, symbol, payload);

            if (topic.includes("200"))
                this.depth200.handle(market, symbol, payload);

            return;
        }

        // FULL DEPTH
        if (topic.startsWith("orderbookL2")) {

            const delta = {
                symbol,
                updateId: Date.now(),
                eventTime: Date.now(),
                bids: payload.b.map(([p, q]) => ({
                    price: parseFloat(p),
                    quantity: parseFloat(q)
                })),
                asks: payload.a.map(([p, q]) => ({
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

    handleMessage(event) {
        try {
            const topic = event.topic;
            const payload = event.data;

            if (!topic || !payload) return;

            this.handleMarketStream(topic, payload);
            this.handleOrderbookStream(topic, payload);

        } catch (err) {
            this.log.error(`Bybit Spot WS Error → ${err.message}`);
        }
    }

    bind() {
        this.ws.on("message", (msg) => {
            try {
                const event = JSON.parse(msg);
                this.handleMessage(event);
            } catch (err) {
                this.log.error(`WS Parse Error → ${err.message}`);
            }
        });
    }

    start() {
        this.connect();
        this.bind();
        this.log.success(`Bybit Spot Enterprise Collector Started → ${this.symbol}`);
    }
}

module.exports = BybitSpotRealtime;

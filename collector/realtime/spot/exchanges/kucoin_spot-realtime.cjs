/**
 * ============================================================
 *  File: kucoin_spot-realtime.cjs
 *  Path: collector/realtime/spot/exchanges/kucoin_spot-realtime.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Full realtime WebSocket collector for KuCoin Spot.
 *      Enterprise version with full stream support + full processor support.
 *
 *      Streams:
 *          - /market/trade
 *          - /market/ticker
 *          - /market/candles
 *          - /market/level2Depth5
 *          - /market/level2Depth20
 *          - /market/level2 (Full Depth Incremental)
 *
 *      Includes ALL processors:
 *          - Price Advanced
 *          - Depth Advanced
 *          - Depth 5 / 20 / Full
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

// KuCoin Spot ONLY supports Depth5 / Depth20 / Full
const Depth5             = require("../orderbook/depth_5.cjs");
const Depth20            = require("../orderbook/depth_20.cjs");
const DepthFull          = require("../orderbook/depth_full.cjs");

// AGGREGATORS
const SymbolAggregator   = require("../aggregator/realtime-spot-symbol-aggregator.cjs");
const ExchangeAggregator = require("../aggregator/realtime-spot-exchange-aggregator.cjs");
class KuCoinSpotRealtime {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "kucoin_spot";
        this.symbol = null;

        this.ws = null;

        // MARKET PROCESSORS
        this.price              = new Price();
        this.priceDelta         = new PriceDelta();
        this.priceSpeed         = new PriceSpeed();
        this.priceTrend         = new PriceTrend();

        this.aggTradeDelta      = new AggTradeDelta();
        this.aggTradeSpeed      = new AggTradeSpeed();
        this.aggTradeTrend      = new AggTradeTrend();

        // DEPTH PROCESSORS
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

        // KuCoin Spot ONLY supports Depth5 / Depth20 / Full
        this.depth5             = new Depth5();
        this.depth20            = new Depth20();
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

        // KuCoin Spot realtime WS endpoint
        const url = `wss://ws-api.kucoin.com/spot/v1/market`;

        this.log.info(`Connecting KuCoin Spot WS → ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → KuCoin Spot (${instId})`);

            // KuCoin Spot subscription list
            const subs = [
                `/market/trade:${instId}`,
                `/market/ticker:${instId}`,
                `/market/candles:${instId}`,
                `/market/level2Depth5:${instId}`,
                `/market/level2Depth20:${instId}`,
                `/market/level2:${instId}`   // full depth incremental
            ];

            // Send all subscriptions
            subs.forEach(topic => {
                this.ws.send(JSON.stringify({
                    id: Date.now(),
                    type: "subscribe",
                    topic,
                    privateChannel: false,
                    response: true
                }));
            });
        });

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → KuCoin Spot (${instId})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
    handleMarketStream(topic, payload) {
        const market = this.exchange;
        const symbol = this.symbol;

        // TRADE
        if (topic.startsWith("/market/trade")) {
            this.price.handle(market, symbol, payload);
            this.priceDelta.handle(market, symbol, payload);
            this.priceSpeed.handle(market, symbol, payload);
            this.priceTrend.handle(market, symbol, payload);
            return;
        }

        // TICKER
        if (topic.startsWith("/market/ticker")) {
            this.price.handle(market, symbol, payload);
            this.priceDelta.handle(market, symbol, payload);
            this.priceSpeed.handle(market, symbol, payload);
            this.priceTrend.handle(market, symbol, payload);
            return;
        }

        // KLINE (CANDLES)
        if (topic.startsWith("/market/candles")) {
            this.candlesCollector?.handle?.(market, symbol, payload);
            return;
        }
    }
    handleOrderbookStream(topic, payload) {
        const market = this.exchange;
        const symbol = this.symbol;

        // DEPTH 5 / 20
        if (topic.startsWith("/market/level2Depth")) {

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

            if (topic.includes("Depth5"))
                this.depth5.handle(market, symbol, payload);

            if (topic.includes("Depth20"))
                this.depth20.handle(market, symbol, payload);

            return;
        }

        // FULL DEPTH (Incremental)
        if (topic.startsWith("/market/level2")) {

            const delta = {
                symbol,
                updateId: payload.sequence,
                eventTime: Date.now(),
                bids: payload.bids.map(([p, q]) => ({
                    price: parseFloat(p),
                    quantity: parseFloat(q)
                })),
                asks: payload.asks.map(([p, q]) => ({
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
            this.log.error(`KuCoin Spot WS Error → ${err.message}`);
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
        this.log.success(`KuCoin Spot Enterprise Collector Started → ${this.symbol}`);
    }
}

module.exports = KuCoinSpotRealtime;

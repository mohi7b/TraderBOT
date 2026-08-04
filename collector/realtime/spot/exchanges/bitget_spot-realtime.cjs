/**
 * ============================================================
 *  File: bitget_spot-realtime.cjs
 *  Path: collector/realtime/spot/exchanges/bitget_spot-realtime.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Full realtime WebSocket collector for Bitget Spot.
 *      Enterprise version with full stream support + full processor support.
 *
 *      Streams:
 *          - trade
 *          - ticker
 *          - candle1m
 *          - books?limit=50
 *          - books?limit=200
 *          - books (Full Depth Incremental)
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
class BitgetSpotRealtime {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "bitget_spot";
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

        const url = `wss://ws.bitget.com/v2/ws/public`;

        this.log.info(`Connecting Bitget Spot WS → ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → Bitget Spot (${instId})`);

            const sub = {
                op: "subscribe",
                args: [
                    { instType: "sp", channel: "trade", instId },
                    { instType: "sp", channel: "ticker", instId },
                    { instType: "sp", channel: "candle1m", instId },
                    { instType: "sp", channel: "books", instId, limit: "50" },
                    { instType: "sp", channel: "books", instId, limit: "200" },
                    { instType: "sp", channel: "books", instId } // full depth
                ]
            };

            this.ws.send(JSON.stringify(sub));
        });

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → Bitget Spot (${instId})`);
        });

        this.ws.on("error", (err) => {
            this.log.error(`WS Error → ${err.message}`);
        });
    }
    handleMarketStream(arg, payload) {
        const market = this.exchange;
        const symbol = this.symbol;

        const channel = arg.channel;

        // TRADES
        if (channel === "trade") {
            this.price.handle(market, symbol, payload);
            this.priceDelta.handle(market, symbol, payload);
            this.priceSpeed.handle(market, symbol, payload);
            this.priceTrend.handle(market, symbol, payload);
            return;
        }

        // TICKER
        if (channel === "ticker") {
            this.price.handle(market, symbol, payload);
            this.priceDelta.handle(market, symbol, payload);
            this.priceSpeed.handle(market, symbol, payload);
            this.priceTrend.handle(market, symbol, payload);
            return;
        }

        // KLINE
        if (channel === "candle1m") {
            this.candlesCollector?.handle?.(market, symbol, payload);
            return;
        }
    }
    handleOrderbookStream(arg, payload) {
        const market = this.exchange;
        const symbol = this.symbol;

        const channel = arg.channel;

        // DEPTH 50 / 200
        if (channel === "books" && arg.limit) {

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

            if (arg.limit === "50")
                this.depth50.handle(market, symbol, payload);

            if (arg.limit === "200")
                this.depth200.handle(market, symbol, payload);

            return;
        }

        // FULL DEPTH
        if (channel === "books" && !arg.limit) {

            const delta = {
                symbol,
                updateId: payload.ts,
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
            const arg = event.arg;
            const payload = event.data?.[0];

            if (!arg || !payload) return;

            this.handleMarketStream(arg, payload);
            this.handleOrderbookStream(arg, payload);

        } catch (err) {
            this.log.error(`Bitget Spot WS Error → ${err.message}`);
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
        this.log.success(`Bitget Spot Enterprise Collector Started → ${this.symbol}`);
    }
}

module.exports = BitgetSpotRealtime;

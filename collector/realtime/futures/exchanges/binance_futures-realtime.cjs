/**
 * ============================================================
 *  File: binance_futures-realtime.cjs
 *  Path: collector/realtime/futures/exchanges/binance_futures-realtime.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Full realtime WebSocket collector for Binance USDT-M Futures.
 *      Enterprise version with full stream support + full processor support.
 *
 *      Streams:
 *          - @trade
 *          - @aggTrade
 *          - @depth
 *          - @bookTicker
 *          - @markPrice
 *          - @funding
 *          - @kline_1m
 *          - @forceOrder
 *
 *      Includes ALL processors:
 *          - Price Advanced
 *          - MarkPrice Advanced
 *          - Funding Advanced
 *          - OI Advanced
 *          - Depth Advanced (10 فایل)
 *          - Depth 50 / 200 / Full
 *          - Liquidation Advanced
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

const MarkPriceDelta     = require("../market/mark_price_delta.cjs");
const MarkPriceVol       = require("../market/mark_price_volatility.cjs");
const MarkPriceTrend     = require("../market/mark_price_trend.cjs");

const FundingDelta       = require("../market/funding_delta.cjs");
const FundingTrend       = require("../market/funding_trend.cjs");
const FundingPressure    = require("../market/funding_pressure.cjs");

const OI                 = require("../market/oi.cjs");
const OIDelta            = require("../market/oi_delta.cjs");
const OITrend            = require("../market/oi_trend.cjs");

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

// LIQUIDATION PROCESSORS
const Liquidation        = require("../liquidation/force_order.cjs");
const LiquidationClusters= require("../liquidation/liquidation_clusters.cjs");
const LiquidationHeatmap = require("../liquidation/liquidation_heatmap.cjs");
const LiquidationPressure= require("../liquidation/liquidation_pressure.cjs");

// AGGREGATORS
const SymbolAggregator   = require("../aggregator/realtime-futures-symbol-aggregator.cjs");
const ExchangeAggregator = require("../aggregator/realtime-futures-exchange-aggregator.cjs");


class BinanceFuturesRealtime {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "binance_futures";
        this.symbol = null;

        this.ws = null;

        // MARKET
        this.price              = new Price();
        this.priceDelta         = new PriceDelta();
        this.priceSpeed         = new PriceSpeed();
        this.priceTrend         = new PriceTrend();

        this.markPriceDelta     = new MarkPriceDelta();
        this.markPriceVol       = new MarkPriceVol();
        this.markPriceTrend     = new MarkPriceTrend();

        this.fundingDelta       = new FundingDelta();
        this.fundingTrend       = new FundingTrend();
        this.fundingPressure    = new FundingPressure();

        this.oi                 = new OI();
        this.oiDelta            = new OIDelta();
        this.oiTrend            = new OITrend();

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

        // LIQUIDATION
        this.liquidation        = new Liquidation();
        this.liquidationClusters= new LiquidationClusters();
        this.liquidationHeatmap = new LiquidationHeatmap();
        this.liquidationPressure= new LiquidationPressure();

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
            `${s}@depth`,
            `${s}@bookTicker`,
            `${s}@markPrice`,
            `${s}@funding`,
            `${s}@kline_1m`,
            `${s}@forceOrder`
        ];

        const url = `wss://fstream.binance.com/stream?streams=${streams.join("/")}`;

        this.log.info(`Connecting Binance Futures WS → ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            this.log.success(`WS Connected → Binance Futures (${this.symbol})`);
        });

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → Binance Futures (${this.symbol})`);
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
            this.aggTradeDelta?.handle?.(market, symbol, data);
            this.aggTradeSpeed?.handle?.(market, symbol, data);
            this.aggTradeTrend?.handle?.(market, symbol, data);
            return;
        }

        if (stream.includes("@markPrice")) {
            this.markPriceDelta.handle(market, symbol, data);
            this.markPriceVol.handle(market, symbol, data);
            this.markPriceTrend.handle(market, symbol, data);
            return;
        }

        if (stream.includes("@funding")) {
            this.fundingDelta.handle(market, symbol, data);
            this.fundingTrend.handle(market, symbol, data);
            this.fundingPressure.handle(market, symbol, data);
            return;
        }

        if (stream.includes("@kline")) {
            this.candlesCollector?.handle?.(market, symbol, data);
            return;
        }

        if (stream.includes("@bookTicker")) {
            this.price.handle(market, symbol, data);
            this.priceDelta.handle(market, symbol, data);
            this.priceSpeed.handle(market, symbol, data);
            this.priceTrend.handle(market, symbol, data);
            return;
        }
    }
    handleOrderbookStream(stream, data) {
        const market = this.exchange;
        const symbol = this.symbol;

        if (stream.includes("@depth") && !stream.endsWith("@depth")) {

            this.depth.handle(market, symbol, data);

            this.depthAbsorption.handle(market, symbol, data);
            this.depthAgg.handle(market, symbol, data);
            this.depthSpeed.handle(market, symbol, data);
            this.depthPressure.handle(market, symbol,data);
            this.depthLiquidity.handle(market, symbol,data);
            this.depthImbalance.handle(market, symbol,data);
            this.depthLevels.handle(market, symbol,data);
            this.depthHeatmap.handle(market, symbol,data);
            this.depthClusters.handle(market, symbol,data);

            this.depth50.handle(market, symbol, data);
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
            this.log.error(`Binance Futures WS Error → ${err.message}`);
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
        this.log.success(`Binance Futures Enterprise Collector Started → ${this.symbol}`);
    }
}

module.exports = BinanceFuturesRealtime;

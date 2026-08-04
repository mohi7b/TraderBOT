/**
 * ============================================================
 *  File: okx_futures-realtime.cjs
 *  Path: collector/realtime/futures/exchanges/okx_futures-realtime.cjs
 *  Version: 10.0.0 (Enterprise Upgrade)
 *
 *  Description:
 *      Full realtime WebSocket collector for OKX USDT Perpetual Futures.
 *      Enterprise version with full stream support + full processor support.
 *
 *      Streams:
 *          - trades
 *          - tickers (mark price)
 *          - candle1m
 *          - funding-rate
 *          - open-interest
 *          - books?sz=50
 *          - books?sz=200
 *          - books-l2-tbt (Full Depth Incremental)
 *
 *      Includes ALL processors:
 *          - Price Advanced
 *          - MarkPrice Advanced
 *          - Funding Advanced
 *          - OI Advanced
 *          - Depth Advanced (10 فایل)
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

// AGGREGATORS
const SymbolAggregator   = require("../aggregator/realtime-futures-symbol-aggregator.cjs");
const ExchangeAggregator = require("../aggregator/realtime-futures-exchange-aggregator.cjs");


class OKXFuturesRealtime {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;
        this.router = orchestrator.router;

        this.exchange = "okx_futures";
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

        const instId = this.symbol.replace("USDT", "-USDT-SWAP");

        const url = `wss://ws.okx.com:8443/ws/v5/public`;

        this.log.info(`Connecting OKX Futures WS → ${url}`);

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

        this.ws.on("close", () => {
            this.log.warn(`WS Closed → OKX Futures (${instId})`);
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
        if (channel === "trades") {
            this.price.handle(market, symbol, payload);
            this.priceDelta.handle(market, symbol, payload);
            this.priceSpeed.handle(market, symbol, payload);
            this.priceTrend.handle(market, symbol, payload);
            return;
        }

        // MARK PRICE
        if (channel === "tickers") {
            this.markPriceDelta.handle(market, symbol, payload);
            this.markPriceVol.handle(market, symbol, payload);
            this.markPriceTrend.handle(market, symbol, payload);
            return;
        }

        // KLINE
        if (channel === "candle1m") {
            this.candlesCollector?.handle?.(market, symbol, payload);
            return;
        }

        // FUNDING
        if (channel === "funding-rate") {
            this.fundingDelta.handle(market, symbol, payload);
            this.fundingTrend.handle(market, symbol, payload);
            this.fundingPressure.handle(market, symbol, payload);
            return;
        }

        // OPEN INTEREST
        if (channel === "open-interest") {
            this.oi.handle(market, symbol, payload);
            this.oiDelta.handle(market, symbol, payload);
            this.oiTrend.handle(market, symbol, payload);
            return;
        }
    }
    handleOrderbookStream(arg, payload) {
        const market = this.exchange;
        const symbol = this.symbol;

        const channel = arg.channel;

        // DEPTH 50 / 200
        if (channel === "books") {

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

            if (arg.sz === "50")
                this.depth50.handle(market, symbol, payload);

            if (arg.sz === "200")
                this.depth200.handle(market, symbol, payload);

            return;
        }

        // FULL DEPTH
        if (channel === "books-l2-tbt") {

            const delta = {
                symbol,
                updateId: payload.seqId,
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
            this.log.error(`OKX Futures WS Error → ${err.message}`);
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
        this.log.success(`OKX Futures Enterprise Collector Started → ${this.symbol}`);
    }
}

module.exports = OKXFuturesRealtime;

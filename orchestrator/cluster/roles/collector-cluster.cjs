/**
 * ============================================================
 *  File: collector-cluster.cjs
 *  Path: orchestrator/cluster/roles/collector-cluster.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Collector Cluster Role Handler for TraderBOT Distributed Engine.
 *      - Multi-exchange
 *      - Multi-symbol
 *      - WSFailover + EventBusIPC + WorkerContext
 * ============================================================
 */

const WSFailover      = require("../ws-failover.cjs");
const collectorLoader = require("../../utils/collector-loader.cjs");
const context         = require("../worker-context.cjs");
const config          = require("../../config/index.cjs");

class CollectorCluster {

    /**
     * ============================================================
     *  START COLLECTOR FOR EXCHANGE
     * ============================================================
     */
    start(exchange) {

        const exchangeConfig = config.exchanges[exchange];

        if (!exchangeConfig || !exchangeConfig.enabled) {
            context.info(`CollectorCluster skipped → ${exchange} (disabled)`);
            return;
        }

        context.info(`📡 CollectorCluster starting → ${exchange}`);

        // RAW PIPELINE
        const raw = config.pipeline.raw;

        if (!raw.enabled) {
            context.info(`RAW pipeline disabled → ${exchange}`);
            return;
        }

        if (raw.realtime)  this.startRealtime(exchange);
        if (raw.historical) this.startHistorical(exchange);
        if (raw.macro)      this.startMacro(exchange);
        if (raw.sentiment)  this.startSentiment(exchange);
    }

    /**
     * ============================================================
     *  REALTIME COLLECTOR (WS + Multi-Stream)
     * ============================================================
     */
    startRealtime(exchange) {

        const realtimeModule = collectorLoader.loadRealtime(exchange);

        if (!realtimeModule) {
            context.error(`No realtime module for ${exchange}`);
            return;
        }

        context.info(`🔌 RealtimeCollector → ${exchange}`);

        const symbols = this.getSymbols(exchange);

        const streams = symbols.map(s => `${s.toLowerCase()}@depth`).join("/");

        const wsUrl = `${realtimeModule.wsBase}/stream?streams=${streams}`;

        WSFailover.start(
            { primary: wsUrl },
            (msg) => realtimeModule.handle(msg)
        );
    }

    /**
     * ============================================================
     *  HISTORICAL COLLECTOR (REST)
     * ============================================================
     */
    startHistorical(exchange) {

        const module = collectorLoader.loadHistorical(exchange);

        if (!module) {
            context.error(`No historical module for ${exchange}`);
            return;
        }

        context.info(`📜 HistoricalCollector → ${exchange}`);
        module.fetch();
    }

    /**
     * ============================================================
     *  MACRO COLLECTOR
     * ============================================================
     */
    startMacro(exchange) {

        const module = collectorLoader.loadMacro(exchange);

        if (!module) {
            context.error(`No macro module for ${exchange}`);
            return;
        }

        context.info(`🌍 MacroCollector → ${exchange}`);
        module.fetch();
    }

    /**
     * ============================================================
     *  SENTIMENT COLLECTOR
     * ============================================================
     */
    startSentiment(exchange) {

        const module = collectorLoader.loadSentiment(exchange);

        if (!module) {
            context.error(`No sentiment module for ${exchange}`);
            return;
        }

        context.info(`💬 SentimentCollector → ${exchange}`);
        module.fetch();
    }

    /**
     * ============================================================
     *  SYMBOL LIST FOR EXCHANGE
     * ============================================================
     */
    getSymbols(exchange) {

        const type = config.exchanges[exchange].type;

        if (type === "spot")    return config.symbols.spot;
        if (type === "futures") return config.symbols.futures;

        return [];
    }
}

module.exports = new CollectorCluster();

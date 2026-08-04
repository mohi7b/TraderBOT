/**
 * ============================================================
 *  File: market-cluster.cjs
 *  Path: orchestrator/cluster/roles/market-cluster.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Market Cluster Role Handler for TraderBOT Distributed Engine.
 *      - Price / Trades / Candles collectors
 *      - EventBus IPC integration
 *      - WorkerContext logging + debug mode
 * ============================================================
 */

const context = require("../worker-context.cjs");
const config  = require("../../config/index.cjs");

class MarketCluster {

    start(pipe) {

        let CollectorClass = null;

        switch (pipe) {

            case "price":
                CollectorClass = require("../../../collector/realtime/spot/market/price.cjs");
                break;

            case "trades":
                CollectorClass = require("../../../collector/realtime/spot/market/trades.cjs");
                break;

            case "candles":
                CollectorClass = require("../../../collector/realtime/spot/market/candles.cjs");
                break;

            default:
                context.error(`Unknown MarketCluster pipe: ${pipe}`);
                return;
        }

        try {

            const collector = new CollectorClass();

            context.info(`💹 MarketCollector (${pipe}) initialized`);

            // MarketCollector باید داده را به EventBus بفرستد
            collector.on("data", (msg) => {
                context.eventbus.publish(`market:${pipe}`, msg);
            });

            // اجرای Collector
            collector.start();

            context.info(`💹 MarketCollector (${pipe}) started`);

        } catch (err) {
            context.error(`MarketCollector Error (${pipe}): ${err.message}`);
        }
    }
}

module.exports = new MarketCluster();

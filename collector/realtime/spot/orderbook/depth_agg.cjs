/**
 * ============================================================
 *  File: depth_agg.cjs
 *  Path: collector/realtime/orderbook/depth_agg.cjs
 *  Version: 10.0.0 (Enterprise Cluster Mode)
 *
 *  Description:
 *      این ماژول دیگر هیچ پردازشی انجام نمی‌دهد.
 *      فقط depthList را به Depth Cluster ارسال می‌کند.
 *
 *      پردازش واقعی Aggregation در Depth Worker انجام می‌شود:
 *          orchestrator/cluster/depth/depth-worker.cjs
 *
 *      معماری:
 *          Collector → Orchestrator → DepthClusterEngine → DepthWorker
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

const orchestrator = require("../../../orchestrator/core/orchestrator.cjs");

class DepthAggregatorCollector {

    constructor() {
        this.depthCluster = orchestrator.depthCluster;
        this.log = orchestrator.log;
    }

    /**
     * Forward aggregated depth list to Depth Cluster
     */
    handle(market, symbol, depthList) {
        try {
            this.depthCluster.dispatch(
                "agg",
                market,
                symbol,
                depthList
            );
        } catch (err) {
            this.log.error(`DepthAggregatorCollector error → ${symbol}: ${err.message}`);
        }
    }
}

module.exports = DepthAggregatorCollector;

/**
 * ============================================================
 *  File: depth_imbalance.cjs
 *  Path: collector/realtime/orderbook/depth_imbalance.cjs
 *  Version: 10.0.0 (Enterprise Cluster Mode)
 *
 *  Description:
 *      این ماژول دیگر هیچ پردازشی انجام نمی‌دهد.
 *      فقط snapshot را به Depth Cluster ارسال می‌کند.
 *
 *      پردازش واقعی Imbalance در Depth Worker انجام می‌شود:
 *          orchestrator/cluster/depth/depth-worker.cjs
 *
 *      معماری:
 *          Collector → Orchestrator → DepthClusterEngine → DepthWorker
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

const orchestrator = require("../../../orchestrator/core/orchestrator.cjs");

class DepthImbalanceCollector {

    constructor() {
        this.depthCluster = orchestrator.depthCluster;
        this.log = orchestrator.log;
    }

    /**
     * Forward snapshot to Depth Cluster
     */
    handle(market, symbol, snapshot) {
        try {
            this.depthCluster.dispatch(
                "imbalance",
                market,
                symbol,
                snapshot
            );
        } catch (err) {
            this.log.error(`DepthImbalanceCollector error → ${symbol}: ${err.message}`);
        }
    }
}

module.exports = DepthImbalanceCollector;

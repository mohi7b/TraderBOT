/**
 * ============================================================
 *  File: depth_speed.cjs
 *  Path: collector/realtime/orderbook/depth_speed.cjs
 *  Version: 10.0.0 (Enterprise Cluster Mode)
 *
 *  Description:
 *      این ماژول دیگر هیچ پردازشی انجام نمی‌دهد.
 *      فقط snapshot را به Depth Cluster ارسال می‌کند.
 *
 *      پردازش واقعی Speed در Depth Worker انجام می‌شود:
 *          orchestrator/cluster/depth/depth-worker.cjs
 *
 *      معماری:
 *          Collector → Orchestrator → DepthClusterEngine → DepthWorker
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

const orchestrator = require("../../../orchestrator/core/orchestrator.cjs");

class DepthSpeedCollector {

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
                "speed",
                market,
                symbol,
                snapshot
            );
        } catch (err) {
            this.log.error(`DepthSpeedCollector error → ${symbol}: ${err.message}`);
        }
    }
}

module.exports = DepthSpeedCollector;

/**
 * ============================================================
 *  File: depth_pressure.cjs
 *  Path: collector/realtime/orderbook/depth_pressure.cjs
 *  Version: 10.0.0 (Enterprise Cluster Mode)
 *
 *  Description:
 *      این ماژول دیگر پردازش انجام نمی‌دهد.
 *      فقط snapshot را به Depth Cluster ارسال می‌کند.
 *
 *      پردازش واقعی فشار (Pressure) در Depth Worker انجام می‌شود:
 *          orchestrator/cluster/depth/depth-worker.cjs
 *
 *      معماری:
 *          Collector → Orchestrator → DepthClusterEngine → DepthWorker
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

const orchestrator = require("../../../orchestrator/core/orchestrator.cjs");

class DepthPressureCollector {

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
                "pressure",
                market,
                symbol,
                snapshot
            );
        } catch (err) {
            this.log.error(`DepthPressureCollector error → ${symbol}: ${err.message}`);
        }
    }
}

module.exports = DepthPressureCollector;

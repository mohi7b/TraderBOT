/**
 * ============================================================
 *  File: depth_absorption.cjs
 *  Path: collector/realtime/spot/orderbook/depth_absorption.cjs
 *  Version: 10.0.0 (Enterprise Cluster Mode)
 *
 *  Description:
 *      - این ماژول دیگر پردازش انجام نمی‌دهد
 *      - فقط snapshot را به Depth Cluster ارسال می‌کند
 *      - پردازش در depth-worker انجام می‌شود
 *
 *  Cluster Architecture:
 *      Collector → Orchestrator → DepthClusterEngine → DepthWorker
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

const orchestrator = require("../../../../orchestrator/core/orchestrator.cjs");

class DepthAbsorptionCollector {

    constructor() {
        this.depthCluster = orchestrator.depthCluster;
        this.log = orchestrator.log;
    }

    handle(market, symbol, snapshot) {
        try {
            this.depthCluster.dispatch(
                "absorption",
                market,
                symbol,
                snapshot
            );
        } catch (err) {
            this.log.error(`DepthAbsorptionCollector error → ${symbol}: ${err.message}`);
        }
    }
}

module.exports = DepthAbsorptionCollector;

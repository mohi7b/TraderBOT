/**
 * ============================================================
 *  File: worker-loader.cjs
 *  Path: orchestrator/cluster/worker-loader.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Loads and initializes the correct role for each Worker
 *      based on new cluster configuration (config/index.cjs).
 *
 *      Supports:
 *      - MarketCluster
 *      - ProcessorCluster
 *      - CollectorCluster
 *      - AggregatorCluster (future)
 *
 *      Fully modular — only config controls activation.
 * ============================================================
 */

const config = require("../config/index.cjs");

// Roles
const MarketCluster      = require("./roles/market-cluster.cjs");
const ProcessorCluster   = require("./roles/processor-cluster.cjs");
const CollectorCluster   = require("./roles/collector-cluster.cjs");

class WorkerLoader {

    start(id) {

        const clusters = config.clusters;

        // اگر کلکستر غیرفعال است → هیچ نقشی لود نشود
        if (!clusters.enabled) {
            console.log(`⚠️ Worker ${id} → Cluster disabled (no role assigned)`);
            return;
        }

        // ---------------------------------------------------------
        // MARKET ROLES
        // ---------------------------------------------------------
        if (clusters.market) {
            for (const pipe in clusters.market) {
                const role = clusters.market[pipe];
                if (role.enabled && role.worker === id) {
                    console.log(`💹 Worker ${id} → MarketCluster (${pipe})`);
                    return MarketCluster.start(pipe);
                }
            }
        }

        // ---------------------------------------------------------
        // PROCESSOR ROLES
        // ---------------------------------------------------------
        if (clusters.processors) {
            for (const pipe in clusters.processors) {
                const role = clusters.processors[pipe];
                if (role.enabled && role.worker === id) {
                    console.log(`⚙️ Worker ${id} → ProcessorCluster (${pipe})`);
                    return ProcessorCluster.start(pipe);
                }
            }
        }

        // ---------------------------------------------------------
        // COLLECTOR ROLES
        // ---------------------------------------------------------
        if (clusters.collectors) {
            for (const exchange in clusters.collectors) {
                const role = clusters.collectors[exchange];
                if (role.enabled && role.worker === id) {
                    console.log(`📡 Worker ${id} → CollectorCluster (${exchange})`);
                    return CollectorCluster.start(exchange);
                }
            }
        }

        // ---------------------------------------------------------
        // NO ROLE FOUND
        // ---------------------------------------------------------
        console.log(`⚠️ Worker ${id} → No role assigned.`);
    }
}

module.exports = new WorkerLoader();

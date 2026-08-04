/*
 * Binance Spot Depth Collector (Cluster Mode)
 * Version: 3.0.0
 * Path: collector/realtime/spot/orderbook/depth.cjs
 * Description:
 *   - Processes Binance @depth stream in Cluster Mode
 *   - Normalizes orderbook delta updates
 *   - Sends normalized depth snapshots to ProcessorCluster via IPC
 *   - Uses worker-context instead of orchestrator
 * Binance Spot Depth Collector (Enterprise Cluster Edition)
 * Stage 1 → Raw Depth → Normalize → IPC Snapshot → ProcessorCluster
 */



const ctx = require("../../../../orchestrator/cluster/worker-context.cjs");
const log = ctx.log;

class SpotDepthCollector {

    constructor() {
        this.router = ctx.router;
        this.state  = ctx.state;
    }

    // -----------------------------------------
    // Normalize raw delta from Binance WS
    // -----------------------------------------
    normalize(event) {
        return {
            symbol: event.s,
            eventTime: event.E,
            updateId: event.u,

            bids: (event.b || []).map(([price, qty]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty)
            })),

            asks: (event.a || []).map(([price, qty]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty)
            }))
        };
    }

    // -----------------------------------------
    // Main handler (Cluster Mode)
    // -----------------------------------------
    handle(market, symbol, event) {
        try {
            log("debug", "DepthCollector → RAW EVENT");
            log("debug+", event);

            // Stage 1 → Normalize
            const normalized = this.normalize(event);
            log("debug", `DepthCollector → NORMALIZED (${normalized.updateId})`);
            log("debug+", normalized);

            // Stage 2 → Send snapshot to ProcessorCluster (IPC)
            // ProcessorCluster listens to "depth.snapshot"
            this.router.route(
                market,
                symbol,
                "orderbook",
                "depth_snapshot",
                normalized
            );

        } catch (err) {
            log("run", "DepthCollector → FATAL ERROR");
            log("debug+", err);
        }
    }
}

module.exports = SpotDepthCollector;

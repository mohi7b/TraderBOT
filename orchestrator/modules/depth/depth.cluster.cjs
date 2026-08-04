/**
 * -------------------------------------------------------------
 *  File: depth.cluster.cjs
 *  Module: Depth Processing Engine
 *  Layer: Cluster Controller (Module-Level)
 *  Version: 1.0.0
 *  Author: Mohsen + Copilot
 *  Location: orchestrator/modules/depth/
 *
 *  Description:
 *      کنترل‌کنندهٔ اصلی ماژول عمق.
 *      ساخت DepthManager، اتصال به eventbus،
 *      dispatch snapshot به ورکرهای عمق،
 *      مدیریت خطا و ثبت متریک‌ها.
 *
 *  Notes:
 *      - این فایل یک کلاستر مستقل نیست.
 *      - داخل همان Process orchestrator اجرا می‌شود.
 *      - ultra-light و مناسب VPS دو‌هسته‌ای.
 *      - فقط مدیریت می‌کند، هیچ پردازش عمقی انجام نمی‌دهد.
 *
 *  Dependencies:
 *      - depth.manager.cjs
 *      - depth.router.cjs
 *      - depth.error.cjs
 *      - depth.metrics.cjs
 *      - eventbus-ipc.cjs
 *      - log-ipc.cjs
 *      - config/index.cjs
 *
 * -------------------------------------------------------------
 */

/**
 * -------------------------------------------------------------
 *  File: depth.cluster.cjs
 * -------------------------------------------------------------
 */

const DepthManager = require("./depth.manager.cjs");
const DepthRouter = require("./depth.router.cjs");
const DepthErrorBoundary = require("./depth.error.cjs");
const DepthMetrics = require("./depth.metrics.cjs");

const { eventbus } = require("../../ipc/eventbus-ipc.cjs");
const config = require("../../config/index.cjs");

class DepthCluster {
    constructor() {
        this.manager = new DepthManager();
        this.router = new DepthRouter();
        this.error = new DepthErrorBoundary(this.manager);
        this.metrics = new DepthMetrics(this.manager);

        this.initialized = false;
    }

    log(level, msg) {
        eventbus.emit("log", { level, msg });
    }

    async init() {
        this.log("info", "[DepthCluster] Initializing depth module...");

        const exchanges = config.exchanges || [];
        const symbols = config.symbols || [];

        for (const market of exchanges) {
            for (const symbol of symbols) {
                this.manager.createWorker(market, symbol);
            }
        }

        eventbus.on("orderbook.depth_snapshot", (msg) => {
            this.handleSnapshot(msg);
        });

        this.initialized = true;
        this.log("info", "[DepthCluster] Depth module initialized.");
    }

    handleSnapshot(msg) {
        try {
            const { market, symbol, payload } = msg;

            this.manager.dispatchSnapshot(market, symbol, payload);
            this.metrics.recordSnapshot(market, symbol);

        } catch (err) {
            this.error.handleClusterError(err);
        }
    }

    shutdown() {
        this.log("warn", "[DepthCluster] Shutting down depth module...");
        this.manager.shutdownAll();
    }
}

module.exports = new DepthCluster();

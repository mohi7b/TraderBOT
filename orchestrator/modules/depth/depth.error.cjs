/**
 * -------------------------------------------------------------
 *  File: depth.error.cjs
 *  Module: Depth Processing Engine
 *  Layer: Error Boundary (Worker-Level)
 *  Version: 1.0.0
 *  Author: Mohsen + Copilot
 *  Location: orchestrator/modules/depth/
 *
 *  Description:
 *      مدیریت خطاهای ورکرهای عمق.
 *      اگر ورکر crash کند، این ماژول مسئول ری‌استارت آن است.
 *      هیچ پردازش عمقی انجام نمی‌دهد و ultra-light است.
 *
 *  Notes:
 *      - این ماژول یک کلاستر مستقل نیست.
 *      - داخل همان Process orchestrator اجرا می‌شود.
 *      - فقط خطاهای ورکر را مدیریت می‌کند.
 *      - مناسب VPS دو‌هسته‌ای و معماری سبک.
 *
 *  Dependencies:
 *      - depth.manager.cjs
 *      - log-ipc.cjs
 *
 * -------------------------------------------------------------
 */

const { log } = require("../../ipc/log-ipc.cjs");

class DepthErrorBoundary {
    constructor(manager) {
        this.manager = manager;
    }

    /**
     * مدیریت خطاهای ورکر
     */
    handleWorkerError(market, symbol, error) {
        log.error(`[DepthError] Worker error in ${market}:${symbol}`, error);

        // ری‌استارت ورکر
        this.manager.restartWorker(market, symbol);

        log.warn(`[DepthError] Worker restarted for ${market}:${symbol}`);
    }

    /**
     * مدیریت خطاهای کلی ماژول عمق
     */
    handleClusterError(error) {
        log.error("[DepthError] Cluster-level error detected:", error);
    }
}

module.exports = DepthErrorBoundary;

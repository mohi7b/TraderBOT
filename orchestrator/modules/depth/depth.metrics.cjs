/**
 * -------------------------------------------------------------
 *  File: depth.metrics.cjs
 *  Module: Depth Processing Engine
 *  Layer: Metrics & Monitoring
 *  Version: 1.0.0
 *  Author: Mohsen + Copilot
 *  Location: orchestrator/modules/depth/
 *
 *  Description:
 *      ثبت و مانیتورینگ متریک‌های ورکرهای عمق.
 *      شامل queue length، snapshot count، آخرین زمان پردازش،
 *      و وضعیت کلی هر ورکر.
 *
 *  Notes:
 *      - ultra-light و مناسب VPS دو‌هسته‌ای.
 *      - هیچ پردازش عمقی انجام نمی‌دهد.
 *      - فقط داده‌های سبک مانیتورینگ را نگه‌داری می‌کند.
 *
 *  Dependencies:
 *      - depth.manager.cjs
 *      - log-ipc.cjs
 *
 * -------------------------------------------------------------
 */

const { log } = require("../../ipc/log-ipc.cjs");

class DepthMetrics {
    constructor(manager) {
        this.manager = manager;
        this.data = new Map(); // key: market:symbol → metrics
    }

    /**
     * ثبت دریافت snapshot
     */
    recordSnapshot(market, symbol) {
        const key = `${market}:${symbol}`;

        if (!this.data.has(key)) {
            this.data.set(key, {
                snapshots: 0,
                lastSnapshot: null,
                queueLength: 0,
                lastUpdate: null
            });
        }

        const m = this.data.get(key);
        m.snapshots++;
        m.lastSnapshot = Date.now();

        const worker = this.manager.getWorker(market, symbol);
        m.queueLength = worker ? worker.queue.length : 0;

        m.lastUpdate = Date.now();
    }

    /**
     * گرفتن متریک‌های یک ورکر
     */
    getMetrics(market, symbol) {
        return this.data.get(`${market}:${symbol}`) || null;
    }

    /**
     * گرفتن متریک‌های همه ورکرها
     */
    getAllMetrics() {
        return Array.from(this.data.entries()).map(([key, value]) => ({
            key,
            ...value
        }));
    }

    /**
     * چاپ متریک‌ها در لاگ (اختیاری)
     */
    logMetrics() {
        for (const [key, m] of this.data.entries()) {
            log.info(
                `[DepthMetrics] ${key} | snapshots=${m.snapshots} | queue=${m.queueLength}`
            );
        }
    }
}

module.exports = DepthMetrics;

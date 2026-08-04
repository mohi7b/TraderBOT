/**
 * -------------------------------------------------------------
 *  File: depth.manager.cjs
 *  Module: Depth Processing Engine
 *  Layer: Mid-Level Worker Manager
 *  Version: 1.0.0
 *  Author: Mohsen + Copilot
 *  Location: orchestrator/modules/depth/
 *
 *  Description:
 *      مدیریت کامل ورکرهای عمق برای هر symbol/exchange.
 *      ساخت، نگه‌داری، dispatch snapshot، restart و shutdown.
 *
 *  Notes:
 *      - این ماژول یک کلاستر مستقل نیست.
 *      - داخل همان Process orchestrator اجرا می‌شود.
 *      - ultra-light و مناسب VPS دو‌هسته‌ای.
 *      - هر ورکر کاملاً مستقل و موازی عمل می‌کند.
 *
 *  Dependencies:
 *      - depth.worker.cjs
 *      - log-ipc.cjs
 *
 * -------------------------------------------------------------
 */

const DepthWorker = require("./workers/depth.worker.cjs");
const { log } = require("../../ipc/log-ipc.cjs");

class DepthManager {
    constructor() {
        this.workers = new Map(); // key: market:symbol → worker instance
    }

    /**
     * ساخت ورکر برای یک symbol/exchange
     */
    createWorker(market, symbol) {
        const key = `${market}:${symbol}`;

        if (this.workers.has(key)) {
            log.warn(`[DepthManager] Worker already exists for ${key}`);
            return;
        }

        const worker = new DepthWorker(market, symbol);

        this.workers.set(key, worker);

        log.info(`[DepthManager] Worker created for ${key}`);
    }

    /**
     * ارسال snapshot به ورکر مناسب
     */
    dispatchSnapshot(market, symbol, snapshot) {
        const key = `${market}:${symbol}`;
        const worker = this.workers.get(key);

        if (!worker) {
            log.error(`[DepthManager] No worker found for ${key}`);
            return;
        }

        worker.enqueue(snapshot);
    }

    /**
     * گرفتن ورکر خاص
     */
    getWorker(market, symbol) {
        return this.workers.get(`${market}:${symbol}`);
    }

    /**
     * ری‌استارت ورکر در صورت crash
     */
    restartWorker(market, symbol) {
        const key = `${market}:${symbol}`;
        const oldWorker = this.workers.get(key);

        if (!oldWorker) {
            log.error(`[DepthManager] Cannot restart. Worker not found for ${key}`);
            return;
        }

        log.warn(`[DepthManager] Restarting worker for ${key}`);

        // حذف ورکر قبلی
        this.workers.delete(key);

        // ساخت ورکر جدید
        const newWorker = new DepthWorker(market, symbol);
        this.workers.set(key, newWorker);
    }

    /**
     * خاموش کردن همه ورکرها
     */
    shutdownAll() {
        for (const [key, worker] of this.workers.entries()) {
            try {
                worker.shutdown();
                log.info(`[DepthManager] Worker shutdown: ${key}`);
            } catch (err) {
                log.error(`[DepthManager] Error shutting down worker ${key}:`, err);
            }
        }

        this.workers.clear();
    }
}

module.exports = DepthManager;

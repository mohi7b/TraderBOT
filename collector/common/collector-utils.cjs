/**
 * ============================================================
 *  File: collector-utils.cjs
 *  Path: collector/common/collector-utils.cjs
 *  Version: 5.0.0 (ENTERPRISE + PIPELINE-CENTRIC)
 *  Description:
 *      Collector Utilities for TraderBOT Distributed Engine.
 *
 *      وظایف:
 *      - مدیریت Backoff هوشمند
 *      - مدیریت Retry خودکار
 *      - مدیریت Throttle / Debounce
 *      - مدیریت Safe JSON Parse
 *      - مدیریت Safe WS Reconnect
 *      - مدیریت Safe REST Fetch
 *      - مدیریت خطاهای Collector
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 *
 *  Notes:
 *      - این فایل برای تمام Collectorها مشترک است.
 *      - تغییرات باید در SAFE mode تست شوند.
 * ============================================================
 */

class CollectorUtils {

    /**
     * ============================================================
     *  SAFE JSON PARSE
     * ============================================================
     */
    safeJSON(str) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    }

    /**
     * ============================================================
     *  BACKOFF (EXPONENTIAL)
     * ============================================================
     */
    backoff(attempt, base = 500, max = 15000) {
        const delay = Math.min(base * Math.pow(2, attempt), max);
        return delay;
    }

    /**
     * ============================================================
     *  RETRY WRAPPER
     * ============================================================
     */
    async retry(fn, maxAttempts = 5) {
        let attempt = 0;

        while (attempt < maxAttempts) {
            try {
                return await fn();
            } catch (err) {
                attempt++;
                const wait = this.backoff(attempt);
                await this.sleep(wait);
            }
        }

        throw new Error("Retry failed after max attempts");
    }

    /**
     * ============================================================
     *  THROTTLE
     * ============================================================
     */
    throttle(fn, limit = 100) {
        let inThrottle = false;

        return (...args) => {
            if (!inThrottle) {
                fn(...args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    /**
     * ============================================================
     *  DEBOUNCE
     * ============================================================
     */
    debounce(fn, delay = 100) {
        let timer = null;

        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    /**
     * ============================================================
     *  SAFE REST FETCH
     * ============================================================
     */
    async safeFetch(url, options = {}) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            return null;
        }
    }

    /**
     * ============================================================
     *  SAFE WS RECONNECT
     * ============================================================
     */
    safeReconnect(ws, url, onMessage) {
        ws.on("close", () => {
            setTimeout(() => {
                const newWS = new WebSocket(url);
                newWS.on("message", onMessage);
            }, 1000);
        });
    }

    /**
     * ============================================================
     *  SLEEP
     * ============================================================
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new CollectorUtils();

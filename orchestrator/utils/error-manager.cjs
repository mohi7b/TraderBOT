/* ============================================================
 * File: error-manager.cjs
 * Path: orchestrator/utils/error-manager.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Centralized error tracking system for all workers and stages
 *   - Counts errors per symbol
 *   - Detects critical error thresholds
 *   - Reports errors to log-manager + health-monitor
 *   - Supports auto-recovery triggers
 *
 * Relations:
 *   - Used by: orchestrator, event-router, health-monitor, workers
 *   - Reads: system.cjs (maxErrors)
 *   - Provides: report(), getCount(), reset(), isCritical()
 * ============================================================ */

class ErrorManager {

    constructor(systemConfig) {
        this.maxErrors = systemConfig.maxErrors || 5;

        // ساختار ذخیره‌سازی خطاها
        // مثال:
        // { BTCUSDT: 3, ETHUSDT: 1 }
        this.errorCount = {};

        this.log = null; // بعداً orchestrator تزریق می‌کند
    }

    /* ============================================================
     * Inject log-manager (optional)
     * ============================================================ */
    attachLogger(logManager) {
        this.log = logManager;
    }

    /* ============================================================
     * Report error for a symbol + stage
     * ============================================================ */
    report(symbol, stage, error) {
        if (!this.errorCount[symbol]) {
            this.errorCount[symbol] = 0;
        }

        this.errorCount[symbol]++;

        if (this.log) {
            this.log.error(`[${symbol}] ERROR in ${stage}: ${error}`);
        }
    }

    /* ============================================================
     * Get current error count for a symbol
     * ============================================================ */
    getCount(symbol) {
        return this.errorCount[symbol] || 0;
    }

    /* ============================================================
     * Reset error count for a symbol
     * ============================================================ */
    reset(symbol) {
        this.errorCount[symbol] = 0;

        if (this.log) {
            this.log.info(`[${symbol}] Error count reset.`);
        }
    }

    /* ============================================================
     * Check if error count is critical
     * ============================================================ */
    isCritical(symbol) {
        return this.getCount(symbol) >= this.maxErrors;
    }
}

module.exports = ErrorManager;

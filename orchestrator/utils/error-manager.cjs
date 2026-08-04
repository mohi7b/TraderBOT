/**
 * ============================================================
 *  File: error-manager.cjs
 *  Path: orchestrator/utils/error-manager.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Centralized Error Manager for TraderBOT Enterprise Orchestrator.
 *
 *      وظایف:
 *      - مدیریت خطاهای Collector / Processor / Engine
 *      - ارسال خطاها به BackoffEngine
 *      - ارسال خطاهای بحرانی به KillSwitchEngine
 *      - ثبت خطاها در StateTree
 *      - دسته‌بندی خطاها (network / exchange / critical / module / system)
 *
 *      نکته:
 *      - ساختار جدید فقط از symbol / collectors / processors / engines استفاده می‌کند.
 *      - market و category قدیمی حذف شده‌اند.
 * ============================================================
 */

class ErrorManager {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.modules    = orchestrator.modules;
        this.state      = orchestrator.state;
        this.backoff    = orchestrator.backoff;
        this.killSwitch = orchestrator.killSwitch;
        this.log        = orchestrator.log;

        this.systemErrors   = [];
        this.criticalErrors = [];
    }

    async init() {
        this.log.info("ErrorManager initialized.");
    }

    /**
     * ============================================================
     *  Capture module error
     * ============================================================
     */
    async captureModuleError(symbol, category, moduleName, error) {

        const key = `${symbol}.${category}.${moduleName}`;
        this.log.error(`Module error captured → ${key}: ${error.message}`);

        // ثبت خطا در StateTree
        this.state.addError(symbol, category, moduleName, error);

        // فعال‌سازی BackoffEngine
        await this.backoff.crash(symbol, category, moduleName, error);
    }

    /**
     * ============================================================
     *  Capture system error
     * ============================================================
     */
    captureSystemError(error) {

        this.log.error(`System error → ${error.message}`);

        this.systemErrors.push({
            error,
            time: Date.now()
        });
    }

    /**
     * ============================================================
     *  Capture critical error
     * ============================================================
     */
    async critical(error) {

        this.log.error(`CRITICAL ERROR → ${error.message}`);

        this.criticalErrors.push({
            error,
            time: Date.now()
        });

        // Kill کامل سیستم
        await this.killSwitch.killSystem();
    }

    /**
     * ============================================================
     *  Categorize error
     * ============================================================
     */
    categorize(error) {

        if (!error || !error.message) return "unknown-error";

        const msg = error.message.toLowerCase();

        if (msg.includes("network"))  return "network-error";
        if (msg.includes("timeout"))  return "network-error";
        if (msg.includes("exchange")) return "exchange-error";
        if (msg.includes("critical")) return "critical-error";
        if (msg.includes("module"))   return "module-error";
        if (msg.includes("system"))   return "system-error";

        return "unknown-error";
    }

    /**
     * ============================================================
     *  Handle error (auto routing)
     * ============================================================
     */
    async handle(error, context = {}) {

        const type = this.categorize(error);

        this.log.error(`ErrorManager: Handling error (${type})`);

        switch (type) {

            case "module-error":
                await this.captureModuleError(
                    context.symbol,
                    context.category,
                    context.moduleName,
                    error
                );
                break;

            case "critical-error":
                await this.critical(error);
                break;

            case "system-error":
            case "network-error":
            case "exchange-error":
            default:
                this.captureSystemError(error);
                break;
        }
    }

    dump() {
        return {
            systemErrors: this.systemErrors,
            criticalErrors: this.criticalErrors
        };
    }
}

module.exports = ErrorManager;

/**
 * ============================================================
 *  File: hot-reload.cjs
 *  Path: orchestrator/utils/hot-reload.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Hot Reload Engine for TraderBOT Enterprise Orchestrator.
 *
 *      وظایف:
 *      - Reload Collector / Processor / Engine بدون ری‌استارت سیستم
 *      - Reset StateTree برای ماژول
 *      - Rebind Collector به EventRouter
 *
 *      نکته:
 *      - ساختار جدید فقط از symbol / collectors / processors / engines استفاده می‌کند.
 *      - market و category قدیمی حذف شده‌اند.
 * ============================================================
 */

class HotReload {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.modules = orchestrator.modules;
        this.state   = orchestrator.state;
        this.router  = orchestrator.router;
        this.log     = orchestrator.log;
    }

    /**
     * ============================================================
     *  Reload یک ماژول
     * ============================================================
     */
    async reloadModule(symbol, category, moduleName) {

        const key = `${symbol}.${category}.${moduleName}`;
        this.log.info(`HotReload: Reloading module → ${key}`);

        // Reset state
        this.state.resetNode(symbol, category, moduleName);

        // Remove old route
        delete this.router.routes[key];

        // Re-bind collector route
        this.router.register(key, (event) => {
            this.state.updateStatus(symbol, category, moduleName, "active");
            this.state.updateMetrics(symbol, category, moduleName, { events: 1 });
        });

        this.log.success(`Module hot reloaded → ${key}`);
    }

    /**
     * ============================================================
     *  Reload یک دسته (collectors / processors / engines)
     * ============================================================
     */
    async reloadCategory(symbol, category) {

        this.log.info(`HotReload: Reloading category → ${symbol}.${category}`);

        const modules = Object.keys(this.modules.tree[symbol][category]);

        for (const mod of modules) {
            await this.reloadModule(symbol, category, mod);
        }

        this.log.success(`Category hot reloaded → ${symbol}.${category}`);
    }

    /**
     * ============================================================
     *  Reload یک سیمبول کامل
     * ============================================================
     */
    async reloadSymbol(symbol) {

        this.log.info(`HotReload: Reloading symbol → ${symbol}`);

        const categories = Object.keys(this.modules.tree[symbol]);

        for (const cat of categories) {
            await this.reloadCategory(symbol, cat);
        }

        this.log.success(`Symbol hot reloaded → ${symbol}`);
    }

    /**
     * ============================================================
     *  Reload کل سیستم
     * ============================================================
     */
    async reloadSystem() {

        this.log.warn("HotReload: Reloading entire system");

        const symbols = Object.keys(this.modules.tree);

        for (const symbol of symbols) {
            await this.reloadSymbol(symbol);
        }

        this.log.success("SYSTEM HOT RELOADED");
    }
}

module.exports = HotReload;

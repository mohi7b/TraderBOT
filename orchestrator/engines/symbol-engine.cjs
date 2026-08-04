/**
 * ============================================================
 *  File: symbol-engine.cjs
 *  Path: orchestrator/engines/symbol-engine.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Symbol Engine for TraderBOT Enterprise Orchestrator.
 *
 *      وظایف:
 *      - Add / Remove / Restart / Reload Symbols
 *      - ثبت Collector / Processor / Engine در ModuleTree + StateTree
 *      - اتصال Collectorها به EventRouter
 *      - مدیریت Hot Reload
 *
 *      سازگار با:
 *      - ModuleTree جدید
 *      - StateTree جدید
 *      - EventRouter جدید
 *      - BackoffEngine جدید
 *      - KillSwitchEngine جدید
 *      - Orchestrator جدید
 *
 *      نکته:
 *      - ساختار جدید فقط بر اساس symbol / collectors / processors / engines است.
 *      - market و category در معماری جدید حذف شده‌اند.
 * ============================================================
 */

class SymbolEngine {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.modules = orchestrator.modules;   // ModuleTree جدید
        this.state   = orchestrator.state;     // StateTree جدید
        this.router  = orchestrator.router;    // EventRouter جدید
        this.log     = orchestrator.log;       // LogManager جدید
    }

    async init() {
        this.log.info("SymbolEngine initialized.");
    }

    /**
     * ============================================================
     *  Add Symbol
     * ============================================================
     */
    async add(symbol) {

        this.log.info(`Adding symbol → ${symbol}`);

        // ایجاد نودهای اولیه
        this.modules.ensureSymbol(symbol);
        this.state.ensureSymbol(symbol);

        // ثبت ماژول‌های پیش‌فرض
        this.registerDefaultModules(symbol);

        // اتصال Collectorها به EventRouter
        this.bindCollectors(symbol);

        this.log.success(`Symbol added → ${symbol}`);
    }

    /**
     * ============================================================
     *  Remove Symbol
     * ============================================================
     */
    async remove(symbol) {

        this.log.warn(`Removing symbol → ${symbol}`);

        delete this.modules.tree[symbol];
        delete this.state.tree[symbol];

        this.log.success(`Symbol removed → ${symbol}`);
    }

    /**
     * ============================================================
     *  Restart Symbol
     * ============================================================
     */
    async restart(symbol) {

        this.log.warn(`Restarting symbol → ${symbol}`);

        const categories = Object.keys(this.modules.tree[symbol]);

        for (const cat of categories) {
            const mods = Object.keys(this.modules.tree[symbol][cat]);

            for (const mod of mods) {
                this.state.resetNode(symbol, cat, mod);
            }
        }

        this.log.success(`Symbol restarted → ${symbol}`);
    }

    /**
     * ============================================================
     *  Reload Symbol (Hot Reload)
     * ============================================================
     */
    async reload(symbol) {

        this.log.info(`Reloading symbol → ${symbol}`);

        await this.restart(symbol);
        await this.bindCollectors(symbol);

        this.log.success(`Symbol reloaded → ${symbol}`);
    }

    /**
     * ============================================================
     *  Register Default Modules
     * ============================================================
     */
    registerDefaultModules(symbol) {

        const collectors = ["price", "trades", "candles"];
        const processors = ["depth", "levels", "speed"];
        const engines    = ["analysis", "logic"];

        for (const c of collectors) {
            this.modules.registerCollector(symbol, c, {});
            this.state.register(symbol, "collectors", c);
        }

        for (const p of processors) {
            this.modules.registerProcessor(symbol, p, {});
            this.state.register(symbol, "processors", p);
        }

        for (const e of engines) {
            this.modules.registerEngine(symbol, e, {});
            this.state.register(symbol, "engines", e);
        }
    }

    /**
     * ============================================================
     *  Bind Collectors to EventRouter
     * ============================================================
     */
    bindCollectors(symbol) {

        const collectors = Object.keys(this.modules.tree[symbol].collectors);

        for (const c of collectors) {

            const key = `${symbol}.collectors.${c}`;

            this.router.register(key, (event) => {
                this.state.updateStatus(symbol, "collectors", c, "active");
                this.state.updateMetrics(symbol, "collectors", c, { events: 1 });
            });
        }

        this.log.info(`Collectors bound → ${symbol}`);
    }
}

module.exports = SymbolEngine;

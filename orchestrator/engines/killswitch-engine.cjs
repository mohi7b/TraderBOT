/**
 * ============================================================
 *  File: killswitch-engine.cjs
 *  Path: orchestrator/engines/killswitch-engine.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      KillSwitch Engine for TraderBOT Enterprise Orchestrator.
 *
 *      وظایف:
 *      - Kill / Restart برای Collector، Processor، Engine
 *      - Soft Kill → فقط حذف مسیر رویدادها
 *      - Hard Kill → حذف کامل ماژول از ModuleTree + StateTree
 *      - Kill Symbol → حذف تمام ماژول‌های یک سیمبول
 *      - Kill System → خاموشی کامل سیستم
 *
 *      سازگار با:
 *      - ModuleTree جدید
 *      - StateTree جدید
 *      - EventRouter جدید
 *      - BackoffEngine جدید
 *      - Orchestrator جدید
 *
 *      نکته:
 *      - ساختار جدید فقط بر اساس symbol / collectors / processors / engines است.
 *      - market و category در معماری جدید حذف شده‌اند.
 * ============================================================
 */

class KillSwitchEngine {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.modules = orchestrator.modules;   // ModuleTree جدید
        this.state   = orchestrator.state;     // StateTree جدید
        this.router  = orchestrator.router;    // EventRouter جدید
        this.log     = orchestrator.log;       // LogManager جدید

        this.systemKilled = false;
    }

    async init() {
        this.log.info("KillSwitchEngine initialized.");
    }

    /**
     * ============================================================
     *  Kill یک ماژول (Collector / Processor / Engine)
     * ============================================================
     */
    async killModule(symbol, category, moduleName) {

        const key = `${symbol}.${category}.${moduleName}`;
        this.log.warn(`KillSwitch: Killing module → ${key}`);

        // حذف مسیر رویداد
        delete this.router.routes[key];

        // آپدیت وضعیت
        this.state.updateStatus(symbol, category, moduleName, "killed");
        this.state.updateHealth(symbol, category, moduleName, "offline");

        this.log.success(`Module killed → ${key}`);
    }

    /**
     * ============================================================
     *  Soft Kill یک سیمبول (حذف مسیرها، بدون حذف ماژول‌ها)
     * ============================================================
     */
    async softKillSymbol(symbol) {

        this.log.warn(`KillSwitch: Soft killing symbol → ${symbol}`);

        const categories = Object.keys(this.modules.tree[symbol]);

        for (const cat of categories) {
            const mods = Object.keys(this.modules.tree[symbol][cat]);

            for (const mod of mods) {
                const key = `${symbol}.${cat}.${mod}`;

                delete this.router.routes[key];

                this.state.updateStatus(symbol, cat, mod, "soft-killed");
                this.state.updateHealth(symbol, cat, mod, "offline");
            }
        }

        this.log.success(`Symbol soft-killed → ${symbol}`);
    }

    /**
     * ============================================================
     *  Hard Kill یک سیمبول (حذف کامل از سیستم)
     * ============================================================
     */
    async hardKillSymbol(symbol) {

        this.log.error(`KillSwitch: HARD killing symbol → ${symbol}`);

        await this.softKillSymbol(symbol);

        delete this.modules.tree[symbol];
        delete this.state.tree[symbol];

        this.log.success(`Symbol HARD killed → ${symbol}`);
    }

    /**
     * ============================================================
     *  Kill کل سیستم
     * ============================================================
     */
    async killSystem() {

        this.log.error("KillSwitch: HARD killing entire system");

        this.systemKilled = true;

        // حذف تمام مسیرهای رویداد
        this.router.routes = {};

        // آپدیت وضعیت تمام ماژول‌ها
        const symbols = Object.keys(this.modules.tree);

        for (const symbol of symbols) {
            const categories = Object.keys(this.modules.tree[symbol]);

            for (const cat of categories) {
                const mods = Object.keys(this.modules.tree[symbol][cat]);

                for (const mod of mods) {
                    this.state.updateStatus(symbol, cat, mod, "system-killed");
                    this.state.updateHealth(symbol, cat, mod, "offline");
                }
            }
        }

        this.log.success("SYSTEM HARD KILLED");
    }

    /**
     * ============================================================
     *  Restart یک ماژول
     * ============================================================
     */
    async restartModule(symbol, category, moduleName) {

        const key = `${symbol}.${category}.${moduleName}`;
        this.log.warn(`KillSwitch: Restarting module → ${key}`);

        this.state.resetNode(symbol, category, moduleName);

        this.log.success(`Module restarted → ${key}`);
    }

    /**
     * ============================================================
     *  Restart یک سیمبول
     * ============================================================
     */
    async restartSymbol(symbol) {

        this.log.warn(`KillSwitch: Restarting symbol → ${symbol}`);

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
     *  Restart کل سیستم
     * ============================================================
     */
    async restartSystem() {

        this.log.warn("KillSwitch: Restarting entire system");

        this.systemKilled = false;

        const symbols = Object.keys(this.modules.tree);

        for (const symbol of symbols) {
            await this.restartSymbol(symbol);
        }

        this.log.success("SYSTEM RESTARTED");
    }

    dump() {
        return { systemKilled: this.systemKilled };
    }
}

module.exports = KillSwitchEngine;

/**
 * ============================================================
 *  File: module-manager.cjs
 *  Path: orchestrator/utils/module-manager.cjs
 *  Version: 5.0.1 (FINAL — FULL HEADER + FIXED)
 *
 *  Description:
 *      Module Manager for TraderBOT Enterprise Orchestrator.
 *
 *      وظایف:
 *      - Enable / Disable / Reload Collector / Processor / Engine
 *      - ثبت ماژول‌ها در ModuleTree + StateTree
 *      - اتصال Collectorها به EventRouter
 *      - مدیریت Hot Reload
 *
 *      نکات معماری جدید:
 *      - market و category قدیمی حذف شده‌اند
 *      - ساختار جدید فقط از:
 *          → symbol
 *          → collectors
 *          → processors
 *          → engines
 *        استفاده می‌کند
 *
 *      این نسخه:
 *      - collectorName را صحیح پاس می‌دهد
 *      - collector-loader را صحیح فراخوانی می‌کند
 *      - EventRouter را صحیح bind می‌کند
 *      - با StateTree جدید سازگار است
 * ============================================================
 */

class ModuleManager {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.modules = orchestrator.modules;
        this.state   = orchestrator.state;
        this.router  = orchestrator.router;
        this.log     = orchestrator.log;
    }

    async init() {
        this.log.info("ModuleManager initialized.");
    }

    /**
     * ============================================================
     *  Enable Collector (NEW ARCHITECTURE)
     * ============================================================
     */
    async enableCollector(symbol, collectorName) {

        this.log.info(`Enabling collector → ${symbol}.${collectorName}`);

        // ثبت در ModuleTree + StateTree
        this.modules.registerCollector(symbol, collectorName, {});
        this.state.register(symbol, "collectors", collectorName);

        // بارگذاری Collector
        const loadCollector = require("./collector-loader.cjs");
        loadCollector(this.orchestrator, symbol, collectorName);

        // اتصال به EventRouter
        const key = `${symbol}.collectors.${collectorName}`;

        this.router.register(key, (event) => {
            this.state.updateStatus(symbol, "collectors", collectorName, "active");
            this.state.updateMetrics(symbol, "collectors", collectorName, { events: 1 });
        });

        this.log.success(`Collector enabled → ${symbol}.${collectorName}`);
    }

    /**
     * ============================================================
     *  Enable Processor
     * ============================================================
     */
    async enableProcessor(symbol, processorName) {

        this.log.info(`Enabling processor → ${symbol}.${processorName}`);

        const ProcessorClass = require(
            `../../collector/realtime/spot/orderbook/${processorName}.cjs`
        );

        const processor = new ProcessorClass(this.orchestrator);

        this.modules.registerProcessor(symbol, processorName, processor);
        this.state.register(symbol, "processors", processorName);

        this.log.success(`Processor enabled → ${symbol}.${processorName}`);
    }

    /**
     * ============================================================
     *  Disable Module
     * ============================================================
     */
    async disable(symbol, category, moduleName) {

        const key = `${symbol}.${category}.${moduleName}`;
        this.log.warn(`Disabling module → ${key}`);

        delete this.router.routes[key];

        this.state.updateStatus(symbol, category, moduleName, "disabled");
        this.state.updateHealth(symbol, category, moduleName, "offline");

        this.log.success(`Module disabled → ${key}`);
    }

    /**
     * ============================================================
     *  enableTradeLogger Module
     * ============================================================
     */


    async enableTradeLogger(symbol) {

    const ProcessorClass = require(
        "../../collector/realtime/spot/processors/trade_logger.cjs"
    );

    const processor = new ProcessorClass(this.orchestrator);

    this.modules.registerProcessor(symbol, "trade_logger", processor);
    this.state.register(symbol, "processors", "trade_logger");

    // اتصال به EventRouter
    const key = `${symbol}.collectors.binance_spot`;

    this.router.register(key, (event) => {
        processor.handle(event);
    });

    this.log.success(`TradeLogger processor enabled → ${symbol}`);
}


    /**
     * ============================================================
     *  Reload Module
     * ============================================================
     */
    async reload(symbol, category, moduleName) {

        const key = `${symbol}.${category}.${moduleName}`;
        this.log.info(`Reloading module → ${key}`);

        await this.disable(symbol, category, moduleName);

        if (category === "collectors") {
            await this.enableCollector(symbol, moduleName);
        } else if (category === "processors") {
            await this.enableProcessor(symbol, moduleName);
        }

        this.log.success(`Module reloaded → ${key}`);
    }

    dump() {
        return {
            modules: this.modules.dump(),
            state: this.state.dump()
        };
    }
}

module.exports = ModuleManager;

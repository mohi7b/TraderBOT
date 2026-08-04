/**
 * ============================================================
 *  File: orchestrator.cjs
 *  Path: orchestrator/core/orchestrator.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      TraderBOT Enterprise Orchestrator (Single-Process Mode)
 *
 *      وظایف:
 *      - مدیریت Collector / Processor / Engine برای هر Symbol
 *      - مدیریت StateTree + ModuleTree
 *      - مدیریت EventRouter
 *      - مدیریت BackoffEngine + KillSwitchEngine
 *      - مدیریت HotReload + ErrorManager
 *      - سازگار با ClusterEngine (در صورت فعال بودن)
 *
 *      نکته:
 *      - ساختار جدید فقط از symbol / collectors / processors / engines استفاده می‌کند.
 *      - market و category قدیمی حذف شده‌اند.
 * ============================================================
 */
/**
 * ============================================================
 *  File: orchestrator.cjs
 *  Path: orchestrator/core/orchestrator.cjs
 *  Version: 5.1.0 (UPDATED WITH DEPTH MODULE)
 * ============================================================
 */

const config        = require("../config/index.cjs");
const EventRouter   = require("./event-router.cjs");
const ModuleTree    = require("./module-tree.cjs");
const StateTree     = require("./state-tree.cjs");

const SymbolEngine  = require("../engines/symbol-engine.cjs");
const BackoffEngine = require("../engines/backoff-engine.cjs");
const KillSwitch    = require("../engines/killswitch-engine.cjs");
const ClusterEngine = require("../cluster/cluster-engine.cjs");

const ModuleManager = require("../utils/module-manager.cjs");
const StateManager  = require("../utils/state-manager.cjs");
const HotReload     = require("../utils/hot-reload.cjs");
const ErrorManager  = require("../utils/error-manager.cjs");
const LogManager    = require("../utils/log-manager.cjs");

// 🔥 اضافه‌شده: ماژول عمق
const DepthCluster  = require("../modules/depth/depth.cluster.cjs");

class Orchestrator {

    constructor() {

        this.log = new LogManager(this);

        this.modules = new ModuleTree();
        this.state   = new StateTree();
        this.router  = new EventRouter();

        this.symbolEngine = new SymbolEngine(this);
        this.backoff      = new BackoffEngine(this);
        this.killSwitch   = new KillSwitch(this);
        this.cluster      = new ClusterEngine(this);

        this.moduleManager = new ModuleManager(this);
        this.stateManager  = new StateManager(this);
        this.hotReload     = new HotReload(this);
        this.errorManager  = new ErrorManager(this);

        this.config = config;
    }

    /**
     * ============================================================
     *  Start Orchestrator
     * ============================================================
     */
    async start() {

        this.log.info("Orchestrator starting...");

        await this.symbolEngine.init();
        await this.backoff.init();
        await this.killSwitch.init();

        await this.moduleManager.init();
        await this.stateManager.init();
        await this.router.init();

        // 🔥 اضافه‌شده: راه‌اندازی ماژول عمق
        await DepthCluster.init();

        this.log.success("Orchestrator fully initialized.");
    }

    /**
     * ============================================================
     *  Shutdown Orchestrator
     * ============================================================
     */
    async shutdown() {

        this.log.warn("Orchestrator shutting down...");

        // 🔥 اضافه‌شده: خاموش کردن ماژول عمق
        DepthCluster.shutdown();

        this.symbolEngine.shutdown();
        this.backoff.shutdown();
        this.killSwitch.shutdown();
        this.cluster.shutdown();

        this.log.warn("Orchestrator shutdown complete.");
    }

    enableCollector(symbol, collectorName) {
        this.moduleManager.enableCollector(symbol, collectorName);
        this.log.info(`Collector enabled → ${symbol}.${collectorName}`);
    }

    enableProcessor(symbol, processorName) {
        this.moduleManager.enableProcessor(symbol, processorName);
        this.log.info(`Processor enabled → ${symbol}.${processorName}`);
    }
}

module.exports = Orchestrator;

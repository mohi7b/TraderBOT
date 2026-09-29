/* ============================================================
 * File: orchestrator/aanode/bootstrap.cjs
 * Role:
 *   Bootstraps the entire system (Worker-based)
 * ============================================================ */

console.log("BOOTSTRAP STARTED");

const CONFIG = require("./config/system.cjs");
global.CONFIG = CONFIG;

if (CONFIG.mode === "debug") {
    console.log("[DEBUG-MODE] In-memory tracing and health snapshots enabled.");
}

const log = require("../utils/log-manager.cjs");
const EXCHANGES = require("./config/exchanges.cjs");
const SYMBOLS = EXCHANGES.symbols;

const Orchestrator = require("../core/orchestrator.cjs");
const HealthMonitor = require("../utils/health-monitor.cjs");
const debugDashboard = require("../utils/debug-dashboard.cjs");
const dashboardServer = require("../api/server.cjs");
const collectorBootstrap = require("../../collector/aanode/bootstrap.cjs");

function orchestratorBootstrap() {

    log.info("Orchestrator Bootstrap → Starting system...");

    // یک orchestrator واحد برای کل سیستم
    const orchestrator = new Orchestrator();
    global.orchestrator = orchestrator;

    // health-monitor باید قبل از collector و realtime اجرا شود
    const monitor = new HealthMonitor(orchestrator);
    monitor.start();

    if (CONFIG.api?.enabled) dashboardServer.start(CONFIG.api.port || 3000);

    // حالا collector و realtime را برای هر symbol اجرا می‌کنیم
    SYMBOLS.forEach(symbol => {

        log.info(`Starting Worker for ${symbol} ...`);
        orchestrator.worker.start();

        if (CONFIG.trees.collector) {
            log.info(`Starting Collector for ${symbol} ...`);
            collectorBootstrap({ symbol });
        }
    });

    log.info("System is running.");

    if (CONFIG.mode === "debug") {
        console.log("[DEBUG-DASHBOARD] Ready:", debugDashboard.renderCompact());
        global.getDebugSummary = () => debugDashboard.getSummary();
    }
}

orchestratorBootstrap();
module.exports = orchestratorBootstrap;
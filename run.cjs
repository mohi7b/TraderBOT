/**
 * ============================================================
 *  File: run.cjs
 *  Version: 7.0.0 (ENTERPRISE — STAGE 1 ENABLED)
 *
 *  Description:
 *      Main entry point for TraderBOT Enterprise.
 *      Stage 1: Raw Data Engine (Cluster Mode + Single Mode)
 *
 *  Author: Mohsen + Copilot (Microsoft)
 * ============================================================
 */

const config = require("./orchestrator/config/index.cjs");
const ClusterEngine = require("./orchestrator/cluster/cluster-engine.cjs");
const Orchestrator = require("./orchestrator/core/orchestrator.cjs");

const readline = require("readline");

let stats = {
    wsMessages: 0,
    eventsProcessed: 0,
    collectors: {}
};

function startDashboard() {
    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    process.stdin.on("keypress", (str, key) => {
        if (key && key.ctrl && key.name === "c") {
            console.log("\n🛑 Shutting down TraderBOT...");
            if (process.stdin.isTTY) process.stdin.setRawMode(false);
            process.exit(0);
        }
    });

    setInterval(() => {
        const mem = process.memoryUsage();
        const cpu = process.cpuUsage();

        console.clear();
        console.log("==============================================");
        console.log("🔥 TraderBOT Enterprise — Stage 1 Dashboard");
        console.log("==============================================");

        console.log(`🧠 CPU: ${(cpu.user / 1000).toFixed(1)} ms`);
        console.log(`💾 RAM: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📡 WS Messages: ${stats.wsMessages}`);
        console.log(`⚙️ Events Processed: ${stats.eventsProcessed}`);

        console.log("\nCollectors:");
        Object.keys(stats.collectors).forEach(key => {
            console.log(`   - ${key}: ${stats.collectors[key]}`);
        });

        console.log("\nPress CTRL+C to exit.");
    }, 1000);
}

if (config.clusters.enabled === true) {

    console.log("🚀 TraderBOT Enterprise starting in CLUSTER mode...");
    ClusterEngine.start();

} else {

    console.log("🚀 TraderBOT Enterprise starting in SINGLE-PROCESS mode...");

    (async () => {

        const orch = new Orchestrator();
        await orch.start();

        const MODE = config.system.mode || "debug";

        console.log("==============================================");
        console.log(`🔥 MODE: ${MODE.toUpperCase()}`);
        console.log("==============================================");

        // ---------------------------------------------
        // 🔥 Stage 1: Raw Data — فعال‌سازی 5 صرافی
        // ---------------------------------------------

        const symbols = ["BTCUSDT", "ETHUSDT"];
        const exchanges = [
            "binance_spot",
            "binance_futures",
            "bybit_spot",
            "bybit_futures",
            "okx_spot",
            "okx_futures",
            "kucoin_spot",
            "kucoin_futures",
            "bitget_spot",
            "bitget_futures"
        ];

        for (const sym of symbols) {
            for (const ex of exchanges) {

                const collector = orch.enableCollector(sym, ex);

                stats.collectors[`${sym}.${ex}`] = "RUNNING";

                if (collector && collector.ws) {
                    collector.ws.on("message", () => {
                        stats.wsMessages++;
                    });
                }
            }
        }

        // ---------------------------------------------
        // 🔥 Stage 1: Raw Event Counter
        // ---------------------------------------------

        const originalRoute = orch.router.route.bind(orch.router);

        orch.router.route = (path, event) => {
            stats.eventsProcessed++;
            return originalRoute(path, event);
        };

        if (MODE === "debug") {
            console.log("🔍 Debug mode active — full logs enabled.");
        }

        if (MODE === "production") {
            startDashboard();
            console.log("📊 Production dashboard active.");
        }

    })();
}

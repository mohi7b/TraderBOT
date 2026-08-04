/**
 * ============================================================
 *  File: cluster-engine.cjs
 *  Path: orchestrator/cluster/cluster-engine.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Master controller for TraderBOT Enterprise Cluster Mode.
 *
 *      نکته مهم:
 *      - این فایل باید یک CLASS صادر کند، نه یک INSTANCE.
 *      - Orchestrator از این کلاس با new استفاده می‌کند.
 * ============================================================
 */

const cluster = require("cluster");
const path = require("path");
const config = require("../config/index.cjs");
const MessageRouter = require("./message-router.cjs");

class ClusterEngine {

    constructor(orchestrator = null) {
        this.orchestrator = orchestrator;
        this.enabled = config.clusters.enabled;
        this.workers = {};
        this.router = new MessageRouter();
    }

    start() {

        // Worker mode
        if (cluster.isWorker) {
            require("./worker.cjs");
            return;
        }

        // Master mode
        if (cluster.isPrimary) {
            this.startMaster();
        }
    }

    startMaster() {
        console.log("🧠 ClusterEngine Master starting...");

        const workerEntry = path.join(__dirname, "worker.cjs");

        cluster.setupPrimary({ exec: workerEntry });

        const totalWorkers = config.clusters.workers || 0;

        for (let i = 0; i < totalWorkers; i++) {
            const worker = cluster.fork({ WORKER_ID: i });
            this.workers[i] = worker;
            console.log(`🔧 Worker ${i} started (PID: ${worker.process.pid})`);
        }

        cluster.on("message", (worker, msg) => {
            this.router.route(worker, msg);
        });

        cluster.on("exit", (worker, code, signal) => {
            console.log(`❌ Worker ${worker.id} died. Restarting...`);
            const newWorker = cluster.fork({ WORKER_ID: worker.id });
            this.workers[worker.id] = newWorker;
            console.log(`🔧 Worker ${worker.id} restarted (PID: ${newWorker.process.pid})`);
        });

        console.log("🧠 ClusterEngine Master fully initialized.");
    }
}

module.exports = ClusterEngine;

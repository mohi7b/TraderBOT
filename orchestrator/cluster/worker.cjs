/**
 * ============================================================
 *  File: worker.cjs
 *  Path: orchestrator/cluster/worker.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Worker Entry Point for TraderBOT Enterprise Cluster
 *      - Loads WorkerContext
 *      - Loads WorkerLoader
 *      - Executes assigned role based on config/index.cjs
 * ============================================================
 */

const cluster = require("cluster");

// Worker باید فقط در حالت Worker اجرا شود
if (cluster.isPrimary) {
    console.error("❌ ERROR: worker.cjs executed in PRIMARY mode");
    process.exit(1);
}

// WorkerContext جدید
const context = require("./worker-context.cjs");

// WorkerLoader جدید
const WorkerLoader = require("./worker-loader.cjs");

// شناسه Worker
const id = parseInt(process.env.WORKER_ID, 10);

// بررسی شناسه Worker
if (isNaN(id)) {
    context.error("Worker has invalid WORKER_ID — exiting");
    process.exit(1);
}

// پیام Boot
context.info(`Worker booting with id = ${id}`);
context.info(`CWD = ${process.cwd()}`);

// اجرای نقش Worker
try {
    WorkerLoader.start(id);
} catch (err) {
    context.error(`WorkerLoader Error (id=${id}): ${err.message}`);
    process.exit(1);
}

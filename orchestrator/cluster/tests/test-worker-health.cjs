/**
 * Worker Health Diagnostic (RUNS INSIDE WORKER)
 */

const cluster = require("cluster");

module.exports = function runWorkerHealth() {

    console.log("=======================================");
    console.log("🔍 Worker Health Diagnostic (INSIDE WORKER)");
    console.log("=======================================");

    console.log("📌 isPrimary =", cluster.isPrimary);
    console.log("📌 isWorker  =", cluster.isWorker);
    console.log("📌 WORKER_ID =", process.env.WORKER_ID);

    console.log("=======================================");
    console.log("🔍 Diagnostic complete");
    console.log("=======================================");
};

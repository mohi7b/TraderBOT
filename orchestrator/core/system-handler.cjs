/* ============================================================
 * File: system-handler.cjs
 * Section: orchestrator/core
 * ============================================================ */

const log = require("../utils/log-manager.cjs");

let collectorHandler = null;
let analyzerHandler = null;
let executorHandler = null;

const stageMap = {
    1: "collector",
    2: "collector",
    3: "collector",
    4: "analyzer",
    5: "analyzer",
    6: "analyzer",
    7: "analyzer",
    8: "analyzer",
    9: "analyzer",
    10: "executor",
    11: "executor",
    12: "executor",
    13: "executor"
};

module.exports = function systemHandler(packet) {
    try {
        const CONFIG = global.CONFIG;
        if (!CONFIG) return log.error("CONFIG not loaded in system-handler");

        const stage = packet.stage;
        const tree = stageMap[stage];

        log.debug(`SystemHandler → Stage ${stage} → Tree ${tree}`);

        if (!tree) return;
        if (!CONFIG.trees[tree]) return;

        if (tree === "collector" && !collectorHandler) {
            log.info("Loading Collector Handler...");
            collectorHandler = require("../../collector/aanode/handler.cjs");
        }

        if (tree === "analyzer" && !analyzerHandler) {
            log.info("Loading Analyzer Handler...");
            analyzerHandler = require("../../analyzer/aanode/handler.cjs");
        }

        if (tree === "executor" && !executorHandler) {
            log.info("Loading Executor Handler...");
            executorHandler = require("../../executor/aanode/handler.cjs");
        }

        switch (tree) {
            case "collector":
                collectorHandler(packet);
                break;
            case "analyzer":
                analyzerHandler(packet);
                break;
            case "executor":
                executorHandler(packet);
                break;
        }

    } catch (err) {
        log.error("SystemHandler Error:", err);
    }
};

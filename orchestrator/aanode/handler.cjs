/* ============================================================
 * File: handler.cjs
 * Section: orchestrator/aanode
 * Role:
 *   Unified EventRouter + SystemHandler
 *   Routes packets to Collector / Analyzer / Executor
 * ============================================================ */

const log = require("../utils/log-manager.cjs");

let collectorHandler = null;
let analyzerHandler = null;
let executorHandler = null;

/* ============================================================
 * Stage → Tree Mapping
 * ============================================================ */
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

/* ============================================================
 * Event Router
 * ============================================================ */
module.exports = {

    eventRouter(packet) {
        log.debug("EventRouter routing packet", packet);
        this.systemHandler(packet);
    },

    /* ============================================================
     * System Handler
     * ============================================================ */
    systemHandler(packet) {
        const CONFIG = global.CONFIG;
        const stage = packet.stage;
        const tree = stageMap[stage];

        log.debug(`SystemHandler → Stage ${stage} → Tree ${tree}`);

        if (!tree) return;
        if (!CONFIG.trees[tree]) return;

        /* Collector */
        if (tree === "collector") {
            if (!collectorHandler) {
                collectorHandler = require("../../collector/aanode/handler.cjs");
            }
            collectorHandler(packet);
            return;
        }

        /* Analyzer */
        if (tree === "analyzer") {
            if (!analyzerHandler) {
                analyzerHandler = require("../../analyzer/aanode/handler.cjs");
            }
            analyzerHandler(packet);
            return;
        }

        /* Executor */
        if (tree === "executor") {
            if (!executorHandler) {
                executorHandler = require("../../executor/aanode/handler.cjs");
            }
            executorHandler(packet);
            return;
        }
    }
};

/* ============================================================
 * File: system.cjs
 * Section: orchestrator/aanode/config
 * Role:
 *   Global system configuration
 * ============================================================ */

module.exports = {
    mode: "debug",   // debug | production | test
    debugVerbose: false,

    trees: {
        collector: true,
        analyzer: false,
        executor: false
    },

    api: {
        enabled: true,
        port: 3000
    }
};

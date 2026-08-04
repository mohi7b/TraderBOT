/**
 * ============================================================
 *  File: index.cjs
 *  Path: orchestrator/config/index.cjs
 *  Version: 5.0.0
 *  Description:
 *      Central configuration aggregator for TraderBOT Enterprise.
 *      Loads and merges all configuration modules into a single
 *      unified config object used by the Orchestrator.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {
    system:    require("./system.cjs"),
    logging:   require("./logging.cjs"),
    pipeline:  require("./pipeline.cjs"),
    symbols:   require("./symbols.cjs"),
    exchanges: require("./exchanges.cjs"),
    clusters:  require("./clusters.cjs"),
    modules:   require("./modules.cjs")
};

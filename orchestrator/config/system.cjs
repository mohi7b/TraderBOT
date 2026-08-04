/**
 * ============================================================
 *  File: system.cjs
 *  Path: orchestrator/config/system.cjs
 *  Version: 5.0.0
 *  Description:
 *      System-level configuration for TraderBOT Enterprise.
 *      Controls environment, runtime mode, timezone, safety flags,
 *      and global system metadata.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {

    name: "TraderBOT Enterprise",
    version: "5.0.0",

    environment: process.env.NODE_ENV || "production",   // production / debug
    timezone: "UTC",

    mode:  "production",        // production / debug / debug+
    safeMode: true,       // prevents execution layer
    hotReload: false      // disabled for test mode
};

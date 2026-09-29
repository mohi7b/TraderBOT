/* ============================================================
 * File: log-manager.cjs
 * Section: orchestrator/utils
 * Role:
 *   Unified logging system
 * ============================================================ */

class LogManager {
    constructor() {
        this.mode = global.CONFIG?.mode || "production";
    }

    debug(msg, ...args) {
        if (this.mode === "debug") console.log(`[DEBUG] ${msg}`, ...args);
    }

    info(msg, ...args) {
        if (this.mode !== "production") console.log(`[INFO] ${msg}`, ...args);
    }

    warn(msg, ...args) {
        console.log(`[WARN] ${msg}`, ...args);
    }

    error(msg, ...args) {
        console.error(`[ERROR] ${msg}`, ...args);
    }
}

module.exports = new LogManager();

/* ============================================================
 * File: collector/crypto/realtime/core/logger.cjs
 * Section: collector/crypto/realtime/core
 *
 * Role:
 *   Section-local logger for the Realtime service.
 *   Replaces the previous dependency on
 *   orchestrator/utils/log-manager.cjs so that collector/crypto/realtime
 *   has zero requires pointing outside of its own section.
 *
 * Levels (ascending verbosity): silent < error < warn < info < debug
 * Configured through collector/crypto/realtime/config/realtime.cjs (logLevel)
 * or REALTIME_LOG_LEVEL. Falls back to debug when global.CONFIG.mode
 * is "debug" so existing orchestrator debug runs stay verbose.
 * ============================================================ */

const CONFIG = require("../config/realtime.cjs");

const LEVELS = Object.freeze({ silent: 0, error: 1, warn: 2, info: 3, debug: 4 });

function resolveLevel() {
    const configured = String(CONFIG.logLevel || "").toLowerCase();
    if (LEVELS[configured] !== undefined) return LEVELS[configured];
    return global.CONFIG && global.CONFIG.mode === "debug" ? LEVELS.debug : LEVELS.info;
}

const activeLevel = resolveLevel();

function format(scope, message) {
    return scope ? `[realtime:${scope}] ${message}` : `[realtime] ${message}`;
}

function createLogger(scope = "") {
    return {
        scope,
        activeLevel,

        isEnabled(level) {
            const value = LEVELS[level];
            return value === undefined ? false : value <= activeLevel;
        },

        debug(message, ...args) {
            if (LEVELS.debug > activeLevel) return;
            console.log(format(scope, message), ...args);
        },

        info(message, ...args) {
            if (LEVELS.info > activeLevel) return;
            console.log(format(scope, message), ...args);
        },

        warn(message, ...args) {
            if (LEVELS.warn > activeLevel) return;
            console.log(format(scope, message), ...args);
        },

        error(message, ...args) {
            if (LEVELS.error > activeLevel) return;
            console.error(format(scope, message), ...args);
        },

        child(childScope) {
            return createLogger(scope ? `${scope}:${childScope}` : String(childScope || ""));
        }
    };
}

const logger = createLogger();
logger.createLogger = createLogger;
logger.LEVELS = LEVELS;

module.exports = logger;

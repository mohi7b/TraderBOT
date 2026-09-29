/* ============================================================
 * File: collector/crypto/realtime/core/index.cjs
 * Section: collector/crypto/realtime/core
 *
 * Role:
 *   Public surface of the Realtime core. Everything a consumer needs
 *   to build/observe the section defaults to the shared runtime.
 * ============================================================ */

const logger = require("./logger.cjs");
const { EventBus, channelKey, normalizeEvent } = require("./event-bus.cjs");
const { ModuleRegistry } = require("./registry.cjs");
const { ModuleState } = require("./module-state.cjs");
const { Pipeline, defaultHealthSink } = require("./pipeline.cjs");
const { getRuntime, buildRuntime, setRuntime, resetRuntime } = require("./runtime.cjs");

module.exports = {
    logger,
    createLogger: logger.createLogger,
    EventBus,
    channelKey,
    normalizeEvent,
    ModuleRegistry,
    ModuleState,
    Pipeline,
    defaultHealthSink,
    getRuntime,
    buildRuntime,
    setRuntime,
    resetRuntime
};

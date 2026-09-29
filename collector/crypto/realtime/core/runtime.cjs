/* ============================================================
 * File: collector/crypto/realtime/core/runtime.cjs
 * Section: collector/crypto/realtime/core
 *
 * Role:
 *   Shared, lazily built runtime for the Realtime section:
 *   registry + event bus + module state + pipeline.
 *
 *   Both the ingest handlers and the service layer resolve the same
 *   instance, so the SSE stream, `request()` and `signals()` always
 *   observe one consistent state.
 *
 *   Requires are lazy on purpose: registrations/*.cjs pull in all L2
 *   modules, and nothing should be loaded until the first packet or the
 *   first request arrives.
 * ============================================================ */

const CONFIG = require("../config/realtime.cjs");
const { EventBus } = require("./event-bus.cjs");
const { ModuleRegistry } = require("./registry.cjs");
const { ModuleState } = require("./module-state.cjs");
const { Pipeline } = require("./pipeline.cjs");
const logger = require("./logger.cjs").createLogger("runtime");

let runtime = null;

function buildRuntime(overrides = {}) {
    const registry = overrides.registry || new ModuleRegistry();

    if (!overrides.registry) {
        registry.registerAll(require("../registrations/spot.cjs"));
        registry.registerAll(require("../registrations/futures.cjs"));
    }

    const bus = overrides.bus || new EventBus();
    const state = overrides.state || new ModuleState({ ttlMs: CONFIG.idleTtlMs });
    const pipeline = overrides.pipeline || new Pipeline({
        registry,
        bus,
        state,
        emitHealth: overrides.emitHealth || null
    });

    return {
        config: CONFIG,
        registry,
        bus,
        state,
        pipeline,
        logger,
        stop() {
            bus.clear();
            state.clear();
        }
    };
}

function getRuntime() {
    if (!runtime) runtime = buildRuntime();
    return runtime;
}

function setRuntime(next) {
    runtime = next;
    return runtime;
}

function resetRuntime() {
    runtime = null;
}

module.exports = { getRuntime, buildRuntime, setRuntime, resetRuntime };

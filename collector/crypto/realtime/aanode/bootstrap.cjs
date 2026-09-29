/* ============================================================
 * File: collector/crypto/realtime/aanode/bootstrap.cjs
 * Section: collector/crypto/realtime/aanode  (legacy path — kept as a shim)
 *
 * Role:
 *   Backward-compatible boot shim. The legacy function started the
 *   hard-coded stream set for one symbol using the orchestrator's
 *   exchange config. It now delegates to the Realtime service, which
 *   resolves the same streams from
 *   collector/crypto/realtime/venue-adapters/registry.cjs and honours
 *   collector/crypto/realtime/config/exchanges.cjs.
 *
 *   Legacy:   realtimeBootstrap({ symbol })
 *   Now:      same signature, non-blocking, returns a Promise
 *             (superset — the legacy call ignored the return value).
 *
 *   New code should call:
 *     const realtime = require("collector/crypto/realtime");
 *     await realtime.request(symbol);
 * ============================================================ */

const createLogger = require("../core/logger.cjs").createLogger;
const { getService } = require("../service/index.cjs");

const log = createLogger("legacy-bootstrap");

module.exports = function realtimeBootstrap({ symbol, symbols, ...options } = {}) {
    const targets = (Array.isArray(symbols) && symbols.length ? symbols : [symbol])
        .filter((value) => typeof value === "string" && value.trim().length);

    if (!targets.length) {
        log.error("realtimeBootstrap requires { symbol } or { symbols: [] }");
        return null;
    }

    const service = getService();
    const promise = Promise.all(
        targets.map((target) => service.request(target, { ...options, force: true }))
    ).catch((err) => {
        log.error(`realtimeBootstrap failed → ${err.message}`);
        return null;
    });

    log.debug(`realtimeBootstrap delegated ${targets.length} symbol(s) to the realtime service`);
    return promise;
};

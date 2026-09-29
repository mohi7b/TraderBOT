/* ============================================================
 * File: collector/crypto/realtime/venue-adapters/wrappers.cjs
 * Section: collector/crypto/realtime/venue-adapters
 *
 * Role:
 *   Unify the two L1 adapter contracts that exist in collector/exchange:
 *
 *     futures ws  →  class XxxFuturesWS { constructor({...}); connect(); }
 *     spot ws     →  function wsXxxSpot({ symbol, handler, onCritical })
 *                    (kucoin spot returns a promise)
 *     pollers     →  class with start() / stop()
 *                    (binance open-interest + market-poller)
 *
 *   Neither contract exposes a real socket teardown today, so `stop()`
 *   is best-effort: it calls whatever of stop/close/disconnect/destroy
 *   the instance provides and otherwise reports "detached". Real socket
 *   close is tracked as a follow-up item of the refactor.
 * ============================================================ */

const createLogger = require("../core/logger.cjs").createLogger;
const log = createLogger("venues");

const STOP_METHODS = ["stop", "close", "disconnect", "destroy", "shutdown", "terminate"];

function isWsClass(mod) {
    return typeof mod === "function" && !!mod.prototype && typeof mod.prototype.connect === "function";
}

function resolveStop(instance) {
    if (!instance) return null;
    for (const name of STOP_METHODS) {
        if (typeof instance[name] === "function") return { name, fn: instance[name] };
    }
    return null;
}

function createHandle({ descriptor, instance }) {
    const stop = resolveStop(instance);

    return {
        id: descriptor.id,
        exchange: descriptor.exchange,
        market: descriptor.market,
        kind: descriptor.kind,
        instance,
        startedAt: Date.now(),
        status: "running",
        closable: !!stop,
        closeMethod: stop ? stop.name : null,

        stop(reason = "manual") {
            if (this.status === "stopped") return false;
            if (!stop) {
                this.status = "detached";
                log.debug(`${descriptor.id} has no stop()/close() → detached (${reason})`);
                return false;
            }
            try {
                stop.fn.call(instance);
                this.status = "stopped";
                return true;
            } catch (err) {
                this.status = "error";
                log.error(`${descriptor.id} stop failed → ${err.message}`);
                return false;
            }
        }
    };
}

/** WebSocket adapter: normalises class-based futures and factory-based spot. */
function createWsAdapter(descriptor) {
    const { id, exchange, market, load, injectExchange } = descriptor;

    return {
        ...descriptor,

        async start({ symbol, handler, onCritical }) {
            const mod = load();

            // Spot factories receive the raw L1 packet; the legacy bootstrap
            // injected exchange/source into `packet.data` before handing it on.
            const wrappedHandler = injectExchange
                ? (packet) => {
                    const data = (packet && packet.data) || {};
                    return handler({
                        ...packet,
                        data: { ...data, exchange, source: data.source || "websocket" }
                    });
                }
                : handler;

            let instance = null;

            if (isWsClass(mod)) {
                instance = new mod({ symbol, handler: wrappedHandler, onCritical });
                if (typeof instance.connect === "function") await Promise.resolve(instance.connect());
            } else {
                instance = await Promise.resolve(mod({ symbol, handler: wrappedHandler, onCritical }));
            }

            return createHandle({ descriptor: { id, exchange, market, kind: "websocket" }, instance });
        }
    };
}

/** Poller adapter: REST pollers with start()/stop(). */
function createPollerAdapter(descriptor) {
    const { id, exchange, market, load, intervalMs } = descriptor;

    return {
        ...descriptor,

        async start({ symbol, handler, onCritical }) {
            const Poller = load();
            const instance = new Poller({ symbol, handler, onCritical, intervalMs });

            if (typeof instance.start !== "function") {
                throw new Error(`${id} does not expose start()`);
            }

            await Promise.resolve(instance.start());
            return createHandle({ descriptor: { id, exchange, market, kind: "poller" }, instance });
        }
    };
}

function createAdapter(descriptor) {
    return descriptor.kind === "poller" ? createPollerAdapter(descriptor) : createWsAdapter(descriptor);
}

module.exports = { createAdapter, createWsAdapter, createPollerAdapter, createHandle, isWsClass, resolveStop };

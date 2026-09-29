/* ============================================================
 * File: collector/crypto/realtime/core/pipeline.cjs
 * Section: collector/crypto/realtime/core
 *
 * Role:
 *   Executes the registered L2 modules for an incoming realtime
 *   packet, in a deterministic order, with per-module isolation.
 *
 *   Responsibilities:
 *     1. build the module context  ({ symbol, data, emit, state, ... })
 *     2. walk the registry in priority order for the packet's market
 *     3. evaluate each module's `when` guard  (was an inline `if`)
 *     4. emit group health markers exactly once per group
 *     5. forward module emits to the event bus + health sink
 *     6. isolate failures: one throwing module no longer aborts the
 *        rest of the pipeline (legacy handlers had a single try/catch
 *        around everything, so one bad module killed the whole packet)
 * ============================================================ */

const { normalizeEvent } = require("./event-bus.cjs");
const createLogger = require("./logger.cjs").createLogger;
const logger = createLogger("pipeline");

function defaultHealthSink(event) {
    if (typeof global.healthEmit === "function") global.healthEmit(event);
}

class Pipeline {
    constructor({ registry = null, bus = null, state = null, emitHealth = null, metrics = true } = {}) {
        this.registry = registry;
        this.bus = bus;
        this.state = state;
        this.emitHealth = typeof emitHealth === "function" ? emitHealth : defaultHealthSink;
        this.collectMetrics = metrics !== false;
        this.metrics = { dispatched: 0, executed: 0, skipped: 0, failed: 0, emitted: 0, markers: 0 };
    }

    /** Ordered descriptors for a market (registry lookup, safe when empty). */
    modulesFor(market) {
        if (!this.registry || typeof this.registry.forMarket !== "function") return [];
        return this.registry.forMarket(market);
    }

    /**
     * Run the whole pipeline for one packet.
     *
     * @param {object} input
     * @param {"spot"|"futures"} input.market
     * @param {string} input.symbol
     * @param {object} input.data                 normalised packet data
     * @param {object} [input.packet]             legacy packet object (kept for ctx.packet)
     * @param {object} [input.canonicalPacket]    futures canonical packet (cross-venue depth)
     * @param {object} [input.healthContext]      fields merged into every emitted event
     *
     * @returns {{emitted: object[], executed: string[], skipped: string[], errors: object[], emit: function}}
     */
    dispatch(input = {}) {
        const {
            market,
            symbol,
            exchange = null,
            data,
            packet = null,
            canonicalPacket = null,
            healthContext = {}
        } = input;

        const emitted = [];
        const executed = [];
        const skipped = [];
        const errors = [];

        const context = {
            market,
            symbol,
            exchange,
            data,
            packet,
            canonicalPacket,
            healthContext,
            state: this.state,
            store: this.state,
            startedAt: Date.now()
        };

        context.emit = (event) => this.emitFromModule(context, event, emitted);
        context.publish = (event) => this.publish(event, context, healthContext);

        if (this.collectMetrics) this.metrics.dispatched += 1;

        for (const descriptor of this.modulesFor(market)) {
            if (!this.matches(descriptor, context)) {
                skipped.push(descriptor.id);
                if (this.collectMetrics) this.metrics.skipped += 1;
                continue;
            }

            if (descriptor.healthEvent) this.publishMarker(descriptor, context);

            try {
                descriptor.run(context);
                executed.push(descriptor.id);
                if (this.collectMetrics) this.metrics.executed += 1;
            } catch (err) {
                errors.push({ id: descriptor.id, message: err.message });
                if (this.collectMetrics) this.metrics.failed += 1;
                logger.error(`${descriptor.id} failed → ${err.message}`);
            }
        }

        return { market, symbol, emitted, executed, skipped, errors, emit: context.emit, durationMs: Date.now() - context.startedAt };
    }

    /* ------------------------------------------------------------
     * Guards
     * ---------------------------------------------------------- */
    matches(descriptor, context) {
        if (!descriptor.when) return true;
        try {
            return !!descriptor.when(context);
        } catch (err) {
            logger.error(`guard for ${descriptor.id} failed → ${err.message}`);
            return false;
        }
    }

    /* ------------------------------------------------------------
     * Group health markers
     *   Legacy handlers called emitHealth("price") / ("depth") / ...
     *   once, before running the modules of that group. Markers are
     *   published to the bus + health sink but are NOT part of
     *   `emitted`, which only carries real module output.
     * ---------------------------------------------------------- */
    publishMarker(descriptor, context) {
        const raw = typeof descriptor.healthEvent === "function"
            ? descriptor.healthEvent(context)
            : descriptor.healthEvent;

        const normalized = typeof raw === "string" ? { event: raw } : { ...(raw || {}) };
        if (!normalized.event) return null;

        if (this.collectMetrics) this.metrics.markers += 1;
        return this.publish(normalized, context, context.healthContext);
    }

    /* ------------------------------------------------------------
     * Module emits
     * ---------------------------------------------------------- */
    emitFromModule(context, event, collected) {
        const normalized = normalizeEvent(event);
        if (!normalized || !normalized.event) return null;

        // healthContext first, module event last → module values win.
        const enriched = { ...context.healthContext, ...normalized };
        collected.push(enriched);

        if (this.collectMetrics) this.metrics.emitted += 1;
        return this.publish(enriched, context, context.healthContext);
    }

    /* ------------------------------------------------------------
     * Sink
     *   bus (state/SSE)  +  global.healthEmit (health monitor)
     * ---------------------------------------------------------- */
    publish(event, context = {}, healthContext = {}) {
        const normalized = normalizeEvent(event);
        if (!normalized || !normalized.event) return null;

        const enriched = typeof event === "string" ? { ...healthContext, event } : event;

        if (this.bus && typeof this.bus.publish === "function") {
            this.bus.publish(enriched, {
                market: context.market,
                exchange: context.exchange,
                symbol: context.symbol
            });
        }

        try {
            this.emitHealth(enriched);
        } catch (err) {
            logger.error(`health sink failed → ${err.message}`);
        }

        return enriched;
    }

    stats() {
        return { ...this.metrics, registrySize: this.registry ? this.registry.size : 0 };
    }
}

module.exports = { Pipeline, defaultHealthSink };

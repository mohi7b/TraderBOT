/* ============================================================
 * File: collector/crypto/realtime/service/realtime-service.cjs
 * Section: collector/crypto/realtime/service
 *
 * Role:
 *   The public entry point of the Realtime section (Phase 2).
 *
 *   Usage:
 *     const realtime = require("collector/crypto/realtime");
 *     await realtime.request("BTCUSDT", { markets: ["spot", "futures"] });
 *     realtime.getState("BTCUSDT");
 *     realtime.status();
 *
 *   Behaviour:
 *     - first request(symbol) starts that symbol's streams on demand
 *     - repeated requests reuse the already running streams
 *     - getState() never starts anything
 *     - getState().signals / realtime.signals() expose the live bus snapshot
 *       (the previous `global.marketSignals` mirror was removed: nothing read
 *       it and it duplicated the bus on every event)
 * ============================================================ */

const CONFIG = require("../config/realtime.cjs");
const createLogger = require("../core/logger.cjs").createLogger;
const { getRuntime } = require("../core/runtime.cjs");
const { normalizeSymbol } = require("../config/exchanges.cjs");
const { buildVenuePlan, summarizePlan, planVenues } = require("./venue-plan.cjs");
const { ConnectionManager, ACTIVE_STATUSES } = require("./connection-manager.cjs");
const spotHandler = require("../ingest/spot-handler.cjs");
const futuresHandler = require("../ingest/futures-handler.cjs");
const marketAggregation = require("../aggregator/market-aggregation-service.cjs");
const marketIndicators = require("../aggregator/market-indicator-service.cjs");
const { chartDataService } = require("../aggregator/chart-data-service.cjs");

const logger = createLogger("service");

function defaultHandlerFor(market) {
    return market === "futures" ? futuresHandler : spotHandler;
}

class RealtimeService {
    constructor({ config = CONFIG, runtime = null, handlerFor = null } = {}) {
        this.config = config;
        this.runtime = runtime || getRuntime();
        this.handlerFor = handlerFor || defaultHandlerFor;

        this.connections = new ConnectionManager({
            handlerFor: this.handlerFor,
            logger: createLogger("connections")
        });

        this.requested = new Map();  // symbol -> request bookkeeping
    }

    /* ------------------------------------------------------------
     * request(symbol, options) → start (or reuse) + snapshot
     * ---------------------------------------------------------- */
    async request(symbol, options = {}) {
        const normalized = normalizeSymbol(symbol);
        if (!normalized) throw new Error("realtime.request(symbol) requires a symbol");

        const current = this.requested.get(normalized);
        const streams = this.connections.statusForSymbol(normalized);
        const active = streams.filter((stream) => ACTIVE_STATUSES.has(stream.status));

        if (current && active.length && options.force !== true) {
            current.hitCount += 1;
            current.lastRequestedAt = Date.now();
            return this.buildResponse(normalized, { plan: current.plan, streams: active, reused: true });
        }

        const plan = buildVenuePlan(normalized, options);
        await this.connections.startSymbol(normalized, plan);

        const serializablePlan = summarizePlan(plan);
        this.requested.set(normalized, {
            symbol: normalized,
            requestedAt: Date.now(),
            lastRequestedAt: Date.now(),
            hitCount: 1,
            options: {
                markets: options.markets || this.config.markets,
                exchanges: options.exchanges || null
            },
            plan: serializablePlan
        });

        logger.info(`requested ${normalized} — ${plan.length} stream(s) across ${planVenues(serializablePlan).length} venue(s)`);

        return this.buildResponse(normalized, {
            plan: serializablePlan,
            streams: this.connections.statusForSymbol(normalized),
            reused: false
        });
    }

    /** Read-only snapshot; never starts a connection. */
    getState(symbol) {
        const normalized = normalizeSymbol(symbol);
        if (!normalized) return null;

        const current = this.requested.get(normalized);
        return this.buildResponse(normalized, {
            plan: current ? current.plan : null,
            streams: this.connections.statusForSymbol(normalized),
            reused: true
        });
    }

    /* ------------------------------------------------------------
     * Response builder
     * ---------------------------------------------------------- */
    buildResponse(symbol, { plan = null, streams = [], reused = false } = {}) {
        const current = this.requested.get(symbol) || null;
        const errors = streams.reduce((sum, stream) => sum + (stream.errorCount || 0), 0);

        return {
            symbol,
            requested: !!current,
            reused,
            requestedAt: current ? current.requestedAt : null,
            updatedAt: Date.now(),
            venues: plan && plan.length
                ? planVenues(plan)
                : [...new Set(streams.map((stream) => `${stream.market}:${stream.exchange}`))],
            streams,
            degraded: errors > 0,
            errors,
            aggregation: {
                aggregate: marketAggregation.get(symbol) || null,
                indicators: marketIndicators.get(symbol) || null,
                charts: chartDataService.get(symbol) || null
            },
            signals: this.runtime.bus.snapshot({ symbol })
        };
    }

    /* ------------------------------------------------------------
     * Status / health
     * ---------------------------------------------------------- */
    status() {
        return {
            section: "realtime",
            version: this.config.version,
            requestedSymbols: [...this.requested.keys()],
            connections: this.connections.summary(),
            symbols: [...this.requested.entries()].map(([symbol, meta]) => ({
                symbol,
                requestedAt: meta.requestedAt,
                lastRequestedAt: meta.lastRequestedAt,
                hitCount: meta.hitCount,
                streams: this.connections.statusForSymbol(symbol)
            })),
            bus: this.runtime.bus.stats(),
            pipeline: this.runtime.pipeline.stats(),
            registry: {
                size: this.runtime.registry.size,
                markets: this.runtime.registry.markets(),
                modules: this.runtime.registry.describe()
            },
            state: { blocks: this.runtime.state.size },
            config: {
                markets: this.config.markets,
                venues: this.config.venues,
                signalHistoryMs: this.config.signalHistoryMs
            }
        };
    }

    /* ------------------------------------------------------------
     * Release
     * ---------------------------------------------------------- */
    release(symbol, reason = "release") {
        const normalized = normalizeSymbol(symbol);
        if (!normalized) return false;

        this.connections.release(normalized, reason);
        this.requested.delete(normalized);
        this.runtime.bus.clear({ symbol: normalized });
        this.runtime.state.clear();
        return true;
    }

    releaseAll(reason = "shutdown") {
        const count = this.connections.releaseAll(reason);
        this.requested.clear();
        return count;
    }

    /* ------------------------------------------------------------
     * Subscriptions (SSE)
     * ---------------------------------------------------------- */
    subscribe(fn) {
        return this.runtime.bus.subscribe(fn);
    }

    dispose() {
        this.releaseAll("dispose");
    }
}

module.exports = { RealtimeService, defaultHandlerFor };

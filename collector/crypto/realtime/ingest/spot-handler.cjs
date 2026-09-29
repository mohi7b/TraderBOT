/* ============================================================
 * File: collector/crypto/realtime/ingest/spot-handler.cjs
 * Section: collector/crypto/realtime/ingest
 *
 * Role:
 *   Spot ingest pipeline. This is the refactored version of
 *   collector/crypto/realtime/aanode/spot-handler.cjs (which is now a
 *   thin re-export of this file).
 *
 *   Responsibilities (unchanged from the legacy handler):
 *     1. normalise depth levels        ([price, qty] tuples for spot)
 *     2. infer the event type
 *     3. gate on market-data quality
 *     4. feed the market aggregation service
 *     5. run the registered L2 modules through the core pipeline
 *
 *   What changed:
 *     - no orchestrator requires (only an opt-out one-way bridge)
 *     - module list/order/guards moved to registrations/spot.cjs
 *     - module output goes to the event bus instead of being dropped
 *     - one failing module no longer aborts the whole packet
 * ============================================================ */

const CONFIG = require("../config/realtime.cjs");
const createLogger = require("../core/logger.cjs").createLogger;
const { getRuntime } = require("../core/runtime.cjs");
const { marketDataQuality } = require("../../common/market-data-quality.cjs");
const marketAggregation = require("../aggregator/market-aggregation-service.cjs");

const log = createLogger("ingest:spot");

/* ------------------------------------------------------------
 * Depth normalisation — spot keeps [price, qty] tuples
 * (futures uses { price, qty } objects; see ingest/futures-handler.cjs)
 * ---------------------------------------------------------- */
function normalizeDepthLevels(levels) {
    if (!Array.isArray(levels)) return [];

    return levels.map((level) => {
        if (Array.isArray(level)) return [Number(level[0]), Number(level[1])];
        if (level && typeof level === "object") return [Number(level.price), Number(level.qty)];
        return null;
    }).filter((level) => Number.isFinite(level[0]) && Number.isFinite(level[1]));
}

function resolveEventType(data) {
    if (data.bids && data.asks) return "depth";
    if (data.open && data.close) return "candle";
    if (data.qty && data.side) return "trade";
    if (data.price) return "price";
    return "unknown";
}

/* ------------------------------------------------------------
 * Optional one-way bridge to a co-hosted orchestrator.
 * The realtime section never requires anything from the orchestrator.
 * ---------------------------------------------------------- */
function routeToLegacyOrchestrator(packet, emit) {
    if (!CONFIG.legacyOrchestratorBridge) return;
    const orchestrator = global.orchestrator;
    if (!orchestrator || typeof orchestrator.route !== "function") return;

    try {
        orchestrator.route({ ...packet, emit });
    } catch (err) {
        log.error(`legacy orchestrator route failed → ${err.message}`);
    }
}

module.exports = function spotHandler(rawPacket) {
    const emitted = [];

    try {
        const { symbol, data: rawData } = rawPacket || {};
        if (!rawData) return emitted;

        const data = {
            ...rawData,
            bids: rawData.bids ? normalizeDepthLevels(rawData.bids) : rawData.bids,
            asks: rawData.asks ? normalizeDepthLevels(rawData.asks) : rawData.asks
        };
        const eventType = resolveEventType(data);

        const healthContext = {
            exchange: data.exchange || data.packet?.exchange || "unknown",
            market: "spot",
            symbol,
            source: data.source || data.packet?.source || "websocket",
            timestamp: Number(data.timestamp) || Date.now(),
            bids: data.bids,
            asks: data.asks
        };

        if (!marketDataQuality.accept({ ...healthContext, type: eventType, payload: data })) return emitted;

        const runtime = getRuntime();
        const busContext = { market: "spot", symbol, exchange: healthContext.exchange };

        // 1. flow event: packet accepted
        runtime.pipeline.publish({ event: eventType, ...healthContext }, busContext);
        if (CONFIG.debugVerbose) log.debug(`accepted ${eventType}`, { symbol, exchange: healthContext.exchange });

        // 2. symbol/venue aggregation + indicators + chart series
        const aggregation = marketAggregation.ingest({ ...data, ...healthContext, type: eventType });
        runtime.pipeline.publish(
            { event: "market_aggregate", ...healthContext, payload: aggregation.aggregate },
            busContext
        );

        // 3. L2 modules (order/guards come from registrations/spot.cjs)
        const packet = { symbol, stage: 1, data };
        const result = runtime.pipeline.dispatch({
            market: "spot",
            symbol,
            exchange: healthContext.exchange,
            data,
            packet,
            healthContext
        });

        emitted.push(...result.emitted);
        routeToLegacyOrchestrator(packet, result.emit);

        return emitted;

    } catch (err) {
        log.error("spot handler error → " + err.message);
        return emitted;
    }
};

module.exports.normalizeDepthLevels = normalizeDepthLevels;
module.exports.resolveEventType = resolveEventType;

/* ============================================================
 * File: collector/crypto/realtime/ingest/futures-handler.cjs
 * Section: collector/crypto/realtime/ingest
 *
 * Role:
 *   Futures ingest pipeline. This is the refactored version of
 *   collector/crypto/realtime/aanode/futures-handler.cjs (which is now a
 *   thin re-export of this file).
 *
 *   Responsibilities (unchanged from the legacy handler):
 *     1. build the canonical futures packet
 *     2. gate on market-data quality
 *     3. feed the market aggregation service
 *     4. run the registered L2 modules through the core pipeline
 *        (including cross-venue depth for full-depth packets)
 *
 *   What changed:
 *     - no orchestrator requires at all
 *     - module list/order/guards/health markers moved to
 *       registrations/futures.cjs
 *     - one failing module no longer aborts the whole packet
 * ============================================================ */

const createLogger = require("../core/logger.cjs").createLogger;
const { getRuntime } = require("../core/runtime.cjs");
const { createCanonicalFuturesPacket } = require("../../common/canonical-futures-packet.cjs");
const { marketDataQuality } = require("../../common/market-data-quality.cjs");
const marketAggregation = require("../aggregator/market-aggregation-service.cjs");

const log = createLogger("ingest:futures");

/* ------------------------------------------------------------
 * Depth normalisation — futures uses { price, qty } objects
 * (spot uses [price, qty] tuples; see ingest/spot-handler.cjs)
 * ---------------------------------------------------------- */
function normalizeDepthLevels(levels) {
    if (!levels) return [];

    if (Array.isArray(levels)) {
        return levels.map((level) => {
            if (Array.isArray(level)) {
                const price = Number(level[0]);
                const qty = Number(level[1]);
                return Number.isFinite(price) && Number.isFinite(qty) ? { price, qty } : null;
            }

            if (level && typeof level === "object") {
                const price = Number(level.price);
                const qty = Number(level.qty);
                return Number.isFinite(price) && Number.isFinite(qty) ? { price, qty } : null;
            }

            return null;
        }).filter(Boolean);
    }

    if (typeof levels === "object") {
        return Object.entries(levels).map(([price, qty]) => ({
            price: Number(price),
            qty: Number(qty)
        })).filter((level) => Number.isFinite(level.price) && Number.isFinite(level.qty));
    }

    return [];
}

module.exports = function futuresHandler(packet) {
    const emitted = [];

    try {
        const { symbol, data } = packet || {};
        if (!data) return emitted;

        const canonicalPacket = createCanonicalFuturesPacket({
            ...data,
            exchange: data.exchange || data.packet?.exchange || "unknown",
            market: data.market || data.packet?.market || "futures",
            symbol: data.symbol || symbol,
            sourceSymbol: data.sourceSymbol || data.symbol || symbol,
            source: data.source || data.packet?.source || "websocket",
            payload: {
                ...data.packet?.payload,
                price: data.price,
                qty: data.qty || data.tradeQty,
                rate: data.rate,
                oi: data.oi,
                bids: data.bids,
                asks: data.asks
            }
        });

        if (!marketDataQuality.accept(canonicalPacket)) return emitted;

        const runtime = getRuntime();
        const busContext = {
            market: canonicalPacket.market,
            symbol: canonicalPacket.symbol,
            exchange: canonicalPacket.exchange
        };

        const aggregation = marketAggregation.ingest({
            ...data,
            exchange: canonicalPacket.exchange,
            market: canonicalPacket.market,
            symbol: canonicalPacket.symbol,
            source: canonicalPacket.source,
            packet: canonicalPacket
        });

        const healthContext = {
            exchange: canonicalPacket.exchange,
            market: canonicalPacket.market,
            symbol: canonicalPacket.symbol,
            source: canonicalPacket.source,
            timestamp: canonicalPacket.timestamp,
            sequenceStatus: canonicalPacket.sequenceStatus,
            bids: canonicalPacket.bids,
            asks: canonicalPacket.asks
        };

        runtime.pipeline.publish(
            { event: "market_aggregate", ...healthContext, payload: aggregation.aggregate },
            busContext
        );

        if (typeof global.debugTrace === "function") {
            global.debugTrace("futures_handler_in", {
                symbol,
                event: data.event || data.type,
                type: data.type || data.event,
                hasPrice: !!data.price,
                hasBids: !!data.bids,
                hasAsks: !!data.asks,
                hasOi: !!data.oi,
                hasFunding: data.type === "funding",
                hasLiquidation: data.type === "liquidation",
                hasMarkPrice: data.type === "mark_price"
            });
        }

        const normalizedData = {
            ...data,
            bids: normalizeDepthLevels(data.bids),
            asks: normalizeDepthLevels(data.asks)
        };

        const result = runtime.pipeline.dispatch({
            market: canonicalPacket.market,
            symbol: canonicalPacket.symbol,
            exchange: canonicalPacket.exchange,
            data: normalizedData,
            packet,
            canonicalPacket,
            healthContext
        });

        emitted.push(...result.emitted);
        return emitted;

    } catch (err) {
        log.error("futures handler error → " + err.message);
        return emitted;
    }
};

module.exports.normalizeDepthLevels = normalizeDepthLevels;

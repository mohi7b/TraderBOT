/* ============================================================
 * File: collector/crypto/realtime/registrations/futures.cjs
 * Section: collector/crypto/realtime/registrations
 *
 * Role:
 *   Declarative table of every futures L2 module, extracted from the
 *   legacy inline blocks of
 *   collector/crypto/realtime/aanode/futures-handler.cjs.
 *
 *   `priority` reproduces the legacy textual order:
 *       price (100) → depth (200) → candles (300) → funding (400)
 *       → liquidation (500) → mark_price (600) → oi (700)
 *   `guard` reproduces the legacy `if (...)` conditions.
 *
 *   The `*.marker` descriptors exist because the legacy handler called
 *   emitHealth("price") / ("depth") / ("candles") / ("funding") /
 *   ("liquidation") / ("markPrice") / ("oi") once, before running the
 *   modules of that group. They carry the exact same payload shape, so
 *   the health monitor sees an unchanged event stream.
 * ============================================================ */

const CrossVenueDepthAggregator = require("../../common/cross-venue-depth-aggregator.cjs");
const { isAuthoritativeBookPacket, decideDepthSource } = require("../../common/depth-source.cjs");
const { group, marker } = require("./helpers.cjs");

/* ------------------------------------------------------------
 * Cross-venue depth book (previously a handler-level singleton)
 * ---------------------------------------------------------- */
const FULL_DEPTH_TYPES = ["depth_full_diff", "depth_full_snapshot", "depth_full"];

let crossVenueDepth = null;
function getCrossVenueDepth() {
    if (!crossVenueDepth) crossVenueDepth = new CrossVenueDepthAggregator();
    return crossVenueDepth;
}

/* ------------------------------------------------------------
 * Legacy guards
 * ---------------------------------------------------------- */
const whenPrice = (ctx) => !!ctx.data.price;
const whenDepth = (ctx) => !!(ctx.data.bids && ctx.data.asks);
/* fix #3: the depth analytics modules only consume the winning feed. */
const whenDepthSource = (ctx) => isAuthoritativeBookPacket(ctx.data);
const whenCandles = (ctx) => !!(ctx.data.open && ctx.data.close);
const whenFunding = (ctx) => ctx.data.type === "funding";
const whenLiquidation = (ctx) => ctx.data.type === "liquidation";
const whenMarkPrice = (ctx) => ctx.data.type === "mark_price";
const whenOi = (ctx) => !!ctx.data.oi;

/* ------------------------------------------------------------
 * Module table
 * ---------------------------------------------------------- */
const futuresModules = [

    /* ---------------- PRICE ---------------- */
    marker({ market: "futures", name: "price", guard: whenPrice, priority: 100, healthEvent: "price" }),
    ...group({
        market: "futures",
        name: "price",
        guard: whenPrice,
        start: 101,
        entries: [
            ["price", require("../futures/price/price.cjs")],
            ["delta", require("../futures/price/price_delta.cjs")],
            ["speed", require("../futures/price/price_speed.cjs")],
            ["trend", require("../futures/price/price_trend.cjs")],
            ["volatility", require("../futures/price/price_volatility.cjs")]
        ]
    }),

    /* ---------------- DEPTH ---------------- */
    marker({ market: "futures", name: "depth", guard: whenDepth, priority: 200, healthEvent: "depth" }),
    {
        id: "futures.depth.cross-venue",
        market: "futures",
        group: "depth",
        priority: 201,
        when: (ctx) => FULL_DEPTH_TYPES.includes(ctx.data.type),
        description: "cross-venue depth aggregation for full-depth packets",
        run(ctx) {
            const aggregate = getCrossVenueDepth().update(ctx.canonicalPacket);
            if (aggregate) {
                ctx.emit({ event: "depth_cross_venue", type: "depth_cross_venue", payload: aggregate });
            }
        }
    },
    {
        id: "futures.depth.source",
        market: "futures",
        group: "depth",
        priority: 202,
        when: whenDepth,
        description: "fix #3 — single-source depth: synced book wins, native patches are never a book",
        run(ctx) {
            const decision = decideDepthSource(ctx.data);
            if (!decision) return;

            /* Publish only the transitions so the analytics layer (and the
             * health gates) can see which feed is authoritative right now. */
            if (decision.switched) {
                ctx.emit({
                    event: "depth_source",
                    type: "depth_source",
                    depthSource: decision.source,
                    depthKind: decision.kind,
                    reason: decision.reason
                });
            }
        }
    },
    ...group({
        market: "futures",
        name: "depth",
        guard: whenDepthSource,
        start: 203,
        entries: [
            ["100", require("../futures/depth/depth_100.cjs")],
            ["medium", require("../futures/depth/depth_medium.cjs")],
            ["full", require("../futures/depth/depth_full.cjs")],
            ["delta", require("../futures/depth/depth_delta.cjs")],
            ["imbalance", require("../futures/depth/depth_imbalance.cjs")],
            ["pressure", require("../futures/depth/depth_pressure.cjs")],
            ["aggregator", require("../futures/depth/depth_aggregator.cjs")]
        ]
    }),

    /* ---------------- CANDLES ---------------- */
    marker({
        market: "futures",
        name: "candles",
        guard: whenCandles,
        priority: 300,
        healthEvent: { event: "candles", type: "candle" }
    }),
    ...group({
        market: "futures",
        name: "candles",
        guard: whenCandles,
        start: 301,
        entries: [
            ["candles", require("../futures/candles/candles.cjs")],
            ["aggregator", require("../futures/candles/candles_aggregator.cjs")],
            ["multi-tf", require("../futures/candles/candles_multi_tf.cjs")]
        ]
    }),

    /* ---------------- FUNDING ---------------- */
    marker({ market: "futures", name: "funding", guard: whenFunding, priority: 400, healthEvent: "funding" }),
    ...group({
        market: "futures",
        name: "funding",
        guard: whenFunding,
        start: 401,
        entries: [
            ["funding", require("../futures/funding/funding.cjs")],
            ["aggregator", require("../futures/funding/funding_aggregator.cjs")],
            ["delta", require("../futures/funding/funding_delta.cjs")],
            ["pressure", require("../futures/funding/funding_pressure.cjs")],
            ["trend", require("../futures/funding/funding_trend.cjs")]
        ]
    }),

    /* ---------------- LIQUIDATIONS ---------------- */
    marker({ market: "futures", name: "liquidation", guard: whenLiquidation, priority: 500, healthEvent: "liquidation" }),
    ...group({
        market: "futures",
        name: "liquidation",
        guard: whenLiquidation,
        start: 501,
        entries: [
            ["liquidation", require("../futures/liquidations/liquidation.cjs")],
            ["clusters", require("../futures/liquidations/liquidation_clusters.cjs")],
            ["pressure", require("../futures/liquidations/liquidation_pressure.cjs")],
            ["aggregator", require("../futures/liquidations/liquidation_aggregator.cjs")],
            ["delta", require("../futures/liquidations/liquidation_delta.cjs")],
            ["trend", require("../futures/liquidations/liquidation_trend.cjs")]
        ]
    }),

    /* ---------------- MARK PRICE ---------------- */
    marker({
        market: "futures",
        name: "mark_price",
        guard: whenMarkPrice,
        priority: 600,
        healthEvent: { event: "markPrice", type: "mark_price" }
    }),
    ...group({
        market: "futures",
        name: "mark_price",
        guard: whenMarkPrice,
        start: 601,
        entries: [
            ["mark-price", require("../futures/mark_price/mark_price.cjs")],
            ["delta", require("../futures/mark_price/mark_price_delta.cjs")],
            ["trend", require("../futures/mark_price/mark_price_trend.cjs")],
            ["volatility", require("../futures/mark_price/mark_price_volatility.cjs")]
        ]
    }),

    /* ---------------- OPEN INTEREST ---------------- */
    marker({ market: "futures", name: "oi", guard: whenOi, priority: 700, healthEvent: "oi" }),
    ...group({
        market: "futures",
        name: "oi",
        guard: whenOi,
        start: 701,
        entries: [
            ["oi", require("../futures/oi/oi.cjs")],
            ["aggregator", require("../futures/oi/oi_aggregator.cjs")],
            ["delta", require("../futures/oi/oi_delta.cjs")],
            ["pressure", require("../futures/oi/oi_pressure.cjs")],
            ["trend", require("../futures/oi/oi_trend.cjs")],
            ["volatility", require("../futures/oi/oi_volatility.cjs")]
        ]
    })
];

module.exports = futuresModules;

/* ============================================================
 * File: collector/crypto/realtime/registrations/spot.cjs
 * Section: collector/crypto/realtime/registrations
 *
 * Role:
 *   Declarative table of every spot L2 module, extracted from the
 *   legacy inline blocks of collector/crypto/realtime/aanode/spot-handler.cjs.
 *
 *   The `priority` values reproduce the legacy textual order exactly:
 *       price (100)  →  depth (200)  →  liquidity (210)
 *                    →  candles (300) →  orderflow (400)
 *                    →  advanced (500)
 *   and the `guard` values reproduce the legacy `if (...)` conditions.
 *
 *   IMPORTANT — intentionally NOT registered:
 *     spot/spread/{spread,spread_delta,spread_trend,spread_pressure}.cjs
 *     The legacy handler `require`d them but never called them, so they
 *     never ran. They stay unregistered until they are wired on purpose
 *     (tracked in the refactor backlog), instead of silently executing
 *     now and changing output.
 *
 *   NOTE — behaviour change (improvement):
 *     The legacy spot handler dropped the module payload when calling
 *     global.healthEmit ({ event, ...healthContext }). Module emits now
 *     carry their payload, identical to the futures path, so downstream
 *     consumers finally receive spot analysis data.
 * ============================================================ */

const { group } = require("./helpers.cjs");

/* ------------------------------------------------------------
 * Legacy guards
 * ---------------------------------------------------------- */
const whenPrice = (ctx) => !!ctx.data.price;
const whenDepth = (ctx) => !!(ctx.data.bids && ctx.data.asks);
const whenCandles = (ctx) => !!(ctx.data.open && ctx.data.close);
const whenOrderflow = (ctx) => !!(ctx.data.qty && ctx.data.side);
const whenMakerActivity = (ctx) => !!(ctx.data.bids && ctx.data.asks && ctx.data.qty);

/* ------------------------------------------------------------
 * Module table
 * ---------------------------------------------------------- */
const spotModules = [

    /* ---------------- PRICE (legacy: if (data.price)) ---------------- */
    ...group({
        market: "spot",
        name: "price",
        guard: whenPrice,
        start: 100,
        entries: [
            ["price", require("../spot/price/price.cjs")],
            ["delta", require("../spot/price/price_delta.cjs")],
            ["speed", require("../spot/price/price_speed.cjs")],
            ["trend", require("../spot/price/price_trend.cjs")],
            ["volatility", require("../spot/price/price_volatility.cjs")]
        ]
    }),

    /* -------- DEPTH (legacy: if (data.bids && data.asks)) -------- */
    ...group({
        market: "spot",
        name: "depth",
        guard: whenDepth,
        start: 200,
        entries: [
            ["20", require("../spot/depth/depth_20.cjs")],
            ["100", require("../spot/depth/depth_100.cjs")],
            ["full", require("../spot/depth/depth_full.cjs")],
            ["delta", require("../spot/depth/depth_delta.cjs")],
            ["imbalance", require("../spot/depth/depth_imbalance.cjs")],
            ["pressure", require("../spot/depth/depth_pressure.cjs")],
            ["aggregator", require("../spot/depth/depth_aggregator.cjs")]
        ]
    }),

    /* -------- LIQUIDITY (same guard as depth, legacy ran them right after) -------- */
    ...group({
        market: "spot",
        name: "liquidity",
        guard: whenDepth,
        start: 210,
        entries: [
            ["liquidity", require("../spot/liquidity/liquidity.cjs")],
            ["heatmap", require("../spot/liquidity/liquidity_heatmap.cjs")],
            ["delta", require("../spot/liquidity/liquidity_delta.cjs")],
            ["pressure", require("../spot/liquidity/liquidity_pressure.cjs")]
        ]
    }),

    /* ---- CANDLES (legacy: if (data.open && data.close)) ---- */
    ...group({
        market: "spot",
        name: "candles",
        guard: whenCandles,
        start: 300,
        entries: [
            ["candles", require("../spot/candles/candles.cjs")],
            ["aggregator", require("../spot/candles/candles_aggregator.cjs")],
            ["multi-tf", require("../spot/candles/candles_multi_tf.cjs")]
        ]
    }),

    /* --- ORDERFLOW (legacy: if (data.qty && data.side)) --- */
    ...group({
        market: "spot",
        name: "orderflow",
        guard: whenOrderflow,
        start: 400,
        entries: [
            ["orderflow", require("../spot/orderflow/orderflow.cjs")],
            ["micro-trades", require("../spot/orderflow/micro_trades.cjs")],
            ["big-trades", require("../spot/orderflow/big_trades.cjs")],
            ["imbalance", require("../spot/orderflow/imbalance.cjs")],
            ["pressure", require("../spot/orderflow/pressure.cjs")],
            ["aggregator", require("../spot/orderflow/orderflow_aggregator.cjs")],
            ["volume-profile", require("../spot/advanced/volume_profile.cjs")]
        ]
    }),

    /* --- ADVANCED (legacy order: tickImpact after orderflow, then maker activity) --- */
    ...group({
        market: "spot",
        name: "advanced.tick-impact",
        guard: whenPrice,
        start: 500,
        entries: [["tick-impact", require("../spot/advanced/tick_impact.cjs")]]
    }),
    ...group({
        market: "spot",
        name: "advanced.maker-activity",
        guard: whenMakerActivity,
        start: 510,
        entries: [["market-maker-activity", require("../spot/advanced/market_maker_activity.cjs")]]
    })
];

module.exports = spotModules;

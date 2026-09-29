/* ============================================================
 * File: analytics-engine/topics.cjs
 * Section: analytics-engine
 * Version: 1.0.0
 *
 * Role:
 *   The topic namespace of the analytical layer. Every computed
 *   envelope is published on exactly one topic so downstream
 *   consumers (frontend, alerting, orchestrator) can subscribe
 *   without knowing the engine internals.
 *
 * Format:
 *   analytics.<assetClass>.<baseAsset>.<eventType>
 *   analytics.crypto.btc.cvd
 *   analytics.crypto.btc.liquidation_heatmap
 *   analytics.crypto.btc.indicators_15m
 *   analytics.indices.spx.candle
 *   └ assetClass/asset: lower case, alphanumeric only
 *   └ eventType:        lower case, underscores kept (one event name)
 *
 *   The asset is the base asset of the symbol the reading carried, never
 *   the venue's spelling: XAUUSD → analytics.commodities.xau.…, SPX →
 *   analytics.indices.spx.…, BTC-USDT-SWAP → analytics.crypto.btc.…
 * ============================================================ */

const { baseAssetOf } = require("../collector/crypto/common/envelope.cjs");

const TOPIC_ROOT = "analytics";

/**
 * The timeframes the bar-reading layer serves by default — mirrors
 * DEFAULT_TIMEFRAMES in core/bars.cjs, which is the authority: a module can be
 * configured with other timeframes, and a deployment that does so builds its
 * topics with indicatorEvent() / priceActionEvent() the same way this table
 * does. One event per timeframe, because a 15m RSI and a 1h RSI are two
 * different readings and must never share one topic.
 */
const INDICATOR_TIMEFRAMES = Object.freeze(["1m", "5m", "15m", "1h", "4h", "1d"]);

/** The indicator event of one timeframe: "15m" → "indicators_15m". */
function indicatorEvent(timeframe) {
    return `indicators_${String(timeframe === null || timeframe === undefined ? "" : timeframe).trim().toLowerCase()}`;
}

/**
 * The timeframes the price-action layer serves by default — the same six the
 * indicator layer reads, because both are built from the same bar vocabulary
 * (core/bars.cjs) and a structure on a timeframe nobody serves would be a
 * structure nobody asked for.
 */
const PRICE_ACTION_TIMEFRAMES = Object.freeze(["1m", "5m", "15m", "1h", "4h", "1d"]);

/** The price-action event of one timeframe: "15m" → "price_action_15m". */
function priceActionEvent(timeframe) {
    return `price_action_${String(timeframe === null || timeframe === undefined ? "" : timeframe).trim().toLowerCase()}`;
}

/**
 * The timeframes the cross-market layer serves by default — the same six the
 * other bar layers read, for the same reason (core/bars.cjs is the bar
 * vocabulary they all share). The macro view leans on the coarser ends: a 1d
 * correlation is a macro correlation, a 1m one is noise with the same name,
 * which is why every reading carries its own timeframe and `samples` count.
 */
const CROSS_MARKET_TIMEFRAMES = Object.freeze(["1m", "5m", "15m", "1h", "4h", "1d"]);

/** The correlation event of one timeframe: "1d" → "macro_correlation_1d". */
function macroCorrelationEvent(timeframe) {
    return `macro_correlation_${String(timeframe === null || timeframe === undefined ? "" : timeframe).trim().toLowerCase()}`;
}

/** The relative-strength event of one timeframe: "15m" → "relative_strength_15m". */
function relativeStrengthEvent(timeframe) {
    return `relative_strength_${String(timeframe === null || timeframe === undefined ? "" : timeframe).trim().toLowerCase()}`;
}

const ANALYTICS_EVENTS = Object.freeze({
    CVD: "cvd",
    ORDERBOOK_IMBALANCE: "orderbook_imbalance",
    LIQUIDATION_HEATMAP: "liquidation_heatmap",
    CROSS_EXCHANGE_SPREAD: "cross_exchange_spread",
    OI_WEIGHTED_FUNDING: "oi_weighted_funding",
    OPEN_INTEREST: "open_interest",
    FUNDING_CARRY: "funding_carry",
    POSITIONING: "positioning",
    /* Sub-phase 2.2 — the six-market liquidity layer (collector/liquidity_6markets).
     * A venue reading comes in as a ticker; these three are what the engine
     * makes of it: what the asset is worth per venue, how liquid it is across
     * venues, and the last bar a venue handed over. */
    PRICE_READING: "price_reading",
    LIQUIDITY_FLOW: "liquidity_flow",
    CANDLE: "candle",
    /* Sub-phase 2.4 — the on-chain layer (collector/crypto/onchain). One
     * reading per arrival, about one subject (a chain, a holder, a
     * stablecoin or a fund): what it holds, how the number moved since the
     * sighting before, and which of the six signals are present and fresh. */
    ONCHAIN_FLOW: "onchain_flow",
    /* Sub-phase 2.5 — the indicator layer (analytics-engine/modules/indicators).
     * One event per served timeframe, edge-triggered on the close of that
     * timeframe's bar: analytics.crypto.btc.indicators_15m. The timeframe list
     * is INDICATOR_TIMEFRAMES (above); a module configured with other
     * timeframes builds its topics with indicatorEvent() the same way. */
    INDICATORS_1M: "indicators_1m",
    INDICATORS_5M: "indicators_5m",
    INDICATORS_15M: "indicators_15m",
    INDICATORS_1H: "indicators_1h",
    INDICATORS_4H: "indicators_4h",
    INDICATORS_1D: "indicators_1d",
    /* Sub-phase 2.6 — the price-action layer (analytics-engine/modules/price_action).
     * One event per served timeframe, edge-triggered on the close of that
     * timeframe's bar, exactly like the indicator layer and for the same reason:
     * a fair-value gap on 5m and a market-structure shift on 1h are two
     * different readings of the same symbol. The timeframe list is
     * PRICE_ACTION_TIMEFRAMES (above); a module configured with other timeframes
     * builds its topics with priceActionEvent() the same way. */
    PRICE_ACTION_1M: "price_action_1m",
    PRICE_ACTION_5M: "price_action_5m",
    PRICE_ACTION_15M: "price_action_15m",
    PRICE_ACTION_1H: "price_action_1h",
    PRICE_ACTION_4H: "price_action_4h",
    PRICE_ACTION_1D: "price_action_1d",
    /* Sub-phase 2.7 — the cross-market layer (analytics-engine/modules/cross_market).
     * One event per served timeframe, edge-triggered on the close of that
     * timeframe's bar, like the two layers above; the difference is that the
     * reading needs TWO series to answer, so it stays silent until both sides
     * have enough closed bars of the same timeframe. The timeframe list is
     * CROSS_MARKET_TIMEFRAMES (above); a module configured with other timeframes
     * builds its topics with macroCorrelationEvent() / relativeStrengthEvent()
     * the same way. */
    MACRO_CORRELATION_1M: "macro_correlation_1m",
    MACRO_CORRELATION_5M: "macro_correlation_5m",
    MACRO_CORRELATION_15M: "macro_correlation_15m",
    MACRO_CORRELATION_1H: "macro_correlation_1h",
    MACRO_CORRELATION_4H: "macro_correlation_4h",
    MACRO_CORRELATION_1D: "macro_correlation_1d",
    RELATIVE_STRENGTH_1M: "relative_strength_1m",
    RELATIVE_STRENGTH_5M: "relative_strength_5m",
    RELATIVE_STRENGTH_15M: "relative_strength_15m",
    RELATIVE_STRENGTH_1H: "relative_strength_1h",
    RELATIVE_STRENGTH_4H: "relative_strength_4h",
    RELATIVE_STRENGTH_1D: "relative_strength_1d",
    /* The leverage view is not a bar reading: it composes what the derivatives
     * collector measured (open interest, funding, positioning) with what the
     * liquidation prints answered, so it is one event per symbol, refreshed when
     * one of those inputs arrives. */
    MARKET_LEVERAGE_RISK: "market_leverage_risk"
});

const ANALYTICS_EVENT_LIST = Object.freeze(Object.values(ANALYTICS_EVENTS));

function normalizeAsset(asset) {
    return String(asset === null || asset === undefined ? "" : asset)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Event segment: lower case, underscores kept (they name one composite
 * event: liquidation_heatmap), every other character removed so a dot can
 * never create a fifth segment and break parseTopic.
 */
function normalizeEvent(eventType) {
    return String(eventType === null || eventType === undefined ? "" : eventType)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
}

/**
 * Build a topic name.
 *   analyticsTopic({ symbol: "BTCUSDT", eventType: "cvd" }) → "analytics.crypto.btc.cvd"
 *   analyticsTopic({ assetClass: "crypto", asset: "BTC", eventType: "cvd" })
 */
function analyticsTopic({ assetClass = "crypto", symbol = null, asset = null, eventType } = {}) {
    const base = normalizeAsset(asset || baseAssetOf(symbol));
    const type = normalizeEvent(eventType);

    if (!base) throw new Error("analyticsTopic: a symbol or asset is required");
    if (!type) throw new Error("analyticsTopic: eventType is required");

    return [TOPIC_ROOT, normalizeAsset(assetClass) || "crypto", base, type].join(".");
}

function isAnalyticsTopic(topic) {
    return typeof topic === "string" && topic.startsWith(`${TOPIC_ROOT}.`);
}

/** Parse "analytics.crypto.btc.cvd" back into its parts (null when invalid). */
function parseTopic(topic) {
    if (!isAnalyticsTopic(topic)) return null;
    const [root, assetClass, asset, eventType] = String(topic).split(".");
    if (!root || !assetClass || !asset || !eventType) return null;
    return { root, assetClass, asset, eventType };
}

module.exports = {
    TOPIC_ROOT,
    ANALYTICS_EVENTS,
    ANALYTICS_EVENT_LIST,
    INDICATOR_TIMEFRAMES,
    indicatorEvent,
    PRICE_ACTION_TIMEFRAMES,
    priceActionEvent,
    CROSS_MARKET_TIMEFRAMES,
    macroCorrelationEvent,
    relativeStrengthEvent,
    analyticsTopic,
    isAnalyticsTopic,
    parseTopic,
    normalizeAsset,
    normalizeEvent
};

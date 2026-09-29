/* ============================================================
 * File: collector/crypto/realtime/config/charts.cjs
 * Section: collector/crypto/realtime/config
 *
 * Role:
 *   Chart/analysis definitions for the Realtime section.
 *   This file is owned by collector/crypto/realtime; the orchestrator
 *   (orchestrator/aanode/config/charts.cjs) re-exports it so that both
 *   layers stay identical without duplication.
 * ============================================================ */

const CHARTS = Object.freeze([
    {
        id: "price-trend",
        title: "Price and Trend",
        series: ["spot", "futures", "mark", "ema9", "ema21", "sma20"],
        source: "price",
        timeframe: "1s",
        unit: "price"
    },
    {
        id: "volume-flow",
        title: "Volume and Flow",
        series: ["spotDelta", "futuresDelta", "spotVwap", "futuresVwap"],
        source: "volumeFlow",
        timeframe: "1s",
        unit: "volume"
    },
    {
        id: "basis",
        title: "Spot Futures Basis",
        series: ["value", "bps", "trend"],
        source: "basis",
        timeframe: "1s",
        unit: "mixed"
    },
    {
        id: "funding-oi",
        title: "Funding and Open Interest",
        series: ["fundingRate", "oiUsd", "oiDeltaUsd"],
        source: "fundingOi",
        timeframe: "1s",
        unit: "mixed"
    },
    {
        id: "liquidity",
        title: "Liquidity and Spread",
        series: ["spotSpreadBps", "spotImbalance5Bps", "futuresImbalance5Bps", "spotBidLiquidity", "spotAskLiquidity"],
        source: "liquidity",
        timeframe: "1s",
        unit: "mixed"
    }
]);

const ANALYSIS_HORIZONS = Object.freeze({
    micro: ["100ms", "1s", "5s"],
    short: ["15s", "30s", "1m"],
    intraday: ["5m", "15m", "30m", "1h", "4h"],
    long: ["1d"],
    weekly: ["1w"],
    monthly: ["1M"],
    yearly: ["1Y"]
});

module.exports = { CHARTS, ANALYSIS_HORIZONS };

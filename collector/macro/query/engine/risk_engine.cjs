"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/risk_engine.cjs
 * Description:
 *   Risk Engine — Phase 16 (Chalak / ultra-light build).
 *   Light economic risk assessment for a country based on the
 *   Phase 13 intelligence labels and the chart series values.
 *   No heavy processing, no complex models.
 *
 *   buildRiskProfile(mergedSeries, intel) -> {
 *     inflation: { level, score },
 *     growth:    { level, score },
 *     policy:    { level, score },
 *     debt:      { level, score }
 *   }
 *   level: low | medium | high | unknown ; score: 1..3 | null
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

// Light risk factory.
function _risk(level, score) {
  return { level, score };
}

// Series list of a chart/merge output.
function _chartSeries(mergedSeries) {
  const chart = mergedSeries && mergedSeries.chart ? mergedSeries.chart : {};
  return Array.isArray(chart.series) ? chart.series : [];
}

// Finds the first series whose name contains the keyword.
function _findSeries(seriesList, keyword) {
  if (!Array.isArray(seriesList)) return null;
  for (const s of seriesList) {
    if (s && typeof s.name === "string" && s.name.toUpperCase().includes(keyword)) return s;
  }
  return null;
}

// Last non-null value of a values array.
function _lastValue(values) {
  const arr = Array.isArray(values) ? values : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

// Inflation risk: rising inflation is the risky case.
function computeInflationRisk(intel) {
  const trend = intel && intel.inflation_trend;
  if (trend === "falling") return _risk("low", 1);
  if (trend === "rising") return _risk("high", 3);
  if (trend === "stable") return _risk("medium", 2);
  return _risk("unknown", null);
}

// Growth risk: weakening growth is the risky case.
function computeGrowthRisk(intel) {
  const trend = intel && intel.growth_trend;
  if (trend === "improving") return _risk("low", 1);
  if (trend === "weakening") return _risk("high", 3);
  if (trend === "flat") return _risk("medium", 2);
  return _risk("unknown", null);
}

// Policy risk: extreme stances are riskier than a neutral stance.
function computePolicyRisk(mergedSeries, intel) {
  const stance = intel && intel.policy_stance;
  if (stance === "neutral") return _risk("low", 1);
  if (stance === "loose") return _risk("medium", 2);
  if (stance === "tight") return _risk("high", 3);
  return _risk("unknown", null);
}

// Debt risk: latest debt-to-GDP value with 60/90 light thresholds.
function computeDebtRisk(mergedSeries, intel) {
  const debt = _findSeries(_chartSeries(mergedSeries), "DEBT");
  const last = _lastValue(debt ? debt.values : null);
  if (last == null) return _risk("unknown", null);
  if (last >= 90) return _risk("high", 3);
  if (last >= 60) return _risk("medium", 2);
  return _risk("low", 1);
}

/**
 * Builds the full country risk profile.
 *
 * @param {object} mergedSeries - chart/merge output
 * @param {object} intel        - { inflation_trend, growth_trend, policy_stance }
 * @returns {object} - { inflation, growth, policy, debt } risk levels
 */
function buildRiskProfile(mergedSeries, intel) {
  return {
    inflation: computeInflationRisk(intel),
    growth: computeGrowthRisk(intel),
    policy: computePolicyRisk(mergedSeries, intel),
    debt: computeDebtRisk(mergedSeries, intel),
  };
}

module.exports = { buildRiskProfile };

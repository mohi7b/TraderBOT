"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/policy_engine.cjs
 * Description:
 *   Policy Engine — Phase 17 (Chalak / ultra-light build).
 *   Light monetary-policy assessment for a country based on the
 *   policy rate, the Phase 13 intelligence labels and the Phase 16
 *   risk profile. Rule-based only — no heavy processing.
 *
 *   buildPolicyAssessment(mergedSeries, intel, risk) -> {
 *     policy_rate, policy_stance, next_move, policy_insight
 *   }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const NEXT_MOVE_TEXT = {
  hike: "بانک مرکزی احتمالاً نرخ بهره را افزایش خواهد داد…",
  cut: "بانک مرکزی احتمالاً نرخ بهره را کاهش خواهد داد…",
  hold: "بانک مرکزی احتمالاً نرخ بهره را بدون تغییر نگه می‌دارد…",
  unknown: "اطلاعات کافی برای پیش‌بینی اقدام سیاست پولی در دسترس نیست.",
};

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

// Latest policy rate derived from the chart series when not explicit.
function _latestRate(mergedSeries) {
  const series = _chartSeries(mergedSeries);
  const rate =
    _findSeries(series, "POLICY_RATE") ||
    _findSeries(series, "INTEREST") ||
    _findSeries(series, "RATE");
  return _lastValue(rate ? rate.values : null);
}

/**
 * Rule-based next-move guess from rate, intelligence and risk.
 *
 * @param {number|null} rate  - latest policy rate
 * @param {object} intel      - { inflation_trend, growth_trend, policy_stance }
 * @param {object} risk       - { inflation, growth, policy, debt }
 * @returns {string}          - "hike" | "cut" | "hold" | "unknown"
 */
function computeNextMove(rate, intel, risk) {
  const r = rate != null ? rate : null;
  const inflation = intel && intel.inflation_trend;
  const growth = intel && intel.growth_trend;

  if (r == null) return "unknown";
  if (inflation === "rising") return "hike";
  if (growth === "weakening" && inflation === "falling") return "cut";
  if (r < 1) return "hold";
  if (r > 4 && growth === "improving") return "hold";
  if (r > 4 && inflation === "falling") return "cut";
  return "hold";
}

/**
 * Short Persian insight for a predicted next move.
 *
 * @param {string} nextMove - "hike" | "cut" | "hold" | "unknown"
 * @returns {string}        - Persian text
 */
function buildPolicyInsight(nextMove) {
  return NEXT_MOVE_TEXT[nextMove] || NEXT_MOVE_TEXT.unknown;
}

/**
 * Builds the full monetary-policy assessment.
 *
 * @param {object} mergedSeries - chart/merge output
 * @param {object} intel        - { inflation_trend, growth_trend, policy_stance }
 * @param {object} risk         - risk profile from the risk engine
 * @returns {object} - { policy_rate, policy_stance, next_move, policy_insight }
 */
function buildPolicyAssessment(mergedSeries, intel, risk) {
  const src = mergedSeries && typeof mergedSeries === "object" ? mergedSeries : {};
  const rate = src.policy_rate != null ? src.policy_rate : _latestRate(mergedSeries);
  const stance = intel && intel.policy_stance;
  const next = computeNextMove(rate, intel, risk);
  return {
    policy_rate: rate,
    policy_stance: stance,
    next_move: next,
    policy_insight: buildPolicyInsight(next),
  };
}

module.exports = { buildPolicyAssessment };

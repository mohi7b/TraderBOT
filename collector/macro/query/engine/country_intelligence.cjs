"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/country_intelligence.cjs
 * Description:
 *   Country Intelligence — Phase 15 (Chalak / ultra-light build).
 *   Combines the Phase 13 intelligence labels, the Phase 14 Persian
 *   insights and the latest series values into one country profile.
 *   Light composition only — no heavy processing, no complex models.
 *
 *   buildCountryProfile(mergedSeries, intel, insights) -> {
 *     country, inflation, growth, policy_rate,
 *     inflation_trend, growth_trend, policy_stance,
 *     inflation_insight, growth_insight, policy_insight,
 *     macro_score, summary
 *   }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

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

// Country code from a series id like "OECD.USA.CPI_YOY.M" -> "USA".
function _countryOf(series) {
  if (!series || typeof series.name !== "string") return null;
  const parts = series.name.split(".");
  return parts.length >= 3 ? parts[1] : null;
}

// Derives { country, inflation, growth, policy_rate } from the chart
// series when the caller did not provide them explicitly.
function _extract(mergedSeries) {
  const chart = mergedSeries && mergedSeries.chart ? mergedSeries.chart : {};
  const series = Array.isArray(chart.series) ? chart.series : [];
  const cpi = _findSeries(series, "CPI");
  const gdp = _findSeries(series, "GDP");
  const rate =
    _findSeries(series, "POLICY_RATE") ||
    _findSeries(series, "INTEREST") ||
    _findSeries(series, "RATE");
  return {
    country: _countryOf(cpi || gdp || rate),
    inflation: _lastValue(cpi ? cpi.values : null),
    growth: _lastValue(gdp ? gdp.values : null),
    policy_rate: _lastValue(rate ? rate.values : null),
  };
}

/**
 * Light macro score from the three intelligence labels.
 * Score range: -3 .. +3 with a qualitative label.
 *
 * @param {object} intel - { inflation_trend, growth_trend, policy_stance }
 * @returns {object}     - { value, label }
 */
function computeMacroScore(intel) {
  const d = intel || {};
  let value = 0;
  if (d.inflation_trend === "falling") value += 1;
  else if (d.inflation_trend === "rising") value -= 1;
  if (d.growth_trend === "improving") value += 1;
  else if (d.growth_trend === "weakening") value -= 1;
  if (d.policy_stance === "loose") value += 1;
  else if (d.policy_stance === "tight") value -= 1;
  let label = "neutral";
  if (value >= 2) label = "strong";
  else if (value <= -2) label = "weak";
  return { value, label };
}

/**
 * One short Persian summary from the three insight sentences.
 *
 * @param {object} intel    - intelligence labels (unused directly)
 * @param {object} insights - { inflation_insight, growth_insight, policy_insight }
 * @returns {string} - combined Persian summary text
 */
function buildSummary(intel, insights) {
  const i = insights || {};
  return [i.inflation_insight, i.growth_insight, i.policy_insight].filter(Boolean).join(" ");
}

/**
 * Combines raw values, intelligence labels and insights into a single
 * country profile.
 *
 * @param {object} mergedSeries - chart/merge output (or object with
 *                                country/inflation/growth/policy_rate)
 * @param {object} intel        - { inflation_trend, growth_trend, policy_stance }
 * @param {object} insights     - { inflation_insight, growth_insight, policy_insight }
 * @returns {object}            - country profile
 */
function buildCountryProfile(mergedSeries, intel, insights) {
  const d = intel || {};
  const i = insights || {};
  const ext = _extract(mergedSeries);
  const src = mergedSeries && typeof mergedSeries === "object" ? mergedSeries : {};

  return {
    country: src.country != null ? src.country : ext.country,
    inflation: src.inflation != null ? src.inflation : ext.inflation,
    growth: src.growth != null ? src.growth : ext.growth,
    policy_rate: src.policy_rate != null ? src.policy_rate : ext.policy_rate,

    inflation_trend: d.inflation_trend,
    growth_trend: d.growth_trend,
    policy_stance: d.policy_stance,

    inflation_insight: i.inflation_insight,
    growth_insight: i.growth_insight,
    policy_insight: i.policy_insight,

    macro_score: computeMacroScore(d),
    summary: buildSummary(d, i),
  };
}

module.exports = { buildCountryProfile };

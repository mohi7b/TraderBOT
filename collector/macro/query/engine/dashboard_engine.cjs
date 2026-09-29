"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/dashboard_engine.cjs
 * Description:
 *   Dashboard Engine — Phase 10 (Chalak / fast light build).
 *   Turns the standard chart output (Phase 6 merge) into three
 *   light, API-friendly views: card, table, summary.
 *   Formatting only — no data processing, no database access,
 *   no heavy loops.
 *
 *   Input contract (chart output):
 *     {
 *       chart: {
 *         timeline: ["2020-01", ...],
 *         series:   [{ name, frequency, values: [...] }]
 *       }
 *     }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const Intelligence = require("./intelligence_engine.cjs");
const Insights = require("./insights_engine.cjs");
const CountryIntel = require("./country_intelligence.cjs");
const RiskEngine = require("./risk_engine.cjs");
const PolicyEngine = require("./policy_engine.cjs");

// Normalizes the chart input to { timeline, series } arrays.
function _chartInput(mergedSeries) {
  const chart = mergedSeries && mergedSeries.chart ? mergedSeries.chart : {};
  return {
    timeline: Array.isArray(chart.timeline) ? chart.timeline : [],
    series: Array.isArray(chart.series) ? chart.series : [],
  };
}

/**
 * Card view — one compact item per series with the latest value,
 * its date and the simple change vs the previous observation.
 *
 * @param {object} mergedSeries - chart output ({ chart: { timeline, series } })
 * @returns {object} - light card object
 */
function buildMacroCard(mergedSeries) {
  const { timeline, series } = _chartInput(mergedSeries);
  const items = series.map((s) => {
    const values = Array.isArray(s.values) ? s.values : [];
    let lastIndex = -1;
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) {
        lastIndex = i;
        break;
      }
    }
    let prev = null;
    if (lastIndex > 0) {
      for (let i = lastIndex - 1; i >= 0; i--) {
        if (values[i] != null) {
          prev = values[i];
          break;
        }
      }
    }
    const latest = lastIndex >= 0 ? values[lastIndex] : null;
    return {
      name: s.name,
      frequency: s.frequency,
      value: latest,
      date: lastIndex >= 0 ? timeline[lastIndex] : null,
      change: latest != null && prev != null ? latest - prev : null,
    };
  });
  return {
    title: "Macro Dashboard",
    updated: timeline.length > 0 ? timeline[timeline.length - 1] : null,
    seriesCount: series.length,
    items,
  };
}

/**
 * Table view — one row per timeline date, one column per series.
 *
 * @param {object} mergedSeries - chart output
 * @returns {object} - { columns, rows }
 */
function buildMacroTable(mergedSeries) {
  const { timeline, series } = _chartInput(mergedSeries);
  const columns = series.map((s) => s.name);
  const rows = timeline.map((date, i) => {
    const row = { date };
    for (const s of series) {
      const values = Array.isArray(s.values) ? s.values : [];
      row[s.name] = i < values.length ? values[i] ?? null : null;
    }
    return row;
  });
  return { columns, rows };
}

/**
 * Summary view — series count, date range, total points and a light
 * per-series { min, max, last } profile.
 *
 * @param {object} mergedSeries - chart output
 * @returns {object} - light summary object
 */
function buildMacroSummary(mergedSeries) {
  const { timeline, series } = _chartInput(mergedSeries);
  const intel = Intelligence.analyzeCountry(mergedSeries);
  const insights = Insights.generateInsights(intel);
  const profile = CountryIntel.buildCountryProfile(mergedSeries, intel, insights);
  const risk = RiskEngine.buildRiskProfile(mergedSeries, intel);
  const policy = PolicyEngine.buildPolicyAssessment(mergedSeries, intel, risk);
  const perSeries = series.map((s) => {
    const values = (Array.isArray(s.values) ? s.values : []).filter((v) => v != null);
    let min = null;
    let max = null;
    for (const v of values) {
      if (min === null || v < min) min = v;
      if (max === null || v > max) max = v;
    }
    return {
      name: s.name,
      frequency: s.frequency,
      points: values.length,
      min,
      max,
      last: values.length > 0 ? values[values.length - 1] : null,
    };
  });
  let dataPoints = 0;
  for (const s of perSeries) dataPoints += s.points;
  return {
    ...profile,
    risk,
    policy,
    seriesCount: series.length,
    dateRange: {
      from: timeline.length > 0 ? timeline[0] : null,
      to: timeline.length > 0 ? timeline[timeline.length - 1] : null,
    },
    dataPoints,
    perSeries,
  };
}

module.exports = { buildMacroCard, buildMacroTable, buildMacroSummary };

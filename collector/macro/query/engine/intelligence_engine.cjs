"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/intelligence_engine.cjs
 * Description:
 *   Intelligence Engine — Phase 13 (Chalak / ultra-light build).
 *   Light country-level macro analysis over the chart output from
 *   Phase 6. No heavy processing, no complex models.
 *
 *   Analyses:
 *     inflation_trend   CPI series   -> falling / rising / stable
 *     growth_trend      GDP series   -> improving / weakening / flat
 *     policy_stance     policy rate  -> tight / loose / neutral
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

// Non-null values of a series, oldest first.
function _valuesOf(series) {
  if (!series || !Array.isArray(series.values)) return [];
  return series.values.filter((v) => v != null);
}

// Compares the last value with the average of up to `window` prior
// values; returns the trend labels or "unknown" when data is too thin.
function _trend(values, window, rising, falling, flat) {
  const n = values.length;
  if (n < 2) return "unknown";
  const last = values[n - 1];
  const start = Math.max(0, n - 1 - window);
  let sum = 0;
  for (let i = start; i < n - 1; i++) sum += values[i];
  const avg = sum / (n - 1 - start);
  if (last > avg) return rising;
  if (last < avg) return falling;
  return flat;
}

// Policy stance from the latest policy rate.
function _policyStance(rate) {
  if (rate > 4) return "tight";
  if (rate < 2) return "loose";
  return "neutral";
}

/**
 * Analyzes a country's macro conditions from the chart output.
 *
 * @param {object} mergedSeries - chart output ({ chart: { timeline, series } })
 * @returns {object} - { inflation_trend, growth_trend, policy_stance }
 */
function analyzeCountry(mergedSeries) {
  const chart = mergedSeries && mergedSeries.chart ? mergedSeries.chart : {};
  const series = Array.isArray(chart.series) ? chart.series : [];

  const cpi = _findSeries(series, "CPI");
  const gdp = _findSeries(series, "GDP");
  const rate =
    _findSeries(series, "POLICY_RATE") ||
    _findSeries(series, "INTEREST") ||
    _findSeries(series, "RATE");

  const inflation = _valuesOf(cpi);
  const growth = _valuesOf(gdp);
  const rates = _valuesOf(rate);

  return {
    inflation_trend: _trend(inflation, 6, "rising", "falling", "stable"),
    growth_trend: _trend(growth, 4, "improving", "weakening", "flat"),
    policy_stance: rates.length > 0 ? _policyStance(rates[rates.length - 1]) : "unknown",
  };
}

module.exports = { analyzeCountry };

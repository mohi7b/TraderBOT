"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/forecast_engine.cjs
 * Description:
 *   Forecast Engine — Phase 12 (Chalak / fast light build).
 *   Light in-memory forecast models over the chart output from
 *   Phase 6. No heavy processing, no external libraries.
 *
 *   Models:
 *     linear               least-squares linear trend
 *     moving / ma          3-point moving average
 *     exponential / es     exponential smoothing (α = 0.3)
 *     gdp / growth         growth-rate projection
 *
 *   Output:
 *     { model, steps, forecast: [ ...12 future values... ] }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const DEFAULT_STEPS = 12;

// Least-squares linear trend through (index, value); predicts n..n+steps-1.
function _predictLinear(values, steps) {
  const n = values.length;
  if (n < 2) {
    const v = n > 0 ? values[n - 1] : null;
    return new Array(steps).fill(v);
  }
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += values[i];
    sxx += i * i;
    sxy += i * values[i];
  }
  const denom = n * sxx - sx * sx;
  const b = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const a = (sy - b * sx) / n;
  const out = [];
  for (let i = 0; i < steps; i++) out.push(a + b * (n + i));
  return out;
}

// 3-point moving average of the tail, repeated flat into the future.
function _predictMovingAverage(values, steps) {
  const n = values.length;
  const k = Math.min(3, n);
  let sum = 0;
  for (let i = n - k; i < n; i++) sum += values[i];
  const avg = k > 0 ? sum / k : null;
  return new Array(steps).fill(avg);
}

// Exponential smoothing (level model) with α = 0.3; level repeated forward.
function _predictExponential(values, steps) {
  const alpha = 0.3;
  let level = values.length > 0 ? values[0] : null;
  for (let i = 1; i < values.length; i++) {
    level = alpha * values[i] + (1 - alpha) * level;
  }
  return new Array(steps).fill(level);
}

// Growth projection: average recent growth rate compounded forward.
function _predictGrowth(values, steps) {
  const rates = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    if (prev != null && prev !== 0 && values[i] != null) {
      rates.push((values[i] - prev) / prev);
    }
  }
  const recent = rates.slice(-4);
  let avg = 0;
  for (const r of recent) avg += r;
  avg = recent.length > 0 ? avg / recent.length : 0;
  const out = [];
  let cur = values.length > 0 ? values[values.length - 1] : null;
  for (let i = 0; i < steps; i++) {
    if (cur == null) {
      out.push(null);
      continue;
    }
    cur = cur * (1 + avg);
    out.push(cur);
  }
  return out;
}

/**
 * Builds a light 12-step forecast from the chart output.
 *
 * @param {object} chart     - chart output ({ chart: { timeline, series } })
 * @param {string} [model]   - "linear" | "moving" | "exponential" | "gdp"
 * @param {number} [steps]   - number of future values (default 12)
 * @returns {object}         - { model, steps, forecast }
 */
function buildForecast(chart, model, steps) {
  const count = Number.isInteger(steps) && steps > 0 ? steps : DEFAULT_STEPS;
  const series = chart && chart.chart && Array.isArray(chart.chart.series) ? chart.chart.series : [];
  const values =
    series.length > 0 && Array.isArray(series[0].values)
      ? series[0].values.filter((v) => v != null)
      : [];
  const name = String(model || "linear").toLowerCase();

  let forecast;
  if (values.length === 0) {
    forecast = new Array(count).fill(null);
  } else if (name === "moving" || name === "moving average" || name === "ma") {
    forecast = _predictMovingAverage(values, count);
  } else if (name === "exponential" || name === "exponential smoothing" || name === "exp" || name === "es") {
    forecast = _predictExponential(values, count);
  } else if (name === "gdp" || name === "growth" || name === "gdp growth" || name === "projection") {
    forecast = _predictGrowth(values, count);
  } else {
    forecast = _predictLinear(values, count);
  }
  return { model: name, steps: count, forecast };
}

module.exports = { buildForecast };

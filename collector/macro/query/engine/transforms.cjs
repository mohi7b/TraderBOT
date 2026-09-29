"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/transforms.cjs
 * Description:
 *   Transforms — Phase 9 (Chalak / fast light build).
 *   Light in-memory series transforms applied AFTER frequency
 *   conversion. Each function does one simple pass over a small
 *   { date, value } array — no heavy loops, no averaging.
 *
 *   Supported transforms:
 *     YoY        lagged difference (M→12, Q→4, A→1); null when missing
 *     MoM        percent change vs previous; null for annual series
 *     Diff       simple difference vs previous
 *     Normalize  value / first value × 100
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

// YoY: lagged difference vs the same period last year.
function _yoy(series, frequency) {
  const lag = frequency === "M" ? 12 : frequency === "Q" ? 4 : 1;
  const data = series.data;
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const current = data[i].value;
    const prev = i - lag >= 0 ? data[i - lag].value : null;
    out.push({
      date: data[i].date,
      value: current == null || prev == null ? null : current - prev,
    });
  }
  return { ...series, data: out };
}

// MoM: percent change vs the previous period; null for annual series.
function _mom(series, frequency) {
  const data = series.data;
  const out = [];
  for (let i = 0; i < data.length; i++) {
    let value = null;
    if (frequency !== "A" && i > 0 && data[i].value != null) {
      const prev = data[i - 1].value;
      if (prev != null && prev !== 0) {
        value = ((data[i].value - prev) / prev) * 100;
      }
    }
    out.push({ date: data[i].date, value });
  }
  return { ...series, data: out };
}

// Diff: simple difference vs the previous period (first row → null).
function _diff(series) {
  const data = series.data;
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const prev = i > 0 ? data[i - 1].value : null;
    out.push({
      date: data[i].date,
      value: data[i].value == null || prev == null ? null : data[i].value - prev,
    });
  }
  return { ...series, data: out };
}

// Normalize: value / first value × 100 (first row → 100).
function _normalize(series) {
  const data = series.data;
  const first = data.length > 0 ? data[0].value : null;
  const out = [];
  for (const row of data) {
    out.push({
      date: row.date,
      value: first == null || first === 0 || row.value == null ? null : (row.value / first) * 100,
    });
  }
  return { ...series, data: out };
}

/**
 * Applies a named transform to a converted series. Unknown or missing
 * transforms return the series unchanged (passthrough).
 *
 * @param {object} series    - { series_id, frequency, data: [{ date, value }] }
 * @param {string} transform - "YoY" | "MoM" | "Diff" | "Normalize" | null
 * @returns {object}         - series with transformed data
 */
function applyTransform(series, transform) {
  if (!series || !Array.isArray(series.data)) return series;
  const name = String(transform || "").toLowerCase();
  const frequency = series.frequency ? String(series.frequency).toUpperCase() : "";
  if (name === "yoy") return _yoy(series, frequency);
  if (name === "mom") return _mom(series, frequency);
  if (name === "diff") return _diff(series);
  if (name === "normalize") return _normalize(series);
  return series;
}

module.exports = { applyTransform };

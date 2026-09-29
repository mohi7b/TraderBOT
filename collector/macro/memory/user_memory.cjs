"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/memory/user_memory.cjs
 * Description:
 *   User Memory — Phase 19 (Chalak / ultra-light build).
 *   Persists light user preferences (countries, indicators,
 *   frequencies, time ranges, analysis types) to a small JSON
 *   file. No heavy processing.
 *
 *   API:
 *     updateMemory(parsed, full)  -> merge + save preferences
 *     getMemory()                 -> load current memory
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "memory.json");

function emptyMemory() {
  return { countries: [], indicators: [], frequencies: [], time_ranges: [], analysis_types: [] };
}

function load() {
  try {
    const mem = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!mem || typeof mem !== "object") return emptyMemory();
    return {
      countries: Array.isArray(mem.countries) ? mem.countries : [],
      indicators: Array.isArray(mem.indicators) ? mem.indicators : [],
      frequencies: Array.isArray(mem.frequencies) ? mem.frequencies : [],
      time_ranges: Array.isArray(mem.time_ranges) ? mem.time_ranges : [],
      analysis_types: Array.isArray(mem.analysis_types) ? mem.analysis_types : [],
    };
  } catch {
    return emptyMemory();
  }
}

function save(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Light helper: push only non-empty, unique values (no unbounded growth).
function _pushUnique(arr, value) {
  if (value == null || String(value).trim() === "" || arr.includes(value)) return;
  arr.push(value);
}

/**
 * Merges a parsed query (and the full pipeline output) into memory.
 *
 * @param {object} parsed - Phase 8 parser output ({ countries, series, time })
 * @param {object} full   - full pipeline result ({ chart, dashboard, ... })
 */
function updateMemory(parsed, full) {
  const mem = load();
  const p = parsed && typeof parsed === "object" ? parsed : {};

  // Countries: direct field or the Phase 8 countries array.
  if (typeof p.country === "string") _pushUnique(mem.countries, p.country);
  if (Array.isArray(p.countries)) for (const c of p.countries) _pushUnique(mem.countries, c);

  // Indicators: direct field or the Phase 8 series list.
  if (typeof p.indicator === "string") _pushUnique(mem.indicators, p.indicator);
  if (Array.isArray(p.series)) {
    for (const s of p.series) {
      if (s && typeof s.indicator === "string") _pushUnique(mem.indicators, s.indicator);
    }
  }

  // Frequencies: direct field or from the full chart series.
  if (typeof p.frequency === "string") _pushUnique(mem.frequencies, p.frequency);
  if (full && full.chart && Array.isArray(full.chart.series)) {
    for (const s of full.chart.series) {
      if (s && typeof s.frequency === "string") _pushUnique(mem.frequencies, s.frequency);
    }
  }

  // Time ranges: from the Phase 8 time clause.
  if (p.time && (p.time.from != null || p.time.to != null)) {
    _pushUnique(
      mem.time_ranges,
      `${p.time.from != null ? p.time.from : "?"}-${p.time.to != null ? p.time.to : "?"}`
    );
  }

  // Analysis types observed in every full run.
  _pushUnique(mem.analysis_types, "trend");
  _pushUnique(mem.analysis_types, "risk");
  _pushUnique(mem.analysis_types, "policy");

  save(mem);
}

module.exports = { updateMemory, getMemory: load };

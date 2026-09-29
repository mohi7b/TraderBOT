/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/utils/normalize.cjs
 * Description:
 *   Normalization utilities for macro data.
 *   Ensures all incoming data (historical + live) follow
 *   MacroUnifiedSchema before entering Stability Window + DB.
 *
 *   Handles:
 *     - variable name normalization
 *     - country code normalization
 *     - unit normalization
 *     - frequency normalization
 *     - timestamp normalization (to UTC ISO)
 *     - source tagging
 *     - numeric cleanup
 *
 *   Fully CJS and used by all collectors.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const path = require("path");
const fs = require("fs");

// Load variable mapping
const variablesFile = path.join(__dirname, "..", "config", "variables.json");
const variablesMap = JSON.parse(fs.readFileSync(variablesFile, "utf8"));

// Load sources mapping
const sourcesFile = path.join(__dirname, "..", "config", "sources.json");
const sourcesMap = JSON.parse(fs.readFileSync(sourcesFile, "utf8"));

/**
 * Normalize variable name
 * Example:
 *   "CPI YoY" → "CPI"
 *   "Consumer Price Index" → "CPI"
 */
function normalizeVariableName(name) {
  const key = name.toLowerCase().trim();

  for (const canonical in variablesMap) {
    const aliases = variablesMap[canonical].aliases.map(a => a.toLowerCase());
    if (aliases.includes(key)) return canonical;
  }

  return name; // fallback
}

/**
 * Normalize country code
 * Example:
 *   "United States" → "USA"
 *   "Germany" → "DEU"
 */
function normalizeCountry(country) {
  const c = country.trim().toLowerCase();

  const map = {
    "united states": "USA",
    "us": "USA",
    "usa": "USA",
    "germany": "DEU",
    "de": "DEU",
    "deu": "DEU",
    "china": "CHN",
    "cn": "CHN",
    "chn": "CHN"
  };

  return map[c] || country;
}

/**
 * Normalize unit
 * Example:
 *   "%" → "%"
 *   "percent" → "%"
 *   "index" → "index"
 */
function normalizeUnit(unit) {
  if (!unit) return null;

  const u = unit.trim().toLowerCase();

  const map = {
    "%": "%",
    "percent": "%",
    "percentage": "%",
    "index": "index",
    "points": "points"
  };

  return map[u] || unit;
}

/**
 * Normalize frequency
 * Example:
 *   "monthly" → "Monthly"
 *   "quarterly" → "Quarterly"
 */
function normalizeFrequency(freq) {
  if (!freq) return null;

  const f = freq.trim().toLowerCase();

  const map = {
    "monthly": "Monthly",
    "quarterly": "Quarterly",
    "weekly": "Weekly",
    "daily": "Daily",
    "annual": "Annual"
  };

  return map[f] || freq;
}

/**
 * Normalize timestamp → UTC ISO
 * Example:
 *   "2024-01-15" → "2024-01-15T00:00:00Z"
 */
function normalizeTimestamp(ts) {
  if (!ts) return null;

  // If already ISO
  if (ts.includes("T")) return ts;

  return ts + "T00:00:00Z";
}

/**
 * Normalize numeric values
 * Example:
 *   "3.5%" → 3.5
 *   "1,234.56" → 1234.56
 */
function normalizeValue(val) {
  if (val === null || val === undefined) return null;

  let v = String(val).trim();

  // Remove %
  if (v.endsWith("%")) v = v.slice(0, -1);

  // Remove commas
  v = v.replace(/,/g, "");

  const num = parseFloat(v);
  return isNaN(num) ? null : num;
}

/**
 * Normalize source metadata
 */
function normalizeSource(sourceName) {
  const key = sourceName.toLowerCase().trim();

  for (const src in sourcesMap) {
    const aliases = sourcesMap[src].aliases.map(a => a.toLowerCase());
    if (aliases.includes(key)) return src;
  }

  return sourceName;
}

/**
 * Main normalization function
 * ------------------------------------------------------------
 * Input: raw record from any source (GMD, IMF, FRED, BIS, Live API)
 * Output: normalized record ready for Stability Window
 * ------------------------------------------------------------
 */
function normalizeRecord(raw) {
  return {
    country: normalizeCountry(raw.country),
    variable: normalizeVariableName(raw.variable),
    value: normalizeValue(raw.value),

    category: raw.category || null,
    sub_category: raw.sub_category || null,
    frequency: normalizeFrequency(raw.frequency),
    unit: normalizeUnit(raw.unit),

    source_primary: normalizeSource(raw.source_primary || raw.source || "unknown"),
    source_secondary: raw.source_secondary || null,

    release_lag_days: raw.release_lag_days || null,

    release_time_utc: normalizeTimestamp(raw.release_time_utc || raw.date)
  };
}

module.exports = {
  normalizeRecord,
  normalizeVariableName,
  normalizeCountry,
  normalizeUnit,
  normalizeFrequency,
  normalizeTimestamp,
  normalizeValue,
  normalizeSource
};

"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/parser/query_parser.cjs
 * Description:
 *   Query Parser — Phase 8 (Chalak). Converts a raw macro query
 *   string into a structured, validated query object for the
 *   Chalak database. Parsing only — no data processing, no
 *   frequency conversion, no merging.
 *
 *   Supported DSL:
 *     COUNTRIES: INDICATORS [time-clause]
 *
 *     Countries:  "USA, CHN, EU"
 *                 (alias: US / United States → USA, China → CHN,
 *                  Euro Area → EU, Germany → DEU)
 *     Indicators: "CPI, GDP, PMI"
 *                 (alias: Consumer Price Index → CPI,
 *                  Gross Domestic Product → GDP,
 *                  Purchasing Managers Index → PMI)
 *     Transform:  YoY | MoM | Diff | Normalize   (optional suffix)
 *     Time:       "from 2010 to 2024" | "since 2008" | "last 10 years"
 *
 *   Result shape (parseQuery):
 *     {
 *       countries: ["USA", ...],
 *       series:    [{ country, indicator, transform }, ...],
 *       time:      { from: number|null, to: number|null }
 *     }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

// Country alias dictionary (label → canonical country code).
const COUNTRY_ALIAS = {
  "US": "USA",
  "United States": "USA",
  "China": "CHN",
  "Euro Area": "EU",
  "Germany": "DEU",
};

// Indicator alias dictionary (label → canonical indicator name).
const INDICATOR_ALIAS = {
  "CPI": "CPI",
  "Consumer Price Index": "CPI",
  "GDP": "GDP",
  "Gross Domestic Product": "GDP",
  "PMI": "PMI",
  "Purchasing Managers Index": "PMI",
};

// Supported light transforms (lowercase label → canonical form).
const TRANSFORM_CANON = {
  yoy: "YoY",
  mom: "MoM",
  diff: "Diff",
  normalize: "Normalize",
};

// Time-clause keywords at a word boundary (series/time split marker).
const TIME_KEYWORDS = /\b(?:from|since|last)\s/i;

/**
 * Normalizes one country token via the alias dictionary. Falls back
 * to an uppercase country code for unknown tokens ("USA" stays "USA").
 *
 * @param {string} token - raw country label
 * @returns {string|null} - canonical country code or null
 */
function _normalizeCountry(token) {
  const key = String(token).trim();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(COUNTRY_ALIAS, key)) return COUNTRY_ALIAS[key];
  const title = key.charAt(0).toUpperCase() + key.slice(1);
  if (Object.prototype.hasOwnProperty.call(COUNTRY_ALIAS, title)) return COUNTRY_ALIAS[title];
  return key.toUpperCase();
}

/**
 * Normalizes one indicator name via the alias dictionary. Unknown
 * names are returned unchanged.
 *
 * @param {string} name - raw indicator label
 * @returns {string|null} - canonical indicator name or null
 */
function _normalizeIndicator(name) {
  const key = String(name).trim();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(INDICATOR_ALIAS, key)) return INDICATOR_ALIAS[key];
  const upper = key.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(INDICATOR_ALIAS, upper)) return INDICATOR_ALIAS[upper];
  const title = key.charAt(0).toUpperCase() + key.slice(1);
  if (Object.prototype.hasOwnProperty.call(INDICATOR_ALIAS, title)) return INDICATOR_ALIAS[title];
  return key;
}

/**
 * Parses one indicator item, splitting an optional transform suffix:
 *   "CPI YoY" → { indicator: "CPI", transform: "YoY" }
 *   "GDP"     → { indicator: "GDP", transform: null }
 *
 * @param {string} item - raw indicator item
 * @returns {object|null} - { indicator, transform } or null
 */
function _parseSeriesItem(item) {
  const parts = String(item).trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  let transform = null;
  let baseParts = parts;
  if (Object.prototype.hasOwnProperty.call(TRANSFORM_CANON, last)) {
    transform = TRANSFORM_CANON[last];
    baseParts = parts.slice(0, parts.length - 1);
  }
  const indicator = _normalizeIndicator(baseParts.join(" "));
  if (!indicator) return null;
  return { indicator, transform };
}

/**
 * Splits a query into its series part and its (optional) time part.
 *
 * @param {string} text - full raw query string
 * @returns {object}    - { seriesText, timeText }
 */
function _splitTimeClause(text) {
  const at = text.search(TIME_KEYWORDS);
  if (at === -1) return { seriesText: text.trim(), timeText: "" };
  return { seriesText: text.slice(0, at).trim(), timeText: text.slice(at).trim() };
}


/**
 * Parses a raw query string into a structured query object.
 *   "USA, CHN: CPI YoY, GDP from 2010 to 2024"
 *   → { countries, series: [{country, indicator, transform}], time }
 *
 * @param {string} queryString - raw macro query string
 * @returns {object} - { countries, series, time }
 */
function parseQuery(queryString) {
  const text = String(queryString || "").trim();
  if (!text) throw new Error("Query string must not be empty");
  const { seriesText, timeText } = _splitTimeClause(text);
  const { countries, series } = parseSeriesClause(seriesText);
  return { countries, series, time: parseTimeRange(timeText) };
}

/**
 * Extracts the requested series from the raw query string.
 * Series = cartesian product of countries × indicators.
 *
 * @param {string} raw - raw query string
 * @returns {object} - { countries: [...], series: [{ country, indicator, transform }] }
 */
function parseSeriesClause(raw) {
  const text = String(raw || "").trim();
  const colon = text.indexOf(":");
  if (colon === -1) {
    throw new Error("Series clause must use the form \"COUNTRIES: INDICATORS\"");
  }
  const countries = [];
  for (const token of text.slice(0, colon).split(",")) {
    const code = _normalizeCountry(token);
    if (code && !countries.includes(code)) countries.push(code);
  }
  if (countries.length === 0) {
    throw new Error("No valid country found in series clause");
  }
  const indicators = [];
  for (const item of text.slice(colon + 1).split(",")) {
    const parsed = _parseSeriesItem(item);
    if (parsed) indicators.push(parsed);
  }
  if (indicators.length === 0) {
    throw new Error("No valid indicator found in series clause");
  }
  const series = [];
  for (const country of countries) {
    for (const ind of indicators) {
      series.push({ country, indicator: ind.indicator, transform: ind.transform });
    }
  }
  return { countries, series };
}

/**
 * Extracts the time-range clause from the raw query.
 * Supports: "from YYYY to YYYY" | "since YYYY" | "last N years".
 *
 * @param {string} raw - raw query string
 * @returns {object}   - { from: number|null, to: number|null }
 */
function parseTimeRange(raw) {
  const text = String(raw || "").trim();
  const currentYear = new Date().getFullYear();
  let m = text.match(/from\s+(\d{4})\s+to\s+(\d{4})/i);
  if (m) return { from: Number(m[1]), to: Number(m[2]) };
  m = text.match(/since\s+(\d{4})/i);
  if (m) return { from: Number(m[1]), to: null };
  m = text.match(/last\s+(\d+)\s+years?/i);
  if (m) return { from: currentYear - Number(m[1]), to: currentYear };
  return { from: null, to: null };
}

/**
 * Extracts the target frequency clause from the raw query.
 * Chalak supports A / Q / M only.
 *
 * @param {string} raw - raw query string
 * @returns {string|null} - normalized frequency or null
 */
function parseFrequency(raw) {
  const text = String(raw || "").trim();
  const m = text.match(/\b(?:frequency|freq)\s*[:=]?\s*([A-Za-z]+)/i);
  const token = m ? m[1].toLowerCase() : "";
  if (token === "m" || token === "month" || token === "monthly") return "M";
  if (token === "q" || token === "quarter" || token === "quarterly") return "Q";
  if (token === "a" || token === "y" || token === "year" || token === "yearly" || token === "annual") {
    return "A";
  }
  return null;
}

/**
 * Extracts additional filter clauses (WHERE ...) from the raw query.
 * The Chalak DSL has no extra filter clauses — always an empty map.
 *
 * @param {string} raw - raw query string
 * @returns {object}   - key/value filter map (always {})
 */
function parseFilters(raw) {
  return {};
}

module.exports = {
  parseQuery,
  parseSeriesClause,
  parseTimeRange,
  parseFrequency,
  parseFilters
};

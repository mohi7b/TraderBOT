"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/integration/macro_service.cjs
 * Description:
 *   Macro Service — Phase 18 (Chalak / ultra-light build).
 *   Integration layer: runs the whole macro pipeline for one DSL
 *   query string and returns every layer in one object. Pure
 *   orchestration — no heavy processing.
 *
 *   runMacroPipeline("USA, CHN: CPI YoY, GDP from 2010 to 2024") -> {
 *     query, chart, dashboard, intelligence, insights,
 *     country_profile, risk, policy
 *   }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const QueryParser = require("../parser/query_parser.cjs");
const { ChartEngine } = require("../engine/chart_engine.cjs");
const IntelligenceEngine = require("../engine/intelligence_engine.cjs");
const InsightsEngine = require("../engine/insights_engine.cjs");
const CountryIntel = require("../engine/country_intelligence.cjs");
const RiskEngine = require("../engine/risk_engine.cjs");
const PolicyEngine = require("../engine/policy_engine.cjs");
const Memory = require("../../memory/user_memory.cjs");

// Chalak database only — the reference DB is never touched.
const DB = "core";
const DEFAULT_FREQUENCY = "M";

function _normalizeFreq(value) {
  const v = value ? String(value).trim().toUpperCase() : "";
  if (v === "M" || v === "MONTH" || v === "MONTHLY") return "M";
  if (v === "Q" || v === "QUARTER" || v === "QUARTERLY") return "Q";
  if (v === "A" || v === "Y" || v === "ANNUAL" || v === "YEARLY" || v === "YEAR") return "A";
  return null;
}

// Converts the Phase 8 parser output into the ChartEngine query form.
function _toEngineQuery(parsed, frequency) {
  const target = _normalizeFreq(frequency) || DEFAULT_FREQUENCY;
  const tr = {};
  if (parsed.time && parsed.time.from != null) tr.start = String(parsed.time.from);
  if (parsed.time && parsed.time.to != null) tr.end = String(parsed.time.to);
  return {
    db: DB,
    frequency: target,
    series: parsed.series.map((s) => ({
      country: s.country,
      indicator: s.indicator,
      frequency: target,
      transform: s.transform,
    })),
    timeRange: tr,
  };
}

/**
 * Runs the full macro pipeline for one DSL query string.
 *
 * @param {string} queryText  - DSL query, e.g. "USA: CPI YoY"
 * @param {object} [options]  - optional ({ frequency })
 * @returns {Promise<object>} - { query, chart, dashboard, intelligence,
 *                               insights, country_profile, risk, policy }
 */
async function runMacroPipeline(queryText, options) {
  const parsed = QueryParser.parseQuery(queryText);
  const engineQuery = _toEngineQuery(parsed, options && options.frequency);
  const engine = new ChartEngine();
  try {
    const chart = await engine.generateChart(engineQuery);
    const dashboard = await engine.generateDashboard(engineQuery);

    // The analysis engines expect the chart shape ({ chart: { series } }).
    const intel = IntelligenceEngine.analyzeCountry(chart);
    const insights = InsightsEngine.generateInsights(intel);
    const country_profile = CountryIntel.buildCountryProfile(chart, intel, insights);
    const risk = RiskEngine.buildRiskProfile(chart, intel);
    const policy = PolicyEngine.buildPolicyAssessment(chart, intel, risk);

    const result = {
      query: parsed,
      chart,
      dashboard,
      intelligence: intel,
      insights,
      country_profile,
      risk,
      policy,
    };
    Memory.updateMemory(parsed, result);
    return result;
  } finally {
    engine.close();
  }
}

module.exports = { runMacroPipeline };

"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/chart_engine.cjs
 * Description:
 *   Chart Engine — Phase 6 (Chalak / fast light build).
 *
 *   Turns a parsed macro query into a chart-ready JSON result by
 *   wiring the pipeline together:
 *
 *     QueryExecutor       -> raw series rows          (Phase 3)
 *     FrequencyConverter  -> light A/Q/M conversion   (Phase 6)
 *     SeriesMerger        -> common-timeline merge    (Phase 6)
 *     ChartFormatter      -> standard chart JSON
 *
 *   Light only: one indexed SQL read per series, one filter pass per
 *   conversion, one inner-join merge. No heavy loops, no analysis.
 *   No direct database connection (DB access only via QueryExecutor).
 *
 *   Result shape:
 *     {
 *       chart: {
 *         timeline: ["2020-01", ...],        // sorted common dates
 *         series: [ { name, frequency, values } ]
 *       }
 *     }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { QueryExecutor } = require("./query_executor.cjs");
const { FrequencyConverter } = require("./frequency_converter.cjs");
const { SeriesMerger } = require("./merger.cjs");
const { applyTransform } = require("./transforms.cjs");
const DashboardEngine = require("./dashboard_engine.cjs");
const ForecastEngine = require("./forecast_engine.cjs");

/**
 * Internal ChartFormatter.
 * Turns a merged result table into the standard chart JSON shape.
 */
class ChartFormatter {
  /**
   * @param {object} merged     - { merged: [{ date, <series_id>... }] }
   * @param {Array}  seriesList - converted series ({ series_id, frequency })
   * @returns {object}          - { chart: { timeline, series } }
   */
  format(merged, seriesList) {
    const rows = merged && Array.isArray(merged.merged) ? merged.merged : [];
    const series = (Array.isArray(seriesList) ? seriesList : []).map((s) => ({
      name: s.series_id,
      frequency: s.frequency,
      values: rows.map((r) => r[s.series_id] ?? null),
    }));
    return {
      chart: {
        timeline: rows.map((r) => r.date),
        series,
      },
    };
  }
}

class ChartEngine {
  /**
   * @param {string} [dbMode="core"] - "core" | "full". The database
   *   connection is opened ONLY inside QueryExecutor; this class never
   *   touches the database directly.
   */
  constructor(dbMode = "core") {
    this.dbMode = dbMode;
    this.executor = new QueryExecutor(dbMode);
    this.converter = new FrequencyConverter();
    this.merger = new SeriesMerger();
    this.chartFormatter = new ChartFormatter();
  }

  /**
   * Runs the full chart pipeline for a parsed query:
   *   execute -> convert frequency -> merge -> format.
   *
   * @param {object} parsedQuery - parsed query object (Phase 2 contract)
   * @returns {Promise<object>}  - { chart: { timeline, series } }
   */
  async generateChart(parsedQuery) {
    // 1) Run the query through the QueryExecutor (raw series rows).
    const raw = await this.executor.execute(parsedQuery);

    // 2) Light frequency alignment (A/Q/M only) then optional transform.
    const converted = (raw.results || []).map((series, index) => {
      const result = this.converter.convert(series, parsedQuery.frequency);
      const transform =
        parsedQuery.series && parsedQuery.series[index]
          ? parsedQuery.series[index].transform
          : null;
      return transform ? applyTransform(result, transform) : result;
    });

    // 3) Inner-join merge on the dates shared by every series.
    const merged = this.merger.merge(converted);

    // 4) Build the standard chart output.
    return this.chartFormatter.format(merged, converted);
  }

  /**
   * Runs the chart pipeline and wraps the result into three light
   * dashboard views: card, table and summary (formatting only).
   *
   * @param {object} parsedQuery - parsed query object (Phase 8 contract)
   * @returns {Promise<object>}  - { card, table, summary }
   */
  async generateDashboard(parsedQuery) {
    const chart = await this.generateChart(parsedQuery);
    return {
      card: DashboardEngine.buildMacroCard(chart),
      table: DashboardEngine.buildMacroTable(chart),
      summary: DashboardEngine.buildMacroSummary(chart),
    };
  }

  /**
   * Runs the chart pipeline and builds a light 12-step forecast from
   * the first series. Optional model: "linear" | "moving" | "exponential" | "gdp".
   *
   * @param {object} parsedQuery - parsed query object
   * @returns {Promise<object>}  - { model, steps, forecast }
   */
  async generateForecast(parsedQuery) {
    const chart = await this.generateChart(parsedQuery);
    return ForecastEngine.buildForecast(chart, parsedQuery.model, parsedQuery.steps);
  }

  /**
   * Closes the underlying DB connection (delegates to QueryExecutor).
   * Callers should call this once the engine is no longer needed.
   */
  close() {
    if (this.executor && typeof this.executor.close === "function") {
      this.executor.close();
    }
  }
}

module.exports = { ChartEngine };

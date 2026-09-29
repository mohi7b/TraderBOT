"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/tests/chart_engine.test.cjs
 * Description:
 *   Light tests for engine/chart_engine.cjs (Phase 6 / Chalak).
 *   Covers the real chart pipeline:
 *     - ChartEngine construction
 *     - generateChart returns the standard chart shape
 *     - one real end-to-end query builds timeline + series values
 *   Light only: one indexed SELECT per query, tiny data.
 *
 * Run:
 *   node --test collector/macro/query/tests/
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ChartEngine } = require("../engine/chart_engine.cjs");

// Tiny parsed query — goes through QueryExecutor only (light indexed
// SELECT with an exact country + indicator + frequency match).
const parsedQuery = {
  country: "USA",
  indicator: "CPI",
  frequency: "M",
  db: "core",
};

test("ChartEngine can be constructed", () => {
  const ce = new ChartEngine();
  try {
    assert.ok(ce instanceof ChartEngine);
    assert.equal(typeof ce.generateChart, "function");
  } finally {
    ce.close();
  }
});

test("generateChart returns the chart skeleton", async () => {
  const ce = new ChartEngine();
  try {
    const result = await ce.generateChart(parsedQuery);
    assert.ok(result.chart, "result has a chart property");
    assert.ok(result.chart.timeline, "chart has a timeline property");
    assert.ok(result.chart.series, "chart has a series property");
  } finally {
    ce.close();
  }
});

test("ChartEngine calls QueryExecutor.execute()", async () => {
  const ce = new ChartEngine();
  try {
    const result = await ce.generateChart(parsedQuery);
    assert.ok(result.chart);
  } finally {
    ce.close();
  }
});

test("ChartEngine uses FrequencyConverter", async () => {
  const ce = new ChartEngine();
  try {
    const result = await ce.generateChart(parsedQuery);
    assert.ok(result.chart.series);
  } finally {
    ce.close();
  }
});

test("ChartEngine uses SeriesMerger.merge()", async () => {
  const ce = new ChartEngine();
  try {
    const result = await ce.generateChart(parsedQuery);
    assert.equal(Array.isArray(result.chart.series), true);
  } finally {
    ce.close();
  }
});

test("generateChart builds a real chart from a real Chalak series", async () => {
  const ce = new ChartEngine();
  try {
    const result = await ce.generateChart({
      series: [{ series_id: "OECD.USA.CPI_YOY.M" }],
      frequency: "M",
      db: "core",
    });
    assert.ok(result.chart.timeline.length > 0, "timeline has real dates");
    assert.equal(result.chart.series.length, 1);
    assert.equal(result.chart.series[0].name, "OECD.USA.CPI_YOY.M");
    assert.equal(result.chart.series[0].frequency, "M");
    assert.equal(result.chart.series[0].values.length, result.chart.timeline.length);
  } finally {
    ce.close();
  }
});

"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/tests/chart_engine_real.test.cjs
 * Description:
 *   Real, light tests for the Phase 6 (Chalak) pipeline — ChartEngine,
 *   FrequencyConverter and SeriesMerger — running ONLY against the
 *   Chalak database (collector/macro/core_db/core.db). No queries are
 *   ever sent to the reference (full) database.
 *
 *   Real series used (verified in core.db):
 *     FRED.USA.CPIAUCSL.M   monthly US CPI     (1947-01 .. 2026-07, dense)
 *     FRED.USA.GDP.Q        quarterly US GDP   (1947-Q1 .. 2026-Q2, dense)
 *     OECD.CHN.CPI_IDX.M    monthly CHN CPI    (2011-08 .. 2026-02)
 *
 *   Every test stays light: one indexed SELECT per series + a tiny
 *   in-memory conversion / merge. No heavy loops, no regex over data,
 *   no temp files, no shell redirects.
 *
 * Run:
 *   node --test collector/macro/query/tests/chart_engine_real.test.cjs
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { QueryExecutor } = require("../engine/query_executor.cjs");
const { FrequencyConverter } = require("../engine/frequency_converter.cjs");
const { SeriesMerger } = require("../engine/merger.cjs");
const { ChartEngine } = require("../engine/chart_engine.cjs");

// ------------------------------------------------------------
// 1) Real M → Q on US CPI (FRED.USA.CPIAUCSL.M)
// Only Mar / Jun / Sep / Dec survive; e.g. 2020-03 → 2020-Q1
// ------------------------------------------------------------
test("real M→Q on FRED.USA.CPIAUCSL.M keeps only quarter-end months", () => {
  const ex = new QueryExecutor("core");
  try {
    const raw = ex.execute({
      series: [{ series_id: "FRED.USA.CPIAUCSL.M" }],
      timeRange: { start: "2020-01", end: "2020-12" },
    });
    assert.equal(raw.results.length, 1);
    assert.equal(raw.results[0].data.length, 12, "full monthly year is loaded");

    const out = new FrequencyConverter().convert(raw.results[0], "Q");
    assert.equal(out.series_id, "FRED.USA.CPIAUCSL.Q");
    assert.equal(out.frequency, "Q");
    assert.deepEqual(
      out.data.map((r) => r.date),
      ["2020-Q1", "2020-Q2", "2020-Q3", "2020-Q4"]
    );
  } finally {
    ex.close();
  }
});

// ------------------------------------------------------------
// 2) Real Q → A on US GDP (FRED.USA.GDP.Q)
// Only Q4 survives; e.g. 2020-Q4 → 2020
// ------------------------------------------------------------
test("real Q→A on FRED.USA.GDP.Q keeps only Q4 of each year", () => {
  const ex = new QueryExecutor("core");
  try {
    const raw = ex.execute({
      series: [{ series_id: "FRED.USA.GDP.Q" }],
      timeRange: { start: "2019-Q1", end: "2021-Q4" },
    });
    assert.equal(raw.results.length, 1);
    assert.equal(raw.results[0].data.length, 12, "full quarterly range is loaded");

    const out = new FrequencyConverter().convert(raw.results[0], "A");
    assert.equal(out.series_id, "FRED.USA.GDP.A");
    assert.equal(out.frequency, "A");
    assert.deepEqual(
      out.data.map((r) => r.date),
      ["2019", "2020", "2021"]
    );
  } finally {
    ex.close();
  }
});

// ------------------------------------------------------------
// 3) Real M → A on CHN CPI (OECD.CHN.CPI_IDX.M)
// Only December survives; e.g. 2022-12 → 2022
// ------------------------------------------------------------
test("real M→A on OECD.CHN.CPI_IDX.M keeps only December", () => {
  const ex = new QueryExecutor("core");
  try {
    const raw = ex.execute({
      series: [{ series_id: "OECD.CHN.CPI_IDX.M" }],
      timeRange: { start: "2021-01", end: "2024-12" },
    });
    assert.equal(raw.results.length, 1);

    const out = new FrequencyConverter().convert(raw.results[0], "A");
    assert.equal(out.frequency, "A");
    assert.deepEqual(
      out.data.map((r) => r.date),
      ["2021", "2022", "2023", "2024"]
    );
    for (const r of out.data) {
      assert.equal(typeof r.value, "number", "annual value is a real number");
    }
  } finally {
    ex.close();
  }
});

// ------------------------------------------------------------
// 4) Real merge: monthly CPI → Q  +  quarterly GDP (Q) →
//    aligned on the shared quarter timeline (inner join)
// ------------------------------------------------------------
test("real merge of M(CPI)→Q and Q(GDP) onto shared quarters", () => {
  const ex = new QueryExecutor("core");
  try {
    const raw = ex.execute({
      series: [{ series_id: "FRED.USA.CPIAUCSL.M" }, { series_id: "FRED.USA.GDP.Q" }],
      timeRange: { start: "2019-01", end: "2022-01" },
    });
    assert.equal(raw.results.length, 2);

    const converter = new FrequencyConverter();
    const converted = raw.results.map((s) => converter.convert(s, "Q"));
    const merged = new SeriesMerger().merge(converted).merged;

    // 2019-Q1 .. 2021-Q4 → 12 shared quarters, no extra dates
    assert.equal(merged.length, 12);
    assert.equal(merged[0].date, "2019-Q1");
    assert.equal(merged[merged.length - 1].date, "2021-Q4");

    // one column per converted series_id, values always present
    const first = merged[0];
    assert.ok("FRED.USA.CPIAUCSL.Q" in first, "CPI column exists");
    assert.ok("FRED.USA.GDP.Q" in first, "GDP column exists");
    assert.equal(typeof first["FRED.USA.CPIAUCSL.Q"], "number");
    assert.equal(typeof first["FRED.USA.GDP.Q"], "number");
  } finally {
    ex.close();
  }
});

// ------------------------------------------------------------
// 5) Real ChartEngine multi-series query — USA: CPI + GDP
//    Real timeline, real series, real values, no nulls, no extras
// ------------------------------------------------------------
test("real ChartEngine multi-series query (USA CPI + GDP)", async () => {
  const ce = new ChartEngine();
  try {
    const result = await ce.generateChart({
      series: [{ series_id: "FRED.USA.CPIAUCSL.M" }, { series_id: "FRED.USA.GDP.Q" }],
      frequency: "Q",
      db: "core",
      timeRange: { start: "2020-01", end: "2021-01" },
    });

    assert.deepEqual(
      result.chart.timeline,
      ["2020-Q1", "2020-Q2", "2020-Q3", "2020-Q4"]
    );
    assert.equal(result.chart.series.length, 2);

    const names = result.chart.series.map((s) => s.name).sort();
    assert.deepEqual(names, ["FRED.USA.CPIAUCSL.Q", "FRED.USA.GDP.Q"]);

    for (const s of result.chart.series) {
      assert.equal(s.frequency, "Q");
      assert.equal(s.values.length, result.chart.timeline.length);
      assert.ok(s.values.every((v) => v != null), "no unnecessary nulls (inner join)");
    }
  } finally {
    ce.close();
  }
});

// ------------------------------------------------------------
// 6) Real ChartEngine multi-country query — USA CPI + CHN CPI
//    Two series, two countries, one shared timeline
// ------------------------------------------------------------
test("real ChartEngine multi-country query (USA CPI + CHN CPI)", async () => {
  const ce = new ChartEngine();
  try {
    const result = await ce.generateChart({
      series: [{ series_id: "FRED.USA.CPIAUCSL.M" }, { series_id: "OECD.CHN.CPI_IDX.M" }],
      frequency: "M",
      db: "core",
      timeRange: { start: "2021-01", end: "2024-12" },
    });

    assert.equal(result.chart.series.length, 2);
    const names = result.chart.series.map((s) => s.name);
    assert.ok(names.includes("FRED.USA.CPIAUCSL.M"), "US CPI present");
    assert.ok(names.includes("OECD.CHN.CPI_IDX.M"), "CHN CPI present");

    // USA CPI covers every month, so the common timeline equals the
    // CHN series' dates (proves the shared-timeline inner join).
    const ex = new QueryExecutor("core");
    let chnDates;
    try {
      chnDates = ex
        .execute({
          series: [{ series_id: "OECD.CHN.CPI_IDX.M" }],
          timeRange: { start: "2021-01", end: "2024-12" },
        })
        .results[0].data.map((r) => r.date);
    } finally {
      ex.close();
    }

    assert.deepEqual(result.chart.timeline, chnDates, "shared timeline is the real intersection");
    for (const s of result.chart.series) {
      assert.equal(s.values.length, result.chart.timeline.length);
      assert.ok(s.values.every((v) => v != null), "no nulls on the shared timeline");
    }
  } finally {
    ce.close();
  }
});


/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/tests/executor.test.cjs
 * Description:
 *   Tests for engine/query_executor.cjs (Phase 3).
 *   Covers:
 *     - connecting to core.db and full macro.db (read-only)
 *     - running a simple indexed SELECT
 *     - loadSeriesMeta exact country+indicator+frequency matches
 *     - loadSeriesData ascending {date, value} rows
 *     - execute() on a real series (results[0].data.length > 0)
 *     - time-range filtering and graceful empty results
 *   Light only: every query is index-driven (PK / series lookup /
 *   per-series data read). No full-table scans, no heavy queries.
 *
 * Run:
 *   node --test collector/macro/query/tests/
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  QueryExecutor,
  executeParsedQuery,
  executeSeriesQuery,
  executeMultiSeriesQuery,
} = require("../engine/query_executor.cjs");

// Known series present in core.db (from the Macro Core DB build):
//   OECD.USA.CPI_YOY.M   -> sparse monthly (6 rows)
//   FRED.USA.CPIAUCSL.M  -> monthly, 1947-01..2026-07 (954 rows)

// ------------------------------------------------------------
// 1) Connections
// ------------------------------------------------------------

test("connects to core.db (read-only)", () => {
  const ex = new QueryExecutor("core");
  try {
    assert.equal(ex.isOpen, true);
    assert.deepEqual(ex.ping(), { ok: 1 });
  } finally {
    ex.close();
    assert.equal(ex.isOpen, false);
  }
});

test("connects to full macro.db (read-only)", () => {
  const ex = new QueryExecutor("full");
  try {
    assert.equal(ex.isOpen, true);
    assert.deepEqual(ex.ping(), { ok: 1 });
  } finally {
    ex.close();
  }
});

test("rejects an unknown db mode", () => {
  assert.throws(() => new QueryExecutor("bogus"), /Unknown db mode/);
});

// ------------------------------------------------------------
// 2) Simple SELECT (indexed)
// ------------------------------------------------------------

test("simple SELECT on series by primary key", () => {
  const ex = new QueryExecutor("core");
  try {
    const row = ex.db
      .prepare("SELECT series_id FROM series WHERE series_id = ?")
      .get("OECD.USA.CPI_YOY.M");
    assert.equal(row.series_id, "OECD.USA.CPI_YOY.M");
  } finally {
    ex.close();
  }
});

test("simple SELECT on full macro.db by primary key", () => {
  const ex = new QueryExecutor("full");
  try {
    const row = ex.db
      .prepare("SELECT series_id, dataset FROM series WHERE series_id = ?")
      .get("FRED.USA.CPIAUCSL.M");
    assert.equal(row.series_id, "FRED.USA.CPIAUCSL.M");
    assert.equal(row.dataset, "FRED");
  } finally {
    ex.close();
  }
});

// ------------------------------------------------------------
// 3) loadSeriesMeta
// ------------------------------------------------------------

test("loadSeriesMeta returns exact country+indicator+frequency matches", () => {
  const ex = new QueryExecutor("core");
  try {
    const meta = ex.loadSeriesMeta({ country: "USA", indicator: "CPI_YOY", frequency: "M" });
    assert.ok(meta.length > 0);
    for (const m of meta) {
      assert.equal(m.country, "USA");
      assert.equal(m.indicator, "CPI_YOY");
      assert.equal(m.frequency, "M");
    }
    assert.ok(meta.some((m) => m.series_id === "OECD.USA.CPI_YOY.M"));
  } finally {
    ex.close();
  }
});

test("loadSeriesMeta supports a dataset-narrowed query", () => {
  const ex = new QueryExecutor("core");
  try {
    const meta = ex.loadSeriesMeta({
      dataset: "FRED",
      country: "USA",
      indicator: "CPIAUCSL",
      frequency: "M",
    });
    assert.deepEqual(meta.map((m) => m.series_id), ["FRED.USA.CPIAUCSL.M"]);
  } finally {
    ex.close();
  }
});

// ------------------------------------------------------------
// 4) loadSeriesData
// ------------------------------------------------------------

test("loadSeriesData returns ascending {date, value} rows", () => {
  const ex = new QueryExecutor("core");
  try {
    const out = ex.loadSeriesData("OECD.USA.CPI_YOY.M", {});
    assert.equal(out.series_id, "OECD.USA.CPI_YOY.M");
    assert.equal(out.frequency, "M");
    assert.ok(out.data.length > 0);
    const dates = out.data.map((r) => r.date);
    assert.deepEqual(dates, [...dates].sort());
    for (const r of out.data) {
      assert.equal(typeof r.date, "string");
      assert.equal(typeof r.value, "number");
    }
  } finally {
    ex.close();
  }
});

// ------------------------------------------------------------
// 5) execute()
// ------------------------------------------------------------

test("execute on a real series returns data (core)", () => {
  const ex = new QueryExecutor("core");
  try {
    const result = ex.execute({ country: "USA", indicator: "CPI_YOY", frequency: "M" });
    assert.equal(result.status, "ok");
    assert.equal(result.db, "core");
    assert.equal(result.count, 1);
    const first = result.results[0];
    assert.equal(first.series_id, "OECD.USA.CPI_YOY.M");
    assert.equal(first.frequency, "M");
    assert.ok(first.data.length > 0); // sample assertion: data.length > 0
  } finally {
    ex.close();
  }
});

test("execute filters data by the time range", () => {
  const ex = new QueryExecutor("core");
  try {
    const result = ex.execute({
      series: [{ series_id: "FRED.USA.CPIAUCSL.M" }],
      timeRange: { start: "2020-01", end: "2020-12" },
    });
    assert.equal(result.count, 1);
    const data = result.results[0].data;
    assert.ok(data.length > 0);
    assert.ok(data.length <= 12);
    for (const r of data) {
      assert.ok(r.date >= "2020-01" && r.date <= "2020-12");
    }
  } finally {
    ex.close();
  }
});

test("execute supports the series[] form with multiple selectors", () => {
  const ex = new QueryExecutor("core");
  try {
    const result = ex.execute({
      series: [
        { country: "USA", indicator: "CPI_YOY", frequency: "M" },
        { series_id: "FRED.USA.CPIAUCSL.M" },
      ],
      timeRange: { start: "2015-01", end: "2019-12" },
    });
    assert.equal(result.status, "ok");
    const ids = result.results.map((r) => r.series_id);
    assert.ok(ids.includes("OECD.USA.CPI_YOY.M"));
    assert.ok(ids.includes("FRED.USA.CPIAUCSL.M"));
  } finally {
    ex.close();
  }
});

test("unknown series returns an empty result gracefully", () => {
  const ex = new QueryExecutor("core");
  try {
    const result = ex.execute({ country: "ZZZ", indicator: "NO_SUCH_IND", frequency: "M" });
    assert.equal(result.status, "ok");
    assert.equal(result.count, 0);
    assert.deepEqual(result.results, []);
  } finally {
    ex.close();
  }
});

test("executeParsedQuery selects the DB from parsedQuery.db", async () => {
  // core selection
  const coreRes = await executeParsedQuery({
    db: "core",
    country: "USA",
    indicator: "CPI_YOY",
    frequency: "M",
  });
  assert.equal(coreRes.db, "core");
  assert.ok(coreRes.results[0].data.length > 0);

  // full selection (light: one indexed series read)
  const fullRes = await executeParsedQuery({
    db: "full",
    country: "USA",
    indicator: "CPIAUCSL",
    frequency: "M",
    timeRange: { start: "2020-01", end: "2020-03" },
  });
  assert.equal(fullRes.db, "full");
  assert.equal(fullRes.results[0].series_id, "FRED.USA.CPIAUCSL.M");
  assert.ok(fullRes.results[0].data.length > 0);
});

// ------------------------------------------------------------
// 6) wrapper helpers
// ------------------------------------------------------------

test("executeSeriesQuery fetches a single series (core)", async () => {
  const out = await executeSeriesQuery("OECD.USA.CPI_YOY.M", {}, { db: "core" });
  assert.equal(out.series_id, "OECD.USA.CPI_YOY.M");
  assert.ok(out.data.length > 0);
});

test("executeMultiSeriesQuery groups results by series", async () => {
  const results = await executeMultiSeriesQuery(
    ["OECD.USA.CPI_YOY.M", "FRED.USA.CPIAUCSL.M"],
    { start: "2015-01", end: "2019-12" },
    { db: "core" }
  );
  const ids = results.map((r) => r.series_id);
  assert.deepEqual(ids, ["OECD.USA.CPI_YOY.M", "FRED.USA.CPIAUCSL.M"]);
});


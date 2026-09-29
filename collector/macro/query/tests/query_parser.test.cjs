"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/tests/query_parser.test.cjs
 * Description:
 *   Light tests for parser/query_parser.cjs (Phase 8 / Chalak).
 *   Parsing only — no database access, no data processing:
 *     - multi-country queries
 *     - multi-indicator queries
 *     - country aliases (US / United States → USA, China → CHN, ...)
 *     - indicator aliases (Consumer Price Index → CPI, ...)
 *     - transforms (YoY / MoM / Diff / Normalize)
 *     - time filters (from ... to / since / last N years)
 *     - one full combined query
 *   Tiny inline strings only — no heavy loops, no large data.
 *
 * Run:
 *   node --test collector/macro/query/tests/query_parser.test.cjs
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseQuery, parseSeriesClause, parseTimeRange } = require("../parser/query_parser.cjs");

test("parses multiple countries into a countries array", () => {
  const q = parseQuery("USA, CHN, EU: CPI");
  assert.deepEqual(q.countries, ["USA", "CHN", "EU"]);
  assert.deepEqual(
    q.series.map((s) => s.country),
    ["USA", "CHN", "EU"]
  );
});

test("parses multiple indicators into one series per indicator", () => {
  const q = parseQuery("USA: CPI, GDP, PMI");
  assert.deepEqual(
    q.series.map((s) => ({ country: s.country, indicator: s.indicator, transform: s.transform })),
    [
      { country: "USA", indicator: "CPI", transform: null },
      { country: "USA", indicator: "GDP", transform: null },
      { country: "USA", indicator: "PMI", transform: null },
    ]
  );
});

test("resolves country aliases (US, China, Euro Area, Germany)", () => {
  const q = parseQuery("US, United States, China, Euro Area, Germany: CPI");
  assert.deepEqual(q.countries, ["USA", "CHN", "EU", "DEU"]);
});

test("resolves indicator aliases (Consumer Price Index, GDP, PMI)", () => {
  const q = parseQuery("USA: Consumer Price Index, Gross Domestic Product, Purchasing Managers Index");
  assert.deepEqual(
    q.series.map((s) => s.indicator),
    ["CPI", "GDP", "PMI"]
  );
});

test("parses transforms (YoY / MoM / Diff / Normalize)", () => {
  const q = parseQuery("USA: CPI YoY, GDP, Unemployment Diff, PMI MoM, Retail Normalize");
  assert.deepEqual(
    q.series.map((s) => ({ indicator: s.indicator, transform: s.transform })),
    [
      { indicator: "CPI", transform: "YoY" },
      { indicator: "GDP", transform: null },
      { indicator: "Unemployment", transform: "Diff" },
      { indicator: "PMI", transform: "MoM" },
      { indicator: "Retail", transform: "Normalize" },
    ]
  );
});

test("parses time filters (from/to, since, last N years)", () => {
  assert.deepEqual(parseQuery("USA: CPI from 2010 to 2024").time, { from: 2010, to: 2024 });
  assert.deepEqual(parseQuery("USA: CPI since 2008").time, { from: 2008, to: null });
  const year = new Date().getFullYear();
  assert.deepEqual(parseQuery("USA: CPI last 10 years").time, { from: year - 10, to: year });
  assert.deepEqual(parseQuery("USA: CPI").time, { from: null, to: null });
});

test("parses a full combined query (countries + indicators + transform + time)", () => {
  const q = parseQuery("USA, CHN: CPI YoY, GDP from 2010 to 2024");
  assert.deepEqual(q.countries, ["USA", "CHN"]);
  assert.deepEqual(q.series, [
    { country: "USA", indicator: "CPI", transform: "YoY" },
    { country: "USA", indicator: "GDP", transform: null },
    { country: "CHN", indicator: "CPI", transform: "YoY" },
    { country: "CHN", indicator: "GDP", transform: null },
  ]);
  assert.deepEqual(q.time, { from: 2010, to: 2024 });
});

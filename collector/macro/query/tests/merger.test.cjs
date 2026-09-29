"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/tests/merger.test.cjs
 * Description:
 *   Light tests for engine/merger.cjs (Phase 6 / Chalak).
 *   Covers the real inner-join merge:
 *     - class construction
 *     - buildTimeline returns only common dates (intersection)
 *     - merge returns one row per common date, one column per series
 *     - guard rejects invalid inputs (null / {} / string)
 *   Tiny inline data only — no large data, no database.
 *
 * Run:
 *   node --test collector/macro/query/tests/
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SeriesMerger } = require("../engine/merger.cjs");

const merger = () => new SeriesMerger();

const sampleSeries = [
  { series_id: "A", data: [{ date: "2020-01", value: 1 }] },
  { series_id: "B", data: [{ date: "2020-02", value: 2 }] },
];

test("constructs a SeriesMerger instance", () => {
  const m = merger();
  assert.ok(m instanceof SeriesMerger);
  assert.equal(typeof m.buildTimeline, "function");
  assert.equal(typeof m.merge, "function");
});

test("buildTimeline skeleton returns an empty timeline", () => {
  assert.deepEqual(merger().buildTimeline(sampleSeries), []);
});

test("merge skeleton returns the standard { merged: [] } shape", () => {
  assert.deepEqual(merger().merge(sampleSeries), { merged: [] });
});

test("buildTimeline keeps only dates shared by every series", () => {
  const m = merger();
  const series = [
    {
      series_id: "A",
      data: [
        { date: "2020-01", value: 1 },
        { date: "2020-02", value: 2 },
        { date: "2020-03", value: 3 },
      ],
    },
    {
      series_id: "B",
      data: [
        { date: "2020-02", value: 20 },
        { date: "2020-03", value: 30 },
        { date: "2020-04", value: 40 },
      ],
    },
  ];
  assert.deepEqual(m.buildTimeline(series), ["2020-02", "2020-03"]);
});

test("merge returns one row per common date with a column per series", () => {
  const m = merger();
  const series = [
    { series_id: "A", data: [{ date: "2020-01", value: 1 }, { date: "2020-02", value: 2 }] },
    { series_id: "B", data: [{ date: "2020-02", value: 20 }, { date: "2020-03", value: 30 }] },
  ];
  assert.deepEqual(m.merge(series).merged, [{ date: "2020-02", A: 2, B: 20 }]);
});

test("merge guard rejects null input", () => {
  assert.throws(() => merger().merge(null), /expects an array/);
});

test("merge guard rejects object input", () => {
  assert.throws(() => merger().merge({}), /expects an array/);
});

test("merge guard rejects string input", () => {
  assert.throws(() => merger().merge("string"), /expects an array/);
});


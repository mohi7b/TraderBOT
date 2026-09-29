"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/tests/converter.test.cjs
 * Description:
 *   Light tests for engine/frequency_converter.cjs (Phase 6 / Chalak).
 *   Covers the real light conversions on the A/Q/M frequencies:
 *     - class construction
 *     - M→Q (last month of each quarter), Q→A (Q4), M→A (December)
 *     - same-frequency passthrough
 *     - unrealistic pairs (D→M, W→M) raise an error
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
const { FrequencyConverter } = require("../engine/frequency_converter.cjs");

const converter = () => new FrequencyConverter();

test("constructs a FrequencyConverter instance", () => {
  const c = converter();
  assert.ok(c instanceof FrequencyConverter);
  assert.equal(typeof c.convert, "function");
  assert.equal(typeof c.convertMonthlyToQuarterly, "function");
  assert.equal(typeof c.convertQuarterlyToAnnual, "function");
  assert.equal(typeof c.convertDailyToMonthly, "function");
  assert.equal(typeof c.convertWeeklyToMonthly, "function");
});

test("convert dispatches M→Q and returns the standard shape", () => {
  const out = converter().convert({ series_id: "X.M", frequency: "M", data: [] }, "Q");
  assert.equal(out.series_id, "X.Q");
  assert.equal(out.frequency, "Q");
  assert.deepEqual(out.data, []);
});

test("skeleton M→Q returns empty data", () => {
  const out = converter().convert({ series_id: "X.M", frequency: "M", data: [] }, "Q");
  assert.equal(out.frequency, "Q");
  assert.deepEqual(out.data, []);
});

test("skeleton Q→A returns empty data", () => {
  const out = converter().convert({ series_id: "X.Q", frequency: "Q", data: [] }, "A");
  assert.equal(out.frequency, "A");
  assert.deepEqual(out.data, []);
});

test("D→M is rejected (not a Chalak DB frequency pair)", () => {
  assert.throws(
    () => converter().convert({ series_id: "X.D", frequency: "D", data: [] }, "M"),
    /Unsupported conversion/
  );
});

test("W→M is rejected (not a Chalak DB frequency pair)", () => {
  assert.throws(
    () => converter().convert({ series_id: "X.W", frequency: "W", data: [] }, "M"),
    /Unsupported conversion/
  );
});

test("M→Q keeps only the last month of each quarter (light, no averaging)", () => {
  const out = converter().convert(
    {
      series_id: "X.M",
      frequency: "M",
      data: [
        { date: "2020-01", value: 1 },
        { date: "2020-02", value: 2 },
        { date: "2020-03", value: 3 },
        { date: "2020-06", value: 6 },
        { date: "2020-09", value: 9 },
        { date: "2020-12", value: 12 },
      ],
    },
    "Q"
  );
  assert.equal(out.series_id, "X.Q");
  assert.equal(out.frequency, "Q");
  assert.deepEqual(out.data, [
    { date: "2020-Q1", value: 3 },
    { date: "2020-Q2", value: 6 },
    { date: "2020-Q3", value: 9 },
    { date: "2020-Q4", value: 12 },
  ]);
});

test("Q→A keeps only Q4 (light, no averaging)", () => {
  const out = converter().convert(
    {
      series_id: "X.Q",
      frequency: "Q",
      data: [
        { date: "2020-Q1", value: 1 },
        { date: "2020-Q2", value: 2 },
        { date: "2020-Q4", value: 4 },
      ],
    },
    "A"
  );
  assert.equal(out.series_id, "X.A");
  assert.equal(out.frequency, "A");
  assert.deepEqual(out.data, [{ date: "2020", value: 4 }]);
});

test("M→A keeps only December (light, no averaging)", () => {
  const out = converter().convert(
    {
      series_id: "X.M",
      frequency: "M",
      data: [
        { date: "2020-05", value: 5 },
        { date: "2020-12", value: 12 },
        { date: "2021-11", value: 110 },
        { date: "2021-12", value: 120 },
      ],
    },
    "A"
  );
  assert.equal(out.frequency, "A");
  assert.deepEqual(out.data, [
    { date: "2020", value: 12 },
    { date: "2021", value: 120 },
  ]);
});

test("same frequency passes through with empty data", () => {
  const out = converter().convert({ series_id: "X.M", frequency: "M", data: [] }, "M");
  assert.equal(out.series_id, "X.M");
  assert.equal(out.frequency, "M");
  assert.deepEqual(out.data, []);
});

test("invalid target frequency raises an error", () => {
  assert.throws(
    () => converter().convert({ series_id: "X.M", frequency: "M", data: [] }, "XYZ"),
    /Unsupported target frequency/
  );
});


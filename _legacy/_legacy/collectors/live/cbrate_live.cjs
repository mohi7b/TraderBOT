/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/live/cbrate_live.cjs
 * Description:
 *   Live collector for Central Bank Rate (Interest Rate).
 *   Steps:
 *     - Fetch live CB rate from API
 *     - Normalize raw data
 *     - Update Stability Window
 *     - Store live JSONL record
 *     - Insert new Parquet record
 *   Fully CJS and compatible with Macro Collector architecture.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { get } = require("../../utils/fetch.cjs");
const logger = require("../../utils/logger.cjs");
const { normalizeRecord } = require("../../utils/normalize.cjs");
const { updateStabilityWindow } = require("../../stability/stability_window.cjs");
const db = require("../../db/db_adapter.cjs");

// API endpoint (نمونه — تو بعداً API واقعی را می‌گذاری)
const API_URL = "https://api.macro.live/cbrate?country=USA";

/**
 * Main CB Rate collector
 */
async function runCBRateLive() {
  logger.info("CBRate Live Collector started.");

  // 1) Fetch live data
  const response = await get(API_URL);

  if (!response || response.success === false) {
    logger.error("CBRate API failed: " + (response.error || "Unknown error"));
    return;
  }

  // Expected API format:
  // {
  //   country: "USA",
  //   variable: "interest rate",
  //   value: "5.50",
  //   date: "2024-01-15",
  //   source: "Federal Reserve"
  // }

  const raw = {
    country: response.country,
    variable: response.variable,
    value: response.value,
    date: response.date,
    source_primary: response.source
  };

  // 2) Normalize record
  const normalized = normalizeRecord(raw);

  logger.info(
    `Normalized CBRate → ${normalized.country} ${normalized.variable} = ${normalized.value}`
  );

  // 3) Update Stability Window
  const newRecord = await updateStabilityWindow(
    db,
    "macro_core", // جدول نرخ بهره در macro_core ذخیره می‌شود
    normalized.country,
    normalized.variable,
    normalized.value,
    normalized.release_time_utc,
    {
      category: "Monetary",
      sub_category: "Rates",
      frequency: "Daily",
      unit: "%",
      source_primary: normalized.source_primary
    }
  );

  logger.success(
    `CBRate updated: ${newRecord.country} ${newRecord.variable} → ${newRecord.value}`
  );

  // 4) Store live JSONL record
  db.appendLive("cbrate", {
    country: normalized.country,
    variable: normalized.variable,
    value: normalized.value,
    release_time_utc: normalized.release_time_utc,
    source: normalized.source_primary,
    last_updated: new Date().toISOString()
  });

  logger.success("CBRate JSONL appended.");

  logger.success("CBRate Live Collector completed.");
}

module.exports = {
  runCBRateLive
};

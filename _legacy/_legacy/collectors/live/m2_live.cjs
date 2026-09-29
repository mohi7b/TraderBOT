/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/live/m2_live.cjs
 * Description:
 *   Live collector for M2 Money Supply.
 *   Steps:
 *     - Fetch M2 from live API
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

// API endpoint (تو بعداً API واقعی را می‌گذاری)
const API_URL = "https://api.macro.live/m2?country=USA";

/**
 * Main M2 collector
 */
async function runM2Live() {
  logger.info("M2 Live Collector started.");

  // 1) Fetch live M2
  const response = await get(API_URL);

  if (!response || response.success === false) {
    logger.error("M2 API failed: " + (response.error || "Unknown error"));
    return;
  }

  // Expected API format:
  // {
  //   country: "USA",
  //   variable: "M2",
  //   value: "21034.5",
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
    `Normalized M2 → ${normalized.country} ${normalized.variable} = ${normalized.value}`
  );

  // 3) Update Stability Window
  const newRecord = await updateStabilityWindow(
    db,
    "macro_liquidity", // M2 در macro_liquidity ذخیره می‌شود
    normalized.country,
    normalized.variable,
    normalized.value,
    normalized.release_time_utc,
    {
      category: "Liquidity",
      sub_category: "Money Supply",
      frequency: "Monthly",
      unit: "index",
      source_primary: normalized.source_primary
    }
  );

  logger.success(
    `M2 updated: ${newRecord.country} ${newRecord.variable} → ${newRecord.value}`
  );

  // 4) Store live JSONL record
  db.appendLive("m2", {
    country: normalized.country,
    variable: normalized.variable,
    value: normalized.value,
    release_time_utc: normalized.release_time_utc,
    source: normalized.source_primary,
    last_updated: new Date().toISOString()
  });

  logger.success("M2 JSONL appended.");

  logger.success("M2 Live Collector completed.");
}

module.exports = {
  runM2Live
};

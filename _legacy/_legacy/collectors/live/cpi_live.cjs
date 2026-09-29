/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/live/cpi_live.cjs
 * Description:
 *   Live collector for CPI (Inflation).
 *   Steps:
 *     - Fetch CPI from live API
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
const API_URL = "https://api.macro.live/cpi?country=USA";

/**
 * Main CPI collector
 */
async function runCPILive() {
  logger.info("CPI Live Collector started.");

  // 1) Fetch live CPI
  const response = await get(API_URL);

  if (!response || response.success === false) {
    logger.error("CPI API failed: " + (response.error || "Unknown error"));
    return;
  }

  // Expected API format:
  // {
  //   country: "USA",
  //   variable: "CPI",
  //   value: "3.4",
  //   date: "2024-01-15",
  //   source: "BLS"
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
    `Normalized CPI → ${normalized.country} ${normalized.variable} = ${normalized.value}`
  );

  // 3) Update Stability Window
  const newRecord = await updateStabilityWindow(
    db,
    "macro_core", // CPI در macro_core ذخیره می‌شود
    normalized.country,
    normalized.variable,
    normalized.value,
    normalized.release_time_utc,
    {
      category: "Inflation",
      sub_category: "Prices",
      frequency: "Monthly",
      unit: "%",
      source_primary: normalized.source_primary
    }
  );

  logger.success(
    `CPI updated: ${newRecord.country} ${newRecord.variable} → ${newRecord.value}`
  );

  // 4) Store live JSONL record
  db.appendLive("cpi", {
    country: normalized.country,
    variable: normalized.variable,
    value: normalized.value,
    release_time_utc: normalized.release_time_utc,
    source: normalized.source_primary,
    last_updated: new Date().toISOString()
  });

  logger.success("CPI JSONL appended.");

  logger.success("CPI Live Collector completed.");
}

module.exports = {
  runCPILive
};

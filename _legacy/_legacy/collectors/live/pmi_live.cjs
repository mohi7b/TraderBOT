/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/live/pmi_live.cjs
 * Description:
 *   Live collector for PMI (Purchasing Managers Index).
 *   Steps:
 *     - Fetch PMI from live API
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
const API_URL = "https://api.macro.live/pmi?country=USA";

/**
 * Main PMI collector
 */
async function runPMILive() {
  logger.info("PMI Live Collector started.");

  // 1) Fetch live PMI
  const response = await get(API_URL);

  if (!response || response.success === false) {
    logger.error("PMI API failed: " + (response.error || "Unknown error"));
    return;
  }

  // Expected API format:
  // {
  //   country: "USA",
  //   variable: "PMI",
  //   value: "51.2",
  //   date: "2024-01-15",
  //   source: "ISM"
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
    `Normalized PMI → ${normalized.country} ${normalized.variable} = ${normalized.value}`
  );

  // 3) Update Stability Window
  const newRecord = await updateStabilityWindow(
    db,
    "macro_activity", // PMI در macro_activity ذخیره می‌شود
    normalized.country,
    normalized.variable,
    normalized.value,
    normalized.release_time_utc,
    {
      category: "Activity",
      sub_category: "Manufacturing",
      frequency: "Monthly",
      unit: "index",
      source_primary: normalized.source_primary
    }
  );

  logger.success(
    `PMI updated: ${newRecord.country} ${newRecord.variable} → ${newRecord.value}`
  );

  // 4) Store live JSONL record
  db.appendLive("pmi", {
    country: normalized.country,
    variable: normalized.variable,
    value: normalized.value,
    release_time_utc: normalized.release_time_utc,
    source: normalized.source_primary,
    last_updated: new Date().toISOString()
  });

  logger.success("PMI JSONL appended.");

  logger.success("PMI Live Collector completed.");
}

module.exports = {
  runPMILive
};

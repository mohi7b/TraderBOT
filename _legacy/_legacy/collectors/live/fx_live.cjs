/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/live/fx_live.cjs
 * Description:
 *   Live collector for FX (Exchange Rate).
 *   Steps:
 *     - Fetch FX rate from live API
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
const API_URL = "https://api.macro.live/fx?pair=EURUSD";

/**
 * Main FX collector
 */
async function runFXLive() {
  logger.info("FX Live Collector started.");

  // 1) Fetch live FX rate
  const response = await get(API_URL);

  if (!response || response.success === false) {
    logger.error("FX API failed: " + (response.error || "Unknown error"));
    return;
  }

  // Expected API format:
  // {
  //   country: "USA",
  //   variable: "FX",
  //   value: "1.085",
  //   date: "2024-01-15T12:00:00Z",
  //   source: "ECB"
  // }

  const raw = {
    country: response.country || "USA",
    variable: response.variable || "FX",
    value: response.value,
    date: response.date,
    source_primary: response.source
  };

  // 2) Normalize record
  const normalized = normalizeRecord(raw);

  logger.info(
    `Normalized FX → ${normalized.country} ${normalized.variable} = ${normalized.value}`
  );

  // 3) Update Stability Window
  const newRecord = await updateStabilityWindow(
    db,
    "macro_markets", // FX در macro_markets ذخیره می‌شود
    normalized.country,
    normalized.variable,
    normalized.value,
    normalized.release_time_utc,
    {
      category: "Markets",
      sub_category: "FX",
      frequency: "Daily",
      unit: "index",
      source_primary: normalized.source_primary
    }
  );

  logger.success(
    `FX updated: ${newRecord.country} ${newRecord.variable} → ${newRecord.value}`
  );

  // 4) Store live JSONL record
  db.appendLive("fx", {
    country: normalized.country,
    variable: normalized.variable,
    value: normalized.value,
    release_time_utc: normalized.release_time_utc,
    source: normalized.source_primary,
    last_updated: new Date().toISOString()
  });

  logger.success("FX JSONL appended.");

  logger.success("FX Live Collector completed.");
}

module.exports = {
  runFXLive
};

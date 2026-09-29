/**
 * ============================================================
 * Project: Macro Engine Collector (Offline Mode)
 * File: collector/macro/collectors/offline/gmd_loader_offline.cjs
 * Description:
 *   Offline GMD Loader
 *   Reads local CSV bulk file instead of API.
 *   Steps:
 *     - Read CSV file from offline/gmd/
 *     - Parse + normalize records
 *     - Insert into Stability Window
 *     - Store into Parquet tables
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger.cjs");
const { normalizeRecord } = require("../../utils/normalize.cjs");
const { updateStabilityWindow } = require("../../stability/stability_window.cjs");
const db = require("../../db/db_adapter.cjs");

// Offline GMD directory
const GMD_DIR = path.join(__dirname, "..", "..", "offline", "gmd");

// Bulk CSV file
const GMD_FILE = "gmd.csv";

/**
 * Parse CSV file
 */
function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const header = lines[0].split(",");

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",");

    const row = {};
    header.forEach((h, idx) => {
      row[h.trim()] = cols[idx] ? cols[idx].trim() : "";
    });

    rows.push(row);
  }

  return rows;
}

/**
 * Main GMD Offline Loader
 */
async function runGMDOfflineLoader() {
  logger.info("GMD Offline Loader started.");

  const filePath = path.join(GMD_DIR, GMD_FILE);

  if (!fs.existsSync(filePath)) {
    logger.error("GMD offline file missing: " + GMD_FILE);
    return;
  }

  logger.info("Reading GMD offline file: " + GMD_FILE);

  const rows = parseCSV(filePath);
  logger.success(`Parsed ${rows.length} rows from GMD`);

  for (const r of rows) {
    const raw = {
      country: r["Country"] || r["REF_AREA"] || r["ISO3"],
      variable: r["Variable"] || r["Series"] || r["Indicator"],
      value: r["Value"] || r["OBS_VALUE"],
      date: r["Date"] || r["TIME_PERIOD"],
      source_primary: "GMD_OFFLINE"
    };

    const normalized = normalizeRecord(raw);

    const newRecord = await updateStabilityWindow(
      db,
      "macro_core",
      normalized.country,
      normalized.variable,
      normalized.value,
      normalized.release_time_utc,
      {
        category: normalized.category,
        sub_category: normalized.sub_category,
        frequency: normalized.frequency,
        unit: normalized.unit,
        source_primary: "GMD_OFFLINE"
      }
    );

    logger.info(
      `GMD_OFFLINE → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`
    );
  }

  logger.success("GMD Offline Loader completed.");
}

module.exports = {
  runGMDOfflineLoader
};

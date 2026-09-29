/**
 * ============================================================
 * Project: Macro Engine Collector (Offline Mode)
 * File: collector/macro/collectors/offline/imf_loader_offline.cjs
 * Description:
 *   Offline IMF Loader (IFS + WEO + GFS)
 *   Reads local CSV bulk files instead of API.
 *   Steps:
 *     - Read CSV files from offline/imf/
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

// Offline IMF directory
const IMF_DIR = path.join(__dirname, "..", "..", "offline", "imf");

// Bulk CSV files
const FILES = [
  "ifs.csv",
  "weo.csv",
  "gfs.csv"
];

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
 * Main IMF Offline Loader
 */
async function runIMFOfflineLoader() {
  logger.info("IMF Offline Loader started.");

  for (const file of FILES) {
    const filePath = path.join(IMF_DIR, file);

    if (!fs.existsSync(filePath)) {
      logger.warn(`IMF offline file missing: ${file}`);
      continue;
    }

    logger.info(`Reading IMF offline file: ${file}`);

    const rows = parseCSV(filePath);
    logger.success(`Parsed ${rows.length} rows from ${file}`);

    for (const r of rows) {
      const raw = {
        country: r["REF_AREA"] || r["Country"] || r["ISO3"] || r["iso3Code"],
        variable: r["INDICATOR"] || r["Series"] || r["Variable"] || r["IndicatorCode"],
        value: r["Value"] || r["OBS_VALUE"],
        date: r["TIME_PERIOD"] || r["Date"] || r["Year"],
        source_primary: "IMF_OFFLINE"
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
          source_primary: "IMF_OFFLINE"
        }
      );

      logger.info(
        `IMF_OFFLINE → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`
      );
    }
  }

  logger.success("IMF Offline Loader completed.");
}

module.exports = {
  runIMFOfflineLoader
};

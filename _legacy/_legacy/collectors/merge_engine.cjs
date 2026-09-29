/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/merge_engine.cjs
 * Description:
 *   Merge Engine:
 *     - Reads all Parquet tables
 *     - Extracts latest active values
 *     - Builds unified macro_latest.csv
 *     - Builds macro_clean.csv (full history)
 *     - Fully CJS and compatible with db_adapter.cjs
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const db = require("../db/db_adapter.cjs");
const logger = require("../utils/logger.cjs");

// Parquet tables
const TABLES = [
  "macro_core",
  "macro_liquidity",
  "macro_markets",
  "macro_credit",
  "macro_energy",
  "macro_risk"
];

// Output paths
const EXPORT_DIR = path.join(__dirname, "..", "exports");
const LATEST_FILE = path.join(EXPORT_DIR, "macro_latest.csv");
const CLEAN_FILE = path.join(EXPORT_DIR, "macro_clean.csv");

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

/**
 * Convert record to CSV row
 */
function toCSVRow(rec) {
  return [
    rec.country,
    rec.variable,
    rec.value,
    rec.macro_value_start_time_utc,
    rec.macro_value_end_time_utc || "",
    rec.macro_value_duration_days || "",
    rec.macro_value_is_active,
    rec.category || "",
    rec.sub_category || "",
    rec.frequency || "",
    rec.unit || "",
    rec.source_primary || "",
    rec.source_secondary || "",
    rec.release_lag_days || "",
    rec.date,
    rec.quality_flag,
    rec.revision_flag,
    rec.last_updated
  ].join(",");
}

/**
 * Build CSV header
 */
function csvHeader() {
  return [
    "country",
    "variable",
    "value",
    "start_time_utc",
    "end_time_utc",
    "duration_days",
    "is_active",
    "category",
    "sub_category",
    "frequency",
    "unit",
    "source_primary",
    "source_secondary",
    "release_lag_days",
    "date",
    "quality_flag",
    "revision_flag",
    "last_updated"
  ].join(",");
}

/**
 * Merge Engine main function
 */
async function runMergeEngine() {
  logger.info("Merge Engine started.");

  const allRows = [];
  const latestMap = {}; // key: country-variable → latest active record

  // Read all tables
  for (const table of TABLES) {
    const filePath = path.join(__dirname, "..", "db", "parquet", `${table}.parquet`);

    if (!fs.existsSync(filePath)) {
      logger.warn(`Parquet table missing: ${table}`);
      continue;
    }

    logger.info(`Reading table: ${table}`);

    const rows = await db.readParquet(filePath);

    for (const r of rows) {
      allRows.push(r);

      const key = `${r.country}-${r.variable}`;

      // Only store active record as latest
      if (r.macro_value_is_active) {
        latestMap[key] = r;
      }
    }
  }

  logger.success(`Loaded ${allRows.length} total records.`);
  logger.success(`Found ${Object.keys(latestMap).length} latest active records.`);

  // Build macro_clean.csv
  const cleanLines = [csvHeader()];
  allRows.forEach(r => cleanLines.push(toCSVRow(r)));
  fs.writeFileSync(CLEAN_FILE, cleanLines.join("\n"));
  logger.success("macro_clean.csv generated.");

  // Build macro_latest.csv
  const latestLines = [csvHeader()];
  Object.values(latestMap).forEach(r => latestLines.push(toCSVRow(r)));
  fs.writeFileSync(LATEST_FILE, latestLines.join("\n"));
  logger.success("macro_latest.csv generated.");

  logger.success("Merge Engine completed.");
}

module.exports = {
  runMergeEngine
};

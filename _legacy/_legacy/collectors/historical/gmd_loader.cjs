/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/historical/gmd_loader.cjs
 * Description:
 *   Historical loader for the Global Macro Database (GMD).
 *   Steps:
 *     - Download GMD CSV file
 *     - Parse + normalize records
 *     - Insert into Stability Window
 *     - Store into Parquet tables
 *   Fully CJS and compatible with Macro Collector architecture.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { get } = require("../../utils/fetch.cjs");
const logger = require("../../utils/logger.cjs");
const { normalizeRecord } = require("../../utils/normalize.cjs");
const { updateStabilityWindow } = require("../../stability/stability_window.cjs");
const db = require("../../db/db_adapter.cjs");

// GMD CSV download URL (latest version)
const GMD_URL = "https://globalmacrodata.org/download/latest/csv";

// Local storage
const TMP_DIR = path.join(__dirname, "..", "tmp");
const CSV_PATH = path.join(TMP_DIR, "gmd_latest.csv");

// Ensure directory exists
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/**
 * Download GMD CSV file
 */
async function downloadGMD() {
  logger.info("Downloading GMD dataset...");

  const data = await get(GMD_URL);

  if (!data || data.success === false) {
    logger.error("GMD download failed: " + (data.error || "Unknown error"));
    return false;
  }

  fs.writeFileSync(CSV_PATH, data);
  logger.success("GMD CSV downloaded.");
  return true;
}

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
 * Main GMD loader
 */
async function runGMDLoader() {
  logger.info("GMD Loader started.");

  // 1) Download
  const ok = await downloadGMD();
  if (!ok) return;

  // 2) Parse CSV
  logger.info("Parsing GMD CSV...");
  const rows = parseCSV(CSV_PATH);
  logger.success(`Parsed ${rows.length} GMD rows.`);

  // 3) Process each row
  for (const r of rows) {
    const raw = {
      country: r["iso3"],
      variable: r["variable"],
      value: r["value"],
      date: r["date"],
      source_primary: "GMD"
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
        source_primary: "GMD"
      }
    );

    logger.info(
      `GMD → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`
    );
  }

  logger.success("GMD Loader completed.");
}

module.exports = {
  runGMDLoader
};

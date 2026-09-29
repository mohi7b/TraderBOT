/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/historical/bis_loader.cjs
 * Description:
 *   Historical loader for BIS datasets.
 *   Steps:
 *     - Download BIS CSV bulk files
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
const unzip = require("unzipper");
const { get } = require("../../utils/fetch.cjs");
const logger = require("../../utils/logger.cjs");
const { normalizeRecord } = require("../../utils/normalize.cjs");
const { updateStabilityWindow } = require("../../stability/stability_window.cjs");
const db = require("../../db/db_adapter.cjs");

// BIS bulk download base URL (from BIS Data Portal) 
const BIS_BASE = "https://data.bis.org/static/bulk/";

// Example dataset: Credit to non-financial sector (CSV ZIP)
const BIS_DATASET = "credit_to_nf_sector_csv_col.zip";

// Local storage
const TMP_DIR = path.join(__dirname, "..", "tmp");
const ZIP_PATH = path.join(TMP_DIR, BIS_DATASET);
const EXTRACT_DIR = path.join(TMP_DIR, "bis_extract");

// Ensure directories exist
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
if (!fs.existsSync(EXTRACT_DIR)) fs.mkdirSync(EXTRACT_DIR, { recursive: true });

/**
 * Download BIS ZIP file
 */
async function downloadBIS() {
  const url = BIS_BASE + BIS_DATASET;
  logger.info("Downloading BIS dataset: " + url);

  const data = await get(url);

  if (!data || data.success === false) {
    logger.error("BIS download failed: " + (data.error || "Unknown error"));
    return false;
  }

  fs.writeFileSync(ZIP_PATH, data);
  logger.success("BIS ZIP downloaded.");
  return true;
}

/**
 * Extract ZIP file
 */
async function extractBIS() {
  logger.info("Extracting BIS ZIP...");

  await fs.createReadStream(ZIP_PATH)
    .pipe(unzip.Extract({ path: EXTRACT_DIR }))
    .promise();

  logger.success("BIS ZIP extracted.");
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
 * Main BIS loader
 */
async function runBISLoader() {
  logger.info("BIS Loader started.");

  // 1) Download
  const ok = await downloadBIS();
  if (!ok) return;

  // 2) Extract
  await extractBIS();

  // 3) Find CSV file
  const files = fs.readdirSync(EXTRACT_DIR);
  const csvFile = files.find(f => f.endsWith(".csv"));

  if (!csvFile) {
    logger.error("No CSV found in BIS ZIP.");
    return;
  }

  const csvPath = path.join(EXTRACT_DIR, csvFile);
  logger.info("Parsing CSV: " + csvPath);

  // 4) Parse CSV
  const rows = parseCSV(csvPath);
  logger.success(`Parsed ${rows.length} BIS rows.`);

  // 5) Process each row
  for (const r of rows) {
    const raw = {
      country: r["COUNTRY"],
      variable: "CreditGrowth",
      value: r["VALUE"],
      date: r["DATE"],
      source_primary: "BIS"
    };

    const normalized = normalizeRecord(raw);

    const newRecord = await updateStabilityWindow(
      db,
      "macro_credit",
      normalized.country,
      normalized.variable,
      normalized.value,
      normalized.release_time_utc,
      {
        category: "Credit",
        sub_category: "Banking",
        frequency: "Quarterly",
        unit: "%",
        source_primary: "BIS"
      }
    );

    logger.info(
      `BIS → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`
    );
  }

  logger.success("BIS Loader completed.");
}

module.exports = {
  runBISLoader
};

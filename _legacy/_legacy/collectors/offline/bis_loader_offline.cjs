/**
 * ============================================================
 * Project: Macro Engine Collector (Offline Mode)
 * File: collector/macro/collectors/offline/bis_loader_offline.cjs
 * Description:
 *   Offline BIS Loader (Credit + Debt + Banking + FX + Derivatives)
 *   Reads local ZIP bulk files instead of API.
 *   Steps:
 *     - Read ZIP files from offline/bis/
 *     - Extract CSV
 *     - Parse + normalize records
 *     - Insert into Stability Window
 *     - Store into Parquet tables
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const logger = require("../../utils/logger.cjs");
const { normalizeRecord } = require("../../utils/normalize.cjs");
const { updateStabilityWindow } = require("../../stability/stability_window.cjs");
const db = require("../../db/db_adapter.cjs");

// Offline BIS directory
const BIS_DIR = path.join(__dirname, "..", "..", "offline", "bis");

// Bulk ZIP files
const FILES = [
  "credit.zip",
  "debt.zip",
  "banking.zip",
  "fx.zip",
  "derivatives.zip"
];

/**
 * Extract CSV files from ZIP
 */
async function extractCSV(zipPath) {
  const csvFiles = [];

  const directory = await unzipper.Open.file(zipPath);

  for (const file of directory.files) {
    if (file.path.endsWith(".csv")) {
      const content = await file.buffer();
      csvFiles.push(content.toString("utf8"));
    }
  }

  return csvFiles;
}

/**
 * Parse CSV content
 */
function parseCSVContent(content) {
  const lines = content.split("\n");
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
 * Main BIS Offline Loader
 */
async function runBISOfflineLoader() {
  logger.info("BIS Offline Loader started.");

  for (const file of FILES) {
    const zipPath = path.join(BIS_DIR, file);

    if (!fs.existsSync(zipPath)) {
      logger.warn(`BIS offline file missing: ${file}`);
      continue;
    }

    logger.info(`Extracting BIS offline ZIP: ${file}`);

    const csvContents = await extractCSV(zipPath);

    for (const content of csvContents) {
      const rows = parseCSVContent(content);
      logger.success(`Parsed ${rows.length} rows from ${file}`);

      for (const r of rows) {
        const raw = {
          country: r["REF_AREA"] || r["Country"] || r["ISO3"],
          variable: r["Series"] || r["Variable"] || r["INDICATOR"],
          value: r["Value"] || r["OBS_VALUE"],
          date: r["TIME_PERIOD"] || r["Date"],
          source_primary: "BIS_OFFLINE"
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
            category: normalized.category,
            sub_category: normalized.sub_category,
            frequency: normalized.frequency,
            unit: normalized.unit,
            source_primary: "BIS_OFFLINE"
          }
        );

        logger.info(
          `BIS_OFFLINE → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`
        );
      }
    }
  }

  logger.success("BIS Offline Loader completed.");
}

module.exports = {
  runBISOfflineLoader
};

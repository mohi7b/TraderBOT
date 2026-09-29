/**
 * ============================================================
 * Project: Macro Engine Collector (Offline Mode)
 * File: collector/macro/collectors/offline/fred_loader_offline.cjs
 * Description:
 *   Offline FRED Loader
 *   Reads the tidy CSVs produced by
 *   collector/macro/offline/fred/download_fred_offline.cjs
 *   and pushes records through the Stability Window.
 *
 *   CSV header: REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger.cjs");
const { normalizeRecord } = require("../../utils/normalize.cjs");
const { updateStabilityWindow } = require("../../stability/stability_window.cjs");
const db = require("../../db/db_adapter.cjs");

// Offline FRED directory
const FRED_DIR = path.join(__dirname, "..", "..", "offline", "fred");

/**
 * Parse a tidy CSV (header + quoted long-form rows).
 */
function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur);
    const row = {};
    header.forEach((h, idx) => { row[h] = (cols[idx] ?? "").trim().replace(/^"|"$/g, ""); });
    rows.push(row);
  }
  return rows;
}

/**
 * Main FRED Offline Loader
 */
async function runFREDOfflineLoader() {
  logger.info("FRED Offline Loader started.");

  if (!fs.existsSync(FRED_DIR)) {
    logger.warn("FRED offline directory missing: " + FRED_DIR);
    return;
  }

  const files = fs.readdirSync(FRED_DIR).filter((f) => f.endsWith(".csv"));
  let total = 0;

  for (const file of files.sort()) {
    const filePath = path.join(FRED_DIR, file);
    const rows = parseCSV(filePath);
    logger.info(`Reading FRED offline file: ${file} (${rows.length} rows)`);

    for (const r of rows) {
      if (!r["OBS_VALUE"] || r["OBS_VALUE"] === "") continue;
      const raw = {
        country: r["REF_AREA"] || "USA",
        variable: r["INDICATOR"],
        value: r["OBS_VALUE"],
        date: r["TIME_PERIOD"],
        frequency: r["FREQUENCY"],
        unit: r["UNIT"],
        source_primary: "FRED_OFFLINE"
      };

      const normalized = normalizeRecord(raw);
      if (normalized.value === null || !normalized.variable) continue;

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
          source_primary: "FRED_OFFLINE"
        }
      );

      logger.info(`FRED_OFFLINE → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`);
      total++;
    }
  }

  logger.success(`FRED Offline Loader completed. (${total} records)`);
}

module.exports = {
  runFREDOfflineLoader
};

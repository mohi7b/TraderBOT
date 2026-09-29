/**
 * ============================================================
 * Project: Macro Engine Collector (Offline Mode)
 * File: collector/macro/collectors/offline/oecd_loader_offline.cjs
 * Description:
 *   Offline OECD Loader
 *   Reads the tidy CSVs produced by
 *   collector/macro/offline/oecd/download_oecd_offline.cjs
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

// Offline OECD directory
const OECD_DIR = path.join(__dirname, "..", "..", "offline", "oecd");

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
    // Split on commas not inside quotes.
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
 * Main OECD Offline Loader
 */
async function runOECDOfflineLoader() {
  logger.info("OECD Offline Loader started.");

  if (!fs.existsSync(OECD_DIR)) {
    logger.warn("OECD offline directory missing: " + OECD_DIR);
    return;
  }

  const files = fs.readdirSync(OECD_DIR).filter((f) => f.endsWith(".csv"));
  let total = 0;

  for (const file of files.sort()) {
    const filePath = path.join(OECD_DIR, file);
    const rows = parseCSV(filePath);
    logger.info(`Reading OECD offline file: ${file} (${rows.length} rows)`);

    for (const r of rows) {
      if (!r["OBS_VALUE"] || r["OBS_VALUE"] === "") continue;
      const raw = {
        country: r["REF_AREA"],
        variable: r["INDICATOR"],
        value: r["OBS_VALUE"],
        date: r["TIME_PERIOD"],
        frequency: r["FREQUENCY"],
        unit: r["UNIT"],
        source_primary: "OECD_OFFLINE"
      };

      const normalized = normalizeRecord(raw);
      if (normalized.value === null || !normalized.country || !normalized.variable) continue;

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
          source_primary: "OECD_OFFLINE"
        }
      );

      logger.info(`OECD_OFFLINE → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`);
      total++;
    }
  }

  logger.success(`OECD Offline Loader completed. (${total} records)`);
}

module.exports = {
  runOECDOfflineLoader
};

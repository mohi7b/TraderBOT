/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/collectors/historical/imf_loader.cjs
 * Description:
 *   Historical loader for IMF SDMX datasets.
 *   Steps:
 *     - Fetch IMF SDMX JSON
 *     - Parse + normalize records
 *     - Insert into Stability Window
 *     - Store into Parquet tables
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

// Example IMF dataset: CPI (PCPI_IX)
// You can replace this with any IMF SDMX dataset
const IMF_URL =
  "https://dataservices.imf.org/REST/SDMX_JSON.svc/CompactData/IFS/USA.PCPI_IX";

/**
 * Parse IMF SDMX JSON
 */
function parseIMF(json) {
  const series = json?.CompactData?.DataSet?.Series;
  if (!series) return [];

  const rows = [];

  for (const s of series) {
    const country = s["@REF_AREA"];
    const variable = s["@INDICATOR"];

    const obs = s.Obs || [];
    for (const o of obs) {
      rows.push({
        country,
        variable,
        value: o["@OBS_VALUE"],
        date: o["@TIME_PERIOD"],
        source_primary: "IMF"
      });
    }
  }

  return rows;
}

/**
 * Main IMF loader
 */
async function runIMFLoader() {
  logger.info("IMF Loader started.");

  // 1) Fetch IMF SDMX JSON
  const response = await get(IMF_URL);

  if (!response || response.success === false) {
    logger.error("IMF API failed: " + (response.error || "Unknown error"));
    return;
  }

  logger.success("IMF dataset downloaded.");

  // 2) Parse IMF SDMX JSON
  const rows = parseIMF(response);
  logger.success(`Parsed ${rows.length} IMF rows.`);

  // 3) Process each row
  for (const r of rows) {
    const normalized = normalizeRecord(r);

    const newRecord = await updateStabilityWindow(
      db,
      "macro_core", // CPI و اکثر شاخص‌های IMF در macro_core ذخیره می‌شوند
      normalized.country,
      normalized.variable,
      normalized.value,
      normalized.release_time_utc,
      {
        category: normalized.category,
        sub_category: normalized.sub_category,
        frequency: normalized.frequency,
        unit: normalized.unit,
        source_primary: "IMF"
      }
    );

    logger.info(
      `IMF → ${newRecord.country} ${newRecord.variable} = ${newRecord.value}`
    );
  }

  logger.success("IMF Loader completed.");
}

module.exports = {
  runIMFLoader
};

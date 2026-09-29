/**
 * ============================================================
 * Project: Macro Engine Collector (Offline Mode)
 * File: collector/macro/main_offline.cjs
 * Description:
 *   Main entry point for building the initial historical database
 *   using offline bulk files (IMF + BIS + GMD + OECD + FRED + Eurostat).
 *
 *   Steps:
 *     - Run IMF Offline Loader
 *     - Run BIS Offline Loader
 *     - Run GMD Offline Loader
 *     - Run OECD Offline Loader
 *     - Run FRED Offline Loader
 *     - Run Eurostat Offline Loader
 *     - Run Merge Engine
 *
 *   This builds the full initial Parquet database without internet.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const logger = require("./utils/logger.cjs");

// Offline loaders
const { runIMFOfflineLoader } = require("./collectors/offline/imf_loader_offline.cjs");
const { runBISOfflineLoader } = require("./collectors/offline/bis_loader_offline.cjs");
const { runGMDOfflineLoader } = require("./collectors/offline/gmd_loader_offline.cjs");
const { runOECDOfflineLoader } = require("./collectors/offline/oecd_loader_offline.cjs");
const { runFREDOfflineLoader } = require("./collectors/offline/fred_loader_offline.cjs");
const { runEurostatOfflineLoader } = require("./collectors/offline/eurostat_loader_offline.cjs");

// Merge Engine
const { runMergeEngine } = require("./collectors/merge_engine.cjs");

/**
 * Main offline execution
 */
async function runOffline() {
  logger.info("Macro Engine (Offline Mode) started.");
  logger.info("Building initial historical database...");

  // IMF
  logger.info("Running IMF Offline Loader...");
  await runIMFOfflineLoader();

  // BIS
  logger.info("Running BIS Offline Loader...");
  await runBISOfflineLoader();

  // GMD
  logger.info("Running GMD Offline Loader...");
  await runGMDOfflineLoader();

  // OECD
  logger.info("Running OECD Offline Loader...");
  await runOECDOfflineLoader();

  // FRED
  logger.info("Running FRED Offline Loader...");
  await runFREDOfflineLoader();

  // Eurostat
  logger.info("Running Eurostat Offline Loader...");
  await runEurostatOfflineLoader();

  // Merge Engine
  logger.info("Running Merge Engine...");
  await runMergeEngine();

  logger.success("Offline Macro Engine completed.");
  logger.success("Initial historical database is ready.");
}

/**
 * CLI mode
 */
if (require.main === module) {
  runOffline();
}

module.exports = {
  runOffline
};

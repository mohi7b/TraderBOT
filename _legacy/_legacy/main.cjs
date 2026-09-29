/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/main.cjs
 * Description:
 *   Main entry point for Macro Engine.
 *   Responsibilities:
 *     - Load schedule.json
 *     - Run historical loaders (GMD, IMF, BIS)
 *     - Run live collectors (CPI, CBRate, M2, PMI, FX)
 *     - Run merge engine
 *     - Provide manual run mode
 *   Fully CJS and compatible with Macro Collector architecture.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const logger = require("./utils/logger.cjs");

// Historical loaders
const { runGMDLoader } = require("./collectors/historical/gmd_loader.cjs");
const { runIMFLoader } = require("./collectors/historical/imf_loader.cjs");
const { runBISLoader } = require("./collectors/historical/bis_loader.cjs");

// Live collectors
const { runCPILive } = require("./collectors/live/cpi_live.cjs");
const { runCBRateLive } = require("./collectors/live/cbrate_live.cjs");
const { runM2Live } = require("./collectors/live/m2_live.cjs");
const { runPMILive } = require("./collectors/live/pmi_live.cjs");
const { runFXLive } = require("./collectors/live/fx_live.cjs");

// Merge Engine
const { runMergeEngine } = require("./collectors/merge_engine.cjs");

// Load schedule
const schedulePath = path.join(__dirname, "config", "schedule.json");
const schedule = JSON.parse(fs.readFileSync(schedulePath, "utf8"));

/**
 * Run historical loaders
 */
async function runHistorical() {
  logger.info("Running historical loaders...");

  if (schedule.historical.gmd_loader.enabled) {
    await runGMDLoader();
  }

  if (schedule.historical.imf_loader.enabled) {
    await runIMFLoader();
  }

  if (schedule.historical.bis_loader.enabled) {
    await runBISLoader();
  }

  logger.success("Historical loaders completed.");
}

/**
 * Run live collectors
 */
async function runLive() {
  logger.info("Running live collectors...");

  if (schedule.live.cpi_live.enabled) {
    await runCPILive();
  }

  if (schedule.live.cbrate_live.enabled) {
    await runCBRateLive();
  }

  if (schedule.live.m2_live.enabled) {
    await runM2Live();
  }

  if (schedule.live.pmi_live.enabled) {
    await runPMILive();
  }

  if (schedule.live.fx_live.enabled) {
    await runFXLive();
  }

  logger.success("Live collectors completed.");
}

/**
 * Run merge engine
 */
async function runMerge() {
  if (schedule.merge_engine.enabled) {
    logger.info("Running merge engine...");
    await runMergeEngine();
  }
}

/**
 * Main execution
 */
async function runMain() {
  logger.info("Macro Engine started.");

  await runHistorical();
  await runLive();
  await runMerge();

  logger.success("Macro Engine completed.");
}

/**
 * CLI mode
 */
if (require.main === module) {
  runMain();
}

module.exports = {
  runMain,
  runHistorical,
  runLive,
  runMerge
};

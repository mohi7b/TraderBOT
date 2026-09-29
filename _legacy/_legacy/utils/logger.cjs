/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/utils/logger.cjs
 * Description:
 *   Lightweight logging utility for Macro Collector.
 *   Features:
 *     - info(), warn(), error(), success()
 *     - timestamped logs
 *     - optional file logging
 *     - fully CJS (CommonJS)
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

// Log directory
const LOG_DIR = path.join(__dirname, "..", "logs");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file path
const LOG_FILE = path.join(LOG_DIR, "macro.log");

/**
 * Format timestamp
 */
function ts() {
  return new Date().toISOString();
}

/**
 * Write log to file
 */
function writeToFile(type, message) {
  const line = `[${ts()}] [${type}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

/**
 * Print to console + write to file
 */
function log(type, color, message) {
  const line = `[${ts()}] [${type}] ${message}`;

  // Console output
  console.log(color + line + "\x1b[0m");

  // File output
  writeToFile(type, message);
}

/**
 * Public logger API
 */
const logger = {
  info(msg) {
    log("INFO", "\x1b[36m", msg); // cyan
  },

  warn(msg) {
    log("WARN", "\x1b[33m", msg); // yellow
  },

  error(msg) {
    log("ERROR", "\x1b[31m", msg); // red
  },

  success(msg) {
    log("SUCCESS", "\x1b[32m", msg); // green
  }
};

module.exports = logger;

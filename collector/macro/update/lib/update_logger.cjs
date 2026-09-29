/**
 * ============================================================
 * Macro Live Update System — logger
 * File: collector/macro/update/lib/update_logger.cjs
 *
 * Writes timestamped entries both to the console and to:
 *     collector/macro/update/logs/update_log_YYYYMMDD.txt
 * (one file per calendar day).
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const { DIRS } = require("./paths.cjs");

/** Today's log file path. */
function todayLogFile() {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(DIRS.logs, `update_log_${day.replace(/-/g, "")}.txt`);
}

let _logFile = todayLogFile();

/** Recompute the log file (used at startup / after midnight). */
function refreshLogFile() {
  _logFile = todayLogFile();
}

function write(level, message) {
  refreshLogFile();
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  // Console (always)
  console.log(line);
  // File (always append)
  fs.appendFileSync(_logFile, line + "\n");
}

const logger = {
  info(msg) { write("INFO", msg); },
  warn(msg) { write("WARN", msg); },
  error(msg) { write("ERROR", msg); },
  success(msg) { write("SUCCESS", msg); },
  section(msg) { write("======", msg); },
  logFile: _logFile,
};

module.exports = logger;

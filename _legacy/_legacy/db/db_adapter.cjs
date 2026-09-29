/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/db/db_adapter.cjs
 * Description:
 *   Unified DB adapter for Parquet + JSONL storage.
 *   Provides:
 *     - writeParquet(tablePath, rows)
 *     - readParquet(tablePath)
 *     - appendLive(streamName, record)
 *     - readJSONL(path)
 *   Fully CJS and compatible with Macro Collector architecture.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const parquet = require("parquetjs-lite");
const logger = require("../utils/logger.cjs");

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write Parquet file
 */
async function writeParquet(filePath, rows) {
  ensureDir(path.dirname(filePath));

  if (!rows || rows.length === 0) {
    logger.warn("writeParquet: no rows provided.");
    return;
  }

  // Build schema dynamically from first row
  const schemaDef = {};
  for (const key of Object.keys(rows[0])) {
    schemaDef[key] = { type: "UTF8" };
  }

  const schema = new parquet.ParquetSchema(schemaDef);
  const writer = await parquet.ParquetWriter.openFile(schema, filePath);

  for (const r of rows) {
    await writer.appendRow(r);
  }

  await writer.close();
  logger.success("Parquet written: " + filePath);
}

/**
 * Read Parquet file
 */
async function readParquet(filePath) {
  if (!fs.existsSync(filePath)) {
    logger.warn("readParquet: file not found → " + filePath);
    return [];
  }

  const reader = await parquet.ParquetReader.openFile(filePath);
  const cursor = reader.getCursor();
  const rows = [];

  let record;
  while ((record = await cursor.next())) {
    rows.push(record);
  }

  await reader.close();
  return rows;
}

/**
 * Append record to JSONL live stream
 */
function appendLive(streamName, record) {
  const dir = path.join(__dirname, "..", "live");
  ensureDir(dir);

  const filePath = path.join(dir, `${streamName}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n");

  logger.info(`Live JSONL appended → ${streamName}`);
}

/**
 * Read JSONL file
 */
function readJSONL(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const rows = [];

  for (const line of lines) {
    if (line.trim()) {
      rows.push(JSON.parse(line));
    }
  }

  return rows;
}

module.exports = {
  writeParquet,
  readParquet,
  appendLive,
  readJSONL
};

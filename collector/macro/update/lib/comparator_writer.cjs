/**
 * ============================================================
 * Macro Live Update System — Module 4: Comparator + Writer
 * File: collector/macro/update/lib/comparator_writer.cjs
 *
 * Merges the normalized data (normalized/<source>/{series,data}.csv)
 * into the 12M-row final database (collector/macro/db/macro.db) with
 * the exact revision semantics of the initial DB build:
 *
 *   case 1 brand-new observation        -> INSERT (revision_id = 1)
 *   case 2 revised observation          -> UPDATE old version (valid_to = today)
 *                                          then INSERT new revision
 *                                          (revision_id = max+1, valid_from = today)
 *   case 3 unchanged duplicate          -> IGNORE (idempotent)
 *
 * Performance: the merge only touches the series_ids present in the
 * normalized staging set (indexed lookup), never a full-table scan,
 * so it stays fast on a 12M-row database.
 *
 * The "only existing series" filter (default ON) guarantees that a
 * source update never injects brand-new unknown series into the DB —
 * only series already tracked are refreshed.
 * ============================================================
 */
const fs = require("fs");
const path = require("path");

const { DB_PATH, NORMALIZED_DIR, SOURCE_TO_DATASET } = require("./paths.cjs");
const { runScript, query } = require("./sqlite.cjs");
const logger = require("./update_logger.cjs");

const TODAY = new Date().toISOString().slice(0, 10);

/** SQL string literal quoting. */
function quote(v) {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/**
 * Build the incremental merge SQL for one source.
 * @param {object} cfg { source, sourceId, seriesCsv, dataCsv, onlyExisting }
 */
function buildMergeSql(cfg) {
  const importSeries = fs.existsSync(cfg.seriesCsv) && fs.statSync(cfg.seriesCsv).size > 0;
  const importData = fs.existsSync(cfg.dataCsv) && fs.statSync(cfg.dataCsv).size > 0;

  let sql = "";
  sql += `PRAGMA synchronous = OFF;\n`;
  sql += `PRAGMA temp_store = FILE;\n`;
  sql += `PRAGMA cache_size = -100000;\n`;
  sql += `BEGIN;\n`;

  // ---- 0) temp tables for the normalized payload ------------------
  sql += `DROP TABLE IF EXISTS series_upd;\n`;
  sql += `DROP TABLE IF EXISTS staging_upd;\n`;
  sql += `CREATE TABLE series_upd (series_id TEXT, dataset TEXT, country TEXT, indicator TEXT, frequency TEXT, unit TEXT, source TEXT);\n`;
  sql += `CREATE TABLE staging_upd (series_id TEXT, date TEXT, value REAL, loaded_on TEXT);\n`;

  if (importSeries) sql += `.import --csv ${cfg.seriesCsv} series_upd\n`;
  if (importData) sql += `.import --csv ${cfg.dataCsv} staging_upd\n`;

  // ---- 1) register (or skip) new series ----------------------------
  // onlyExisting=true  -> only insert series that already exist
  //                       (new series rows are effectively ignored)
  // onlyExisting=false -> insert any new series identity
  sql += `INSERT OR IGNORE INTO series(series_id, dataset, country, indicator, frequency, unit, source)\n`;
  sql += `SELECT series_id, dataset, country, indicator, frequency, unit, source FROM series_upd\n`;
  if (cfg.onlyExisting) {
    sql += `WHERE EXISTS (SELECT 1 FROM series s WHERE s.series_id = series_upd.series_id);\n`;
  } else {
    sql += `;\n`;
  }
  sql += `DROP TABLE series_upd;\n`;

  // ---- 2) de-dup staging on (series_id, date) - first row wins -----
  sql += `CREATE TABLE staging_upd2 (\n`;
  sql += `  series_id TEXT, date TEXT, value REAL, loaded_on TEXT,\n`;
  sql += `  PRIMARY KEY (series_id, date)\n);\n`;
  sql += `INSERT OR IGNORE INTO staging_upd2(series_id, date, value, loaded_on)\n`;
  sql += `SELECT series_id, date, value, loaded_on FROM staging_upd ORDER BY rowid;\n`;
  sql += `DROP TABLE staging_upd;\n`;
  sql += `ALTER TABLE staging_upd2 RENAME TO staging_upd;\n`;
  sql += `CREATE INDEX idx_staging_upd_sd ON staging_upd(series_id, date);\n`;

  // ---- 3) only-existing filter on observations ----------------------
  if (cfg.onlyExisting) {
    sql += `DELETE FROM staging_upd WHERE series_id NOT IN (SELECT series_id FROM series);\n`;
  }

  // ---- 4) snapshot the CURRENT state of the affected series ---------
  sql += `CREATE TEMP TABLE latest_upd AS\n`;
  sql += `SELECT series_id, date,\n`;
  sql += `       MAX(revision_id) AS max_rev,\n`;
  sql += `       MAX(CASE WHEN valid_to IS NULL THEN value END) AS open_value\n`;
  sql += `FROM data\n`;
  sql += `WHERE series_id IN (SELECT DISTINCT series_id FROM staging_upd)\n`;
  sql += `GROUP BY series_id, date;\n`;

  // ---- 5) close superseded revisions (case 2 part A) ----------------
  sql += `UPDATE data\n`;
  sql += `SET valid_to = ${quote(TODAY)}\n`;
  sql += `WHERE valid_to IS NULL\n`;
  sql += `  AND series_id IN (SELECT DISTINCT series_id FROM staging_upd)\n`;
  sql += `  AND EXISTS (\n`;
  sql += `    SELECT 1 FROM staging_upd s\n`;
  sql += `    WHERE s.series_id = data.series_id AND s.date = data.date AND s.value != data.value\n`;
  sql += `  );\n`;

  // ---- 6) insert new + revised observations --------------------------
  sql += `INSERT INTO data(series_id, date, value, revision_id, valid_from, valid_to)\n`;
  sql += `SELECT s.series_id, s.date, s.value,\n`;
  sql += `       COALESCE(l.max_rev, 0) + 1,\n`;
  sql += `       s.loaded_on, NULL\n`;
  sql += `FROM staging_upd s\n`;
  sql += `LEFT JOIN latest_upd l ON l.series_id = s.series_id AND l.date = s.date\n`;
  sql += `WHERE l.open_value IS NULL OR l.open_value != s.value;\n`;

  // ---- 7) track the source freshness ---------------------------------
  sql += `UPDATE sources SET last_update = ${quote(TODAY)} WHERE source_id = ${quote(cfg.sourceId)};\n`;

  // ---- cleanup ---------------------------------------------------------
  sql += `DROP TABLE staging_upd;\n`;
  sql += `DROP TABLE latest_upd;\n`;
  sql += `COMMIT;\n`;
  return sql;
}

/**
 * Run the comparator + writer for one source.
 * @param {string} source FRED | OECD | EUROSTAT | IMF | BIS | WORLD_BANK
 * @param {object} [opts] { onlyExisting = true, dryRun = false }
 */
async function runComparatorWriter(source, opts = {}) {
  const onlyExisting = opts.onlyExisting !== false; // default ON
  const sourceId = SOURCE_TO_DATASET[source];
  const seriesCsv = path.join(NORMALIZED_DIR[source], "series.csv");
  const dataCsv = path.join(NORMALIZED_DIR[source], "data.csv");

  const dataSize = fs.existsSync(dataCsv) ? fs.statSync(dataCsv).size : 0;
  if (dataSize === 0) {
    logger.info(`[${source}] no normalized data — writer skipped`);
    return { source, ok: true, inserted: 0, updated: 0, ignored: 0, skipped: true };
  }

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`database not found: ${DB_PATH}`);
  }

  const sql = buildMergeSql({ source, sourceId, seriesCsv, dataCsv, onlyExisting });

  if (opts.dryRun) {
    logger.info(`[${source}] (dry-run) merge SQL built, not executed`);
    return { source, ok: true, dryRun: true, sql };
  }

  const started = Date.now();
  await runScript(sql, DB_PATH);

  const stats = {
    source,
    ok: true,
    onlyExisting,
    elapsedSec: Number(((Date.now() - started) / 1000).toFixed(1)),
  };

  logger.success(`[${source}] merged into DB in ${stats.elapsedSec}s (onlyExisting=${onlyExisting})`);
  return stats;
}

module.exports = { runComparatorWriter, buildMergeSql };



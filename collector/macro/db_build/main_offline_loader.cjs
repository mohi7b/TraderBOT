
/**
 * ============================================================
 * Macro DB Pipeline - main offline loader
 * File: collector/macro/db_build/main_offline_loader.cjs
 *
 * Builds collector/macro/db/macro.db directly from the 6 offline
 * CSV folders:
 *   offline/bis, offline/imf, offline/worldbank,
 *   offline/oecd, offline/fred, offline/eurostat
 *
 * Pipeline:
 *   1. Stream-parse every CSV (memory-bounded, low RAM machine)
 *   2. Normalize each record -> series + observations
 *   3. Write bulk temp CSV files (series.csv + staging.csv)
 *   4. Bulk-import into SQLite via `sqlite3 .import`
 *   5. Apply the revision / time-validity merge
 *      - brand new period      -> INSERT with revision_id = 1
 *      - unchanged value       -> ignored (idempotent)
 *      - changed value         -> close old version (valid_to = today)
 *                                 then INSERT new revision
 *   6. Finalize (indexes already present, ANALYZE, optional VACUUM)
 *
 * Usage:
 *   node collector/macro/db_build/main_offline_loader.cjs [--fresh] [--vacuum] [--max-files=N]
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { parse } = require("csv-parse");
const logger = require("../utils/logger.cjs");
const {
  SOURCES,
  BIS_INDICATORS,
  BIS_MEASURE_INDICATORS,
  bisIndicator,
  COUNTRY_COLS,
  isDateToken,
  toNumber,
  frequencyCode,
  normalizeDate,
  makeSeriesId,
  countryToISO3,
  csvEscape,
} = require("./normalize.cjs");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "db", "macro.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const TMP_DIR = path.join(__dirname, "tmp");
const TODAY = new Date().toISOString().slice(0, 10); // valid_from / loaded_on

// ------------------------------------------------------------
// Source configuration
// ------------------------------------------------------------
const SOURCE_DIRS = [
  { dataset: "BIS",      dir: path.join(ROOT, "offline", "bis"),       kind: "bis",       recursive: true,  skip: null },
  { dataset: "IMF",      dir: path.join(ROOT, "offline", "imf"),       kind: "imf",       recursive: false, skip: /_sdmx_datamapper\.csv$/i },
  { dataset: "WB",       dir: path.join(ROOT, "offline", "worldbank"), kind: "worldbank", recursive: true,  skip: null },
  { dataset: "OECD",     dir: path.join(ROOT, "offline", "oecd"),      kind: "tidy",      recursive: false, skip: null },
  { dataset: "FRED",     dir: path.join(ROOT, "offline", "fred"),      kind: "tidy",      recursive: false, skip: null },
  { dataset: "EUROSTAT", dir: path.join(ROOT, "offline", "eurostat"),  kind: "tidy",      recursive: false, skip: null },
  { dataset: "OWID",     dir: path.join(ROOT, "offline", "owid"),      kind: "owid",      recursive: false, skip: null },
];

/** SQL string literal quoting */
function quote(v) {
  if (v == null) return "NULL";
  const s = String(v).replace(/'/g, "''");
  return "'" + s + "'";
}

/** Recursively list CSV files under a directory (sorted). */
function listCsvs(dir, { recursive = false, skip = null } = {}) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (recursive) walk(full);
      } else if (/\.csv$/i.test(ent.name)) {
        if (skip && skip.test(ent.name)) continue;
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Stream a CSV file row-by-row with column-name indexing.
 * Memory-bounded: only one row object is alive at a time.
 */
function eachCsvRow(filePath, onRow) {
  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(filePath).pipe(
      parse({
        bom: true,
        columns: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      })
    );
    parser.on("data", (row) => {
      try {
        onRow(row);
      } catch (e) {
        parser.destroy(e);
      }
    });
    parser.on("error", reject);
    parser.on("end", resolve);
  });
}

// ------------------------------------------------------------
// Out - collects normalized series + observations into bulk CSV files
// ------------------------------------------------------------
class Out {
  constructor() {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    this.seriesPath = path.join(TMP_DIR, "series.csv");
    this.stagingPath = path.join(TMP_DIR, "staging.csv");
    fs.writeFileSync(this.seriesPath, "");
    fs.writeFileSync(this.stagingPath, "");
    this.seriesFile = fs.createWriteStream(this.seriesPath, { flags: "a" });
    this.stagingFile = fs.createWriteStream(this.stagingPath, { flags: "a" });
    this.seriesSeen = new Set();
    this.seriesBuf = [];
    this.stagingBuf = [];
    this.seriesRows = 0;
    this.stagingRows = 0;
  }

  addSeries(s) {
    if (this.seriesSeen.has(s.series_id)) return; // de-dup series identity
    this.seriesSeen.add(s.series_id);
    this.seriesBuf.push(
      [s.series_id, s.dataset, s.country, s.indicator, s.frequency, s.unit, s.source]
        .map(csvEscape)
        .join(",")
    );
    this.seriesRows++;
    if (this.seriesBuf.length >= 2000) this.flushSeries();
  }

  addData(d) {
    this.stagingBuf.push([d.series_id, d.date, d.value, TODAY].map(csvEscape).join(","));
    this.stagingRows++;
    if (this.stagingBuf.length >= 10000) this.flushStaging();
  }

  flushSeries() {
    if (!this.seriesBuf.length) return;
    this.seriesFile.write(this.seriesBuf.join("\n") + "\n");
    this.seriesBuf = [];
  }

  flushStaging() {
    if (!this.stagingBuf.length) return;
    this.stagingFile.write(this.stagingBuf.join("\n") + "\n");
    this.stagingBuf = [];
  }

  async close() {
    this.flushSeries();
    this.flushStaging();
    await new Promise((res) => this.seriesFile.end(res));
    await new Promise((res) => this.stagingFile.end(res));
  }

  stats() {
    return { series: this.seriesRows, obs: this.stagingRows };
  }
}

// ------------------------------------------------------------
// Loaders
// ------------------------------------------------------------

/** IMF: ISO3,Country,IndicatorCode,Units,Scale,Year,Value  (annual) */
async function loadImfFile(filePath, out) {
  let csvRows = 0;
  await eachCsvRow(filePath, (row) => {
    csvRows++;
    const value = toNumber(row.Value);
    if (value == null) return;
    const country = String(row.ISO3 || "").trim().toUpperCase();
    const indicator = String(row.IndicatorCode || "").trim().toUpperCase();
    const year = String(row.Year || "").trim();
    if (!country || !indicator || !/^\d{4}$/.test(year)) return;
    const unit = String(row.Units || row.Scale || "").trim();
    const sid = makeSeriesId("IMF", country, indicator, "A");
    out.addSeries({ series_id: sid, dataset: "IMF", country, indicator, frequency: "A", unit, source: "IMF" });
    out.addData({ series_id: sid, date: year, value });
  });
  return csvRows;
}

/** OECD / FRED / Eurostat tidy: REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY */
async function loadTidyFile(dataset, filePath, out) {
  let csvRows = 0;
  await eachCsvRow(filePath, (row) => {
    csvRows++;
    const value = toNumber(row.OBS_VALUE);
    if (value == null) return;
    const freq = frequencyCode(row.FREQUENCY);
    if (!freq) return;
    const date = normalizeDate(row.TIME_PERIOD, freq);
    if (!date) return;
    let country = String(row.REF_AREA || "").trim().toUpperCase();
    if (!country) return;
    if (dataset === "EUROSTAT") country = countryToISO3(country);
    const indicator = String(row.INDICATOR || "").trim().toUpperCase();
    if (!indicator) return;
    const unit = String(row.UNIT || "").trim();
    const sid = makeSeriesId(dataset, country, indicator, freq);
    out.addSeries({ series_id: sid, dataset, country, indicator, frequency: freq, unit, source: dataset });
    out.addData({ series_id: sid, date, value });
  });
  return csvRows;
}

/** World Bank WDI wide: Country Code, Indicator Code, 1960..2025  (annual) */
const WB_YEAR_RE = /^(\d{4})$/;
async function loadWorldbankFile(filePath, out) {
  let csvRows = 0;
  await eachCsvRow(filePath, (row) => {
    csvRows++;
    const country = String(row["Country Code"] || "").trim().toUpperCase();
    const indicator = String(row["Indicator Code"] || "").trim().toUpperCase();
    if (!country || !indicator) return;
    const sid = makeSeriesId("WB", country, indicator, "A");
    out.addSeries({ series_id: sid, dataset: "WB", country, indicator, frequency: "A", unit: "", source: "WB" });
    for (const k of Object.keys(row)) {
      if (!WB_YEAR_RE.test(k.trim())) continue;
      const value = toNumber(row[k]);
      if (value == null) continue;
      out.addData({ series_id: sid, date: k.trim(), value });
    }
  });
  return csvRows;
}

/** BIS wide: dimension columns then date columns (melt)
 *
 * ⭐ Measure-aware (P0): within one BIS dump a country/frequency can have
 * SEVERAL measures, distinguished only by UNIT_MEASURE (WS_LONG_CPI:
 * 628 = index, 771 = YoY %). The indicator is therefore resolved **per row**
 * via `bisIndicator()` so the two measures get different series_ids and can
 * no longer collide under the staging "first value wins" rule.
 * See: MACRO_DATA_INVENTORY.md §5.
 */
async function loadBisFile(datasetCode, filePath, out) {
  let csvRows = 0;
  await eachCsvRow(filePath, (row) => {
    csvRows++;
    let country = "";
    let freq = "";
    let unit = "";
    let unitMeasure = "";
    for (const k of Object.keys(row)) {
      if (isDateToken(k)) continue;
      const v = String(row[k] ?? "").trim();
      if (!v) continue;
      if (!country && COUNTRY_COLS.includes(k)) country = v;
      if (!freq && k === "FREQ") freq = v;
      if (!unit && k === "UNIT_MEASURE") {
        unit = v;
        unitMeasure = v;
      }
    }
    if (!country) return;
    const f = frequencyCode(freq) || "U";
    // per-row, measure-aware indicator (CPI_IDX vs CPI_YOY for WS_LONG_CPI)
    const indicator = bisIndicator(datasetCode, unitMeasure);
    const sid = makeSeriesId("BIS", country, indicator, f);
    out.addSeries({ series_id: sid, dataset: "BIS", country, indicator, frequency: f, unit, source: "BIS" });
    for (const k of Object.keys(row)) {
      if (!isDateToken(k)) continue;
      const value = toNumber(row[k]);
      if (value == null) continue;
      const date = normalizeDate(k, f);
      if (!date) continue;
      out.addData({ series_id: sid, date, value });
    }
  });
  return csvRows;
}

/** BIS dataset code from the WS_*_csv_col / WS_*_csv_flat folder name */
function bisDatasetCode(csvPath) {
  const folder = path.basename(path.dirname(csvPath));
  return folder.replace(/_(csv_col|csv_flat)$/i, "");
}

/**
 * OWID grapher CSV (annual):
 *   Entity,Code,Year,CPI
 *   Australia,AUS,1960,7.96
 * - Code is ISO3 (matches core's country codes).
 * - One series per country: OWID.<ISO3>.CPI.A
 * - Stored fully separately from BIS/FRED/OECD monthly CPI (source isolation).
 */
async function loadOwidFile(filePath, out) {
  let csvRows = 0;
  await eachCsvRow(filePath, (row) => {
    csvRows++;
    const country = String(row.Code || "").trim().toUpperCase();
    const year = String(row.Year || "").trim();
    const value = toNumber(row.CPI);
    if (!country || !/^\d{4}$/.test(year) || value == null) return;
    const indicator = "CPI";
    const sid = makeSeriesId("OWID", country, indicator, "A");
    out.addSeries({
      series_id: sid,
      dataset: "OWID",
      country,
      indicator,
      frequency: "A",
      unit: "index_2010_100",
      source: "OWID",
    });
    out.addData({ series_id: sid, date: year, value });
  });
  return csvRows;
}

// ------------------------------------------------------------
// SQLite import + revision/time-validity merge
// ------------------------------------------------------------

/** Build the post-import merge SQL (revision + validity rules). */
function mergeSql() {
  return `
-- de-dup series identity
INSERT OR IGNORE INTO series(series_id, dataset, country, indicator, frequency, unit, source)
SELECT series_id, dataset, country, indicator, frequency, unit, source FROM series_raw;
DROP TABLE series_raw;

-- de-dup staging on (series_id, date) - first imported row wins.
-- Written into a fresh PK table (append-only, small rollback journal)
-- instead of deleting millions of rows in place (which OOMs the RAM
-- journal on this small host).
CREATE TABLE staging2 (
    series_id TEXT,
    date      TEXT,
    value     REAL,
    loaded_on TEXT,
    PRIMARY KEY (series_id, date)
);
INSERT OR IGNORE INTO staging2(series_id, date, value, loaded_on)
SELECT series_id, date, value, loaded_on FROM staging ORDER BY rowid;
DROP TABLE staging;
ALTER TABLE staging2 RENAME TO staging;
CREATE INDEX idx_staging_sd ON staging(series_id, date);

-- snapshot the current state of every (series_id, date) already in data
CREATE TEMP TABLE latest AS
SELECT series_id, date,
       MAX(revision_id) AS max_rev,
       MAX(CASE WHEN valid_to IS NULL THEN value END) AS open_value
FROM data
GROUP BY series_id, date;

-- 1) close superseded revisions: the same (series_id, date) got a NEW value
UPDATE data
SET valid_to = ${quote(TODAY)}
WHERE valid_to IS NULL
  AND EXISTS (
    SELECT 1 FROM staging s
    WHERE s.series_id = data.series_id
      AND s.date = data.date
      AND s.value != data.value
  );

-- 2) insert brand-new observations AND revisions of changed observations
--    (hash join against the latest snapshot -> no correlated subqueries)
INSERT INTO data(series_id, date, value, revision_id, valid_from, valid_to)
SELECT s.series_id, s.date, s.value,
       COALESCE(l.max_rev, 0) + 1,
       s.loaded_on, NULL
FROM staging s
LEFT JOIN latest l
  ON l.series_id = s.series_id AND l.date = s.date
WHERE l.open_value IS NULL OR l.open_value != s.value;

-- cleanup
DROP TABLE staging;
DROP TABLE latest;
`;
}

/**
 * Spawn sqlite3, apply schema, bulk-import the temp CSVs and run the merge.
 */
function importIntoDb(seriesCsv, stagingCsv, { vacuum = false } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("sqlite3", [DB_PATH], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.on("error", reject);
    proc.stderr.on("data", (d) => { stderr += d; process.stderr.write(d); });
    proc.stdout.on("data", (d) => process.stdout.write(d));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`sqlite3 exited with code ${code}\n${stderr}`));
      resolve();
    });

    const write = (sql) =>
      new Promise((res) => {
        if (proc.stdin.write(sql)) return res();
        proc.stdin.once("drain", res);
      });

    (async () => {
      // schema + indexes
      await write(fs.readFileSync(SCHEMA_PATH, "utf8") + "\n");

      // sources table
      let src = "BEGIN;\n";
      for (const [sid, s] of Object.entries(SOURCES)) {
        src +=
          `INSERT OR IGNORE INTO sources(source_id, name, url, update_frequency, last_update) VALUES ` +
          `(${quote(sid)}, ${quote(s.name)}, ${quote(s.url)}, ${quote(s.update_frequency)}, ${quote(TODAY)});\n`;
      }
      src += "COMMIT;\n";
      await write(src);

      // bulk imports (paths contain no spaces -> safe unquoted)
      await write(`.import --csv ${seriesCsv} series_raw\n`);
      await write(`.import --csv ${stagingCsv} staging\n`);

      // revision / validity merge
      await write(mergeSql());

      // speed indexes (created after the bulk merge for speed)
      await write("CREATE INDEX IF NOT EXISTS idx_series_id ON data(series_id);\n");
      await write("CREATE INDEX IF NOT EXISTS idx_date ON data(date);\n");
      await write("CREATE INDEX IF NOT EXISTS idx_data_series_date ON data(series_id, date);\n");

      if (vacuum) await write("VACUUM;\n");
      await write("ANALYZE;\n");

      proc.stdin.end();
    })().catch((e) => {
      proc.kill();
      reject(e);
    });
  });
}

/** Run a single query against the DB and return trimmed text. */
function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const q = spawn("sqlite3", [DB_PATH, sql], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    q.stdout.on("data", (d) => (out += d));
    q.stderr.on("data", (d) => (err += d));
    q.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `query failed (${code})`))
    );
  });
}

/** Remove the temporary bulk CSV files. */
function cleanupTmp() {
  for (const f of [path.join(TMP_DIR, "series.csv"), path.join(TMP_DIR, "staging.csv")]) {
    try { fs.unlinkSync(f); } catch {}
  }
}

// ------------------------------------------------------------
// Main build
// ------------------------------------------------------------

/**
 * Build collector/macro/db/macro.db from the 6 offline folders.
 */
async function buildDatabase({ fresh = false, vacuum = false, maxFiles = Infinity, only = null } = {}) {
  if (fresh) {
    for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
      try { fs.unlinkSync(f); } catch {}
    }
    logger.info("Removed existing macro.db (--fresh)");
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const out = new Out();
  const started = Date.now();

  // ---- step 1+2: stream-parse + normalize every CSV ----------------
  for (const cfg of SOURCE_DIRS) {
    if (only && cfg.dataset !== only) continue;
    logger.info(`[${cfg.dataset}] scanning ${cfg.dir}`);
    let files = listCsvs(cfg.dir, { recursive: cfg.recursive, skip: cfg.skip });
    if (cfg.dataset === "WB") files = files.filter((f) => path.basename(f) === "WDICSV.csv");
    if (files.length === 0) {
      logger.warn(`[${cfg.dataset}] no CSV files found - skipped`);
      continue;
    }
    if (files.length > maxFiles) files = files.slice(0, maxFiles);
    logger.info(`[${cfg.dataset}] found ${files.length} CSV file(s)`);

    for (const file of files) {
      const t0 = Date.now();
      let rows = 0;
      if (cfg.kind === "bis") rows = await loadBisFile(bisDatasetCode(file), file, out);
      else if (cfg.kind === "imf") rows = await loadImfFile(file, out);
      else if (cfg.kind === "worldbank") rows = await loadWorldbankFile(file, out);
      else if (cfg.kind === "owid") rows = await loadOwidFile(file, out);
      else rows = await loadTidyFile(cfg.dataset, file, out);
      logger.info(
        `[${cfg.dataset}] ${path.basename(file)}: parsed ${rows.toLocaleString()} csv rows, ` +
        `${out.stagingRows.toLocaleString()} obs staged (${((Date.now() - t0) / 1000).toFixed(1)}s)`
      );
    }
  }

  // ---- step 3+4: write bulk files, import, merge -------------------
  await out.close();
  const { series, obs } = out.stats();
  logger.info(`Normalization finished: ${series.toLocaleString()} series, ${obs.toLocaleString()} observations`);
  logger.info("Importing into SQLite and applying revision merge...");

  await importIntoDb(out.seriesPath, out.stagingPath, { vacuum });

  // ---- step 5: verify -------------------------------------------------
  const countsRaw = await runQuery(
    "SELECT 'series',(SELECT COUNT(*) FROM series)" +
    " UNION ALL SELECT 'data',(SELECT COUNT(*) FROM data)" +
    " UNION ALL SELECT 'sources',(SELECT COUNT(*) FROM sources);"
  );
  const counts = {};
  for (const line of countsRaw.split("\n")) {
    const [k, v] = line.split("|");
    if (k) counts[k] = Number(v);
  }
  const revisions = Number(
    await runQuery("SELECT COUNT(*) FROM data WHERE valid_to IS NOT NULL;")
  );

  cleanupTmp();

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  logger.success("Macro DB build complete ✔");
  logger.success(`DB file: ${DB_PATH}`);
  logger.success(`series=${counts.series}  data=${counts.data}  sources=${counts.sources}  revisions=${revisions}`);
  logger.success(`Elapsed: ${secs}s`);

  return {
    dbPath: DB_PATH,
    series: counts.series,
    data: counts.data,
    sources: counts.sources,
    revisions,
    elapsedSec: Number(secs),
  };
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {
    fresh: args.includes("--fresh"),
    vacuum: args.includes("--vacuum"),
    maxFiles: Infinity,
  };
  const mf = args.find((a) => a.startsWith("--max-files="));
  if (mf) opts.maxFiles = parseInt(mf.split("=")[1], 10);
  const only = args.find((a) => a.startsWith("--only="));
  if (only) opts.only = only.split("=")[1].toUpperCase();

  buildDatabase(opts)
    .then(() => process.exit(0))
    .catch((e) => {
      logger.error("Build failed: " + e.message);
      process.exit(1);
    });
}

module.exports = {
  buildDatabase,
  SOURCE_DIRS,
  DB_PATH,
  TODAY,
};





/**
 * ============================================================
 * BIS DB Pipeline - Build database
 * File: collector/macro/bis_build/build.cjs
 *
 *  1. Reads all *_csv_*.zip extracted under offline/bis_extracted/
 *  2. Parses each CSV (flat + col/wide) with csv-parse
 *  3. Normalizes every record via normalize.cjs
 *  4. Writes series + data into collector/macro/db/bis.db
 *
 * SQLite access: uses the system `sqlite3` CLI over stdin (no native binding
 * needed). The DB file is created at collector/macro/db/bis.db.
 *
 * Usage:
 *   node collector/macro/bis_build/build.cjs [--extract] [--fresh]
 *     --extract : run the extract step first
 *     --fresh   : delete an existing bis.db before building
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { parse } = require("csv-parse");
const { makeEmitter } = require("./normalize.cjs");
const { extractAll } = require("./extract.cjs");

const DB_PATH = path.join(__dirname, "..", "db", "bis.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const EXTRACTED = path.join(__dirname, "..", "offline", "bis_extracted");

function quote(v) {
  if (v == null) return "NULL";
  const s = String(v).replace(/'/g, "''");
  return "'" + s + "'";
}

/** List every .csv inside extracted dirs (recursively) */
function listCsvs() {
  if (!fs.existsSync(EXTRACTED)) return [];
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.csv$/i.test(ent.name)) out.push(full);
    }
  };
  walk(EXTRACTED);
  return out.sort();
}

/** Read first line of a CSV (the header) up to the first newline */
function readHeaderLine(file) {
  const fd = fs.openSync(file, "r");
  let bytes = Buffer.alloc(0);
  const buf = Buffer.alloc(65536);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, bytes.length)) > 0) {
    bytes = Buffer.concat([bytes, buf.subarray(0, n)]);
    const idx = bytes.indexOf(0x0a);
    if (idx >= 0) { fs.closeSync(fd); return bytes.subarray(0, idx).toString("utf8").replace(/^\uFEFF/, ""); }
    if (bytes.length > 2 * 1024 * 1024) break;
  }
  fs.closeSync(fd);
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}

/** Parse a CSV header line with csv-parse */
function parseHeaderLine(line) {
  return new Promise((resolve, reject) => {
    parse(line, { bom: true, relax_column_count: true, trim: false })
      .on("data", (r) => resolve(r))
      .on("error", reject);
  });
}

module.exports = { listCsvs, readHeaderLine, parseHeaderLine, quote, DB_PATH, SCHEMA_PATH, EXTRACTED, extractAll };

/**
 * Load one CSV file's data rows into the sqlite process by appending
 * SQL INSERT statements to the child's stdin. Buffers rows and flushes
 * in batches wrapped in transactions for speed.
 */
function loadFile(dbProc, file, dataset) {
  return new Promise(async (resolve, reject) => {
    try {
      const header = await parseHeaderLine(readHeaderLine(file));
      const emitter = makeEmitter(dataset, header);

      let seriesBuf = [];
      let dataBuf = [];
      let seriesCount = 0;
      let dataCount = 0;

      const flush = () => {
        if (seriesBuf.length || dataBuf.length) dbProc.stdin.write("BEGIN;\n");
        for (const s of seriesBuf) {
          dbProc.stdin.write(
            "INSERT OR IGNORE INTO series VALUES(" +
              quote(s.series_id) + "," + quote(s.dataset) + "," + quote(s.country) + "," +
              quote(s.indicator) + "," + quote(s.frequency) + "," + quote(s.unit) + "," +
              quote(s.description) + ");\n"
          );
        }
        for (const d of dataBuf) {
          dbProc.stdin.write(
            "INSERT OR IGNORE INTO data VALUES(" +
              quote(d.series_id) + "," + quote(d.date) + "," +
              (d.value == null ? "NULL" : String(d.value)) + ");\n"
          );
        }
        if (seriesBuf.length || dataBuf.length) dbProc.stdin.write("COMMIT;\n");
        seriesCount += seriesBuf.length;
        dataCount += dataBuf.length;
        seriesBuf = [];
        dataBuf = [];
      };

      const parser = fs.createReadStream(file).pipe(
        parse({ bom: true, relax_column_count: true, skip_empty_lines: true, columns: false })
      );

      parser.on("data", (row) => {
        const rec = emitter.emit(row);
        if (!rec) return;
        seriesBuf.push(rec.series);
        for (const o of rec.obs) dataBuf.push({ series_id: rec.series.series_id, date: o.date, value: o.value });
        if (seriesBuf.length >= 2000 || dataBuf.length >= 5000) flush();
      });
      parser.on("error", reject);
      parser.on("end", () => {
        flush();
        resolve({ file, dataset, series: seriesCount, data: dataCount, mode: emitter.mode });
      });
    } catch (e) {
      reject(e);
    }
  });
}

/** Spawn sqlite3, apply schema, return child */
function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const proc = spawn("sqlite3", [DB_PATH], { stdio: ["pipe", "pipe", "pipe"] });
  proc.on("error", (e) => { console.error("sqlite3 spawn error:", e.message); process.exit(1); });
  proc.stdin.write(".bail on\n");
  proc.stdin.write(fs.readFileSync(SCHEMA_PATH, "utf8"));
  proc.stdin.write("\n");
  return proc;
}

// Separate binary decision: load a CSV into the running sqlite child.
// This helper avoids duplicating the flush logic across files.

(async () => {
  const args = process.argv.slice(2);
  const useFresh = args.includes("--fresh");

  if (args.includes("--extract")) {
    console.log("▶ Step 1: extracting zip files...");
    const res = await extractAll(false);
    res.results.forEach((r) =>
      console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.zip}${r.error ? "  " + r.error : ""}`)
    );
    if (useFresh) { try { fs.unlinkSync(DB_PATH); } catch {} }
  }

  if (useFresh && !args.includes("--extract")) {
    try { fs.unlinkSync(DB_PATH); console.log("  removed existing bis.db (--fresh)"); } catch {}
  }

  console.log("▶ Step 2: locating CSVs...");
  const csvs = listCsvs();
  if (csvs.length === 0) {
    console.error("No CSVs found under " + EXTRACTED + ". Run with --extract first.");
    process.exit(1);
  }
  console.log(`  found ${csvs.length} CSV file(s)`);

  console.log("▶ Step 3: opening sqlite db at " + DB_PATH);
  const proc = openDb();
  proc.stdout.on("data", (d) => process.stdout.write(d));
  proc.stderr.on("data", (d) => process.stderr.write(d));

  console.log("▶ Step 4: loading CSVs...");
  const started = Date.now();
  const results = [];
  for (const file of csvs) {
    const rel = path.relative(EXTRACTED, file);
    const top = rel.split(path.sep)[0];
    const m = top.match(/^(.*)_csv_(?:col|flat)$/);
    const dataset = m ? m[1] : top;
    try {
      const r = await loadFile(proc, file, dataset);
      results.push(r);
      console.log(`  ✅ ${path.basename(file)}  [${r.mode}]  ${r.series} series, ${r.data} obs`);
    } catch (e) {
      results.push({ file, dataset, error: e.message });
      console.error(`  ❌ ${path.basename(file)}  ${e.message}`);
    }
  }

  console.log("▶ Step 5: finalize (ANALYZE / VACUUM)");
  proc.stdin.write("ANALYZE;\n");
  proc.stdin.write("VACUUM;\n");
  proc.stdin.end();

  proc.on("close", (code) => {
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nBuild finished in ${secs}s (sqlite exit ${code})`);
    const ok = results.filter((r) => !r.error).length;
    console.log(`Files processed: ${ok}/${results.length}`);
    results.filter((r) => r.error).forEach((r) => console.log("  failed:", r.file, r.error));

    // Sanity counts
    const q = spawn("sqlite3", [DB_PATH, "SELECT (SELECT count(*) FROM series),(SELECT count(*) FROM data);"], { stdio: ["ignore", "pipe", "pipe"] });
    q.stdout.on("data", (d) => console.log("DB counts -> series,data = " + d.toString().trim()));
    console.log("DB file:", DB_PATH);
  });
})();
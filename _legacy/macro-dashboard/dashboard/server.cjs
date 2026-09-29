/**
 * ============================================================
 * Macro Dashboard — static server
 * File: collector/macro/dashboard/server.cjs
 * ============================================================
 * Minimal HTTP server for the Macro Overview Dashboard.
 *
 *   - serves dashboard/index.html + dashboard/style.css
 *   - /api/latest -> for each of the 6 datasets, the most recent
 *     valid observation of every active series in core.db.
 *
 * Core DB layout (identical to macro.db):
 *   series: series_id | dataset | country | indicator | frequency | unit | source
 *   data:   series_id | date | value | revision_id | valid_from | valid_to
 *
 * The current (authoritative) version of an observation is the row
 * where valid_to IS NULL. Series metadata lives in `series`.
 *
 * Run:
 *   node dashboard/server.cjs            # default port 4001
 *   MACRO_DASH_PORT=4100 node dashboard/server.cjs
 * ============================================================
 */
"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");

const Database = require("better-sqlite3");
const DASH_ROOT = __dirname;                         // collector/macro/dashboard
const CORE_DB = path.join(DASH_ROOT, "..", "core_db", "core.db");
const PORT = Number(process.env.MACRO_DASH_PORT || 4001);

const DATASETS = ["BIS", "IMF", "WB", "OECD", "FRED", "EUROSTAT"];

// read-only, required to exist
const db = new Database(CORE_DB, { readonly: true, fileMustExist: true });

// Prepared statements (fixed SQL, bound values only).
const stmtSeries = db.prepare(
  `SELECT series_id, dataset, country, indicator, frequency, unit, source
     FROM series WHERE dataset = ? ORDER BY series_id ASC`
);
const stmtLastDate = db.prepare(
  `SELECT MAX(date) AS lastDate
     FROM data WHERE series_id = ? AND valid_to IS NULL`
);
const stmtVal = db.prepare(
  `SELECT value FROM data
     WHERE series_id = ? AND date = ? AND valid_to IS NULL
     ORDER BY revision_id DESC LIMIT 1`
);

/**
 * latestForDataset(dataset) -> [ { series_id, country, indicator,
 *   frequency, unit, source, date, value }, ... ]
 *
 * For every series in the dataset, resolves its most recent
 * authoritative period and the value at that instant.
 */
function latestForDataset(dataset) {
  const rows = stmtSeries.all(dataset);
  const out = [];
  for (const s of rows) {
    const last = stmtLastDate.get(s.series_id);
    if (!last || !last.lastDate) continue; // series with no published data
    const v = stmtVal.get(s.series_id, last.lastDate);
    if (!v) continue;
    out.push({
      series_id: s.series_id,
      country: s.country,
      indicator: s.indicator,
      frequency: s.frequency,
      unit: s.unit,
      source: s.source,
      date: last.lastDate,
      value: Number(v.value),
    });
  }
  // Most recent first; ties broken for stable output.
  out.sort((a, b) => {
    if (b.date !== a.date) return b.date < a.date ? -1 : 1;
    return a.series_id < b.series_id ? -1 : a.series_id > b.series_id ? 1 : 0;
  });
  return out;
}

/** Whole payload for /api/latest */
function buildPayload() {
  const byDataset = {};
  for (const d of DATASETS) byDataset[d] = latestForDataset(d);
  return {
    ok: true,
    db: "core",
    generated_at: new Date().toISOString(),
    datasets: DATASETS,
    by_dataset: byDataset,
  };
}

// ------------------------------------------------------------
// tiny static / json router
// ------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (url === "/api/latest") {
    try {
      const payload = buildPayload();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // static files
  let file = url === "/" || url === "/index.html" ? "index.html" : url.replace(/^\/+/, "");
  // keep to files in this dashboard folder only (no traversal)
  const safe = path.basename(file);
  const disk = path.join(DASH_ROOT, safe);
  if (!fs.existsSync(disk) || !fs.statSync(disk).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const ext = path.extname(safe).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(disk).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Macro dashboard at http://127.0.0.1:${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));

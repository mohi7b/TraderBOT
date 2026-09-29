"use strict";

/**
 * ============================================================
 * Macro Unit Diagnostic — distinct (dataset, indicator) level
 * File: collector/macro/tools/unit_audit_distinct.cjs
 * ============================================================
 * Scans the FULL macro database (db/macro.db) READ-ONLY and produces a
 * report aggregated at the *indicator-code* level (per dataset) — the
 * exact granularity a future "Unit Registry" needs: one canonical unit
 * per (dataset, code) rather than one row per country/frequency series.
 *
 * OUTPUT:
 *   - tools/unit_audit_out.json            distinct-code report
 *   - tools/unit_audit_summary.json        compact summary
 *   - tools/unit_audit_oecd_inconsistent_sample.json   OECD sample (30)
 *
 * Read-only: opens macro.db { readonly:true } — never writes the DB.
 *
 * Run:  node collector/macro/tools/unit_audit_distinct.cjs
 * ============================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;                                 // collector/macro/tools
const ROOT = path.join(HERE, "..");                      // collector/macro
const DB_PATH = path.join(ROOT, "db", "macro.db");
const OUT_FILE = path.join(HERE, "unit_audit_out.json");
const SUMMARY_FILE = path.join(HERE, "unit_audit_summary.json");
const OECD_SAMPLE_FILE = path.join(HERE, "unit_audit_oecd_inconsistent_sample.json");
const OECD_SAMPLE_SIZE = 30;

const Database = require("better-sqlite3");

const registry = (() => {
  try {
    return require(path.join(ROOT, "backend", "catalog", "registry.cjs"));
  } catch (_) {
    return { SERIES_KIND_EXPLICIT: {}, INDICATOR_META: {} };
  }
})();
const SERIES_KIND_EXPLICIT = registry.SERIES_KIND_EXPLICIT || {};
const INDICATOR_META = registry.INDICATOR_META || {};

// reverse canonical map (code -> one canonical family)
const CODE_TO_CANON = (() => {
  const map = {};
  try {
    const cfg = require(path.join(ROOT, "core_db", "build", "build_core_db.cjs"));
    const ind = cfg.INDICATOR_MAP || {};
    for (const canon of Object.keys(ind)) {
      for (const ds of Object.keys(ind[canon])) {
        for (const c of ind[canon][ds] || []) if (!(c in map)) map[c] = canon;
      }
    }
  } catch (_) { /* best-effort */ }
  return map;
})();

const RATE_RE = /(\.ZG$|\.ZG\.|_YOY|_RPCH|_RP_CH|_PCH|_PCH_|\bPIPCH|ANR$|_RATE$|_RT_M$|_RT_Q$)/i;
const SHARE_RE = /\.ZS\./;

const trim = (s) => (s == null ? null : String(s).trim());
const isNumeric = (s) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);

function rawKind(rawUnit) {
  const r = trim(rawUnit);
  if (r == null || r === "") return { cls: "empty", raw: r };
  if (isNumeric(r)) return { cls: "numeric", raw: r };
  const lower = r.toLowerCase();
  if (/%|percent|pct/.test(lower)) return { cls: "rate", raw: r };
  if (/index|indices|100\s*=|=\s*100|yoy|year.on.year/i.test(lower)) return { cls: "index", raw: r };
  return { cls: "text", raw: r };
}

/** authoritative expected kind/unit for a (dataset, code) */
function expectedFor(dataset, code) {
  const exact = SERIES_KIND_EXPLICIT[`${dataset}::${code}`];
  if (exact) return { known: true, kind: exact.kind, expected: exact.display_unit, source: "catalog-explicit" };

  const canon = CODE_TO_CANON[code];
  if (canon) {
    const meta = INDICATOR_META[canon];
    const hint = (meta && meta.unit_hint) || null;
    let kind = "rate";
    if (hint === "Index") kind = "index";
    else if (hint === "%") kind = "percent";
    else if (hint && hint.indexOf("%") === -1 && hint.indexOf("YoY") === -1) kind = "level";
    return { known: !!hint, kind, expected: hint, source: "canonical-family:" + canon };
  }
  if (RATE_RE.test(code)) return { known: true, kind: "rate", expected: "YoY %", source: "pattern-rate" };
  if (SHARE_RE.test(code)) return { known: true, kind: "percent", expected: "%", source: "pattern-share" };
  return { known: false, kind: "level", expected: null, source: "unknown" };
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    try { fs.writeFileSync(path.join(HERE, "_err.txt"), "macro.db not found: " + DB_PATH); } catch (_) {}
    console.error("macro.db not found:", DB_PATH);
    process.exit(1);
  }
  fs.mkdirSync(HERE, { recursive: true });

  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db.prepare(`SELECT series_id, dataset, country, indicator, frequency, unit FROM series`).all();
  db.close();

  // aggregate per (dataset::indicator)
  const byKey = new Map();
  for (const s of rows) {
    if (!s.indicator) continue;
    const key = s.dataset + "::" + s.indicator;
    let agg = byKey.get(key);
    if (!agg) {
      agg = { dataset: s.dataset, code: s.indicator, countries: new Set(), freqs: new Set(), unitMap: new Map(), rows: 0 };
      byKey.set(key, agg);
    }
    agg.rows += 1;
    agg.countries.add(s.country == null ? "" : String(s.country));
    agg.freqs.add(s.frequency);
    const text = trim(s.unit);
    const bucket = agg.unitMap.get(text == null ? "" : text) || { rows: 0 };
    bucket.rows += 1;
    agg.unitMap.set(text == null ? "" : text, bucket);
  }

  const problems = [];
  const byIssue = {};
  const byDataset = {};
  const oecdSample = [];

  for (const agg of byKey.values()) {
    const exp = expectedFor(agg.dataset, agg.code);
    if (!exp.known && agg.rows === 0) continue; // defensive

    const variants = [...agg.unitMap.entries()].map(([u, b]) => ({ unit: u === "" ? null : u, rows: b.rows }));
    const hasMissing = agg.unitMap.has("");
    // kinds of every stored unit text
    const stored = new Set();
    let onlyMissingNonNumeric = true;
    let hasNumeric = false;
    for (const [u] of agg.unitMap.entries()) {
      if (u === "") continue;
      const cls = rawKind(u).cls;
      stored.add(cls);
      if (cls === "numeric") { hasNumeric = true; onlyMissingNonNumeric = false; }
      else onlyMissingNonNumeric = false;
    }
    const numericOnly = hasNumeric && stored.size === 1;

    let issue = "ok";
    if (exp.known) {
      if (numericOnly) issue = "numeric";
      else if (exp.kind === "rate" && [...stored].includes("index")) issue = "inconsistent";
      else if (exp.kind === "index" && [...stored].includes("rate")) issue = "inconsistent";
      else if (hasMissing) issue = "missing";
    } else {
      if (numericOnly) issue = "numeric";
      else if (hasMissing) issue = "missing";
    }

    if (issue !== "ok") {
      byIssue[issue] = (byIssue[issue] || 0) + 1;
      byDataset[agg.dataset] = byDataset[agg.dataset] || {};
      byDataset[agg.dataset][issue] = (byDataset[agg.dataset][issue] || 0) + 1;

      const entry = {
        dataset: agg.dataset,
        code: agg.code,
        country_count: agg.countries.size,
        countries_sample: [...agg.countries].slice(0, 12),
        frequencies: [...agg.freqs].sort(),
        series_count: agg.rows,
        has_missing: hasMissing,
        unit_variants: variants.slice(0, 5),
        var_count: variants.length,
        issue,
        raw_unit_vs_expected: {
          stored_raw_units: variants.map((v) => v.unit).slice(0, 3),
          expected_unit: exp.expected,
        },
        expected_kind: exp.known ? exp.kind : null,
        expected_source: exp.source,
      };
      problems.push(entry);
      if (agg.dataset === "OECD" && issue === "inconsistent" && oecdSample.length < OECD_SAMPLE_SIZE) {
        oecdSample.push(entry);
      }
    }
  }

  problems.sort((a, b) => (a.dataset + a.code).localeCompare(b.dataset + b.code));

  const out = {
    _meta: {
      tool: "unit_audit_distinct.cjs",
      db: "db/macro.db",
      mode: "READ_ONLY",
      granularity: "per (dataset, indicator code)",
      scanned_series_rows: rows.length,
      distinct_codes: byKey.size,
      datasets_seen: [...new Set(rows.map((r) => r.dataset))].sort(),
      generated_at: new Date().toISOString(),
    },
    summary: { by_issue: byIssue, by_dataset: byDataset, distinct_codes_flagged: problems.length },
    problems,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  fs.writeFileSync(OECD_SAMPLE_FILE, JSON.stringify({
    note: "first " + OECD_SAMPLE_SIZE + " OECD codes flagged inconsistent (raw vs expected diff)",
    count: Math.min(oecdSample.length, OECD_SAMPLE_SIZE),
    items: oecdSample,
  }, null, 2), "utf8");

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify({
    meta: { scanned_rows: rows.length, distinct_codes: byKey.size },
    summary: out.summary,
    oecd_sample_count: oecdSample.length,
  }, null, 2), "utf8");

  console.log(JSON.stringify({
    scanned_rows: rows.length,
    distinct_codes: byKey.size,
    flagged_codes: problems.length,
    by_issue: byIssue,
    by_dataset: byDataset,
    oecd_inconsistent_sample: oecdSample.length,
  }));
}

if (require.main === module) {
  try { main(); } catch (e) {
    try { fs.writeFileSync(path.join(HERE, "_err.txt"), String((e && e.stack) || e), "utf8"); } catch (_) {}
    throw e;
  }
}
module.exports = { main, expectedFor, rawKind };

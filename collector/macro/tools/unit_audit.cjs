"use strict";

/**
 * ============================================================
 * Macro Unit Diagnostic (read-only audit) — tools/unit_audit.cjs
 * File: collector/macro/tools/unit_audit.cjs
 * ============================================================
 * Scans the FULL macro database (db/macro.db) and produces a
 * diagnostic report of every series whose `unit` column is missing,
 * null, empty, numeric, or inconsistent with the series kind that its
 * provider code implies (using the same catalogue rules that back
 * `seriesProfile` in backend/catalog/registry.cjs).
 *
 * PURPOSE
 *   This JSON report is the INPUT feed for the future "Unit Registry"
 *   (a canonical unit table keyed by dataset::code). It does NOT modify
 *   the database in any way — opened strictly READ-ONLY.
 *
 * OUTPUT
 *   - collector/macro/tools/unit_audit_out.json        (the report)
 *   - collector/macro/tools/unit_audit_summary.json    (compact summary)
 *
 * Run:
 *   node collector/macro/tools/unit_audit.cjs
 * ============================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");              // collector/macro
const DB_PATH = path.join(ROOT, "db", "macro.db");
const OUT_DIR = path.join(__dirname);                 // collector/macro/tools
const OUT_FILE = path.join(OUT_DIR, "unit_audit_out.json");
const SUMMARY_FILE = path.join(OUT_DIR, "unit_audit_summary.json");

const Database = require("better-sqlite3");

// --- catalogue reference (same rules as seriesProfile) -------------
const registry = require(path.join(ROOT, "backend", "catalog", "registry.cjs"));
const { SERIES_KIND_EXPLICIT } = registry;
const toISO3 = registry.toISO3;

// Canonical 13 families => which indicator *codes* they cover per
// dataset, taken from the same INDICATOR_MAP the picker uses. We use it
// to resolve a raw code back to its canonical family so we can apply the
// registry's per-family unit_hint when no exact "<dataset>::<code>" hit
// exists but the code clearly belongs to e.g. the CPI family.
const buildCfg = require(path.join(ROOT, "core_db", "build", "build_core_db.cjs"));
const { INDICATOR_MAP, DATASETS } = buildCfg;

// 1 remap: canonical family -> set of codes (all datasets), and reverse.
const CODE_TO_CANON = {};
for (const canon of Object.keys(INDICATOR_MAP)) {
  for (const ds of Object.keys(INDICATOR_MAP[canon])) {
    for (const c of INDICATOR_MAP[canon][ds] || []) {
      // a code is rarely used by two canonicals; first one wins, fine here
      if (!(c in CODE_TO_CANON)) CODE_TO_CANON[c] = canon;
    }
  }
}

// pattern heuristics (kept aligned with registry.cjs)
const RATE_RE = /(\.ZG$|\.ZG\.|_YOY|\b_YOY\b|_RPCH|_RP_CH|_PCH|_PCH_|\bPIPCH|ANR$|_RATE$|_RT_M$|_RT_Q$)/i;
const SHARE_RE = /\.ZS\./;

const trim = (s) => (s == null ? null : String(s).trim());
const isNumeric = (s) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);

function classifyRawUnit(rawUnit) {
  const r = trim(rawUnit);
  if (r == null || r === "") return "empty";
  if (isNumeric(r)) return "numeric";
  const lower = r.toLowerCase();
  if (/%|percent|pct/.test(lower)) return "rate";
  if (/index|indices|100\s*=\s*\d|=\s*100|\byoy\b|year.on.year|annual /.test(lower)) return "index";
  // generic english words e.g. "millions", "US dollars", "persons"
  return "text";
}

/**
 * Resolve best-known kind + expected unit for a (dataset, code).
 * Priority:
 *   1) explicit catalogue override (same table used by seriesProfile)
 *   2) code belongs to one of the 13 canonical families -> family unit_hint
 *   3) code pattern heuristics (rate/share)
 *   4) unknown -> { known:false }
 */
function expectedFor(dataset, code) {
  const exact = SERIES_KIND_EXPLICIT[`${dataset}::${code}`];
  if (exact) {
    return { known: true, kind: exact.kind, expected: exact.display_unit, source: "catalog-explicit" };
  }
  const canon = CODE_TO_CANON[code];
  if (canon) {
    const meta = registry.INDICATOR_META[canon];
    const hint = meta && meta.unit_hint;
    // canonical families that are really index-level stored as YoY targets:
    // CPI/CORE_CPI/PPI/GDP etc. Their unit_hint is "YoY %" -> their raw
    // series might legitimately be flagged "index" too; we mark accordingly.
    return {
      known: !!hint,
      kind: hint === "Index" ? "index" : "rate",
      kindHint: hint || null,
      canon,
      source: "canonical-family",
      expected: hint || null,
    };
  }
  if (RATE_RE.test(code)) {
    return { known: true, kind: "rate", expected: "YoY %", source: "pattern-rate" };
  }
  if (SHARE_RE.test(code)) {
    return { known: true, kind: "percent", expected: "%", source: "pattern-share" };
  }
  return { known: false, kind: "level", expected: null, source: "pattern-level" };
}

// A conflict is only asserted when we are confident the raw publisher
// unit contradicts the authoritative kind we know for this code
// (reduces false positives across raw wording variants).
function issueFor(rawTrim, rawClass, exp) {
  if (rawClass === "empty") return { issue: rawTrim == null ? "null" : "missing" };
  if (rawClass === "numeric") return { issue: "numeric" };
  if (!exp.known) return null; // cannot judge an unknown code's text

  // percentage class strongly implies a rate/percent kind
  const conflict =
    (exp.kind === "index" && rawClass === "rate") ||
    (exp.kind === "rate" && rawClass === "text");
  if (conflict) {
    return { issue: "inconsistent", expected: exp.expected || null };
  }
  if (exp.kind === "rate" && rawClass === "index") {
    return { issue: "inconsistent", expected: exp.expected || null };
  }
  return null;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("macro.db not found:", DB_PATH);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db.prepare(
    `SELECT series_id, dataset, country, indicator, frequency, unit
       FROM series`
  ).all();
  db.close();

  const problems = [];
  const byIssue = {};
  const byDataset = {};
  const counter = (d, issue) => {
    byDataset[d] = byDataset[d] || {};
    byDataset[d][issue] = (byDataset[d][issue] || 0) + 1;
    byIssue[issue] = (byIssue[issue] || 0) + 1;
  };

  for (const s of rows) {
    const rawNull = s.unit == null;
    const rawTrim = trim(s.unit);
    const rawClass = classifyRawUnit(s.unit);
    const exp = expectedFor(s.dataset, s.indicator);
    const judged = issueFor(rawTrim, rawClass, exp);
    if (!judged) continue;

    const iso3 = toISO3(s.country, s.dataset);
    const problem = {
      series_id: s.series_id,
      dataset: s.dataset,
      code: s.indicator,
      country: s.country,
      country_iso3: iso3,
      frequency: s.frequency,
      raw_unit: rawNull ? null : rawTrim,
      issue: judged.issue,
      // diff of the audit: what we expected vs what was stored
      expected_kind: exp.known ? (exp.kind || null) : null,
      expected_unit: (judged.expected && judged.expected != null) ? judged.expected
                    : (exp.known ? exp.expected : null),
      expected_source: exp.source,
    };
    problems.push(problem);
    counter(s.dataset, judged.issue);
  }

  // deterministic ordering: dataset, then raw code, then country
  problems.sort((a, b) =>
    (a.dataset + a.code + a.country_iso3).localeCompare(b.dataset + b.code + b.country_iso3)
  );

  const out = {
    _meta: {
      tool: "unit_audit.cjs",
      db: "db/macro.db",
      mode: "READ_ONLY — no database write",
      scanned_series: rows.length,
      datasets_seen: [...new Set(rows.map((r) => r.dataset))].sort(),
      report_for: "Unit Registry input",
      generated_at: new Date().toISOString(),
    },
    summary: {
      by_issue: byIssue,
      by_dataset: byDataset,
      total_problems: problems.length,
    },
    problems,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  const mini = {
    meta: out._meta,
    summary: out.summary,
    dataset_tally: byDataset,
  };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(mini, null, 2), "utf8");

  // if stdout is captured, print a compact digest as well
  console.log(JSON.stringify({ scanned: rows.length, problems: problems.length, by_issue: byIssue, by_dataset: byDataset }));
  return mini;
}

if (require.main === module) {
  main();
}
module.exports = { main, expectedFor, classifyRawUnit, issueFor };

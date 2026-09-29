"use strict";
const fs = require("fs");
const path = require("path");
const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const DB_PATH = path.join(ROOT, "db", "macro.db");
const OUT = "unit_registry.json";
const OUTB = "_bis_numeric_codes.txt";
const OUTM = "_manual_sample.txt";
const Database = require("better-sqlite3");

const registry = (function () {
  try { return require(path.join(ROOT, "backend", "catalog", "registry.cjs")); }
  catch (e) { return { SERIES_KIND_EXPLICIT: {}, INDICATOR_META: {} }; }
})();
const IM = registry.INDICATOR_META || {};

const CODE_TO_CANON = (function () {
  const m = {};
  try {
    const cfg = require(path.join(ROOT, "core_db", "build", "build_core_db.cjs"));
    const ind = cfg.INDICATOR_MAP || {};
    Object.keys(ind).forEach(function (canon) {
      Object.keys(ind[canon]).forEach(function (ds) {
        (ind[canon][ds] || []).forEach(function (c) { if (!(c in m)) m[c] = canon; });
      });
    });
  } catch (e) { /* ignore */ }
  return m;
})();

const JOIN = String.prototype.concat;
function isNum(u) { return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(String(u == null ? "" : u).trim()); }
function hasRatePat(c) { return /_YOY|YoY|ZG|PCPIPCH|NGDP_RPCH|RPCH|LUR|Unemployment|_RATE|_ANR/i.test(c); }

const DB = new Database(DB_PATH, { readonly: true, fileMustExist: true });
const rows = DB.prepare("SELECT dataset,country,indicator,unit FROM series").all();
DB.close();

const byKey = new Map();
rows.forEach(function (s) {
  if (!s.dataset || !s.indicator) return;
  const k = s.dataset + "::" + s.indicator;
  let a = byKey.get(k);
  if (!a) { a = { ds: s.dataset, code: s.indicator, cnt: 0, miss: 0, numeric: 0, nonEmpty: [], used: {} }; byKey.set(k, a); }
  a.cnt += 1;
  const t = s.unit == null ? "" : String(s.unit).trim();
  if (t === "") { a.miss += 1; } else { a.numeric += isNum(t) ? 1 : 0; if (!a.used[t]) { a.used[t] = 1; a.nonEmpty.push(t); } }
});

const out = [];
const totals = {};
const bis = [];
const manual = [];
const RESOLVE = new Set(["OECD::INDPRO"]);

byKey.forEach(function (a) {
  const key = a.ds + "::" + a.code;
  let row = { registry_key: key, dataset: a.ds, code: a.code, unit: null, kind: null, category: null, source: null, countries: null, series_rows: a.cnt, stored_missing: a.miss > 0, stored_nonempty: a.nonEmpty.slice(0, 5) };

  if (RESOLVE.has(key)) {
    row.category = "needs_resolution"; row.kind = "ambiguous(index_or_rate)"; row.source = "explicit";
  } else {
    const canon = CODE_TO_CANON[a.code];
    if (canon && IM[canon] && IM[canon].unit_hint) {
      const hint = IM[canon].unit_hint;
      row.category = "canonical"; row.source = "INDICATOR_META:" + canon;
      row.unit = hint; row.kind = hint === "Index" ? "index" : (hint === "%" ? "percent" : (String(hint).indexOf("YoY") >= 0 ? "rate" : "level"));
    } else if (a.ds === "BIS" && a.numeric > 0 && a.numeric === a.cnt - a.miss) {
      // authoritative override lives in backend registry (SERIES_KIND_EXPLICIT)
      const hit = registry.SERIES_KIND_EXPLICIT && registry.SERIES_KIND_EXPLICIT[key];
      if (hit) {
        row.category = "override_final"; row.unit = hit.display_unit; row.kind = hit.kind; row.source = "registry.SERIES_KIND_EXPLICIT";
      } else {
        row.category = "override"; row.unit = null; row.kind = null; row.source = "pending-authoritative-override(numeric)";
      }
    } else if (hasRatePat(a.code)) {
      row.category = "pattern_rate"; row.unit = "YoY %"; row.kind = "rate"; row.source = "pattern";
    } else {
      row.category = "needs_manual"; row.source = "unknown-code";
    }
  }

  out.push(row);
  totals[row.category] = (totals[row.category] || 0) + 1;
  if (row.category === "override") bis.push(row);
  if (row.category === "needs_manual") manual.push(row);
});

out.sort(function (x, y) { return (x.registry_key).localeCompare(y.registry_key); });
fs.writeFileSync(path.join(HERE, OUT), JSON.stringify({ _meta: { tool: "unit_registry_build", db: "db/macro.db", read_only: true, distinct_keys: out.length }, totals_by_category: totals, rows: out }, null, 2), "utf8");
fs.writeFileSync(path.join(HERE, OUTB), bis.map(function (r) { return JSON.stringify({ key: r.registry_key, code: r.code, stored: r.stored_nonempty, series: r.series_rows }); }).join("\n"), "utf8");
fs.writeFileSync(path.join(HERE, OUTM), manual.slice(0, 40).map(function (r) { return r.registry_key; }).join("\n"), "utf8");

console.log(JSON.stringify({ distinct: out.length, totals_by_category: totals, bis_numeric_codes: bis.map(function (r) { return r.code; }) }));
module.exports = { out };

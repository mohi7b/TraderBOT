"use strict";
/* ============================================================
 * unit_registry_resolve.cjs  (D3 — resolver v1)
 * Reads macro.db READ-ONLY, groups every distinct (dataset,code)
 * and, by code pattern + a small explicit domain table, assigns a
 * {unit, kind} to provider codes that were flagged needs_manual.
 * Unresolvable codes stay as-is (kind:null) and are reported so we
 * can iterate without guessing.
 * Output:
 *   tools/unit_registry_resolved.json
 *   tools/_manual_unresolved.txt (up to 120 representative rows)
 * ============================================================ */
const fs = require("fs");
const path = require("path");
const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const DB_PATH = path.join(ROOT, "db", "macro.db");
const Database = require("better-sqlite3");

// --- IMF suffix semantics (standard IMF/GFS/IFS vocabulary) --------
// `_PCH`  (P = percentage, CH = change) => annual % growth
// *_2_Q_PCH etc left as rate; `_GDP`/`_NGDP` denominators => "share of GDP"
// EER series are trade-weighted index (EREER/ENEER).
function imfRule(code) {
  const c = code.toUpperCase();
  if (/^(EREER|ENEER)/.test(c)) return { unit: "Index (EER)", kind: "index" };
  if (/(_PCH$|_PCH_)/.test(c)) return { unit: "YoY %", kind: "rate" };
  if (/(_GDP$|_NGDP$|_GDP_PT$|_NGDP_PT)/.test(c)) return { unit: "% of GDP", kind: "percent" };
  return null;
}

// --- a few safe explicit BIS broad-bucket labels (rare/clear) ------
const BIS_HEAD = {
  PROPERTY_PRICES:        { unit: "Index (Real Property Prices)", kind: "index" },
  CREDIT_GAP:             { unit: "% of trend GDP", kind: "percent" },
  DEBT_SERVICE_RATIO:     { unit: "% of GDP", kind: "percent" },
  GLI:                    { unit: "Index (Global Liquidity)", kind: "index" },
  DSR:                    { unit: "% of income", kind: "percent" },
};

function main() {
  if (!fs.existsSync(DB_PATH)) { console.error("missing db"); process.exit(1); }
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db.prepare("SELECT DISTINCT dataset, indicator FROM series").all();
  db.close();

  const resolved = [];
  const unresolved = [];
  const byDatasE = {};
  const bump = (ds, cat) => { byDatasE[ds] = byDatasE[ds] || { resolved: 0, unresolved: 0 }; byDatasE[ds][cat] += 1; };

  for (const r of rows) {
    if (!r.dataset || !r.indicator) continue;
    let cat = null;
    let hit = null;
    if (r.dataset === "IMF") {
      hit = imfRule(r.indicator);
      cat = hit ? "resolved" : "unresolved";
    } else if (r.dataset === "BIS") {
      const t = BIS_HEAD[r.indicator];
      hit = t || null; cat = t ? "resolved" : "unresolved";
    } else {
      cat = "unresolved"; hit = null; // catalog handles OECD/FRED/EUROSTAT core; WB mostly helper derivations
    }
    bump(r.dataset, cat);
    const row = { dataset: r.dataset, code: r.indicator, unit: hit ? hit.unit : null, kind: hit ? hit.kind : null };
    (cat === "resolved" ? resolved : unresolved).push(row);
  }
  resolved.sort((a, b) => (a.dataset + a.code).localeCompare(b.dataset + b.code));
  unresolved.sort((a, b) => (a.dataset + a.code).localeCompare(b.dataset + b.code));

  fs.writeFileSync(path.join(HERE, "unit_registry_resolved.json"),
    JSON.stringify({ _meta: { tool: "unit_registry_resolve.cjs v1" }, by_dataset: byDatasE, resolved, unresolved: unresolved.length }, null, 2), "utf8");
  fs.writeFileSync(path.join(HERE, "_manual_unresolved.txt"),
    unresolved.slice(0, 120).map((r) => r.dataset + "::" + r.code).join("\n"), "utf8");

  console.log(JSON.stringify({
    by_dataset: byDatasE,
    resolved_count: resolved.length,
    unresolved_count: unresolved.length,
    resolved_sample: resolved.slice(0, 8).map((r) => r.dataset + "::" + r.code + " -> [" + (r.unit || "") + "/" + (r.kind || "") + "]"),
    unresolved_top: unresolved.slice(0, 15).map((r) => r.dataset + "::" + r.code),
  }, null, 0));
}
if (require.main === module) { try { main(); } catch (e) { console.error((e && e.stack) || e); } }
module.exports = { main };

"use strict";

/**
 * ============================================================
 * Macro CLI (D2) — professional terminal viewer
 * File: collector/macro/cli.cjs
 * ============================================================
 * Single terminal entry that reuses the SAME dashboard runtime the REST
 * API uses (picker_lib / module builders). No parallel data logic.
 *
 * Usage:
 *   node cli.cjs groups                 -> list group keys/canonicals
 *   node cli.cjs view <group>           -> summary + ASCII table of series
 *        group in: 1A_inflation|1B_growth|1C_labor|inflation|growth|labor
 *   node cli.cjs raw <group>            -> print full group JSON (dev)
 *   node cli.cjs serve [port]           -> boot the shared http runtime
 *   node cli.cjs health                 -> quiet runtime ping
 *
 * The view is plain ASCII (no external libs). Every series row shows
 * unit/kind as resolved from the catalog.
 */

const path = require("path");
const { buildGroup } = require(path.join(__dirname, "backend", "picker.cjs"));

const GROUPS = {
  inflation: { key: "1A_inflation", canons: ["CPI", "CORE_CPI", "PPI", "GDP_DEFL"], title: "Inflation" },
  growth:    { key: "1B_growth",    canons: ["GDP", "IND_PRO", "RETAIL_SALES"], title: "Growth" },
  labor:     { key: "1C_labor",     canons: ["UNEMP", "EMP"], title: "Labor" },
};

function resolveGroup(arg) {
  const a = String(arg || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (GROUPS[a]) return GROUPS[a];
  if (a === "1ainflation") return GROUPS.inflation;
  if (a === "1bgrowth") return GROUPS.growth;
  if (a === "1clabor") return GROUPS.labor;
  return null;
}

function fmt(n, dec) {
  if (n == null || !Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1e6) return n.toExponential(2);
  const d = dec == null ? 2 : dec;
  return Number(n.toFixed(d)).toString();
}

function pad(s, w) {
  s = s == null ? "" : String(s);
  if (s.length > w) return s.slice(0, w);
  return s + " ".repeat(w - s.length);
}

function right(s, w) {
  s = s == null ? "" : String(s);
  if (s.length > w) return s.slice(0, w);
  return " ".repeat(w - s.length) + s;
}

function printTable(series) {
  const H = [
    { t: "Dataset", w: 10 }, { t: "Country", w: 6 }, { t: "Indicator", w: 11 },
    { t: "Kind", w: 7 }, { t: "Freq", w: 4 }, { t: "Value", w: 12 },
    { t: "MoM%", w: 8 }, { t: "YoY%", w: 8 }, { t: "Trend", w: 7 }, { t: "As of", w: 10 },
  ];
  const header = H.map((h) => pad(h.t, h.w)).join("  ");
  const sep = "-".repeat(header.length);
  const lines = [];
  lines.push(header + "\n" + sep);
  for (const s of series) {
    const l = s.latest || {};
    const cells = [
      pad(s.dataset, 10), pad((s.country && s.country.code) || "?", 6),
      pad((s.indicator && s.indicator.code) || "?", 11),
      pad(s.series_kind || "?", 7), pad(s.frequency || "?", 4),
      right(fmt(l.value, 2), 12), right(fmt(l.mom, 1), 8), right(fmt(l.yoy, 1), 8),
      pad((s.trend && s.trend.direction) || "-", 7), pad(l.date || "?", 10),
    ];
    lines.push(cells.join("  "));
  }
  return lines.join("\n");
}

function summaryLine(sum, key) {
  return [
    `[${key.key}] ${key.title}   trend=${sum.global_trend}`,
    `  avg_mom=${fmt(sum.avg_mom)}  avg_yoy=${fmt(sum.avg_yoy)}   ` +
      `rising=${sum.rising} falling=${sum.falling} flat=${sum.flat}`,
    `  countries=${JSON.stringify(sum.coverage ? sum.coverage.countries : [])}   ` +
      `as_of=${sum.coverage ? sum.coverage.as_of : "-"}`,
  ].join("\n");
}

function computeClean(payload) {
  const isOut = (s) => {
    const l = s.latest || {};
    return Math.abs(l.mom || 0) > 60 || Math.abs(l.yoy || 0) > 60;
  };

  // (E2) filter outliers BEFORE dedup so a broken twin can't survive
  const kept = payload.series.filter((s) => !isOut(s));

  // (E1) one series per country — keep freshest latest date
  const seen = new Map();
  for (const s of kept) {
    const cc = (s.country && s.country.code) || "?";
    const prev = seen.get(cc);
    if (!prev || (s.latest && s.latest.date) >= (prev.latest && prev.latest.date)) seen.set(cc, s);
  }
  const rows = [...seen.values()];

  // clean local summary from kept growth-like rows only
  const mom = [], yoy = [];
  const tally = { up: 0, down: 0, flat: 0 };
  const countries = new Set(), datasets = new Set();
  let asOf = null;
  for (const s of rows) {
    if (s.country && s.country.code) countries.add(s.country.code);
    if (s.dataset) datasets.add(s.dataset);
    const kind = s.series_kind;
    if (kind === "index" || kind === "percent" || kind === "rate") {
      if (Number.isFinite(s.latest.mom)) mom.push(s.latest.mom);
      if (Number.isFinite(s.latest.yoy)) yoy.push(s.latest.yoy);
    }
    const d = s.latest && s.latest.date;
    if (d && (!asOf || d > asOf)) asOf = d;
    if (s.trend && s.trend.direction) tally[s.trend.direction] += 1;
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  let global_trend = "mixed";
  const { up, down, flat } = tally;
  if (up + down + flat > 0) {
    if (up === 0 && down === 0) global_trend = "stable";
    else if (up === 0) global_trend = "cooling";
    else if (down === 0) global_trend = "heating";
    else {
      const tot = up + down, maj = Math.max(up, down);
      if (maj / tot >= 0.6) global_trend = up > down ? "heating" : "cooling";
    }
  }
  return {
    rows, avg_mom: avg(mom), avg_yoy: avg(yoy), global_trend,
    countries: [...countries].sort(), datasets: [...datasets].sort(), asOf,
    hidden: payload.series.length - kept.length,
  };
}

function doView(arg) {
  const g = resolveGroup(arg);
  if (!g) throw new Error(`Unknown group "${arg}". Use: inflation | growth | labor`);
  const payload = buildGroup(g.key, g.canons, { title: g.title });
  const clean = computeClean(payload);
  const out = [];
  out.push(`[${g.key}] ${g.title}   trend=${clean.global_trend}`);
  out.push(`  avg_mom=${fmt(clean.avg_mom)}  avg_yoy=${fmt(clean.avg_yoy)}`);
  out.push(
    `  countries=${JSON.stringify(clean.countries)}  datasets=${JSON.stringify(clean.datasets)}` +
      `  as_of=${clean.asOf}` +
      (clean.hidden ? `   (HIDDEN ${clean.hidden} outlier series)` : "")
  );
  out.push("");
  out.push(printTable(clean.rows));
  console.log(out.join("\n"));
}

function doRaw(arg) {
  const g = resolveGroup(arg);
  if (!g) throw new Error(`Unknown group: ${arg}`);
  const payload = buildGroup(g.key, g.canons, { title: g.title });
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

function doGroups() {
  const rows = Object.keys(GROUPS).map((k) => {
    const g = GROUPS[k];
    const p = buildGroup(g.key, g.canons, { title: g.title });
    const cov = p.summary && p.summary.coverage ? p.summary.coverage : null;
    return {
      key: g.key, slug: k, title: g.title,
      canons: g.canons,
      series: p.series_count,
      coverage_series: cov ? cov.series : 0,
      coverage_countries: cov ? cov.countries.length : 0,
      as_of: cov ? cov.as_of : null,
    };
  });
  console.log(JSON.stringify({ ok: 1, groups: rows }, null, 2));
}

async function main() {
  const [, , cmd, arg, third] = process.argv;
  try {
    if (cmd === "groups") return doGroups();
    if (cmd === "view") return doView(arg);
    if (cmd === "raw") return doRaw(arg);
    if (cmd === "serve") {
      const port = arg && /^\d+$/.test(arg) ? Number(arg) : undefined;
      const { start } = require(path.join(__dirname, "backend", "http.cjs"));
      start(port);
      return; // keep process alive via listening server
    }
    if (cmd === "health") {
      return console.log(JSON.stringify({ ok: 1, groups: Object.keys(GROUPS).map((k) => GROUPS[k].key) }));
    }
    console.log(
      "Usage:\n  node cli.cjs groups\n  node cli.cjs view <group>\n  node cli.cjs raw <group>\n  node cli.cjs serve [port]"
    );
  } catch (e) {
    console.error("CLI_ERROR:", (e && e.stack) || e);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { GROUPS, buildGroup, doView, resolveGroup };

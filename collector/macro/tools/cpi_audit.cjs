"use strict";
/**
 * ============================================================
 * Macro — CPI audit tool (Headline vs Core, 17 Tier-1/2 countries)
 * File: collector/macro/tools/cpi_audit.cjs
 * ============================================================
 * هدف: بازتولید دائمیِ ممیزی `CPI_YOY_DATA_AUDIT.md` از ردیف‌های واقعی
 * core.db + payload زندهٔ API، بدون نیاز به مرورگر.
 *
 * آینهٔ (mirror) قاعدهٔ فرانت‌اند است:
 *   frontend/lib/macro/cpi.ts → RAW_RATE_KINDS + detectRateLike/CPI_RATE_GUARD
 *   (rate ⇒ مقدار خام عیناً YoY؛ index/level ⇒ درصد تغییر)
 *
 * Usage (از داخل collector/macro):
 *   node tools/cpi_audit.cjs                    # DB inventory + verdict + Core gaps
 *   node tools/cpi_audit.cjs --payload          # payload زندهٔ API (default mode)
 *   node tools/cpi_audit.cjs --payload --mode=countries
 *   node tools/cpi_audit.cjs --kinds            # kind اعلامی registry برای هر سری
 *   node tools/cpi_audit.cjs --all              # همهٔ بخش‌ها
 *   node tools/cpi_audit.cjs --json             # خروجی ماشین‌خوان
 *
 * Exit code: 0 = سازگار · 1 = نقض واقعی (regression guard برای CI)
 * ============================================================
 */
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "core_db", "core.db");
const COUNTRIES_FILE = path.join(
  __dirname, "..", "core_db", "build", "filters", "countries.json",
);
const { INDICATOR_MAP } = require(
  path.join(__dirname, "..", "core_db", "build", "build_core_db.cjs"),
);

const BASE = process.env.MACRO_API_BASE || "http://127.0.0.1:4001";

// ---- همان ثابت‌های frontend/lib/macro/cpi.ts ------------------------
const RAW_RATE_KINDS = ["rate", "percent"];
const CPI_RATE_GUARD = {
  maxRateMedian: 60,
  maxPositiveStepShare: 0.85,
  minPoints: 24,
};

const COUNTRIES = JSON.parse(fs.readFileSync(COUNTRIES_FILE, "utf8"));

// ISO2 → ISO3 (BIS کد دوحرفی ذخیره می‌کند)
const BIS_ISO2 = {
  USA: "US", CHN: "CN", JPN: "JP", DEU: "DE", GBR: "GB", FRA: "FR",
  ITA: "IT", CAN: "CA", AUS: "AU", KOR: "KR", IND: "IN", TUR: "TR",
  MEX: "MX", BRA: "BR", RUS: "RU", SAU: "SA", ZAF: "ZA",
};
const ISO2_TO_ISO3 = Object.fromEntries(
  Object.entries(BIS_ISO2).map(([k, v]) => [v, k]),
);

// ------------------------------------------------------------------
// helpers (آینهٔ logic فرانت)
// ------------------------------------------------------------------
function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid];
  return (s[mid - 1] + s[mid]) / 2;
}

function positiveStepShare(values) {
  if (values.length < 2) return null;
  let up = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[i - 1]) up++;
  return up / (values.length - 1);
}

/**
 * آینهٔ detectRateLike در frontend/lib/macro/cpi.ts.
 * ورودی: آرایهٔ عددی مرتب‌شده بر اساس تاریخ (تضمین payload/DB).
 */
function detectRateLike(values, cfg = CPI_RATE_GUARD) {
  if (!values || values.length === 0) {
    return { isRate: false, reason: "empty", points: 0 };
  }
  if (values.length < cfg.minPoints) {
    return { isRate: false, reason: "insufficient-points", points: values.length };
  }
  const win = values.slice(-cfg.minPoints);
  const med = median(win.slice(-12));
  const share = positiveStepShare(win);
  if (med !== null && Math.abs(med) > cfg.maxRateMedian) {
    return { isRate: false, reason: "level-magnitude", points: values.length, med, share };
  }
  if (share !== null && share >= cfg.maxPositiveStepShare) {
    return { isRate: false, reason: "trending-level", points: values.length, med, share };
  }
  return { isRate: true, reason: "rate-magnitude", points: values.length, med, share };
}

function isPrecomputedRate(kind) {
  return RAW_RATE_KINDS.includes(kind);
}

/** تصمیم نهایی منبع YoY — همان resolveYoySource فرانت. */
function resolveYoySource(series) {
  if (isPrecomputedRate(series.series_kind)) return "raw";
  if (detectRateLike(series.history.full.map((p) => p.value)).isRate) return "raw";
  return "computed";
}

/** مسیر raw: مقدار خام عیناً YoY است (صفر محاسبه). */
function rawRatePoints(history) {
  return history.map((p) => ({ date: p.date, yoy: p.value }));
}

function offsetForFrequency(freq) {
  return freq === "M" ? 12 : freq === "Q" ? 4 : freq === "A" ? 1 : 12;
}

/** کلید «همان دوره، یک سال قبل» — آینهٔ priorYearKey در frontend/lib/macro/cpi.ts */
function priorYearKey(date) {
  const s = String(date == null ? "" : date).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${Number(m[1]) - 1}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${Number(m[1]) - 1}-${m[2]}`;
  m = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (m) return `${Number(m[1]) - 1}-Q${m[2].toUpperCase()}`;
  m = /^(\d{4})-S([1-2])$/i.exec(s);
  if (m) return `${Number(m[1]) - 1}-S${m[2]}`;
  m = /^(\d{4})$/.exec(s);
  if (m) return `${Number(m[1]) - 1}`;
  return null;
}

/**
 * مسیر computed: درصد تغییر روی سطح.
 * ⚠️ تطبیق **تاریخ‌محور** (نه آفست مکانی) — همان اصلاح P0 فرانت‌اند:
 * یک نقطهٔ غایب (مثلاً 2025-10 در شاخص CPI آمریکا) نباید مبنا را جابجا کند.
 */
function computeYoyRows(history, frequency) {
  const clean = history
    .filter((p) => Number.isFinite(p.value))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byDate = new Map(clean.map((p) => [p.date, p.value]));
  const out = [];
  for (const p of clean) {
    const key = priorYearKey(p.date);
    if (!key) continue;
    const prev = byDate.get(key);
    if (prev === undefined || !(prev > 0)) continue;
    const yoy = (p.value / prev - 1) * 100;
    if (Number.isFinite(yoy)) out.push({ date: p.date, yoy });
  }
  return out;
}

// ------------------------------------------------------------------
// بخش ۱ — موجودی DB خام (بدون API)
// ------------------------------------------------------------------
function dbInventory() {
  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = [];

  for (const [canon, perDataset] of Object.entries(INDICATOR_MAP)) {
    if (canon !== "CPI" && canon !== "CORE_CPI") continue;
    for (const [dataset, codes] of Object.entries(perDataset)) {
      if (!Array.isArray(codes) || codes.length === 0) continue;
      for (const code of codes) {
        const seriesRows = db
          .prepare(
            "SELECT series_id, country, frequency, unit FROM series WHERE dataset=? AND indicator=?",
          )
          .all(dataset, code);
        for (const s of seriesRows) {
          const iso3 =
            dataset === "BIS"
              ? ISO2_TO_ISO3[String(s.country).toUpperCase()] || s.country
              : s.country;
          const pts = db
            .prepare(
              "SELECT date, value FROM data WHERE series_id=? AND valid_to IS NULL ORDER BY date",
            )
            .all(s.series_id);
          const values = pts
            .filter((p) => p.value !== null && Number.isFinite(p.value))
            .map((p) => p.value);
          const det = detectRateLike(values);
          rows.push({
            canonical: canon,
            dataset,
            code,
            iso3,
            series_id: s.series_id,
            frequency: s.frequency,
            unit: s.unit,
            n: values.length,
            first: pts.length ? pts[0].date : null,
            last: pts.length ? pts[pts.length - 1].date : null,
            raw_last: values.length ? values[values.length - 1] : null,
            detected: det.isRate ? "rate" : "level",
            reason: det.reason,
            med_last12: det.med !== undefined ? det.med : null,
            pos_share: det.share !== undefined ? det.share : null,
          });
        }
      }
    }
  }
  db.close();
  return rows;
}

function printDbInventory(rows) {
  for (const canon of ["CPI", "CORE_CPI"]) {
    console.log(`\n##### DB INVENTORY — canonical ${canon} #####`);
    console.log(
      pad("ISO3", 5) + pad("dataset", 11) + pad("code", 16) + pad("freq", 5) +
      pad("n", 6) + pad("first", 10) + pad("last", 10) + pad("rawLast", 10) +
      pad("detected", 9) + pad("med12", 10) + "reason",
    );
    const list = rows
      .filter((r) => r.canonical === canon)
      .sort((a, b) => a.iso3.localeCompare(b.iso3) || a.dataset.localeCompare(b.dataset) || String(a.frequency).localeCompare(String(b.frequency)));
    if (list.length === 0) console.log("  (هیچ سری‌ای موجود نیست)");
    for (const r of list) {
      console.log(
        pad(r.iso3, 5) + pad(r.dataset, 11) + pad(r.code, 16) + pad(r.frequency, 5) +
        pad(r.n, 6) + pad(r.first || "-", 10) + pad(r.last || "-", 10) +
        pad(fmt(r.raw_last), 10) + pad(r.detected, 9) + pad(fmt(r.med_last12, 2), 9) + r.reason,
      );
    }
  }

  // ماتریس ۱۷ کشور
  console.log("\n##### PER-COUNTRY MATRIX (17 Tier-1/2) #####");
  console.log(pad("ISO3", 5) + pad("HEADLINE (best monthly)", 28) + pad("n", 6) + pad("CORE", 20) + "GAP");
  for (const iso of COUNTRIES) {
    const head = rows.filter(
      (r) => r.canonical === "CPI" && r.iso3 === iso && r.frequency === "M",
    ).sort((a, b) => b.n - a.n);
    const core = rows.filter((r) => r.canonical === "CORE_CPI" && r.iso3 === iso);
    const h = head[0];
    console.log(
      pad(iso, 5) +
      pad(h ? `${h.dataset}::${h.code}.M ${h.detected}` : "NONE", 28) +
      pad(h ? h.n : "-", 6) +
      pad(core.length ? `${core[0].dataset}::${core[0].code} n=${core[0].n}` : "NONE", 20) +
      (core.length ? "" : "<-- NO CORE DATA"),
    );
  }
}

// ------------------------------------------------------------------
// بخش ۲ — مطابقت kind اعلامی registry با واقعیت داده
// ------------------------------------------------------------------
function registryKinds() {
  const reg = require(path.join(__dirname, "..", "backend", "catalog", "registry.cjs"));
  const out = [];
  for (const [canon, perDataset] of Object.entries(INDICATOR_MAP)) {
    if (canon !== "CPI" && canon !== "CORE_CPI") continue;
    for (const [dataset, codes] of Object.entries(perDataset)) {
      for (const code of (codes || [])) {
        const p = reg.seriesProfile(dataset, code, canon);
        out.push({ canon, dataset, code, kind: p.kind, unit: p.display_unit, origin: p.origin });
      }
    }
  }
  return out;
}

function printRegistryKinds(kinds, rows) {
  console.log("\n##### REGISTRY DECLARED vs DETECTED (17 countries) #####");
  console.log(
    pad("canon", 10) + pad("series", 20) + pad("declared", 10) +
    pad("in data", 10) + pad("flag", 24) + "display_unit",
  );
  let mathRisk = 0;
  for (const k of kinds) {
    const mine = rows.filter(
      (r) => r.canonical === k.canon && r.dataset === k.dataset && r.code === k.code,
    );
    const detRates = mine.filter((r) => r.detected === "rate").length;
    const detLevels = mine.filter((r) => r.detected === "level").length;
    const inData = !mine.length
      ? "n/a"
      : detRates && detLevels
        ? "rate+level"
        : detRates
          ? "rate"
          : "level";

    // علم خطر فقط در جهت «مخربِ محاسبه»:
    //   declared index/level ولی داده نرخ است ⇒ YoY‌سازی دوباره عدد را خراب می‌کند.
    let flag = "ok";
    if (!mine.length) flag = "no series";
    else if (!isPrecomputedRate(k.kind) && detRates) {
      flag = "MATH-RISK (backend mislabel)";
      mathRisk++;
    } else if (isPrecomputedRate(k.kind) && !detRates && detLevels) {
      flag = "declared-rate-but-level-data";
    }

    console.log(
      pad(k.canon, 10) + pad(`${k.dataset}::${k.code}`, 20) + pad(k.kind, 10) +
      pad(inData, 10) + pad(flag, 24) + (k.unit || "-"),
    );
  }
  console.log(
    `\n  MATH-RISK entries: ${mathRisk}` +
      (mathRisk ? "  → فرانت‌اند با guard:\"cpi\" این‌ها را اصلاح می‌کند (سند CPI_YOY_DATA_AUDIT.md)." : ""),
  );
  return mathRisk;
}

function seriesYoyPoints(series) {
  const history = series.history.full;
  if (resolveYoySource(series) === "raw") return rawRatePoints(history);
  return computeYoyRows(history, series.frequency);
}

function fmt(v, d = 3) {
  return v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(d);
}

function pad(s, n) {
  return String(s).padEnd(n);
}

// ------------------------------------------------------------------
// بخش ۳ — payload زندهٔ API (همان چیزی که فرانت می‌گیرد)
// ------------------------------------------------------------------
async function fetchJson(pathname) {
  const url = `${BASE}${pathname}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function auditPayload(payload) {
  const series = payload.series.filter(
    (s) => s.indicator.code === "CPI" || s.indicator.code === "CORE_CPI",
  );
  const results = [];
  for (const s of series) {
    const values = s.history.full
      .filter((p) => Number.isFinite(p.value))
      .map((p) => p.value);
    const det = detectRateLike(values);
    const src = resolveYoySource(s);
    const rows = seriesYoyPoints(s);
    const legacy = computeYoyRows(s.history.full, s.frequency);
    const last = rows.length ? rows[rows.length - 1].yoy : null;
    const legacyLast = legacy.length ? legacy[legacy.length - 1].yoy : null;
    const rawLast = values.length ? values[values.length - 1] : null;

    const problems = [];
    if (rows.some((r) => !Number.isFinite(r.yoy))) problems.push("non-finite value");
    if (src === "raw" && last !== rawLast) problems.push("raw passthrough mismatch");
    if (src === "computed" && legacyLast !== last) problems.push("computed drift");

    results.push({
      iso3: s.country.code,
      dataset: s.dataset,
      indicator: s.indicator.code,
      declared: s.series_kind,
      detected: det.isRate ? "rate" : "level",
      n: values.length,
      raw_last: rawLast,
      kind_only: legacyLast,
      guarded: last,
      source: src,
      problem: problems.join("; "),
      kind_mismatch: !isPrecomputedRate(s.series_kind) && det.isRate,
    });
  }
  return results;
}

function printPayload(label, results) {
  console.log(`\n##### PAYLOAD AUDIT — ${label} #####`);
  console.log(
    pad("ISO3", 5) + pad("dataset", 11) + pad("ind", 10) + pad("declared", 9) +
    pad("detected", 9) + pad("rawLast", 10) + pad("kind-only", 11) + pad("guarded", 11) +
    pad("source", 9) + "status",
  );
  for (const r of results) {
    const status = r.problem ? `PROBLEM: ${r.problem}` : "OK";
    console.log(
      pad(r.iso3, 5) + pad(r.dataset, 11) + pad(r.indicator, 10) + pad(r.declared, 9) +
      pad(r.detected, 9) + pad(fmt(r.raw_last), 10) + pad(fmt(r.kind_only), 11) +
      pad(fmt(r.guarded), 11) + pad(r.source, 9) + status,
    );
  }
  const mismatches = results.filter((r) => r.kind_mismatch);
  const problems = results.filter((r) => r.problem);
  console.log(
    `\n  سری‌های بررسی‌شده: ${results.length} · raw: ${results.filter((r) => r.source === "raw").length}` +
    ` · computed: ${results.filter((r) => r.source === "computed").length}`,
  );
  console.log(
    `  kind mismatch (بک‌اند اشتباه برچسب زده، فرانت اصلاح می‌کند): ${mismatches.length}` +
    (mismatches.length ? ` → ${mismatches.map((m) => m.iso3).join(", ")}` : ""),
  );
  console.log(`  نقض واقعی (regression): ${problems.length}`);
  return problems.length;
}

// ------------------------------------------------------------------
// بخش ۴ — نمونهٔ خروجی پردازش‌شده (پس از عبور از لایهٔ تبدیل/Safeguard)
// ------------------------------------------------------------------
function r6(v) {
  return typeof v === "number" ? Number(v.toFixed(6)) : v;
}
function r2(v) {
  return typeof v === "number" ? Number(v.toFixed(2)) : v;
}

/** انتخاب سری هدف: اولویت BIS::CPI ماهانه، سپس هر سری CPI. */
function pickCpiSeries(payload, iso3) {
  const pool = payload.series.filter((s) => s.country.code === iso3);
  return (
    pool.find(
      (s) => s.dataset === "BIS" && s.indicator.code === "CPI" && s.frequency === "M",
    ) ||
    pool.find((s) => s.indicator.code === "CPI") ||
    null
  );
}

/** ساخت نمونهٔ کامل: ورودی خام → guard → ردیف‌های نهایی چارت. */
function buildSample(payload, iso3, label) {
  const s = pickCpiSeries(payload, iso3);
  if (!s) {
    return {
      country: iso3,
      payload: label,
      available_in_this_payload: false,
      note: "این کشور در این payload نیست (mode=countries را امتحان کنید).",
    };
  }

  const history = s.history.full;
  const values = history.map((p) => p.value);
  const det = detectRateLike(values);
  const source = resolveYoySource(s);
  const rows = seriesYoyPoints(s);
  const legacy = computeYoyRows(history, s.frequency);
  const nums = rows.map((r) => r.yoy);
  const tail = (a, n) => a.slice(-n);
  const last = tail(rows, 1)[0] || null;
  const rawLast = values.length ? values[values.length - 1] : null;

  return {
    country: iso3,
    payload: label,
    available_in_this_payload: true,
    series: {
      id: s.id,
      series_id: s.series_id,
      dataset: s.dataset,
      indicator: s.indicator.code,
      indicator_label: s.indicator.label,
      frequency: s.frequency,
      declared_series_kind: s.series_kind,
      declared_unit: s.unit,
      history_full_points: history.length,
      history_display_points: (s.history.display || []).length,
      first_date: history.length ? history[0].date : null,
      last_date: history.length ? history[history.length - 1].date : null,
      backend_latest_block: s.latest,
    },
    guard: {
      layer1_declared_rate: isPrecomputedRate(s.series_kind),
      layer2_detectRateLike: {
        isRate: det.isRate,
        reason: det.reason,
        points: det.points,
        last12_median: r6(det.med),
        positive_step_share: r6(det.share),
      },
      resolved_source: source,
    },
    raw_input_tail_SeriesPoint: tail(history, 5).map((p) => ({
      date: p.date,
      value: r6(p.value),
    })),
    processed_rows_YoyPoint_count: rows.length,
    processed_rows_head: rows.slice(0, 2).map((p) => ({ date: p.date, yoy: r6(p.yoy) })),
    processed_rows_tail: tail(rows, 12).map((p) => ({ date: p.date, yoy: r6(p.yoy) })),
    final_point: last ? { date: last.date, value: r6(last.yoy) } : null,
    lwc_time_conversion: "در چارت: TimeShift.closeSec(date) → UTCTimestamp",
    annualize_suppressed: source === "raw",
    sanity: rows.length
      ? {
          all_finite: nums.every((v) => Number.isFinite(v)),
          min_over_series: r2(Math.min(...nums)),
          max_over_series: r2(Math.max(...nums)),
          min_last12: r2(Math.min(...tail(nums, 12))),
          max_last12: r2(Math.max(...tail(nums, 12))),
        }
      : null,
    verification: {
      raw_last_value_exact: rawLast,
      processed_last_value_exact: last ? last.yoy : null,
      equals_raw_bitwise: !!last && last.yoy === rawLast,
      previously_buggy_value: legacy.length ? r6(legacy[legacy.length - 1].yoy) : null,
      note:
        source === "raw"
          ? "مقدار خام بک‌اند عیناً به‌عنوان YoY استفاده شده (صفر محاسبه)."
          : "سری سطح است ⇒ YoY با درصد تغییر نسبت به offset فرکانس محاسبه شده.",
    },
  };
}

function printSamples(samples) {
  let bad = 0;
  for (const smp of samples) {
    console.log(`\n##### SAMPLE — ${smp.country} · ${smp.payload} #####`);
    if (!smp.available_in_this_payload) {
      console.log(`  available: false — ${smp.note}`);
      continue;
    }
    const g = smp.guard;
    const v = smp.verification;
    console.log(`  series            : ${smp.series.series_id}  (${smp.series.dataset}::${smp.series.indicator}, ${smp.series.frequency})`);
    console.log(`  declared kind/unit: ${smp.series.declared_series_kind} / ${smp.series.declared_unit}`);
    console.log(`  points            : ${smp.series.history_full_points}  (${smp.series.first_date} … ${smp.series.last_date})`);
    console.log(`  layer1 (kind=rate): ${g.layer1_declared_rate}`);
    console.log(`  layer2 detect     : isRate=${g.layer2_detectRateLike.isRate} reason=${g.layer2_detectRateLike.reason} med12=${g.layer2_detectRateLike.last12_median} posShare=${g.layer2_detectRateLike.positive_step_share}`);
    console.log(`  resolved source   : ${g.resolved_source}${g.resolved_source === "raw" ? "  → صفر محاسبه، مقدار خام = YoY" : "  → درصد تغییر روی سطح"}`);
    console.log(`  rows              : ${smp.processed_rows_YoyPoint_count}   annualize_suppressed=${smp.annualize_suppressed}`);
    console.log(`  raw last / processed last: ${v.raw_last_value_exact} / ${v.processed_last_value_exact}  (bitwise equal: ${v.equals_raw_bitwise})`);
    console.log(`  previous buggy → fixed   : ${v.previously_buggy_value} → ${smp.final_point.value}`);
    console.log(`  last 6 rows        : ${smp.processed_rows_tail.slice(-6).map((p) => `${p.date}=${p.yoy}`).join("  ")}`);
    console.log(`  sanity             : finite=${smp.sanity.all_finite} range=[${smp.sanity.min_over_series}, ${smp.sanity.max_over_series}] last12=[${smp.sanity.min_last12}, ${smp.sanity.max_last12}]`);
    if (!v.equals_raw_bitwise && g.resolved_source === "raw") bad++;
  }
  return bad;
}
// ------------------------------------------------------------------
// main
// ------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const wantAll = args.includes("--all");
  const sampleArg = args.find((a) => a.startsWith("--sample="));
  const sampleIsos = sampleArg
    ? sampleArg
        .slice("--sample=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : null;
  const noFlags =
    args.filter(
      (a) => a.startsWith("--") && !a.startsWith("--mode=") && !a.startsWith("--sample="),
    ).length === 0;
  const modeArg = args.find((a) => a.startsWith("--mode="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : null;

  const doDb = wantAll || noFlags || args.includes("--db");
  const doKinds = wantAll || noFlags || args.includes("--kinds");
  // --sample نیازمند payload است
  const doPayload = wantAll || args.includes("--payload") || !!sampleIsos;

  const out = { db: null, kinds: null, payloads: [], samples: null, failures: 0 };
  const needDb = doDb || doKinds;
  const rows = needDb ? dbInventory() : [];
  out.db = needDb ? rows : null;
  if (doKinds) out.kinds = registryKinds();

  const payloadTargets = [];
  if (doPayload || wantAll) {
    payloadTargets.push(["default (mode=balanced)", "/api/inflation"]);
    payloadTargets.push([
      "mode=countries",
      `/api/inflation${mode ? `?mode=${mode}` : "?mode=countries"}`,
    ]);
  }

  if (!asJson) {
    if (doDb) printDbInventory(rows);
    if (doKinds) printRegistryKinds(out.kinds, rows);
  }

  const payloadCache = [];
  for (const [label, pathname] of payloadTargets) {
    let payload;
    try {
      payload = await fetchJson(pathname);
    } catch (err) {
      console.log(`\n##### PAYLOAD AUDIT — ${label} #####\n  SKIP: ${err.message}`);
      console.log("  (بک‌اند بالا نیست؟ → cd collector/macro && node backend/boot.cjs)");
      out.failures++;
      continue;
    }
    payloadCache.push({ label, pathname, payload });
    const res = auditPayload(payload);
    out.payloads.push({ label, pathname, results: res });
    if (!asJson) out.failures += printPayload(`${label} (${pathname})`, res);
  }

  // ---- نمونهٔ خروجی پردازش‌شده (--sample=ISO3,ISO3) ----
  if (sampleIsos) {
    const samples = [];
    for (const c of payloadCache) {
      for (const iso of sampleIsos) samples.push(buildSample(c.payload, iso, c.label));
    }
    if (asJson) {
      out.samples = samples;
    } else {
      out.failures += printSamples(samples);
    }
  }

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(
      out.failures === 0
        ? "\nRESULT: OK — هیچ نقض واقعی‌ای پیدا نشد."
        : `\nRESULT: ${out.failures} نقض واقعی (نیازمند بررسی).`,
    );
  }
  process.exit(out.failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("cpi_audit failed:", err && err.stack ? err.stack : err);
  process.exit(2);
});


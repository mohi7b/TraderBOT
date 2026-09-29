"use strict";
/**
 * ============================================================
 * گزارش جامع منابع — macro.db
 * File: collector/macro/tools/data_inventory/source_report.cjs
 * ------------------------------------------------------------
 * چه می‌کند: کل `db/macro.db` را (فقط خواندنی) اسکن می‌کند و یک
 * گزارش ساختاریافته به تفکیک ۷ منبع تولید می‌کند:
 *   §۱ فهرست کامل کدهای شاخص هر منبع (با تفکیک خانوادهٔ قیمتی)
 *   §۲ بررسی وجود زیرشاخص / هسته / وزن سبد (سه‌لایه: DB / فایل خام / دانلودر)
 *   §۳ پوشش ۱۷ کشور هدف به تفکیک منبع و نوع سری (Headline / Core / Sub)
 *   §۴ چه چیزی از دادهٔ موجود قابل استخراج است
 * اجرا:  cd collector/macro && node tools/data_inventory/source_report.cjs
 * خروجی: MACRO_SOURCE_INVENTORY.md  +  MACRO_SOURCE_INVENTORY.json   (ریشهٔ پروژه)
 * مبنا:  MACRO_DATA_INVENTORY.md · MACRO_INFLATION_COVERAGE.md
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const TOOL_DIR = __dirname;                                   // collector/macro/tools/data_inventory
const MACRO_ROOT = path.join(TOOL_DIR, "..", "..");           // collector/macro
const PROJECT_ROOT = path.join(MACRO_ROOT, "..", "..");       // TraderBOT
const DB_PATH = path.join(MACRO_ROOT, "db", "macro.db");
const OUT_MD = path.join(PROJECT_ROOT, "MACRO_SOURCE_INVENTORY.md");
const OUT_JSON = path.join(PROJECT_ROOT, "MACRO_SOURCE_INVENTORY.json");

// ۷ منبع داده‌ای. ⚠️ `DERIVED` این‌جا نیست: سری‌های محاسباتی فقط در `core.db`
// ساخته می‌شوند (در macro.db وجود ندارند) و در §۲.۶ همین گزارش فهرست می‌شوند.
const DATASETS = ["BIS", "IMF", "WB", "OECD", "FRED", "EUROSTAT", "OWID"];
const TARGET17 = require(path.join(MACRO_ROOT, "core_db", "build", "filters", "countries.json"));
// آینهٔ COUNTRY_ALIAS داخل build_core_db.cjs (آن ماژول این نگاشت را export نمی‌کند)
const BIS_ALIAS = {
  USA: "US", CHN: "CN", JPN: "JP", DEU: "DE", GBR: "GB", FRA: "FR", ITA: "IT", CAN: "CA",
  AUS: "AU", KOR: "KR", IND: "IN", TUR: "TR", MEX: "MX", BRA: "BR", RUS: "RU", SAU: "SA", ZAF: "ZA",
};
const BIS17 = TARGET17.map((c) => BIS_ALIAS[c] || c);

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

// ------------------------------------------------------------
// کاتالوگ رسمی WDI (کد -> نام شاخص) — مرجع داوری معنایی برای کدهای WB
// ------------------------------------------------------------
function loadWbCatalog() {
  const map = new Map();
  const file = path.join(MACRO_ROOT, "offline", "worldbank", "WDI_CSV", "WDISeries.csv");
  try {
    const { parse } = require("csv-parse/sync");
    const rows = parse(fs.readFileSync(file), {
      columns: true, bom: true, relax_column_count: true, skip_empty_lines: true,
    });
    for (const r of rows) {
      const code = String(r["Series Code"] || "").trim();
      if (code) map.set(code, String(r["Indicator Name"] || "").trim());
    }
  } catch (e) { /* کاتالوگ نیست → داوری خودکار انجام نمی‌شود */ }
  return map;
}
const WB_NAMES = loadWbCatalog();

// ------------------------------------------------------------
// خانواده‌بندی کدهای قیمتی — اولین تطابق برنده است
// ------------------------------------------------------------
const FAMILIES = [
  ["CORE",      /CORE|CPILFE|CPGRLE|CPHPLA|LFE|EXCL|_X_NRG|TXCP/i],
  ["SUB_ENERGY",/ENRG|ENERGY|FUEL|ELECTR|_GAS|OIL|CP045/i],
  ["SUB_FOOD",  /FOOD|CP01|ALCOHOL|BEVERAGE|TOBACCO/i],
  ["SUB_HOUSING",/HOUSING|RENT|SHELTER|UTILIT|WATER|CP04/i],
  ["SUB_OTHER", /CLOTH|HEALTH|EDUC|TRANSPORT|COMMUNIC|RECREAT|RESTAURANT|MISCELL|CP0[2-9]|CP1[0-2]/i],
  ["WEIGHTS",   /WEIGHT|WGT|BASKET|_IW|IWEIGHT|^HICP_IW|CPI_W_/i],
  ["HEADLINE",  /CPIAUCSL|CPI_IDX|CPI_YOY|^CPI$|\bCPI\b|HICP|PCPI|INFLATION/i],
  ["PPI",       /PPI|PRODUCER_PRICE/i],
  ["DEFLATOR",  /DEFL/i],
  ["PRICE_OTHER",/PRICE|\.PRI\.|REER|TERMS_OF_TRADE/i],
];
// خانواده‌هایی که «قیمتی بودن» خودشان جای داوری دارد
const PRICE_FAMILIES = ["HEADLINE", "CORE", "SUB_FOOD", "SUB_ENERGY", "SUB_HOUSING", "SUB_OTHER",
                        "WEIGHTS", "PPI", "DEFLATOR"];
// داوری معنایی: برای کدهای WB، نام رسمی WDI باید واژهٔ قیمتی داشته باشد؛
// وگرنه کد «مثبت کاذب» است (مثل IE.PPI.* = سرمایه‌گذاری، HD_HCIP_EDUC_* = شاخص سرمایهٔ انسانی).
const FP_REASONS = {};
const PRICE_WORDS = /price|inflation|deflator|\bcpi\b|consumer|cost of living/i;
function regexFamily(code) {
  for (const [name, re] of FAMILIES) if (re.test(code)) return name;
  return "OTHER";
}
function classify(code, dataset) {
  const fam = regexFamily(code);
  if (dataset === "WB" && PRICE_FAMILIES.includes(fam)) {
    const nm = WB_NAMES.get(code) || "";
    if (nm && !PRICE_WORDS.test(nm)) {
      FP_REASONS["WB::" + code] = nm;
      return "FALSE_POS";
    }
  }
  return fam;
}
const TYPE_OF_FAMILY = {
  CORE: "Core", SUB_ENERGY: "Sub", SUB_FOOD: "Sub", SUB_HOUSING: "Sub", SUB_OTHER: "Sub",
  WEIGHTS: "Weights", HEADLINE: "Headline", PPI: "PPI", DEFLATOR: "Deflator",
  PRICE_OTHER: "Price(other)", FALSE_POS: "—", OTHER: "—",
};


// ------------------------------------------------------------
// ۱) دیتابیس: آمار کل + فهرست کدها
// ------------------------------------------------------------
const dsStats = db.prepare(`
  SELECT dataset, COUNT(*) series, COUNT(DISTINCT country) countries,
         COUNT(DISTINCT indicator) indicators, COUNT(DISTINCT frequency) freqs
  FROM series GROUP BY dataset`).all();
const dsStatsMap = Object.fromEntries(dsStats.map((r) => [r.dataset, r]));

const obsStats = db.prepare(`
  SELECT s.dataset ds, COUNT(*) n
  FROM data d JOIN series s ON s.series_id = d.series_id
  GROUP BY s.dataset`).all();
const obsMap = Object.fromEntries(obsStats.map((r) => [r.ds, r.n]));

const allCodes = db.prepare(`
  SELECT dataset, indicator,
         COUNT(*) series, COUNT(DISTINCT country) countries,
         GROUP_CONCAT(DISTINCT frequency) freqs,
         GROUP_CONCAT(DISTINCT unit) units
  FROM series GROUP BY dataset, indicator`).all();
for (const r of allCodes) { r.family = classify(r.indicator, r.dataset); r.type = TYPE_OF_FAMILY[r.family]; }

const sources = db.prepare("SELECT * FROM sources").all();
const targets = db.prepare("SELECT * FROM inflation_targets").all();

// ------------------------------------------------------------
// ۲) پوشش ۱۷ کشور: جزئیات سری‌های قیمتی
// ------------------------------------------------------------
const priceCodes = allCodes.filter((r) => r.family !== "FALSE_POS" && r.family !== "OTHER");
const codeSet = new Set(priceCodes.map((r) => r.dataset + "\u0000" + r.indicator));

const seriesAll = db.prepare(`
  SELECT series_id, dataset, country, indicator, frequency, unit FROM series`).all();
const priceSeries = seriesAll.filter(
  (s) => codeSet.has(s.dataset + "\u0000" + s.indicator) &&
         (TARGET17.includes(s.country) || BIS17.includes(s.country))
);

// تعداد نقاط + بازهٔ زمانی برای هر سری قیمتی مرتبط با ۱۷ کشور
const stmtRange = db.prepare(`
  SELECT COUNT(*) n, MIN(date) mn, MAX(date) mx FROM data WHERE series_id = ?`);
for (const s of priceSeries) {
  const r = stmtRange.get(s.series_id) || { n: 0, mn: null, mx: null };
  s.n = r.n; s.mn = r.mn; s.mx = r.mx;
}

// ------------------------------------------------------------
// ۳) مقایسه با core.db (چه چیزی به چارت می‌رسد)
// ------------------------------------------------------------
let coreCodes = [], coreStats = null, coreDerived = [];
try {
  const coreDb = new Database(path.join(MACRO_ROOT, "core_db", "core.db"), { readonly: true, fileMustExist: true });
  coreStats = coreDb.prepare("SELECT COUNT(*) series, COUNT(DISTINCT country) countries FROM series").get();
  coreStats.data = coreDb.prepare("SELECT COUNT(*) n FROM data").get().n;
  coreCodes = coreDb.prepare("SELECT DISTINCT dataset, indicator FROM series").all()
    .map((r) => r.dataset + "::" + r.indicator);
  // ---- P1: سری‌های محاسباتی (DERIVED) که فقط در core.db وجود دارند ----
  coreDerived = coreDb.prepare(
    `SELECT s.series_id, s.country, s.indicator, s.unit,
            (SELECT COUNT(*) FROM data d WHERE d.series_id = s.series_id) AS points,
            (SELECT MIN(date) FROM data d WHERE d.series_id = s.series_id) AS first_date,
            (SELECT MAX(date) FROM data d WHERE d.series_id = s.series_id) AS last_date
       FROM series s WHERE s.dataset = 'DERIVED' ORDER BY s.country`
  ).all();
  coreDb.close();
} catch (e) { coreStats = { error: String(e.message) }; }
const coreSet = new Set(coreCodes);

// ------------------------------------------------------------
// ۴) شواهد فایل‌های خام محلی (چرا زیرشاخص در DB نیست)
// ------------------------------------------------------------
const OFFLINE = path.join(MACRO_ROOT, "offline");
function readHead(file, n = 1) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(4000);
    const len = fs.readSync(fd, buf, 0, 4000, 0);
    fs.closeSync(fd);
    return buf.slice(0, len).toString("utf8").split(/\r?\n/).slice(0, n);
  } catch (e) { return null; }
}
function grepFile(file, re, max = 6) {
  try {
    const out = [];
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) { out.push({ line: i + 1, text: lines[i].trim() }); if (out.length >= max) break; }
    }
    return out;
  } catch (e) { return []; }
}
const evidence = { tidyHeaders: [], downloaderFilters: {}, bis: {} };

for (const rel of ["eurostat/cpi_index.csv", "eurostat/cpi_yoy.csv", "oecd/cpi.csv",
                   "oecd/cpi_yoy.csv", "oecd/ppi.csv", "fred/cpi.csv", "fred/core_cpi.csv",
                   "owid/owid_cpi.csv"]) {
  const h = readHead(path.join(OFFLINE, rel), 1);
  if (h) evidence.tidyHeaders.push({ file: rel, header: h[0] });
}
evidence.downloaderFilters.EUROSTAT =
  grepFile(path.join(OFFLINE, "eurostat", "download_eurostat_offline.cjs"), /dimensions:\s*\{[^}]*coicop/i);
evidence.downloaderFilters.OECD =
  grepFile(path.join(OFFLINE, "oecd", "download_oecd_offline.cjs"), /MEASURE === "CP"|MEASURE === "PP"/i, 4);
evidence.downloaderFilters.IMF =
  grepFile(path.join(OFFLINE, "imf", "download_imf_offline.cjs"), /PCPIPCH|PCPIEPCH/, 4);
evidence.downloaderFilters.FRED =
  grepFile(path.join(OFFLINE, "fred", "download_fred_offline.cjs"), /CPILFESL|CPGRLE01DEM659N/, 4);

// BIS WS_LONG_CPI: هر (کشور × فرکانس × UNIT_MEASURE) چند ردیف دارد؟ (>1 = ادغام مفاهیم)
try {
  const csv = fs.readFileSync(path.join(OFFLINE, "bis", "WS_LONG_CPI_csv_col", "WS_LONG_CPI_csv_col.csv"), "utf8");
  const lines = csv.split(/\r?\n/);
  const head = lines[0].split(",");
  const iFreq = head.indexOf("FREQ"), iArea = head.indexOf("REF_AREA"),
        iUm = head.indexOf("UNIT_MEASURE"), iTitle = head.indexOf("TITLE_TS");
  const keys = new Map(), titles = new Set(), um = new Map();
  let rows = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length <= iTitle) continue;
    const area = (c[iArea] || "").trim();
    if (!BIS17.includes(area)) continue;
    rows++;
    um.set(c[iUm].trim(), (um.get(c[iUm].trim()) || 0) + 1);
    const k = area + "|" + c[iFreq].trim() + "|" + c[iUm].trim();
    keys.set(k, (keys.get(k) || 0) + 1);
    titles.add(area + "|" + c[iTitle].trim());
  }
  evidence.bis = {
    rows, unitMeasures: Object.fromEntries(um), distinctKeys: keys.size,
    keysWithMoreThanOneRow: [...keys.values()].filter((v) => v > 1).length,
    distinctTitles: titles.size,
  };
} catch (e) { evidence.bis = { error: String(e.message) }; }


// ------------------------------------------------------------
// ۵) ساخت ساختار پوشش کشوری
// ------------------------------------------------------------
const coverage = {};
for (const c of TARGET17) coverage[c] = {};
for (const s of priceSeries) {
  let c = s.country;
  if (!TARGET17.includes(c)) {
    const hit = Object.entries(BIS_ALIAS).find(([, v]) => v === s.country);
    if (hit) c = hit[0];
  }
  if (!TARGET17.includes(c)) continue;
  coverage[c][s.dataset] = coverage[c][s.dataset] || [];
  coverage[c][s.dataset].push(s);
}
const typePresence = (c, type) =>
  Object.values(coverage[c] || {}).some((arr) => arr.some((s) => TYPE_OF_FAMILY[classify(s.indicator, s.dataset)] === type));

// ------------------------------------------------------------
// ۶) تولید Markdown
// ------------------------------------------------------------
const L = [];
const g = (s) => (s === null || s === undefined || s === "") ? "—" : s;
const famOrder = ["HEADLINE", "CORE", "SUB_FOOD", "SUB_ENERGY", "SUB_HOUSING", "SUB_OTHER",
                  "WEIGHTS", "PPI", "DEFLATOR", "PRICE_OTHER", "FALSE_POS", "OTHER"];
const famLabel = {
  HEADLINE: "Headline (تورم کل)", CORE: "Core (هسته)", SUB_FOOD: "زیرشاخص: خوراک",
  SUB_ENERGY: "زیرشاخص: انرژی", SUB_HOUSING: "زیرشاخص: مسکن/آب/برق",
  SUB_OTHER: "زیرشاخص: سایر گروه‌ها", WEIGHTS: "وزن سبد (CPI weights)",
  PPI: "PPI (قیمت تولیدکننده)", DEFLATOR: "دِفلاتور", PRICE_OTHER: "سایر شاخص‌های قیمت",
  FALSE_POS: "⚠️ نام گمراه‌کننده (قیمت نیست)", OTHER: "غیرقیمتی",
};
const now = new Date().toISOString().slice(0, 19).replace("T", " ");

L.push("# گزارش جامع منابع داده — `macro.db`");
L.push("");
L.push(`> **تاریخ اجرا:** ${now} · **اسکریپت:** \`collector/macro/tools/data_inventory/source_report.cjs\``);
L.push(`> **دیتابیس:** \`collector/macro/db/macro.db\` (${(fs.statSync(DB_PATH).size / 1e6).toFixed(1)} MB)`);
L.push("> این گزارش کل دیتابیس خام را اسکن می‌کند و برای هر ۷ منبع نشان می‌دهد چه کدهایی ذخیره شده‌اند.");
L.push("");
L.push("---");
L.push("");
L.push("## ۰) خلاصهٔ اجرایی");
L.push("");
L.push("| منبع | سری | نقاط داده | کشورها | کدهای شاخص | کدهای قیمتی | Headline | Core | زیرشاخص | وزن سبد |");
L.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
let totSeries = 0, totObs = 0;
for (const ds of DATASETS) {
  const st = dsStatsMap[ds] || { series: 0, countries: 0, indicators: 0 };
  const rows = allCodes.filter((r) => r.dataset === ds);
  const price = rows.filter((r) => r.family !== "OTHER" && r.family !== "FALSE_POS");
  const has = (fam) => price.filter((r) => r.family === fam).length;
  totSeries += st.series; totObs += obsMap[ds] || 0;
  L.push(`| **${ds}** | ${st.series.toLocaleString()} | ${(obsMap[ds] || 0).toLocaleString()} | ${st.countries} | ${st.indicators.toLocaleString()} | ${price.length} | ${has("HEADLINE") || "—"} | ${has("CORE") || "—"} | ${(has("SUB_FOOD") + has("SUB_ENERGY") + has("SUB_HOUSING") + has("SUB_OTHER")) || "—"} | ${has("WEIGHTS") || "—"} |`);
}
L.push(`| **جمع** | **${totSeries.toLocaleString()}** | **${totObs.toLocaleString()}** | — | **${allCodes.length.toLocaleString()}** | **${priceCodes.length}** | | | | |`);
L.push("");
L.push(`**پاسخ یک‌خطی:** از ${allCodes.length.toLocaleString()} کد شاخص، ${priceCodes.length} کد قیمتی/تورمی است: ` +
       `**${priceCodes.filter((r) => r.family === "HEADLINE").length} Headline** · ` +
       `**${priceCodes.filter((r) => r.family === "CORE").length} Core** · ` +
       `**${priceCodes.filter((r) => r.family.startsWith("SUB_")).length} زیرشاخص** · ` +
       `**${priceCodes.filter((r) => r.family === "WEIGHTS").length} وزن سبد**.`);
L.push("");
L.push("---");
L.push("");
L.push("## ۱) فهرست کامل کدهای شاخص به تفکیک منبع");
L.push("");
L.push("### ۱.۰ همهٔ «کدهای قیمتی» در یک نگاه");
L.push("");
L.push("| # | منبع::کد | خانواده | نوع | سری (۱۷ کشور) | در core.db؟ | واحد | فرکانس |");
L.push("|---:|---|---|---|---:|:--:|---|---|");
let idx = 0;
for (const r of priceCodes.slice().sort((a, b) => a.dataset.localeCompare(b.dataset) || a.indicator.localeCompare(b.indicator))) {
  const in17 = priceSeries.filter((s) => s.dataset === r.dataset && s.indicator === r.indicator).length;
  idx++;
  L.push(`| ${idx} | \`${r.dataset}::${r.indicator}\` | ${famLabel[r.family] || r.family} | ${r.type} | ${in17} | ${coreSet.has(r.dataset + "::" + r.indicator) ? "✅" : "—"} | ${g(r.units)} | ${g(r.freqs)} |`);
}
L.push("");
L.push("> **یادداشت `BIS::CPI`:** این کد **قدیمی** و حاوی باگ «قاطی شدن شاخص و نرخ» است (واحدهای `771,628` در یک سری). " +
       "از P0 به بعد با دو کد جداگانه جایگزین شده: `BIS::CPI_IDX` (۶۲۸) و `BIS::CPI_YOY` (۷۷۱). " +
       "ردیف‌های قدیمی دست‌نخورده در `macro.db` مانده‌اند ولی به `core.db` نمی‌روند (`MACRO_DATA_INVENTORY.md` §۵).");
L.push("");
L.push("### ۱.۱ توزیع کدها بر اساس خانواده");
L.push("");
L.push("| خانواده | تعداد کد | مجموع سری | منابع دارای این خانواده |");
L.push("|---|---:|---:|---|");
for (const fam of famOrder) {
  const rows = allCodes.filter((r) => r.family === fam);
  if (!rows.length) continue;
  const sum = rows.reduce((a, b) => a + b.series, 0);
  const dss = [...new Set(rows.map((r) => r.dataset))].join(", ");
  L.push(`| ${famLabel[fam]} | ${rows.length} | ${sum.toLocaleString()} | ${dss} |`);
}
L.push("");
L.push("### ۱.۲ فهرست کدهای هر منبع (کامل برای منابع کوچک، قیمتی برای WB)");
L.push("");
for (const ds of DATASETS) {
  const rows = allCodes.filter((r) => r.dataset === ds).sort((a, b) => b.series - a.series);
  const st = dsStatsMap[ds] || {};
  L.push(`**${ds}** — ${(st.series || 0).toLocaleString()} سری · ${st.countries} کشور · ${rows.length} کد · ${(obsMap[ds] || 0).toLocaleString()} نقطه`);
  L.push("");
  const isWB = ds === "WB";
  const show = isWB ? rows.filter((r) => r.family !== "OTHER") : rows;
  L.push(isWB ? "| کد | خانواده | نام رسمی (WDI) | سری | کشور | فرکانس | واحد |"
              : "| کد | خانواده | سری | کشور | فرکانس | واحد |");
  L.push(isWB ? "|---|---|---|---:|---:|---|---|" : "|---|---|---:|---:|---|---|");
  for (const r of show) {
    const nm = WB_NAMES.get(r.indicator) || "—";
    const fam = r.family === "OTHER" ? "—" : (famLabel[r.family] || r.family);
    L.push(isWB
      ? `| \`${r.indicator}\` | ${fam} | ${nm} | ${r.series.toLocaleString()} | ${r.countries} | ${g(r.freqs)} | ${g(r.units)} |`
      : `| \`${r.indicator}\` | ${fam} | ${r.series.toLocaleString()} | ${r.countries} | ${g(r.freqs)} | ${g(r.units)} |`);
  }
  L.push("");
  if (isWB && show.length !== rows.length) {
    L.push(`> WB در کل **${rows.length.toLocaleString()} کد** دارد؛ بالا فقط کدهای قیمتی + نام‌های گمراه‌کننده آمده. ` +
           `بقیهٔ ${(rows.length - show.length).toLocaleString()} کد غیرقیمتی‌اند → فهرست کامل در \`MACRO_SOURCE_INVENTORY.json\`.`);
    L.push("");
  }
}

// ---- سنجش زندهٔ فایل‌های tidy: چند مقدار INDICATOR/UNIT داخل هر CSV است؟ ----
function scanTidy(file) {
  try {
    const txt = fs.readFileSync(path.join(OFFLINE, file), "utf8");
    const lines = txt.split(/\r?\n/).filter((l) => l.length);
    if (!lines.length) return null;
    const head = lines[0].split(",");
    const iInd = head.indexOf("INDICATOR"), iUnit = head.indexOf("UNIT"), iArea = head.indexOf("REF_AREA");
    const ind = new Map(), unit = new Map(), areas = new Set();
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(",");
      if (c.length <= Math.max(iInd, iUnit, iArea)) continue;
      ind.set(c[iInd], (ind.get(c[iInd]) || 0) + 1);
      unit.set(c[iUnit], (unit.get(c[iUnit]) || 0) + 1);
      areas.add(c[iArea]);
    }
    return { rows: lines.length - 1, cols: head.length, header: head,
             indicators: Object.fromEntries(ind), units: Object.fromEntries(unit), areas: areas.size };
  } catch (e) { return { error: String(e.message) }; }
}
const tidyScan = {};
for (const rel of ["eurostat/cpi_index.csv", "eurostat/cpi_yoy.csv", "oecd/cpi.csv",
                   "oecd/cpi_yoy.csv", "oecd/ppi.csv", "fred/cpi.csv", "fred/core_cpi.csv"])
  tidyScan[rel] = scanTidy(rel);

// ---- جست‌وجوی الگوهای زیرشاخص / وزن در کل دیتابیس ----
const RX_SUB = /COICOP|CP0[1-9]|CP1[0-2]|_FOOD|FOOD_|_ENRG|_ENERGY|ENERGY_|_UTIL|UTILIT|_RENT|RENT_|SHELTER|_FUEL|_TRANSPORT_|_CLOTH|_HEALTH|_EDUC|_RECREAT|_RESTAURANT|_MISC/i;
const RX_WGT = /WEIGHT|WGT|BASKET|_IW$|_IW\b|_IW_|IWEIGHT|^HICP_IW|CPI_W_/i;
const rxSubHits = allCodes.filter((r) => RX_SUB.test(r.indicator));
const rxWgtHits = allCodes.filter((r) => RX_WGT.test(r.indicator));
const rxSubInPrice = priceCodes.filter((r) => ["SUB_FOOD", "SUB_ENERGY", "SUB_HOUSING", "SUB_OTHER"].includes(r.family));

L.push("");
L.push("---");
L.push("");
L.push("## ۲) آیا زیرشاخص / هسته / وزن سبد در داده‌های خام وجود دارد؟");
L.push("");
L.push("پاسخ در **سه لایه** بررسی شد (دیتابیس → فایل خام → اسکریپت دانلود):");
L.push("");
L.push("### ۲.۱ لایهٔ ۱ — خود `macro.db`");
L.push("");
L.push(`| جست‌وجو | الگو | نتیجه در کل ${allCodes.length.toLocaleString()} کد |`);
L.push("|---|---|---|");
L.push(`| زیرشاخص COICOP (CP01..CP12) | \`${RX_SUB.source.slice(0, 60)}…\` | **${rxSubHits.length} کد**${rxSubHits.length ? " → " + rxSubHits.map((r) => `\`${r.dataset}::${r.indicator}\``).join(", ") : ""} |`);
L.push(`| وزن سبد | \`${RX_WGT.source}\` | **${rxWgtHits.length} کد**${rxWgtHits.length ? " → " + rxWgtHits.map((r) => `\`${r.dataset}::${r.indicator}\``).join(", ") : ""} |`);
L.push("");
L.push(`- از ${priceCodes.length} کد قیمتی، **${rxSubInPrice.length} کد** در خانوادهٔ زیرشاخص (خوراک/انرژی/مسکن/سایر) قرار می‌گیرد.`);
if (rxSubHits.filter((r) => r.family === "FALSE_POS").length) {
  L.push(`- از این تعداد، **${rxSubHits.filter((r) => r.family === "FALSE_POS").length} کد «کاذب»** است (نامش قیمتی به‌نظر می‌رسد ولی مفهوم دیگری دارد) — جزئیات در §۲.۴.`);
}
L.push("");
L.push("### ۲.۲ لایهٔ ۲ — فایل‌های خام محلی");
L.push("");
L.push("ساختار CSVهای tidy (Eurostat / OECD / FRED):");
L.push("");
L.push("| فایل | ستون‌ها | INDICATOR داخل فایل | UNIT | کشورها |");
L.push("|---|---:|---|---|---:|");
for (const [f, s] of Object.entries(tidyScan)) {
  if (!s || s.error) { L.push(`| \`${f}\` | — | — | — | — |`); continue; }
  L.push(`| \`${f}\` | ${s.cols} | ${Object.keys(s.indicators).map((k) => `\`${k}\``).join(", ")} | ${Object.keys(s.units).map((k) => `\`${k}\``).join(", ")} | ${s.areas} |`);
}
L.push("");
L.push(`> **نکتهٔ کلیدی:** همهٔ این فایل‌ها فقط **${Object.values(tidyScan).find((s) => s && s.cols)?.cols || 6} ستون** دارند ` +
       `(\`REF_AREA, INDICATOR, TIME_PERIOD, OBS_VALUE, UNIT, FREQUENCY\`). هیچ ستونی مثل \`COICOP\` / \`EXPENDITURE\` / \`MEASURE\` ` +
       `در فایل‌ها **وجود ندارد** ⇒ اطلاعات زیرشاخص **پیش از ذخیره‌سازی حذف شده**، نه در زمان لود در SQLite.`);
L.push("");
L.push("BIS \`WS_LONG_CPI\` (فایل خام، فقط ۱۷ کشور هدف):");
L.push("");
const b = evidence.bis || {};
L.push(`| سنجه | مقدار | تفسیر |`);
L.push("|---|---:|---|");
L.push(`| ردیف سری × کشور | ${g(b.rows)} | — |`);
L.push(`| مقادیر \`UNIT_MEASURE\` | ${b.unitMeasures ? Object.entries(b.unitMeasures).map(([k, v]) => `${k}=${v}`).join(" · ") : "—"} | 628=شاخص · 771=نرخ YoY |`);
L.push(`| کلیدهای (کشور×فرکانس×measure) | ${g(b.distinctKeys)} | هر کلید یک سری |`);
L.push(`| کلیدهایی با بیش از یک ردیف | **${g(b.keysWithMoreThanOneRow)}** | ۰ = هیچ سری پنهانی (زیرشاخص) ادغام نشده |`);
L.push(`| تعداد عنوان سری یکتا (\`TITLE_TS\`) | ${g(b.distinctTitles)} | کمتر از تعداد کلیدها ⇒ عنوان، معیار تفکیک نیست (تفکیک واقعی روی \`UNIT_MEASURE\` است) |`);
L.push("IMF (`offline/imf/*.csv`): ۲۱ کد IFS + ۹ کد WEO + ۱۱ کد GFS که از این میان فقط دو کد قیمتی‌اند:");
L.push("`PCPIPCH` (تورم کل، میانگین سالانه) و `PCPIEPCH` (تورم کل، پایان دوره). **هیچ کد خوراک/انرژی/هسته‌ای وجود ندارد.**");
L.push("");
L.push("### ۲.۳ لایهٔ ۳ — اسکریپت‌های دانلود (کجا فیلتر شد؟)");
L.push("");
L.push("| منبع | خط فیلتر در اسکریپت دانلود | معنا |");
L.push("|---|---|---|");
const evLines = (ds) => (evidence.downloaderFilters[ds] || [])
  .map((h) => `\`download_${ds.toLowerCase()}_offline.cjs:${h.line}\` \`${h.text.replace(/`/g, "")}\``)
  .join("<br>") || "(اسکریپت یا الگو یافت نشد)";
L.push(`| **EUROSTAT** | ${evLines("EUROSTAT")} | بُعد \`coicop\` روی **CP00** (همهٔ اقلام) قفل شده؛ CP01..CP12 (خوراک، انرژی، مسکن…) هرگز دانلود نشده |`);
L.push(`| **OECD** | ${evLines("OECD")} | فقط سری‌هایی با \`MEASURE='CP'\` و \`UNIT_MEASURE='IX'/'GR'\` برداشته می‌شود |`);
L.push(`| **IMF** | ${evLines("IMF")} | فهرست ثابت کدها (DataMapper API) — فقط \`PCPIPCH\`/\`PCPIEPCH\` |`);
L.push(`| **FRED** | ${evLines("FRED")} | فهرست ثابت series_id — هستهٔ CPI اضافه شده، ولی زیرشاخص‌ها (CUUR0000SAF…) نه |`);
L.push(`| **BIS** | \`loadBisFile()\` در \`db_build/main_offline_loader.cjs:269-285\` | فقط \`REF_AREA\`+\`FREQ\`+\`UNIT_MEASURE\` خوانده می‌شود؛ سایر بُعدها (BREAKS/COVERAGE/TITLE_TS) دور ریخته می‌شوند |`);
L.push(`| **WB** | \`WDI\` (فقط شاخص‌های استاندارد WDI) | WDI اساساً زیرشاخص COICOP منتشر نمی‌کند |`);
L.push(`| **OWID** | \`download_owid_offline.cjs\` → ستون واحد \`CPI\` | فقط تورم کل سالانه |`);
L.push("");
L.push("**نتیجه‌گیری لایهٔ ۳ (به‌روزشده — P1):** داده‌های زیرشاخص در نسخهٔ اول **در مرحلهٔ دانلود** حذف شده بودند، " +
       "نه در مرحلهٔ لود (منابع بالادستی داده را داشتند: Eurostat بُعد `coicop`، OECD بُعد `EXPENDITURE`، FRED سری‌های `CUUR*`). " +
       "این فیلتر در **P1 (2026-09-20)** برداشته شد و اسکریپت‌های دانلود گسترش یافتند:");
L.push("");
L.push("| منبع | فایل‌های جدید خروجی | چه چیزی اضافه شد |");
L.push("|---|---|---|");
L.push("| **EUROSTAT** | `cpi_index_sub.csv` · `cpi_yoy_sub.csv` · `cpi_weights.csv` | ۲۲ کد COICOP (CP00..CP12 + `CP045`/`CP071`/`CP0722` + تجمیع‌های `NRG`/`FOOD`/`IGD`/`SERV`/`TOT_X_NRG`/`TOT_X_NRG_FOOD`) + وزن‌های سبد (‰) |");
L.push("| **OECD** | `cpi_sub.csv` | فلوی جدید `DSD_PRICES@DF_PRICES_ALL` با ۱۷ کد EXPENDITURE برای ۱۷ کشور — شامل `_TXCP01_NRG` = **هستهٔ رسمی (All items non-food non-energy)** |");
L.push("| **FRED** | `cpi_sub.csv` (+ `core_cpi.csv`) | ۱۰ زیرشاخص CPI آمریکا (خوراک/انرژی/مسکن/برق/بنزین/اجاره) + هستهٔ HICP تُرکیه (`TURCPHPLA01IXOBM`) |");
L.push("");
L.push("> ⚠️ قاعدهٔ کلیدی معماری: لودر **فقط ستون `INDICATOR`** را می‌خواند، پس کد COICOP در همان ستون «پخته» می‌شود " +
       "(`HICP_MIDX_CP01` · `HICP_IW_TOTAL` · `CPI_IDX_CP01`) تا هر گروه یک سری مستقل شود و تصادم «اولین مقدار برنده» رخ ندهد.");
L.push("");
L.push("> ⚠️ نکتهٔ فنی OECD (کشف‌شده در همین کار): سرور SDMX سازمان OECD به درخواستی که از `fetch` " +
       "(undici نود ۲۰) بیاید پاسخ **500 Internal server error** می‌دهد؛ همان درخواست با ماژول `https` نود " +
       "۲۰۰/CSV می‌گیرد ⇒ دانلودر OECD از `https.get` استفاده می‌کند. همچنین جداکنندهٔ OR در کلید SDMX باید " +
       "`%2B` باشد (`+` در URL به فاصله تفسیر می‌شود و 404 می‌دهد).");
L.push("");

L.push("");
L.push("### ۲.۴ ⚠️ کدهای «مثبت کاذب» — نامشان قیمتی است، مفهومشان نیست");
L.push("");
L.push("روش داوری: برای کدهای `WB`، **نام رسمی از کاتالوگ `WDISeries.csv`** خوانده می‌شود؛ " +
       "اگر خانوادهٔ regex قیمتی باشد ولی نام رسمی واژهٔ `price|inflation|deflator|CPI` نداشته باشد، " +
       "کد به‌عنوان مثبت کاذب علامت می‌خورد.");
L.push("");
if (Object.keys(FP_REASONS).length === 0) {
  L.push("_هیچ مثبت کاذبی یافت نشد._");
} else {
  L.push("| منبع::کد | سری در DB | نام رسمی (مرجع) |");
  L.push("|---|---:|---|");
  for (const [key, why] of Object.entries(FP_REASONS)) {
    const code = key.split("::")[1];
    const row = allCodes.find((r) => r.dataset === key.split("::")[0] && r.indicator === code);
    L.push(`| \`${key}\` | ${row ? row.series : "—"} | ${why} |`);
  }
}
L.push("");
// کدهایی که در هیچ خانوادهٔ قیمتی نیفتادند ولی نامشان گمراه‌کننده است (IE.PPI.* / HD_HCIP_*)
const misleading = allCodes.filter((r) => /^IE\.PP[IN]\.|^HD_HCIP_/.test(r.indicator)
  && !FP_REASONS[r.dataset + "::" + r.indicator]);
if (misleading.length) {
  L.push("### ۲.۵ کدهای گمراه‌کنندهٔ دیگر (در هیچ خانوادهٔ قیمتی نیفتادند)");
  L.push("");
  L.push("| منبع::کد | سری | نام رسمی |");
  L.push("|---|---:|---|");
  for (const r of misleading.slice().sort((a, b) => a.indicator.localeCompare(b.indicator))) {
    L.push(`| \`${r.dataset}::${r.indicator}\` | ${r.series} | ${WB_NAMES.get(r.indicator) || "—"} |`);
  }
  L.push("");
  L.push("> این‌ها «PPI» در نامشان به معنای **P**rivate **P**articipation in Infrastructure (سرمایه‌گذاری) است، " +
         "و `HD_HCIP_*` شاخص سرمایهٔ انسانی (HCI+) است. هیچ‌کدام شاخص قیمت نیستند.");
  L.push("");
}
L.push("### ۲.۶ 🧮 سری‌های محاسباتی `DERIVED` (فقط در `core.db`)");
L.push("");
if (!coreDerived.length) {
  L.push("_هیچ سری محاسباتی ساخته نشده است._");
} else {
  L.push("این سری‌ها **دادهٔ منتشرشدهٔ ناشر نیستند**؛ در `core_db/build/build_core_db.cjs` " +
         "با `insertDerivedCore()` ساخته می‌شوند و روش ساخت در ستون `unit` حمل می‌شود " +
         "(در API با کلید `unit_raw` دیده می‌شود).");
  L.push("");
  L.push("| سری | روش | نقاط | از | تا | روش در `unit` |");
  L.push("|---|---|---:|---|---|---|");
  for (const d of coreDerived) {
    const m = /trimmed-mean/.test(d.unit) ? "trimmed-mean + تمدید روند (Hybrid)"
      : (/trend[- ](proxy|extension)/.test(d.unit) ? "تمدید روند ۱۲ماهه (بدون هستهٔ COICOP)" : "؟");
    L.push(`| \`${d.series_id}\` | ${m} | ${d.points} | ${d.first_date} | ${d.last_date} | \`${d.unit}\` |`);
  }
  L.push("");
  L.push(`⇒ با احتساب این ${coreDerived.length} سری، پوشش Core در ` +
         `\`core.db\` به **${12 + coreDerived.length}/۱۷ کشور** می‌رسد ` +
         `(۱۲ رسمی + ${coreDerived.length} محاسباتی).`);
}
L.push("");
L.push("---");
L.push("");
L.push("## ۳) پوشش کشوری به تفکیک منبع (۱۷ کشور هدف)");
L.push("");
L.push("### ۳.۱ ماتریس نوع سری");
L.push("");
L.push("| کشور | Headline | **Core** | زیرشاخص | وزن سبد | منابع دارای Headline | منبع Core |");
L.push("|---|:--:|:--:|:--:|:--:|---|---|");
for (const c of TARGET17) {
  const srcs = Object.entries(coverage[c]).filter(([, arr]) => arr.some((s) => classify(s.indicator, s.dataset) === "HEADLINE"));
  const coreSrcs = Object.entries(coverage[c]).filter(([, arr]) => arr.some((s) => classify(s.indicator, s.dataset) === "CORE"));
  const hasSub = typePresence(c, "Sub");
  const hasWgt = typePresence(c, "Weights");
  L.push(`| **${c}** | ${srcs.length ? "✅" : "❌"} | ${coreSrcs.length ? "✅" : "❌"} | ${hasSub ? "✅" : "❌"} | ${hasWgt ? "✅" : "❌"} | ${srcs.map(([d]) => d).join(", ") || "—"} | ${coreSrcs.map(([d, a]) => `${d} (${[...new Set(a.map((s) => s.indicator))].length} کد)`).join(", ") || "—"} |`);
}
L.push("");
const withCore = TARGET17.filter((c) => typePresence(c, "Core"));
const withSub = TARGET17.filter((c) => typePresence(c, "Sub"));
L.push(`**خلاصه:** Headline برای **${TARGET17.length}/۱۷** کشور · Core برای **${withCore.length}/۱۷** (${withCore.join(", ") || "—"}) · ` +
       `زیرشاخص برای **${withSub.length}/۱۷** · وزن سبد برای **۰/۱۷**.`);
L.push("");
L.push("### ۳.۲ جزئیات سری‌های قیمتی هر کشور");
L.push("");
for (const c of TARGET17) {
  const srcs = coverage[c];
  const total = Object.values(srcs).reduce((a, b) => a + b.length, 0);
  L.push(`**${c}** — ${total} سری قیمتی`);
  L.push("");
  if (!total) { L.push("_هیچ سری قیمتی ثبت نشده._"); L.push(""); continue; }
  L.push("| منبع | کد | خانواده | فرکانس | نقاط | از | تا | در core.db |");
  L.push("|---|---|---|---|---:|---|---|:--:|");
  for (const ds of DATASETS) {
    for (const s of (srcs[ds] || [])) {
      L.push(`| ${ds} | \`${s.indicator}\` | ${famLabel[classify(s.indicator, s.dataset)] || classify(s.indicator, s.dataset)} | ${s.frequency} | ${s.n} | ${g(s.mn)} | ${g(s.mx)} | ${coreSet.has(ds + "::" + s.indicator) ? "✅" : "—"} |`);
    }
  }
  L.push("");
}
L.push("### ۳.۳ فهرست سری‌های قیمتی که در `core.db` نیستند (به چارت نمی‌رسند)");
L.push("");
const notCurated = priceSeries.filter((s) => !coreSet.has(s.dataset + "::" + s.indicator));
const notCuratedCodes = [...new Set(notCurated.map((s) => s.dataset + "::" + s.indicator))];
L.push(`**${notCuratedCodes.length} کد** از کدهای قیمتی در ۱۷ کشور وجود دارند ولی در \`core.db\` فیلتر شده‌اند:`);
L.push("");
L.push("| منبع::کد | تعداد سری در ۱۷ کشور |");
L.push("|---|---:|");
for (const code of notCuratedCodes.sort()) {
  L.push(`| \`${code}\` | ${notCurated.filter((s) => s.dataset + "::" + s.indicator === code).length} |`);
}
L.push("");
L.push("---");
L.push("");
L.push("## ۴) از دادهٔ موجود چه چیزی قابل استخراج است؟");
L.push("");
L.push("| قابلیت | امکان | مبنای داده |");
L.push("|---|:--:|---|");
L.push(`| تورم کل (Headline) ماهانه/فصلی/سالانه برای ۱۷ کشور | ✅ | ${priceCodes.filter((r) => r.family === "HEADLINE").length} کد از ۶ منبع |`);
L.push(`| هستهٔ تورم (Core) برای ${withCore.length} کشور | ✅ | FRED (\`CPILFESL\`, \`*CPHPLA01*\`, \`CPGRLE01*\`) |`);
L.push("| شکاف Headline − Core | ✅ | همان دو سری بالا (۷ کشور) |");
L.push("| PPI (قیمت تولیدکننده، کل) | ✅ | OECD \`PPI\` (۹ کشور) + FRED \`PPIACO\`/\`PPIFIS\` (USA) |");
L.push("| دِفلاتور GDP (کل اقتصاد) | ✅ | WB \`NY.GDP.DEFL.*\` (۱۷ کشور، سالانه) |");
L.push("| زیرشاخص‌های CPI (خوراک/انرژی/مسکن/سایر) | ❌ | در هیچ لایه‌ای موجود نیست (§۲) |");
L.push("| وزن سبد مصرف‌کننده | ❌ | هیچ کدی در ۴۰۵k سری (§۲.۱) |");
L.push("| محاسبهٔ Core با فرمول حذفی برای ۱۰ کشور باقی‌مانده | ❌ | نیاز به زیرشاخص + وزن (هر دو غایب) |");
L.push("| جایگزین: Core آماری (روند/میانگین متحرک از Headline) | ⚠️ | ممکن، ولی «رسمی» نیست — باید «proxy» برچسب بخورد |");
L.push("");
L.push("---");
L.push("");
L.push("## ۵) بازتولید");
L.push("");
L.push("```bash");
L.push("cd collector/macro");
L.push("node tools/data_inventory/source_report.cjs      # همین گزارش را بازتولید می‌کند");
L.push("node tools/data_inventory/funnel.cjs             # قیف ۴۰۵k → ۱.۴۴k سری");
L.push("python3 tools/data_inventory/bis_unit_collision.py");
L.push("```");
L.push("");
L.push(`_تولیدشده توسط \`source_report.cjs\` — ${now}_`);



// ------------------------------------------------------------
// ۷) خروجی‌ها: Markdown + JSON + خلاصهٔ کنسول
// ------------------------------------------------------------
const md = L.join("\n") + "\n";
fs.writeFileSync(OUT_MD, md, "utf8");

const payload = {
  generated_at: now,
  database: { path: DB_PATH, size_bytes: fs.statSync(DB_PATH).size, series: totSeries, observations: totObs },
  datasets: DATASETS.map((ds) => ({
    dataset: ds,
    series: (dsStatsMap[ds] || {}).series || 0,
    observations: obsMap[ds] || 0,
    countries: (dsStatsMap[ds] || {}).countries || 0,
    codes: (dsStatsMap[ds] || {}).indicators || 0,
    price_codes: priceCodes.filter((r) => r.dataset === ds).length,
  })),
  families: famOrder.map((fam) => {
    const rows = allCodes.filter((r) => r.family === fam);
    return { family: fam, codes: rows.length, series: rows.reduce((a, b) => a + b.series, 0),
             datasets: [...new Set(rows.map((r) => r.dataset))] };
  }),
  price_codes: priceCodes.map((r) => ({
    dataset: r.dataset, indicator: r.indicator, family: r.family, type: r.type,
    series: r.series, countries: r.countries, units: r.units, freqs: r.freqs,
    series_in_17: priceSeries.filter((s) => s.dataset === r.dataset && s.indicator === r.indicator).length,
    in_core_db: coreSet.has(r.dataset + "::" + r.indicator),
  })),
  false_positives: FP_REASONS,
  country_coverage: Object.fromEntries(TARGET17.map((c) => [c, {
    headline: typePresence(c, "Headline"), core: typePresence(c, "Core"),
    sub_index: typePresence(c, "Sub"), weights: typePresence(c, "Weights"),
    series: Object.fromEntries(Object.entries(coverage[c]).map(([ds, arr]) => [ds,
      arr.map((s) => ({ indicator: s.indicator, frequency: s.frequency, unit: s.unit, points: s.n, from: s.mn, to: s.mx }))])),
  }])),
  evidence: { tidy_scan: tidyScan, downloader_filters: evidence.downloaderFilters, bis_long_cpi: evidence.bis },
  core_db: { stats: coreStats, codes: coreCodes.sort() },
};
fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");

console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
console.log("║  گزارش جامع منابع macro.db — تولید شد                                       ║");
console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
console.log(`  ${OUT_MD}`);
console.log(`  ${OUT_JSON}`);
console.log("");
console.log("  منبع      |     سری |  نقاط داده | کشور | کد | قیمتی | Headline | Core | Sub | وزن");
console.log("  ----------|---------|------------|------|----|-------|----------|------|-----|-----");
for (const ds of DATASETS) {
  const st = dsStatsMap[ds] || { series: 0, countries: 0, indicators: 0 };
  const rows = allCodes.filter((r) => r.dataset === ds);
  const price = rows.filter((r) => r.family !== "OTHER" && r.family !== "FALSE_POS");
  const cnt = (fam) => price.filter((r) => r.family === fam).length;
  const sub = cnt("SUB_FOOD") + cnt("SUB_ENERGY") + cnt("SUB_HOUSING") + cnt("SUB_OTHER");
  const fmt = (n) => (n ? String(n) : "-");
  console.log(`  ${ds.padEnd(9)} | ${String(st.series).padStart(7)} | ${String(obsMap[ds] || 0).padStart(10)} | ` +
    `${String(st.countries).padStart(4)} | ${String(st.indicators).padStart(3)} | ${String(price.length).padStart(5)} | ` +
    `${fmt(cnt("HEADLINE")).padStart(8)} | ${fmt(cnt("CORE")).padStart(4)} | ` +
    `${fmt(sub).padStart(3)} | ${fmt(cnt("WEIGHTS")).padStart(4)}`);
}
console.log("");
console.log(`  کدهای شاخص کل        : ${allCodes.length.toLocaleString()}`);
console.log(`  کدهای قیمتی/تورمی    : ${priceCodes.length}`);
console.log(`  ├─ Headline          : ${priceCodes.filter((r) => r.family === "HEADLINE").length}`);
console.log(`  ├─ Core              : ${priceCodes.filter((r) => r.family === "CORE").length}`);
console.log(`  ├─ زیرشاخص (Sub)     : ${rxSubInPrice.length}  ${rxSubInPrice.length ? "-> " + rxSubInPrice.map((r) => r.indicator).join(", ") : "(هیچ)"}`);
console.log(`  └─ وزن سبد           : ${rxWgtHits.length}  ${rxWgtHits.length ? "-> " + rxWgtHits.map((r) => r.indicator).join(", ") : "(هیچ)"}`);
console.log("");
const withCore2 = TARGET17.filter((c) => typePresence(c, "Core"));
console.log(`  ۱۷ کشور: Headline ${TARGET17.length}/17 · Core رسمی ${withCore2.length}/17 (${withCore2.join(",")})`);
if (coreDerived.length) {
  console.log(`           + Core محاسباتی (DERIVED) ${coreDerived.length}/17 (${coreDerived.map((d) => d.country).join(",")})` +
              `  ⇒ مجموع Core: ${withCore2.length + coreDerived.length}/17`);
}
console.log(`  سری‌های قیمتی در ۱۷ کشور: ${priceSeries.length}  ·  از این تعداد در core.db: ${priceSeries.filter((s) => coreSet.has(s.dataset + "::" + s.indicator)).length}`);
console.log(`  BIS WS_LONG_CPI: ردیف=${(evidence.bis || {}).rows} کلید=${(evidence.bis || {}).distinctKeys} تصادم=${(evidence.bis || {}).keysWithMoreThanOneRow}`);


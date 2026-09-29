"use strict";
/* ============================================================
 * قیف فیلتر خام → core — با **همان کد** core_db/build/build_core_db.cjs
 * File: collector/macro/tools/data_inventory/funnel.cjs
 * ------------------------------------------------------------
 * چرا: نشان می‌دهد ۴۰۵,۲۶۹ سری خام چگونه به ۱,۴۴۲ سری curated می‌رسد
 * و در هر مرحله (کشور / اندیکاتور / فرکانس) چه تعداد حذف می‌شود.
 * اجرا:  cd collector/macro && node tools/data_inventory/funnel.cjs
 * مبنا:  MACRO_DATA_INVENTORY.md بند ۳
 * ============================================================ */
const path = require("path");
const B = path.join(__dirname, "..", "..") + path.sep;
const { INDICATOR_MAP, DATASETS } = require(B + "core_db/build/build_core_db.cjs");
const Database = require("better-sqlite3");

// آینهٔ FILTERS (همان فایل‌های JSON که build می‌خواند)
const COUNTRIES = require(B + "core_db/build/filters/countries.json");
const INDICATORS = require(B + "core_db/build/filters/indicators.json");
const FREQS = require(B + "core_db/build/filters/frequencies.json");
// آینهٔ COUNTRY_ALIAS داخل build (فقط BIS کد دوحرفی دارد)
const ALIAS = {
  BIS: { USA:"US",CHN:"CN",JPN:"JP",DEU:"DE",GBR:"GB",FRA:"FR",ITA:"IT",CAN:"CA",AUS:"AU",
         KOR:"KR",IND:"IN",TUR:"TR",MEX:"MX",BRA:"BR",RUS:"RU",SAU:"SA",ZAF:"ZA" },
};

const db = new Database(B + "db/macro.db", { readonly: true, fileMustExist: true });

function allowedCountries(ds) {
  const a = ALIAS[ds] || {};
  return COUNTRIES.map((c) => a[c] || c);
}
function allowedIndicators(ds) {
  const out = [];
  for (const canon of INDICATORS) {
    const per = INDICATOR_MAP[canon] || {};
    for (const code of per[ds] || []) out.push(code);
  }
  return [...new Set(out)];
}

const total = db.prepare("SELECT COUNT(*) c FROM series").get().c;
console.log(`0) کل سری‌های خام                        : ${total}`);

// per-dataset breakdown of the funnel
let afterCountry = 0, afterIndicator = 0, afterFreq = 0;
const detail = [];
for (const ds of DATASETS) {
  const cs = allowedCountries(ds);
  const is = allowedIndicators(ds);
  if (is.length === 0) {
    detail.push({ ds, series: 0, afterCountry: 0, afterIndicator: 0, afterFreq: 0, indicators: [] });
    continue;
  }
  const phC = cs.map(() => "?").join(",");
  const phI = is.map(() => "?").join(",");
  const phF = FREQS.map(() => "?").join(",");
  const nAll = db.prepare("SELECT COUNT(*) c FROM series WHERE dataset=?").get(ds).c;
  const nC = db.prepare(`SELECT COUNT(*) c FROM series WHERE dataset=? AND country IN (${phC})`).get(ds, ...cs).c;
  const nI = db.prepare(`SELECT COUNT(*) c FROM series WHERE dataset=? AND country IN (${phC}) AND indicator IN (${phI})`)
    .get(ds, ...cs, ...is).c;
  const nF = db.prepare(`SELECT COUNT(*) c FROM series WHERE dataset=? AND country IN (${phC}) AND indicator IN (${phI}) AND frequency IN (${phF})`)
    .get(ds, ...cs, ...is, ...FREQS).c;
  afterCountry += nC; afterIndicator += nI; afterFreq += nF;
  detail.push({ ds, series: nAll, afterCountry: nC, afterIndicator: nI, afterFreq: nF, indicators: is });
}
console.log("\ndataset    |  خام  | کشور∈17 | +اندیکاتور | +فرکانس M/Q/A | کدهای مجاز (تعداد)");
for (const d of detail) {
  console.log(
    `${d.ds.padEnd(10)} | ${String(d.series).padStart(6)} | ${String(d.afterCountry).padStart(7)} | ${String(d.afterIndicator).padStart(10)} | ${String(d.afterFreq).padStart(13)} | ${d.indicators.length}`,
  );
}
console.log(`\n1) بعد از فیلتر کشور (17 کشور هدف)        : ${afterCountry}`);
console.log(`2) بعد از فیلتر اندیکاتور (14 canonical)   : ${afterIndicator}`);
console.log(`3) بعد از فیلتر فرکانس (M/Q/A)             : ${afterFreq}`);
const core = new Database(B + "core_db/core.db", { readonly: true, fileMustExist: true })
  .prepare("SELECT COUNT(*) c FROM series").get().c;
console.log(`4) سری‌های موجود در core.db                 : ${core}`);
console.log(`\nنرخ بقا: ${(core / total * 100).toFixed(3)}%`);
console.log("\nکدهای canonical با پوشش صفر در هر dataset (منبع Core/PPI/PMI):");
for (const canon of INDICATORS) {
  const empty = DATASETS.filter((ds) => ((INDICATOR_MAP[canon] || {})[ds] || []).length === 0);
  if (empty.length) console.log(`   ${canon.padEnd(10)} → بدون کد در: ${empty.join(", ")}`);
}

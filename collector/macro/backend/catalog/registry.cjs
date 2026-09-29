"use strict";

/**
 * ============================================================
 * Macro Backend — Catalog / Registry (رگ‌یستری متادیتا)
 * File: collector/macro/backend/catalog/registry.cjs
 * ============================================================
 * Static metadata used by the Backend to turn raw core.db rows into
 * a professional, dashboard-ready Bloomberg-style payload.
 *
 *  Language: English ONLY at this stage (every field needed for the
 *            UI / ML is present; `*_fa` fields are already kept so the
 *            payload can become bilingual later with zero schema change).
 *
 *  Country codes : standardized to ISO3 everywhere. Some datasets
 *                  (BIS) store a 2-letter country code; we translate
 *                  through ISO2_TO_ISO3. The authoritative country
 *                  universe = Tier-1/Tier-2 filter of core.db build.
 * ============================================================
 */

// ------------------------------------------------------------------
// Country universe = Tier-1 + Tier-2 (matches core_db filters/countries.json)
// ------------------------------------------------------------------
const COUNTRIES = {
  USA: { name_en: "United States",            name_fa: "ایالات متحده آمریکا" },
  CHN: { name_en: "China",                    name_fa: "چین" },
  JPN: { name_en: "Japan",                    name_fa: "ژاپن" },
  DEU: { name_en: "Germany",                  name_fa: "آلمان" },
  GBR: { name_en: "United Kingdom",           name_fa: "بریتانیا" },
  FRA: { name_en: "France",                   name_fa: "فرانسه" },
  ITA: { name_en: "Italy",                    name_fa: "ایتالیا" },
  CAN: { name_en: "Canada",                   name_fa: "کانادا" },
  AUS: { name_en: "Australia",                name_fa: "استرالیا" },
  KOR: { name_en: "South Korea",              name_fa: "کره جنوبی" },
  IND: { name_en: "India",                    name_fa: "هند" },
  TUR: { name_en: "Türkiye",                   name_fa: "ترکیه" },
  MEX: { name_en: "Mexico",                   name_fa: "مکزیک" },
  BRA: { name_en: "Brazil",                   name_fa: "برزیل" },
  RUS: { name_en: "Russia",                   name_fa: "روسیه" },
  SAU: { name_en: "Saudi Arabia",             name_fa: "عربستان سعودی" },
  ZAF: { name_en: "South Africa",             name_fa: "آفریقای جنوبی" },
};

// ------------------------------------------------------------------
// BIS stores countries as 2-letter codes. Mirror of the ISO3→ISO2
// translation used by build_core_db (COUNTRY_ALIAS.BIS).
// ------------------------------------------------------------------
const ISO2_TO_ISO3 = {
  US: "USA", CN: "CHN", JP: "JPN", DE: "DEU", GB: "GBR", FR: "FRA",
  IT: "ITA", CA: "CAN", AU: "AUS", KR: "KOR", IN: "IND", TR: "TUR",
  MX: "MEX", BR: "BRA", RU: "RUS", SA: "SAU", ZA: "ZAF",
};

// ------------------------------------------------------------------
// Datasets
// ------------------------------------------------------------------
const DATASET_META = {
  BIS:       { name_en: "Bank for International Settlements", name_fa: "بانک تسویه‌های بین‌المللی" },
  IMF:       { name_en: "International Monetary Fund",        name_fa: "صندوق بین‌المللی پول" },
  WB:        { name_en: "World Bank",                          name_fa: "بانک جهانی" },
  OECD:      { name_en: "OECD",                                name_fa: "سازمان همکاری و توسعهٔ اقتصادی" },
  FRED:      { name_en: "FRED (Federal Reserve)",              name_fa: "فرد (فدرال رزرو)" },
  EUROSTAT:  { name_en: "Eurostat",                            name_fa: "یورواستات" },
  // محاسباتی — در build_core_db.cjs ساخته می‌شود (نه دادهٔ منتشرشدهٔ ناشر)
  DERIVED:   { name_en: "Derived (computed in core build)",    name_fa: "محاسباتی (تولیدشده در ساخت core)" },
};

// ------------------------------------------------------------------
// Canonical macro indicators — label / category used by the Backend.
//   code     : canonical key (same key used by modules and INDICATOR_MAP)
//   label    : English display label
//   category : thematic bucket (grouping for the UI)
//   unit_hint: preferred dashboard unit for that canonical concept when
//              the publisher only stores a "level" series. Kept as a hint:
//              the real per-series `unit` (from core.db) is always kept.
// ------------------------------------------------------------------
const INDICATOR_META = {
  CPI:          { label: "Consumer Price Index",         category: "Inflation", unit_hint: "YoY %" },
  CORE_CPI:     { label: "Core Consumer Price Index",    category: "Inflation", unit_hint: "YoY %" },
  // ---- P1 (2026-09-20): COICOP sub-indices + basket weights ----
  //   CPI_SUB     : خوراک (CP01) · انرژی (CP045_0722/NRG) · مسکن (CP04) ·
  //                 خدمات (SERV) · کالاها (GD) · … — شاخص (۲۰۱۵=۱۰۰) یا نرخ
  //   CPI_WEIGHTS : وزن سبد مصرف‌کننده (Eurostat ‰ · جمع = ۱۰۰۰)
  CPI_SUB:      { label: "CPI Sub-index (COICOP)",       category: "Inflation", unit_hint: "Index" },
  CPI_WEIGHTS:  { label: "CPI Basket Weights",           category: "Inflation", unit_hint: "‰ (per mille)" },
  PPI:          { label: "Producer Price Index",         category: "Inflation", unit_hint: "YoY %" },
  // P3 (2026-09-22): نرخ سیاستی بانک مرکزی (BIS WS_CBPOL) — مقدار خام = درصد
  POLICY_RATE:  { label: "Policy Rate",                  category: "Monetary",  unit_hint: "%" },
  // P3-Signals (2026-09-22): بازدهی اوراق دولتی ۱۰ساله (FRED/OECD IRLTLT01)
  YIELD_10Y:    { label: "10Y Bond Yield",               category: "Monetary",  unit_hint: "%" },
  // P4-Growth (2026-09-22): رشد فصلی/سالانهٔ GDP (OECD GDP_VPV_*)
  GDP_GROWTH:   { label: "GDP Growth",                   category: "Growth",    unit_hint: "%" },
  // P5-Financial (2026-09-23): شاخص‌های بازار جهانی (FAS) — نوسان/دلار/سهام/اعتبار/نقدینگی
  MARKET_GLOBAL: { label: "Global Market",               category: "Financial", unit_hint: "mixed" },

  GDP:          { label: "Gross Domestic Product",       category: "Growth",    unit_hint: "YoY %" },
  IND_PROD:     { label: "Industrial Production",        category: "Growth",    unit_hint: "YoY %" },
  RETAIL_SALES: { label: "Retail Sales",                 category: "Growth",    unit_hint: "YoY %" },

  UNEMP:        { label: "Unemployment Rate",            category: "Labor",     unit_hint: "%" },
  EMP:          { label: "Employment",                   category: "Labor",     unit_hint: "Index" },

  M1:           { label: "Money Supply M1",              category: "Monetary",  unit_hint: "YoY %" },
  M2:           { label: "Money Supply M2",              category: "Monetary",  unit_hint: "YoY %" },
  CLI:          { label: "Composite Leading Indicator",  category: "Cyclical",  unit_hint: "Index" },
  EXPORT:       { label: "Exports",                      category: "Trade",     unit_hint: "YoY %" },
  IMPORT:       { label: "Imports",                      category: "Trade",     unit_hint: "YoY %" },

  // ---- Breadth (data available in core.db) — p2 path 1 (data-driven) ----
  GDP_DEFL:     { label: "GDP Deflator",                 category: "Inflation", unit_hint: "YoY %" },
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
/**
 * Standardize a raw country code (as stored by a dataset's own
 * convention) to ISO3.
 *   BIS stores ISO2  (US → USA); OECD/IMF/WB/FRED/EUROSTAT store ISO3.
 *
 * @param {string} rawCode - country code exactly as stored in series.country
 * @param {string} dataset - dataset code (BIS | IMF | WB | OECD | FRED | EUROSTAT)
 * @returns {string}       - canonical ISO3 code (falls back to raw if unknown)
 */
function toISO3(rawCode, dataset) {
  const raw = String(rawCode || "").trim().toUpperCase();
  if (!raw) return raw;
  if (dataset === "BIS" && ISO2_TO_ISO3[raw]) return ISO2_TO_ISO3[raw];
  // FRED sometimes stores ISO2 too; guard harmlessly.
  if (ISO2_TO_ISO3[raw]) return ISO2_TO_ISO3[raw];
  return raw;
}

/**
 * Country display metadata, keyed by ISO3.
 * @param {string} iso3 - canonical ISO3 code
 * @returns {object} - { code, name_en, name_fa (fallback to code) }
 */
function countryMeta(iso3) {
  const c = COUNTRIES[iso3] || {};
  return {
    code: iso3,
    name_en: c.name_en || iso3,
    name_fa: c.name_fa || iso3,
  };
}

/**
 * Indicator display metadata.
 * @param {string} canonical - canonical indicator key (CPI, GDP, ...)
 * @returns {object} - { code, label, category }
 */
function indicatorMeta(canonical) {
  const m = INDICATOR_META[canonical] || {};
  return {
    code: canonical,
    label: m.label || canonical,
    category: m.category || "Macro",
  };
}

function datasetMeta(code) {
  const m = DATASET_META[code] || {};
  return {
    code,
    name_en: m.name_en || code,
    name_fa: m.name_fa || code,
  };
}

// ------------------------------------------------------------------
// Series unit / kind (Bloomberg-style, registry-derived)
// ------------------------------------------------------------------
// The `series.unit` column copied out of the main DB is NOT trustworthy
// (e.g. BIS CPI carries a meaningless integer like "771"; IMF/WB growth
// rows often have NULL). Unit + *series kind* are derived HERE from
// provider code + canonical indicator so the dashboard always shows a
// meaningful unit and can treat series consistently:
//
//  kind         -> "index"    stored values are a level / index series
//                   "rate"    stored values themselves are YoY / MoM %
//                   "percent" stored values are a ratio expressed in %
//                   "level"   absolute level (e.g. millions USD)
//  display_unit -> unit string sent on the dashboard  ("YoY %", "Index", "%")
// ------------------------------------------------------------------

// ----
// BIS retail/series with a *numerically stored* unit (a meaningless
// dummy). Real units are known by name (CPMI statistics / BIS equities):
//   PAYMENT_DEVICES        credit-transfer/devices counts   -> level (units)
//   PAYMENT_PARTICIPATION  per-capita payment participation -> percent
//   SHARE_PRICES           BIS broad equity price series    -> index
// ----
// Explicit overrides keyed by "<DATASET>::<provider_code>".
const SERIES_KIND_EXPLICIT = {
  // ---- Growth (level index series) -----------------------
  // OECD INDPRO series store the raw industrial-production volume INDEX
  // (2015=100), not a YoY print. Treat it as an index so MoM/YoY become
  // percentage changes and stay comparable inside a growth group. (Same
  // shape as OECD CPI_IDX / PPI above.)
  "OECD::INDPRO":      { kind: "index",   display_unit: "Index (Ind. Prod.)" },
  // ---- BIS (numeric-unit overrides) ----
  "BIS::PAYMENT_DEVICES":        { kind: "level",   display_unit: "Millions of payment instruments" },
  "BIS::PAYMENT_PARTICIPATION":  { kind: "percent", display_unit: "% of population" },
  "BIS::SHARE_PRICES":           { kind: "index",   display_unit: "Index" },
  // ---- Consumer price ----------------
  // BIS WS_LONG_CPI carries TWO measures per (country, frequency) that used to
  // collide under one series_id (P0 fix — MACRO_DATA_INVENTORY.md §5):
  //   628 -> BIS::CPI_IDX (index level)   ·   771 -> BIS::CPI_YOY (YoY %)
  "BIS::CPI_IDX":        { kind: "index",   display_unit: "Index (CPI)" },
  // نرخ سیاستی: مقدار خام = درصد (نرخ رسمی بانک مرکزی)، نه سطح شاخص
  // ⇒ kind=rate تا فرانت‌اند/YoY هیچ محاسبهٔ اشتباهی روی آن انجام ندهد.
  "BIS::POLICY_RATE":    { kind: "rate",    display_unit: "% (policy rate)" },
  // بازدهی ۱۰ساله = نرخ خام (نه درصد تغییر) ⇒ YoY محاسبه نمی‌شود
  "FRED::YIELD_10Y":     { kind: "rate",    display_unit: "% (10Y yield)" },
  // ---- Growth (P4 — 2026-09-22) ---------------------------
  // OECD رشد تولید ناخالص داخلی، خودش **درصد** است (سالانه/فصلی) ⇒ kind=percent
  // تا موتور YoY دوباره نگیرد (وگرنه «۲.۸٪» به «۲.۸٪ تغییر» تبدیل می‌شد).
  "OECD::GDP_VPV_YOY":   { kind: "percent", display_unit: "% (GDP YoY)" },
  "OECD::GDP_VPV_QOQ":   { kind: "percent", display_unit: "% (GDP QoQ)" },
  "OECD::GDP_YOY":       { kind: "percent", display_unit: "% (GDP YoY)" },
  // WB رشد سالانهٔ واقعی GDP (٪) — fallback سالانهٔ چارت رشد
  "WB::NY.GDP.MKTP.KD.ZG": { kind: "percent", display_unit: "% (real GDP growth, annual)" },
  // FRED سطح واقعی GDP (میلیارد دلار زنجیره‌ای) ⇒ index برای MoM/YoY
  // (کلید = `<DATASET>::<provider_code>` مطابق قرارداد همین فایل)
  "FRED::GDPC1":         { kind: "index", display_unit: "Index (real GDP, USA)" },
  // ---- Global market (P5-Financial — 2026-09-23) ----------
  // هر کد با ماهیت خودش: شاخص (level/index) یا نرخ/اسپرد (percent).
  "FRED::VIXCLS":     { kind: "level",   display_unit: "VIX index points" },
  "FRED::DTWEXBGS":   { kind: "index",   display_unit: "Index (broad USD)" },
  "FRED::SP500":      { kind: "index",   display_unit: "Index (S&P 500)" },
  "FRED::BAMLC0A0CM": { kind: "percent", display_unit: "% (IG credit spread OAS)" },
  "FRED::M2SL":       { kind: "index",   display_unit: "Billions USD (M2)" },
  "BIS::CPI_YOY":        { kind: "rate",    display_unit: "YoY %" },
  // LEGACY: the pre-fix mixed series is no longer ingested into core.db;
  // kept so a leftover BIS.*.CPI.* row still resolves to a sane unit.
  "BIS::CPI":            { kind: "index",   display_unit: "Index (CPI, legacy mixed)" },
  "IMF::PCPIPCH":        { kind: "rate",    display_unit: "YoY %" },
  "IMF::PCPIEPCH":       { kind: "rate",    display_unit: "YoY %" },
  "WB::FP.CPI.TOTL":     { kind: "index",   display_unit: "Index (CPI)" },
  "WB::FP.CPI.TOTL.ZG":  { kind: "rate",    display_unit: "YoY %" },
  "OECD::CPI_IDX":       { kind: "index",   display_unit: "Index (CPI)" },
  "OECD::CPI_YOY":       { kind: "rate",    display_unit: "YoY %" },
  "FRED::CPIAUCSL":      { kind: "index",   display_unit: "Index (CPI)" },
  "EUROSTAT::HICP_MIDX": { kind: "index",   display_unit: "Index (HICP)" },
  "EUROSTAT::HICP_ANR":  { kind: "rate",    display_unit: "YoY %" },
  // ---- Core CPI / PPI -----------------
  "FRED::CPILFESL":      { kind: "index",   display_unit: "Index (Core CPI)" },
  // ---- P1: Core رسمی منتشرشده از OECD/Eurostat (2026-09-20) ----
  // OECD     : EXPENDITURE=_TXCP01_NRG = "All items non-food non-energy"
  // EUROSTAT : COICOP=TOT_X_NRG_FOOD  = "Overall index excluding energy and food"
  "OECD::CPI_IDX_TXCP01_NRG":              { kind: "index", display_unit: "Index (Core CPI)" },
  "EUROSTAT::HICP_MIDX_TOT_X_NRG_FOOD":    { kind: "index", display_unit: "Index (Core HICP)" },
  "EUROSTAT::HICP_ANR_TOT_X_NRG_FOOD":     { kind: "rate",  display_unit: "YoY % (Core HICP)" },
  // ---- P1: هستهٔ محاسباتی (۵ کشور بدون Core رسمی) ----
  // ⚠️ این سری دادهٔ منتشرشده نیست؛ روش ساخت در `unit_raw` سری می‌آید.
  "DERIVED::DERIVED_CORE_CPI":             { kind: "rate",  display_unit: "YoY % (derived — see unit_raw)" },
  "OECD::PPI":           { kind: "index",   display_unit: "Index (PPI)" },
  "FRED::PPIACO":        { kind: "index",   display_unit: "Index (PPI)" },
  "FRED::PPIFIS":        { kind: "index",   display_unit: "Index (PPI, fin.)" },
  // ---- Labour --------------------------
  "IMF::LUR":               { kind: "percent", display_unit: "%" },
  "WB::SL.UEM.TOTL.ZS":     { kind: "percent", display_unit: "% of labour force" },
  "WB::SL.UEM.TOTL.NE.ZS":  { kind: "level",   display_unit: "persons" },
  "WB::SL.EMP.TOTL.SP.ZS":  { kind: "percent", display_unit: "% of labour force" },
  "WB::SL.EMP.TOTL.SP.NE.ZS": { kind: "level", display_unit: "persons" },
};

// Suffix / pattern heuristics for codes not listed explicitly above.
const RATE_CODE_RE = /(\.ZG$|\.ZG\.|_YOY|_RPCH|_RP_CH|_PCH|_PCH_|\bPIPCH|ANR$|UNEMP_RATE$|UNE_RT_M$|UNE_RT_Q$|_RATE$)/i;

// Core-inflation families ingested from FRED (OECD/Eurostat re-publications).
// Their ids carry no YoY/PCH marker, so they need explicit rules:
//   CPGRLE01{ISO2}M659N  core CPI (COICOP non-food non-energy), YoY %, monthly
//   {ISO3}CPHPLA01GYM    core HICP (excl. energy/food/alcohol/tobacco), YoY %, monthly
//   {ISO3}CPHPLA01IXOBM  core HICP index, 2015 = 100, monthly
// Used by CORE_CPI.FRED in core_db/build/build_core_db.cjs.
const FRED_CORE_YOY_RE = /^(?:CPGRLE01[A-Z]{2}M659N|[A-Z]{3}CPHPLA01GYM)$/;
const FRED_CORE_INDEX_RE = /^[A-Z]{3}CPHPLA01IXOBM$/;

// ---- P1 (2026-09-20): COICOP sub-index + basket-weight families ----
//   OECD      CPI_IDX_<COICOP>       index  (2015=100)
//   EUROSTAT  HICP_MIDX_<COICOP>     index  (2015=100)
//             HICP_ANR_<COICOP>      rate   (YoY %)
//             HICP_IW_<COICOP>       per-mille weights (جمع = ۱۰۰۰)
//   FRED      CPIFABSL / CPIENGSL / CPIHOSSL / CUUR0000S*   index
// Producer codes come from offline/{oecd,eurostat,fred}/download_*_offline.cjs.
const CPI_SUB_INDEX_RE = /^(?:CPI_IDX_(?:CP\d{2}|CP045_0722|SERV|GD|TXNRG_01_02|TXCP01_NRG)|HICP_MIDX_(?:CP\d{2}|CP045|CP071|CP0722|NRG|FOOD|IGD|SERV|TOT_X_NRG|TOT_X_NRG_FOOD))$/;
const CPI_SUB_RATE_RE = /^HICP_ANR_(?:CP\d{2}|CP045|CP071|CP0722|NRG|FOOD|IGD|SERV|TOT_X_NRG|TOT_X_NRG_FOOD)$/;
const CPI_WEIGHTS_RE = /^HICP_IW_(?:TOTAL|CP\d{2})$/;
const FRED_SUB_INDEX_RE = /^(?:CPI(?:FABSL|ENGSL|HOSSL)|CUUR0000S[A-Z0-9]+)$/;

/**
 * Meaningful unit + kind for a raw series (never trusts series.unit).
 * @param {string} dataset   - BIS | IMF | WB | OECD | FRED | EUROSTAT
 * @param {string} code      - provider indicator code (series.indicator)
 * @param {string} canonical - canonical key (CPI, GDP, UNEMP, ...)
 */
function seriesProfile(dataset, code, canonical) {
  const meta = INDICATOR_META[canonical] || {};
  const key = `${dataset}::${code}`;
  const hit = SERIES_KIND_EXPLICIT[key];
  if (hit) {
    return { kind: hit.kind, display_unit: hit.display_unit, origin: "catalog-explicit" };
  }
  // Core-inflation families ingested from FRED (see the regexes above)
  if (FRED_CORE_YOY_RE.test(code)) {
    return { kind: "rate", display_unit: "YoY %", origin: "pattern-core-yoy" };
  }
  if (FRED_CORE_INDEX_RE.test(code)) {
    return { kind: "index", display_unit: "Index (2015=100)", origin: "pattern-core-index" };
  }
  // ---- P1 families: زیرشاخص COICOP · وزن سبد · زیرشاخص‌های FRED ----
  if (CPI_SUB_INDEX_RE.test(code)) {
    return { kind: "index", display_unit: "Index (2015=100)", origin: "pattern-cpi-sub-index" };
  }
  if (CPI_SUB_RATE_RE.test(code)) {
    return { kind: "rate", display_unit: "YoY %", origin: "pattern-cpi-sub-rate" };
  }
  if (CPI_WEIGHTS_RE.test(code)) {
    return { kind: "level", display_unit: "‰ of basket", origin: "pattern-cpi-weights" };
  }
  if (FRED_SUB_INDEX_RE.test(code)) {
    return { kind: "index", display_unit: "Index (CPI group)", origin: "pattern-fred-sub-index" };
  }
  if (RATE_CODE_RE.test(code)) {
    return { kind: "rate", display_unit: meta.unit_hint || "YoY %", origin: "pattern-rate" };
  }
  if (/\.ZS\./.test(code)) {
    return { kind: "percent", display_unit: "%", origin: "pattern-share" };
  }
  return { kind: "level", display_unit: meta.unit_hint || null, origin: "catalog-generic" };
}

// Min valid history points per frequency for a series to be picked
// (a single-print series is useless for trend / vol / risk dashboard).
const MIN_POINTS_BY_FREQ = { W: 24, M: 12, Q: 6, A: 3 };
const DEFAULT_MIN_POINTS = 6;

function minPointsFor(frequency) {
  return MIN_POINTS_BY_FREQ[frequency] || DEFAULT_MIN_POINTS;
}

module.exports = {
  COUNTRIES,
  ISO2_TO_ISO3,
  DATASET_META,
  INDICATOR_META,
  toISO3,
  countryMeta,
  indicatorMeta,
  datasetMeta,
  seriesProfile,
  minPointsFor,
  SERIES_KIND_EXPLICIT,
  CPI_SUB_INDEX_RE,
  CPI_SUB_RATE_RE,
  CPI_WEIGHTS_RE,
  FRED_SUB_INDEX_RE,
};

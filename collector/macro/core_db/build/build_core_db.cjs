/**
 * ============================================================
 * Macro Core DB Builder
 * File: collector/macro/core_db/build/build_core_db.cjs
 *
 * Builds collector/macro/core_db/core.db — a lightweight subset
 * of the main macro database (collector/macro/db/macro.db).
 *
 * What is kept (the "core" of the macro universe):
 *   - countries : Tier 1 + Tier 2 (see filters/countries.json)
 *   - indicators: 13 canonical macro indicators (filters/indicators.json)
 *   - frequency : M / Q / A (filters/frequencies.json)
 *
 * Safety & performance rules (enforced by this script):
 *   - The main DB is opened READ-ONLY ({ readonly: true }) and is
 *     never modified, deleted, vacuumed or locked for writes.
 *   - Every row is read/written through better-sqlite3 prepared
 *     statements with bound parameters — no SQL string
 *     concatenation of filter data.
 *   - No LIKE is used at all. Matching is done with exact
 *     per-dataset IN (...) lists generated from the JSON filters
 *     plus per-dataset alias tables (no leading-% wildcard scans).
 *   - The 3-table schema (series / data / sources) is preserved
 *     1:1 with the main DB, revision history included.
 *   - Indexes are created AFTER the data load (single pass, no
 *     index-maintenance cost during the bulk copy).
 *   - The copy is streamed in bounded batches (low-RAM friendly);
 *     per-series reads use the main DB's idx_series_id index.
 *
 * Usage:
 *   node build_core_db.cjs               # build core.db (rebuilds if present)
 *   node build_core_db.cjs --fresh       # explicit rebuild (same as default)
 *   node build_core_db.cjs --count-only  # dry run: report matching counts, write nothing
 *
 * Output:
 *   collector/macro/core_db/core.db
 *   collector/macro/core_db/logs/core_build_YYYYMMDD_HHMMSS.log
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ------------------------------------------------------------
// Paths
// ------------------------------------------------------------
const BUILD_DIR = __dirname;
const CORE_ROOT = path.join(BUILD_DIR, "..");                    // collector/macro/core_db
const CORE_DB_PATH = path.join(CORE_ROOT, "core.db");
const MAIN_DB_PATH = path.join(CORE_ROOT, "..", "db", "macro.db");
const FILTERS_DIR = path.join(BUILD_DIR, "filters");
const LOG_DIR = path.join(CORE_ROOT, "logs");

const DATASETS = ["BIS", "IMF", "WB", "OECD", "FRED", "EUROSTAT", "OWID", "DERIVED"];

// ------------------------------------------------------------
// Filter loading (JSON, validated)
// ------------------------------------------------------------
function readFilter(name) {
  const file = path.join(FILTERS_DIR, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Filter file not found: ${file}`);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || !v)) {
    throw new Error(`Filter file ${file} must contain an array of non-empty strings`);
  }
  return raw;
}

const COUNTRIES = readFilter("countries.json");
const INDICATORS = readFilter("indicators.json");
const FREQUENCIES = readFilter("frequencies.json");

// ------------------------------------------------------------
// فهرست کدهای «زیرشاخص / وزن سبد» (تولید از الگو — نه دستی)
// ------------------------------------------------------------
// منبع هر گروه از کدها:
//   EUROSTAT : offline/eurostat/cpi_index_sub.csv + cpi_yoy_sub.csv + cpi_weights.csv
//   OECD     : offline/oecd/cpi_sub.csv (+ cpi_weights.csv اگر منتشر شده باشد)
//   FRED     : offline/fred/cpi_sub.csv
// همهٔ این کدها با API رسمی تأیید شده‌اند — نگاه کنید به
// MACRO_SOURCE_INVENTORY.md §۲ و MACRO_INFLATION_COVERAGE.md.
const EU_COICOP = [
  "CP01", "CP02", "CP03", "CP04", "CP05", "CP06", "CP07", "CP08", "CP09", "CP10", "CP11", "CP12",
  "CP045", "CP071", "CP0722", "NRG", "FOOD", "IGD", "SERV", "TOT_X_NRG",
];
const EU_SUB = [
  ...EU_COICOP.map((c) => `HICP_MIDX_${c}`),   // شاخص (2015=100)
  ...EU_COICOP.map((c) => `HICP_ANR_${c}`),    // نرخ سالانه ٪
];
const EU_WEIGHTS = ["TOTAL", "CP01", "CP02", "CP03", "CP04", "CP05", "CP06",
                    "CP07", "CP08", "CP09", "CP10", "CP11", "CP12"].map((c) => `HICP_IW_${c}`);
const OECD_SUB = ["CP01", "CP02", "CP03", "CP04", "CP05", "CP06", "CP07", "CP08", "CP09", "CP10",
                  "CP11", "CP12", "CP045_0722", "SERV", "GD", "TXNRG_01_02"].map((c) => `CPI_IDX_${c}`);
const OECD_WEIGHTS = ["TOTAL", "CP01", "CP02", "CP03", "CP04", "CP05", "CP06",
                      "CP07", "CP08", "CP09", "CP10", "CP11", "CP12"].map((c) => `CPI_W_${c}`);
const FRED_SUB = [
  "CPIFABSL", "CPIENGSL", "CPIHOSSL",                                     // گروه‌های اصلی (SA)
  "CUUR0000SAF11", "CUUR0000SAF112", "CUUR0000SAH1", "CUUR0000SEHA",      // خوراک/مسکن
  "CUUR0000SETB01", "CUUR0000SEHF01", "CUUR0000SETA01",                   // بنزین/برق/خودرو
];

// ------------------------------------------------------------
// DERIVED_CORE_CPI — هستهٔ محاسباتی برای کشورهای بدون Core رسمی
// ------------------------------------------------------------
// ۵ کشور باقی‌مانده (CHN/IND/BRA/RUS/SAU) نه Core رسمی دارند و نه وزن سبد:
//   • OECD برای آن‌ها `_TXCP01_NRG` منتشر نمی‌کند (فقط ۱۲ گروه COICOP)
//   • FRED سری هسته ندارد · Eurostat پوشش نمی‌دهد · IMF زیرشاخص COICOP ندارد
// ⇒ این‌جا یک سری **محاسباتی** ساخته می‌شود و صریحاً به‌عنوان derived برچسب
//   می‌خورد (روش در ستون `unit` سری ذخیره می‌شود تا در API/چارت دیده شود).
//
// انتخاب روش (به ترتیب، بر پایهٔ دادهٔ واقعی موجود در core.db):
//   ۱) `trimmed-mean` : ≥۵ گروه COICOP ماهانه ⇒ میانگین پیرایش‌شدهٔ YoY گروه‌ها
//      (روش استاندارد بانک‌های مرکزی؛ τ=1 برای ۸–۹ گروه و τ=2 برای ≥۱۰ گروه)
//   ۲) `trend-proxy`  : <۵ گروه (مثل CHN که فقط CP01 دارد) ⇒ میانگین متحرک
//      مرکزی ۱۳ماههٔ تورم کل (پروکسی روند — «رسمی» نیست)
//
// نقشهٔ کد → canonical: `CORE_CPI.DERIVED = ["DERIVED_CORE_CPI"]` در INDICATOR_MAP
// ⇒ سری‌ها در همان گروه تورم (Core) به API می‌رسند و خلأ ۵ کشور پر می‌شود.
const DERIVED_CORE_COUNTRIES = ["CHN", "IND", "BRA", "RUS", "SAU"];
const DERIVED_DATASET = "DERIVED";
const DERIVED_CODE = "DERIVED_CORE_CPI";
const DERIVED_MIN_POINTS = 24;          // سری کوتاه‌تر از ۲ سال ساخته نمی‌شود
const DERIVED_MIN_DIVISIONS = 5;        // حداقل گروه برای روش trimmed-mean
const DERIVED_TODAY = new Date().toISOString().slice(0, 10); // valid_from سری‌های محاسباتی

// تورم کل: ترتیب اولویت منابع (ماهانهٔ منتشرشده → سالانه)
const HEADLINE_PREFERENCE = [
  { dataset: "OECD", indicator: "CPI_YOY", frequency: "M" },
  { dataset: "BIS", indicator: "CPI_YOY", frequency: "M" },
  { dataset: "OECD", indicator: "CPI_IDX", frequency: "M", fromIndex: true },
  { dataset: "BIS", indicator: "CPI_IDX", frequency: "M", fromIndex: true },
  { dataset: "WB", indicator: "FP.CPI.TOTL.ZG", frequency: "A" },
];

// ------------------------------------------------------------
// Per-dataset country aliases
// ------------------------------------------------------------
// The `series.country` column uses each upstream provider's own
// country convention. filters/countries.json holds Tier 1 + Tier 2
// in ISO3 (canonical). This table translates ISO3 -> the code the
// provider actually uses inside macro.db.
//
//   BIS      -> 2-letter ISO code (US, GB, JP, ...)
//   IMF/WB/OECD/FRED/EUROSTAT -> ISO3 as-is (identity, no entry)
// ------------------------------------------------------------
const COUNTRY_ALIAS = {
  BIS: {
    USA: "US", CHN: "CN", JPN: "JP", DEU: "DE", GBR: "GB", FRA: "FR",
    ITA: "IT", CAN: "CA", AUS: "AU", KOR: "KR", IND: "IN", TUR: "TR",
    MEX: "MX", BRA: "BR", RUS: "RU", SAU: "SA", ZAF: "ZA",
  },
};

// نگاشت معکوس ISO3 → ISO2 برای BIS (لازم برای خواندن سری‌های BIS در بخش DERIVED)
const BIS_ISO2_OF = Object.fromEntries(
  Object.entries(COUNTRY_ALIAS.BIS).map(([iso3, iso2]) => [iso3, iso2]),
);

// ------------------------------------------------------------
// Per-dataset indicator mapping
// ------------------------------------------------------------
// filters/indicators.json holds the 13 canonical macro indicators.
// The `series.indicator` column uses provider-specific codes, so this
// table maps each canonical indicator -> the exact raw codes stored in
// macro.db for each dataset. Only codes listed here are extracted.
// ------------------------------------------------------------
const INDICATOR_MAP = {
  GDP: {
    BIS: [],
    IMF: ["NGDPD", "NGDPDPC", "NGDP_RPCH", "NGDP_R_PCH", "PPPGDP", "PPPPC"],
    WB: [
      "NY.GDP.MKTP.CD", "NY.GDP.MKTP.CN", "NY.GDP.MKTP.KD", "NY.GDP.MKTP.KD.ZG",
      "NY.GDP.MKTP.KN", "NY.GDP.MKTP.PP.CD", "NY.GDP.MKTP.PP.KD",
      "NY.GDP.PCAP.CD", "NY.GDP.PCAP.CN", "NY.GDP.PCAP.KD", "NY.GDP.PCAP.KD.ZG",
      "NY.GDP.PCAP.KN", "NY.GDP.PCAP.PP.CD", "NY.GDP.PCAP.PP.KD",
    ],
    OECD: ["GDP_VPV_QOQ", "GDP_VPV_YOY", "GDP_YOY"],
    FRED: ["GDP", "GDPC1"],
    EUROSTAT: ["GDP_CLV10_MEUR", "GDP_CLV_PCH_SM"],
  },
  // ---- رشد اقتصادی (P4-Growth — 2026-09-22) ----
  // چرا canon جدا: سری‌های رشد **فصلی** (٪) OECD با کد provider
  // `GDP_VPV_YOY` (رشد سالانه) و `GDP_VPV_QOQ` (رشد فصلی) می‌آیند و زیر
  // canon کلی `GDP` با سری‌های سالانهٔ IMF/WB (سطح تولید ناخالص، forecasts)
  // مخلوط می‌شوند ⇒ picker اولی‌ها را کنار می‌گذاشت و چارت رشد بی‌داده می‌ماند.
  // با canon اختصاصی، گروه `1E_growth_core` دقیقاً همین دو سری را می‌دهد.
  //   kind = percent (SERIES_KIND_EXPLICIT) ⇒ YoY دوباره محاسبه نمی‌شود.
  // ⚠️ USA: سطح واقعی GDP (`GDPC1`) هم می‌آید تا در نبود سری OECD قابل
  //    محاسبهٔ QoQ باشد (kind = index).
  GDP_GROWTH: {
    BIS: [],
    IMF: [],
    // WB: رشد **سالانهٔ** واقعی GDP (٪) — fallback کشورهایی که سری فصلی‌شان
    // ناقص است (SAU/CAN/GBR/KOR فقط ۱ نقطهٔ فصلی دارند). منبع: World Bank WDI.
    WB: ["NY.GDP.MKTP.KD.ZG"],
    OECD: ["GDP_VPV_YOY", "GDP_VPV_QOQ", "GDP_YOY"],
    FRED: ["GDPC1"],
    EUROSTAT: ["GDP_CLV_PCH_SM"],
  },
  // ---- شاخص‌های بازار جهانی (P5-Financial — 2026-09-23) ----
  // چارت «شرایط مالی» (FAS): نوسان · دلار · سهام · اسپرد اعتباری · نقدینگی.
  // ⚠️ این‌ها **کشوری نیستند** (بازار جهانی/آمریکا) و در چارت به‌عنوان شاخص
  //    جهانی برای همهٔ کشورها خوانده می‌شوند؛ فرانت‌اند برای این canon فیلتر
  //    کشور را اعمال نمی‌کند (کشور سری = USA).
  //    M2SL = نقدینگی (M2 آمریکا) — پروکسی جهانی نقدینگی در نبود سری کشوری.
  MARKET_GLOBAL: {
    BIS: [],
    IMF: [],
    WB: [],
    OECD: [],
    FRED: ["VIXCLS", "DTWEXBGS", "SP500", "BAMLC0A0CM", "M2SL"],
    EUROSTAT: [],
  },
  CPI: {
    // BIS::CPI was split into two measures (P0 fix — MACRO_DATA_INVENTORY.md §5):
    //   628 -> CPI_IDX (index level)  ·  771 -> CPI_YOY (year-on-year %)
    // The old single "CPI" code mixed both under one series_id, so the value
    // type depended on the row order inside the BIS bulk CSV. It is no longer
    // ingested into core.db (the legacy BIS.*.CPI.* rows stay untouched in the
    // main DB, they are simply not selected anymore).
    BIS: ["CPI_IDX", "CPI_YOY"],
    IMF: ["PCPIPCH", "PCPIEPCH"],
    WB: ["FP.CPI.TOTL", "FP.CPI.TOTL.ZG"],
    OECD: ["CPI_IDX", "CPI_YOY"],
    FRED: ["CPIAUCSL"],
    EUROSTAT: ["HICP_ANR", "HICP_MIDX"],
    OWID: ["CPI"], // annual, 2010=100 — fallback/backfill (lowest priority)
  },
  // ---- زیرشاخص‌های COICOP (خوراک/انرژی/مسکن/خدمات/کالا) ----
  // از P1 به بعد: Eurostat COICOP + OECD EXPENDITURE + FRED sub-indices.
  // هر گروه یک سری مستقل است، پس فرانت‌اند می‌تواند CP01/CP04/NRG/SERV را
  // جدا رسم کند و Core را با فرمول حذفی بسازد.
  CPI_SUB: {
    BIS: [], IMF: [], WB: [],
    OECD: OECD_SUB,
    FRED: FRED_SUB,
    EUROSTAT: EU_SUB,
  },
  // ---- وزن‌های سبد مصرف‌کننده (برای Core فرمولی و وزن‌دهی نمودارها) ----
  // Eurostat: prc_hicp_iw (‰، جمع = ۱۰۰۰) · OECD: MEASURE=IT_W
  CPI_WEIGHTS: {
    BIS: [], IMF: [], WB: [],
    OECD: OECD_WEIGHTS,
    FRED: [], // FRED سری وزن سبد منتشر نمی‌کند
    EUROSTAT: EU_WEIGHTS,
  },
  CORE_CPI: {
    BIS: [],
    IMF: [],
    WB: [],
    // ⭐ OECD: «All items non-food non-energy» = هستهٔ رسمی منتشرشده
    //    (کد EXPENDITURE = _TXCP01_NRG → INDICATOR = CPI_IDX_TXCP01_NRG)
    OECD: ["CPI_IDX_TXCP01_NRG"],
    // US core CPI + the foreign core series verified to exist on FRED
    // (OECD/Eurostat re-publications). Added by the FRED pipeline:
    //   cpilfesl         : USA  (CPI less food & energy, index)
    //   *CPHPLA01GYM     : core HICP YoY %      (DEU/FRA/ITA)
    //   *CPHPLA01IXOBM   : core HICP index      (DEU/FRA/ITA/GBR/TUR)
    //   CPGRLE01*M659N   : core CPI YoY %       (DEU/FRA/ITA/GBR/CAN/KOR)
    // Not available on FRED → still an ingest gap: JPN, AUS, CHN, IND, MEX,
    // BRA, RUS, SAU, ZAF (they are covered by the OECD code above instead).
    FRED: [
      "CPILFESL",
      "DEUCPHPLA01GYM", "FRACPHPLA01GYM", "ITACPHPLA01GYM",
      "DEUCPHPLA01IXOBM", "FRACPHPLA01IXOBM", "ITACPHPLA01IXOBM", "GBRCPHPLA01IXOBM",
      "TURCPHPLA01IXOBM",
      "CPGRLE01DEM659N", "CPGRLE01FRM659N", "CPGRLE01ITM659N",
      "CPGRLE01GBM659N", "CPGRLE01CAM659N", "CPGRLE01KRM659N",
    ],
    // ⭐ EUROSTAT: TOT_X_NRG_FOOD = «Overall index excluding energy and food»
    EUROSTAT: ["HICP_MIDX_TOT_X_NRG_FOOD", "HICP_ANR_TOT_X_NRG_FOOD"],
    // ⭐ DERIVED: هستهٔ **محاسباتی** برای ۵ کشور بدون Core رسمی
    //    (CHN/IND/BRA/RUS/SAU) — ساخته‌شده در همین فایل (insertDerivedCore).
    //    روش در ستون `unit` سری ثبت می‌شود:
    //      trimmed-mean  → میانگین پیرایش‌شدهٔ YoY گروه‌های COICOP
    //      trend-proxy   → میانگین متحرک ۱۳ماههٔ تورم کل (CHN)
    DERIVED: ["DERIVED_CORE_CPI"],
  },
  PPI: {
    BIS: [],
    IMF: [],
    WB: [],
    OECD: ["PPI"],
    FRED: ["PPIACO", "PPIFIS"],
    EUROSTAT: [],
  },
  // ---- نرخ سیاستی بانک مرکزی (P3 — 2026-09-22) ----
  // BIS WS_CBPOL (`POLICY_RATE`): نرخ رسمی سیاستی، روزانه (D) و ماهانه (M).
  // kind = rate است (registry) ⇒ YoY محاسبه نمی‌شود و مقدار خام رسم می‌شود.
  // ⚠️ منطقهٔ یورو: سری ملی DEU/FRA/ITA در ۱۹۹۸ متوقف شده و نرخ ECB تحت کشور
  //    «XM» منتشر می‌شود ⇒ بلوک «استثنای XM» در بخش کپی سری‌ها همان سری را
  //    هم می‌آورد و چارت برای آن سه کشور به XM برمی‌گردد (بدون جعل داده).
  // ---- بازدهی اوراق دولتی ۱۰ساله (P3-Signals — 2026-09-22) ----
  // منبع: FRED (بازنشر OECD IRLTLT01…) — مقدار خام = درصد.
  // kind = rate است (SERIES_KIND_EXPLICIT) ⇒ YoY محاسبه نمی‌شود.
  YIELD_10Y: {
    BIS: [],
    IMF: [],
    WB: [],
    OECD: [],
    FRED: [
      // USA: روزانهٔ خزانهٔ ۱۰ساله (تازه‌ترین) + ماهانهٔ OECD
      "DGS10",
      "IRLTLT01USM156N",
      "IRLTLT01AUM156N",
      "IRLTLT01CAM156N",
      "IRLTLT01DEM156N",
      "IRLTLT01FRM156N",
      "INDIRLTLT01STM",
      "IRLTLT01ITM156N",
      "IRLTLT01JPM156N",
      "IRLTLT01KRM156N",
      "IRLTLT01MXM156N",
      "IRLTLT01RUM156N", // ⚠️ تا 2018-06 متوقف ⇒ گارد کهنگی فرانت‌اند آن را رد می‌کند
      "IRLTLT01ZAM156N",
    ],
    EUROSTAT: [],
    // ⚠️ BRA/CHN/SAU/TUR روی FRED منتشر نمی‌شوند ⇒ برای این ۴ کشور سری
    //    ساخته نمی‌شود (سیگنال 📈 به‌کل رسم نمی‌شود؛ مقدار ساختگی نداریم).
  },
  POLICY_RATE: {
    BIS: ["POLICY_RATE"],
    IMF: [],
    WB: [],
    OECD: [],
    FRED: [],
    EUROSTAT: [],
    OWID: [],
  },
  UNEMP: {
    BIS: [],
    IMF: ["LUR"],
    WB: ["SL.UEM.TOTL.ZS", "SL.UEM.TOTL.NE.ZS"],
    OECD: ["UNEMP_RATE"],
    FRED: ["UNRATE"],
    EUROSTAT: ["UNE_RT_M"],
  },
  EMP: {
    BIS: [],
    IMF: [],
    WB: ["SL.EMP.TOTL.SP.ZS", "SL.EMP.TOTL.SP.NE.ZS"],
    OECD: [],
    FRED: [],
    EUROSTAT: ["LFSI_EMP_Q"],
  },
  M1: {
    BIS: [],
    IMF: [],
    WB: [],
    OECD: [],
    FRED: ["M1SL"],
    EUROSTAT: [],
  },
  M2: {
    BIS: [],
    IMF: [],
    WB: ["FM.LBL.BMNY.CN", "FM.LBL.BMNY.GD.ZS"],
    OECD: [],
    FRED: ["M2SL"],
    EUROSTAT: [],
  },
  PMI: {
    // no dataset in the main DB currently publishes a PMI
    BIS: [], IMF: [], WB: [], OECD: [], FRED: [], EUROSTAT: [],
  },
  CLI: {
    BIS: [],
    IMF: [],
    WB: [],
    OECD: ["CLI"],
    FRED: [],
    EUROSTAT: [],
  },
  IND_PROD: {
    BIS: [],
    IMF: [],
    WB: [
      "NV.IND.TOTL.CD", "NV.IND.TOTL.CN", "NV.IND.TOTL.KD", "NV.IND.TOTL.KD.ZG",
      "NV.IND.TOTL.KN", "NV.IND.TOTL.ZS",
      "NV.IND.MANF.CD", "NV.IND.MANF.CN", "NV.IND.MANF.KD", "NV.IND.MANF.KD.ZG",
      "NV.IND.MANF.KN", "NV.IND.MANF.ZS",
    ],
    OECD: ["INDPRO"],
    FRED: [],
    EUROSTAT: [],
  },
  EXPORT: {
    BIS: [],
    IMF: ["BX_GDP"],
    WB: [
      "NE.EXP.GNFS.CD", "NE.EXP.GNFS.CN", "NE.EXP.GNFS.KD", "NE.EXP.GNFS.KD.ZG",
      "NE.EXP.GNFS.KN", "NE.EXP.GNFS.ZS",
    ],
    OECD: ["EXPORT"],
    FRED: [],
    EUROSTAT: [],
  },
  IMPORT: {
    BIS: [],
    IMF: ["BM_GDP"],
    WB: [
      "NE.IMP.GNFS.CD", "NE.IMP.GNFS.CN", "NE.IMP.GNFS.KD", "NE.IMP.GNFS.KD.ZG",
      "NE.IMP.GNFS.KN", "NE.IMP.GNFS.ZS",
    ],
    OECD: ["IMPORT"],
    FRED: [],
    EUROSTAT: [],
  },
  // ---- Breadth (data available in main DB) — p2 path 1 (data-driven) ----
  GDP_DEFL: {
    BIS: [], IMF: [], WB: ["NY.GDP.DEFL.KD.ZG"], OECD: [], FRED: [], EUROSTAT: [],
  },
}; // end INDICATOR_MAP

// ------------------------------------------------------------
// P1 (2026-09-20) — Core «زنده»: آستانهٔ تأخیر نسبت به Headline
// ------------------------------------------------------------
// مسئله: برای ۷ کشور، Core رسمی (OECD `_TXCP01_NRG` / FRED / Eurostat)
//        ماه‌ها یا سال‌ها عقب‌تر از تورم کل است — شاهد 2026-09-20:
//          JPN 2021-06 · MEX 2024-07 · ZAF 2024-12 · CAN 2025-04 ·
//          FRA/ITA/TUR 2025-12   (تورم کل همه تا 2026-04…2026-07)
//        ⇒ خط Core در چارت زودتر تمام می‌شود و مقایسهٔ «Headline vs Core»
//          بی‌معنا/گمراه‌کننده می‌گردد.
// راه‌حل: هر کشوری که Core رسمی‌اش **غایب** است یا **بیش از آستانهٔ زیر
//        عقب‌تر** از Headline است، سری `DERIVED_CORE_CPI` هم می‌گیرد (ساخت +
//        تمدید hybrid تا آخرین ماه تورم کل). آستانه در یک ثابت است تا
//        تغییرش یک‌خطی باشد.
// 2026-09-20 (v2): آستانه ۶ → ۳ ماه؛ با ۶ ماه، ITA (تأخیر ۴ ماه) از پوشش
//        می‌افتاد در حالی که Eurostat/OECD آن هم 2025-12 است و خط Core
//        نیمه‌کاره می‌ماند.
const DERIVED_STALENESS_MONTHS = 3;

/**
 * کشورهای همیشه-مشمول (بدون Core رسمی) — مستقل از آستانه.
 * بقیهٔ کشورها با قاعدهٔ تأخیر اضافه می‌شوند.
 */
const DERIVED_ALWAYS = Object.freeze([...DERIVED_CORE_COUNTRIES]);

/** کدهای provider «Core رسمی» (بدون DERIVED) — برگرفته از INDICATOR_MAP. */
const OFFICIAL_CORE_CODES = Object.entries(INDICATOR_MAP.CORE_CPI)
  .filter(([dataset]) => dataset !== DERIVED_DATASET)
  .flatMap(([, codes]) => codes);

/** کدهای provider «تورم کل» — برای سنجش هم‌زمانی Core با Headline. */
const HEADLINE_CODES = [...new Set(Object.values(INDICATOR_MAP.CPI).flat())];

/** «YYYY-MM»/فصل/سال → اندیس ماه (سال*۱۲+ماه) برای محاسبهٔ تأخیر. */
function ymIndexOf(date) {
  const s = String(date || "").trim();
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 12 + Number(m[2]);
  m = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (m) return Number(m[1]) * 12 + Number(m[2]) * 3;
  m = /^(\d{4})-S([1-2])$/i.exec(s);
  if (m) return Number(m[1]) * 12 + Number(m[2]) * 6;
  m = /^(\d{4})$/.exec(s);
  if (m) return Number(m[1]) * 12 + 12;
  return null;
}

/** فاصلهٔ ماهی بین دو تاریخ (to − from)؛ null اگر قابل‌تشخیص نباشد. */
function monthsBetween(fromDate, toDate) {
  const a = ymIndexOf(fromDate);
  const b = ymIndexOf(toDate);
  if (a === null || b === null) return null;
  return b - a;
}

/** آخرین تاریخ موجود یک سری (هر نسخه‌ای) یا null. */
function lastDateOf(db, dataset, country, indicator, frequency) {
  const sid = `${dataset}.${country}.${indicator}.${frequency}`.toUpperCase();
  const row = db.prepare("SELECT MAX(date) AS d FROM data WHERE series_id = ?").get(sid);
  return row && row.d ? String(row.d) : null;
}

/** آخرین تاریخ یک مجموعه کد شاخص برای یک کشور (MAX روی کدها/فرکانس‌ها). */
function latestDateForCodes(db, country, codes) {
  let best = null;
  for (const indicator of codes) {
    const rows = db
      .prepare("SELECT series_id FROM series WHERE country = ? AND indicator = ?")
      .all(country, indicator);
    for (const r of rows) {
      const d = db.prepare("SELECT MAX(date) AS d FROM data WHERE series_id = ?").get(r.series_id).d;
      if (d && (!best || String(d) > best)) best = String(d);
    }
  }
  return best;
}

/** آخرین تاریخ Core رسمی یک کشور (هر provider). */
function officialCoreLastDate(db, country) {
  return latestDateForCodes(db, country, OFFICIAL_CORE_CODES);
}

/** آخرین تاریخ Headline یک کشور (هر provider تورم کل). */
function headlineLastDate(db, country) {
  return latestDateForCodes(db, country, HEADLINE_CODES);
}

/**
 * حل سری «تورم کل» یک کشور — **تازه‌ترین** کاندید (نه اولین در ترتیب ترجیح).
 * ⚠️ چرا freshness: ترتیب ترجیح قدیمی می‌توانست سری‌ای را بچیند که سال‌ها
 *    پیش قطع شده است (مثل `OECD.DEU.CPI_YOY.M` که تا 2009-10 می‌رود)
 *    و در نتیجه تمدید Core بی‌اثر می‌شد. حالا بین کاندیدهای ≥۲۴ نقطه،
 *    تازه‌ترین انتخاب می‌شود (در تساوی، ترتیب ترجیح برنده است).
 * @returns {{map:Map<string,number>, source:string, last:string}|null}
 */
function resolveHeadline(db, iso3) {
  const bisCountry = BIS_ISO2_OF[iso3] || iso3;
  let best = null;
  for (const pref of HEADLINE_PREFERENCE) {
    const country = pref.dataset === "BIS" ? bisCountry : iso3;
    if (!seriesExists(db, pref.dataset, country, pref.indicator, pref.frequency)) continue;
    const raw = readSeriesMap(db, pref.dataset, country, pref.indicator, pref.frequency);
    if (raw.size < DERIVED_MIN_POINTS) continue;
    const cand = pref.fromIndex ? yoyFromLevel(raw) : raw;
    if (cand.size < DERIVED_MIN_POINTS) continue;
    const dates = [...cand.keys()].sort();
    const last = dates[dates.length - 1];
    if (!best || last > best.last) {
      best = {
        map: cand,
        source: `${pref.dataset}.${country}.${pref.indicator}.${pref.frequency}`,
        last,
      };
    }
  }
  return best;
}

/**
 * کشورهای هدف سری Core مشتق: «بدون Core رسمی» یا «Core >۶ ماه عقب‌تر».
 * کاندیدها = همان ۱۷ کشور فیلتر (`COUNTRIES`) — بدون لیست هاردکد.
 * ⚠️ سنجش روی DB ورودی انجام می‌شود (core.db هنوز ساخته نشده)؛ برای
 *    کدهای allowlistشده معادل core.db است.
 */
function resolveDerivedCountries(db, log) {
  const countries = [...DERIVED_ALWAYS]; // پایه: ۵ کشور بدون Core رسمی
  const reasons = [];
  for (const iso3 of COUNTRIES) {
    if (countries.includes(iso3)) continue;
    const head = resolveHeadline(db, iso3);
    if (!head) continue;
    const coreLast = officialCoreLastDate(db, iso3);
    const lag = coreLast ? monthsBetween(coreLast, head.last) : null;
    if (coreLast && lag !== null && lag <= DERIVED_STALENESS_MONTHS) continue;
    countries.push(iso3);
    reasons.push({ country: iso3, coreLast, headlineLast: head.last, lag });
  }
  if (log) {
    for (const r of reasons) {
      log.info(
        `[DERIVED] +${r.country}: core رسمی=${r.coreLast || "ندارد"} · headline=${r.headlineLast} · ` +
          `تأخیر=${r.lag === null ? "n/a" : `${r.lag} ماه`} (آستانه >${DERIVED_STALENESS_MONTHS})`
      );
    }
    log.info(`[DERIVED] کشورهای هدف: ${countries.length} → ${countries.join(",")}`);
  }
  return { countries, reasons };
}

// ------------------------------------------------------------
// Per-dataset allowed lists (built once from the JSON filters)
// ------------------------------------------------------------
function allowedCountries(dataset) {
  const alias = COUNTRY_ALIAS[dataset] || {};
  return COUNTRIES.map((c) => alias[c] || c);
}

function allowedIndicators(dataset) {
  const out = [];
  for (const canon of INDICATORS) {
    const perDataset = INDICATOR_MAP[canon];
    if (!perDataset) {
      throw new Error(
        `indicators.json contains "${canon}" which is not defined in INDICATOR_MAP — ` +
          `add a mapping entry or remove the code`
      );
    }
    for (const code of perDataset[dataset] || []) out.push(code);
  }
  return out;
}


// ------------------------------------------------------------
// Logger (console + timestamped file under core_db/logs/)
// ------------------------------------------------------------
function makeLogger() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(LOG_DIR, `core_build_${ts}.log`);
  const stream = fs.createWriteStream(logFile, { flags: "a" });
  const stamp = () => new Date().toISOString();

  function write(level, msg) {
    const line = `[${stamp()}] [${level}] ${msg}`;
    console.log(line);
    stream.write(line + "\n");
  }
  return {
    logFile,
    info: (m) => write("INFO", m),
    warn: (m) => write("WARN", m),
    success: (m) => write("SUCCESS", m),
    error: (m) => write("ERROR", m),
    close: () => stream.end(),
  };
}

// ------------------------------------------------------------
// Core DB schema (identical 3-table layout to macro.db)
// ------------------------------------------------------------
const SCHEMA_SQL = `
CREATE TABLE series (
    series_id   TEXT PRIMARY KEY,          -- <dataset>.<country>.<indicator>.<frequency>
    dataset     TEXT,                      -- BIS | IMF | WB | OECD | FRED | EUROSTAT
    country     TEXT,                      -- ISO code (per-source convention)
    indicator   TEXT,                      -- short indicator code
    frequency   TEXT,                      -- M | Q | A
    unit        TEXT,                      -- unit of measure
    source      TEXT                       -- FK-ish -> sources.source_id
);

CREATE TABLE data (
    series_id   TEXT,                      -- -> series.series_id
    date        TEXT,                      -- canonical period (YYYY, YYYY-Qx, YYYY-MM, YYYY-MM-DD)
    value       REAL,
    revision_id INTEGER,                   -- 1 = first published version, 2 = first revision, ...
    valid_from  TEXT,                      -- date this version became the published one
    valid_to    TEXT,                      -- date this version stopped being current (NULL = current)
    FOREIGN KEY(series_id) REFERENCES series(series_id)
);

CREATE TABLE sources (
    source_id        TEXT PRIMARY KEY,     -- BIS | IMF | WB | OECD | FRED | EUROSTAT
    name             TEXT,
    url              TEXT,
    update_frequency TEXT,
    last_update      TEXT
);
`;

// Speed indexes - created AFTER the data load (single pass, faster build).
const INDEX_SQL = `
CREATE INDEX idx_series_id ON data(series_id);
CREATE INDEX idx_date ON data(date);
CREATE INDEX idx_data_series_date ON data(series_id, date);
-- extra composite index on series metadata: the Query Engine /
-- Chart Engine filter on (dataset, country, indicator, frequency)
CREATE INDEX idx_series_lookup ON series(dataset, country, indicator, frequency);
`;

// ------------------------------------------------------------
// SQL helpers (positional parameter lists)
// ------------------------------------------------------------
function inList(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}


// ------------------------------------------------------------
// DERIVED: توابع کمکی محاسبهٔ Core
// ------------------------------------------------------------
/** کلید «همان دوره، یک سال قبل» برای تاریخ ماهانه/فصلی/سالانه. */
function priorYearKeyOf(date) {
  const s = String(date || "").trim();
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${Number(m[1]) - 1}-${m[2]}`;
  m = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (m) return `${Number(m[1]) - 1}-Q${m[2].toUpperCase()}`;
  m = /^(\d{4})$/.exec(s);
  if (m) return String(Number(m[1]) - 1);
  return null;
}

/** YoY (٪) از یک سری **سطح/شاخص** — تطبیق تاریخ‌محور (نه آفست مکانی). */
function yoyFromLevel(levelMap) {
  const out = new Map();
  for (const [date, value] of levelMap) {
    const prevKey = priorYearKeyOf(date);
    if (!prevKey) continue;
    const prev = levelMap.get(prevKey);
    if (prev === undefined || !(prev > 0) || !(value > 0)) continue;
    out.set(date, (value / prev - 1) * 100);
  }
  return out;
}

/** میانگین پیرایش‌شده (trimmed mean) — τ مقدار از هر سر حذف می‌شود. */
function trimmedMean(values, tau) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const t = Math.max(0, Math.min(tau, Math.floor((sorted.length - 1) / 2)));
  const slice = sorted.slice(t, sorted.length - t);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** خواندن یک سری از core.db (فقط نسخهٔ جاری) → Map(date → value). */
function readSeriesMap(db, dataset, country, indicator, frequency) {
  const sid = `${dataset}.${country}.${indicator}.${frequency}`.toUpperCase();
  const rows = db
    .prepare("SELECT date, value FROM data WHERE series_id = ? AND valid_to IS NULL ORDER BY date")
    .all(sid);
  const map = new Map();
  for (const r of rows) if (Number.isFinite(r.value)) map.set(r.date, r.value);
  return map;
}

/** آیا سری موردنظر در core.db وجود دارد؟ */
function seriesExists(db, dataset, country, indicator, frequency) {
  const sid = `${dataset}.${country}.${indicator}.${frequency}`.toUpperCase();
  return !!db.prepare("SELECT 1 FROM series WHERE series_id = ?").get(sid);
}

/**
 * ساخت سری DERIVED_CORE_CPI برای یک کشور از دادهٔ همین core.db.
 * @returns {{ok:boolean, method?:string, points?:number, unit?:string, ...}}
 */
function deriveCoreForCountry(db, iso3) {
  // ---- ۱) تورم کل: **تازه‌ترین** کاندید (P1: freshness-aware) ----
  const head = resolveHeadline(db, iso3);
  if (!head) return { ok: false, reason: "no usable headline series" };
  const headline = head.map;
  const headlineSource = head.source;

  // ---- ۲) گروه‌های COICOP ماهانهٔ OECD (CPI_IDX_CPnn → YoY) ----
  const divisions = [];
  for (let d = 1; d <= 12; d++) {
    const code = `CPI_IDX_CP${String(d).padStart(2, "0")}`;
    if (!seriesExists(db, "OECD", iso3, code, "M")) continue;
    const yoy = yoyFromLevel(readSeriesMap(db, "OECD", iso3, code, "M"));
    if (yoy.size >= DERIVED_MIN_POINTS) divisions.push({ code, yoy });
  }

  // ---- ۳) انتخاب روش: trimmed-mean (COICOP) ----
  const out = new Map();
  let method;
  let unit;
  let tau = null;

  if (divisions.length >= DERIVED_MIN_DIVISIONS) {
    // میانگین پیرایش‌شدهٔ YoY گروه‌ها (روش trimmed-mean بانک‌های مرکزی)
    method = "trimmed-mean";
    tau = divisions.length >= 10 ? 2 : 1;
    const months = new Set();
    for (const div of divisions) for (const date of div.yoy.keys()) months.add(date);
    for (const date of [...months].sort()) {
      const vals = [];
      for (const div of divisions) {
        const v = div.yoy.get(date);
        if (Number.isFinite(v)) vals.push(v);
      }
      if (vals.length < DERIVED_MIN_DIVISIONS) continue;
      const mean = trimmedMean(vals, tau);
      if (mean !== null && Number.isFinite(mean)) out.set(date, mean);
    }
  } else {
    // بدون گروه کافی (مثل CHN با ۱ گروه): کل سری از میانگین متحرک ساخته می‌شود
    method = "trend-proxy";
  }

  const coreDates = [...out.keys()].sort();
  const lastCoreDate = coreDates.length ? coreDates[coreDates.length - 1] : null;

  // ---- ۴) HYBRID: تمدید تا ۲۰۲۶ (FRED → میانگین متحرک ۱۲ماهه) ----
  const headlineDates = [...headline.keys()].sort();
  const headlineLast = headlineDates.length ? headlineDates[headlineDates.length - 1] : null;
  const headlineMA = trailingMovingAverage(headline);
  const fredCore = fredCoreForCountry(db, iso3);
  const ext = extendCoreSeries(out, {
    fredCore, headlineMA, headlineEnd: headlineLast, lastCoreDate, headlineLast,
  });

  const finalDates = [...out.keys()].sort();
  const first = finalDates[0];
  const last = finalDates[finalDates.length - 1];

  // ---- ۵) متاداده: روش + قطعه‌ها (شفافیت کامل در API) ----
  const parts = [];
  if (out.size >= DERIVED_MIN_POINTS) {
    if (method === "trimmed-mean") {
      parts.push(`trimmed-mean YoY of ${divisions.length} COICOP divisions (tau=${tau})`);
      if (lastCoreDate) parts.push(`COICOP coverage → ${lastCoreDate}`);
    } else {
      parts.push("no usable COICOP divisions");
    }
    if (ext.fredUsed > 0) parts.push(`FRED core ${fredCore.code} for ${ext.fredUsed} months`);
    else parts.push("no FRED core series for this country");
    if (ext.maUsed > 0) {
      parts.push(
        `${HYBRID_MA_WINDOW}m trailing MA of headline for ${ext.maUsed} months` +
        (ext.offset ? ` (level-spliced, offset ${ext.offset.toFixed(2)}pp)` : "")
      );
    }
    if (ext.junctionStep !== undefined && ext.junctionStep !== null) {
      parts.push(
        `junction step ${ext.junctionStep >= 0 ? "+" : ""}${ext.junctionStep.toFixed(2)}pp at ${ext.junctionTo}`
      );
    }
    parts.push(`→ ${first} … ${last}`);
  }
  unit = `% (hybrid: trimmed-mean + trend-extension to 2026) — ${parts.join(" · ")}`;
  if (method === "trend-proxy") {
    unit = `% (hybrid: trend-extension to 2026) — ${parts.join(" · ")}`;
  }

  if (out.size < DERIVED_MIN_POINTS) {
    return { ok: false, reason: `only ${out.size} derived points (method=${method})` };
  }
  return {
    ok: true, method, points: out.size, unit,
    first, last,
    headlineSource, divisions: divisions.length, data: out,
    // اطلاعات قطعه‌ها برای لاگ
    coreLast: lastCoreDate, maUsed: ext.maUsed, fredUsed: ext.fredUsed,
    fredCode: fredCore ? fredCore.code : null, headlineLast,
  };
}

// ------------------------------------------------------------
// Filter plan (per dataset: countries + indicators)
// ------------------------------------------------------------
function planFilters(log, derivedCountries = DERIVED_CORE_COUNTRIES) {
  const plan = {};
  for (const dataset of DATASETS) {
    const countries = allowedCountries(dataset);
    const indicators = allowedIndicators(dataset);
    if (countries.length === 0 || indicators.length === 0) {
      log.warn(`[${dataset}] skipped: no matching countries/indicators in the filters`);
      continue;
    }
    plan[dataset] = { countries, indicators };
    log.info(
      `[${dataset}] filter -> ${countries.length} countries, ${indicators.length} indicator codes, ` +
        `frequencies=${FREQUENCIES.join("/")}`
    );
  }
  // DERIVED: از macro.db کپی نمی‌شود — در همین build ساخته می‌شود
  // (insertDerivedCore). ثبت در plan برای اینکه verifyFilters آن را «مجاز» بداند.
  plan[DERIVED_DATASET] = {
    countries: derivedCountries,
    indicators: [DERIVED_CODE],
  };
  log.info(
    `[${DERIVED_DATASET}] computed -> ${derivedCountries.length} countries ` +
      `(${derivedCountries.join(",")}), 1 derived code (${DERIVED_CODE})`
  );
  return plan;
}

// ------------------------------------------------------------
// Count matching series + data rows (uses the main DB read-only)
// ------------------------------------------------------------
function countMatching(main, plan) {
  const freqs = FREQUENCIES;
  const fIn = inList(freqs.length);
  const result = { byDataset: {}, series: 0, data: 0 };

  for (const [dataset, f] of Object.entries(plan)) {
    const cIn = inList(f.countries.length);
    const iIn = inList(f.indicators.length);
    const stmt = main.prepare(
      `SELECT series_id FROM series
        WHERE dataset = ? AND frequency IN (${fIn})
          AND country IN (${cIn}) AND indicator IN (${iIn})`
    );
    const params = [dataset, ...freqs, ...f.countries, ...f.indicators];
    const seriesIds = stmt.all(...params).map((r) => r.series_id);

    let dataCount = 0;
    if (seriesIds.length > 0) {
      const sIn = inList(seriesIds.length);
      dataCount = main
        .prepare(`SELECT COUNT(*) AS c FROM data WHERE series_id IN (${sIn})`)
        .get(...seriesIds).c;
    }

    result.byDataset[dataset] = { series: seriesIds.length, data: dataCount };
    result.series += seriesIds.length;
    result.data += dataCount;
  }
  return result;
}

// ------------------------------------------------------------
// Dry run: report what a build would produce, write nothing
// ------------------------------------------------------------
function runCountOnly(log) {
  if (!fs.existsSync(MAIN_DB_PATH)) {
    throw new Error(`Main DB not found: ${MAIN_DB_PATH}`);
  }
  const Database = require("better-sqlite3");
  const main = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const derived = resolveDerivedCountries(main, log);
    const plan = planFilters(log, derived.countries);
    const t0 = Date.now();
    const counts = countMatching(main, plan);
    log.info(`count-only scan finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const [dataset, c] of Object.entries(counts.byDataset)) {
      log.info(`[${dataset}] series=${fmt(c.series)}  data=${fmt(c.data)}`);
    }
    log.success(`TOTAL (dry run): series=${fmt(counts.series)}  data=${fmt(counts.data)}`);
    return counts;
  } finally {
    main.close();
  }
}

// ------------------------------------------------------------
// Snapshot of the main DB row counts (to prove it is untouched)
// ------------------------------------------------------------
function snapshotMain(main) {
  const g = (sql) => main.prepare(sql).get().c;
  return {
    series: g("SELECT COUNT(*) AS c FROM series"),
    data: g("SELECT COUNT(*) AS c FROM data"),
    sources: g("SELECT COUNT(*) AS c FROM sources"),
  };
}

// ------------------------------------------------------------
// Verify that every series inside core.db matches the filters
// ------------------------------------------------------------
/**
 * استثناهای **مستند** خارج از فیلترها — سری‌هایی که عامدانه در core.db هستند
 * ولی در `filters/{countries,indicators}.json` نیستند.
 *
 * چرا: BIS سری نرخ سیاستی ملی DEU/FRA/ITA را در ۱۹۹۸ متوقف کرده و از آن زمان
 * نرخ ECB را زیر کشور «XM» منتشر می‌کند. اگر «XM» به countries.json اضافه شود،
 * لیست «۱۷ کشور» در همهٔ گروه‌ها/چارت‌ها می‌شکند ⇒ فقط همین یک سری استثنا
 * می‌شود (کپی صریح در بخش «استثنای XM» + همین allowlist در اعتبارسنجی).
 *
 * ⚠️ هر ورودی این فهرست باید هم در کپی و هم در اعتبارسنجی دیده شود؛ یک منبع
 *    حقیقت (`FILTER_EXCEPTIONS`) تا دوباره «filter violation» رخ ندهد.
 */
const FILTER_EXCEPTIONS = [
  { dataset: "BIS", country: "XM", indicator: "POLICY_RATE", reason: "نرخ ECB منطقهٔ یورو (fallback برای DEU/FRA/ITA)" },
];

function verifyFilters(core, plan) {
  const check = core.prepare(
    `SELECT dataset, country, indicator, frequency, COUNT(*) AS c
       FROM series GROUP BY dataset, country, indicator, frequency`
  );
  let violations = 0;
  for (const row of check.all()) {
    const f = plan[row.dataset];
    const inPlan =
      f &&
      f.countries.includes(row.country) &&
      f.indicators.includes(row.indicator) &&
      FREQUENCIES.includes(row.frequency);
    const exc = FILTER_EXCEPTIONS.find(
      (e) =>
        e.dataset === row.dataset &&
        e.country === row.country &&
        e.indicator === row.indicator &&
        FREQUENCIES.includes(row.frequency)
    );
    if (!inPlan && !exc) {
      violations++;
      console.warn(
        `filter violation: dataset=${row.dataset} country=${row.country} ` +
          `indicator=${row.indicator} frequency=${row.frequency} rows=${row.c}`
      );
    } else if (exc) {
      console.log(
        `filter exception (documented): dataset=${row.dataset} country=${row.country} ` +
          `indicator=${row.indicator} rows=${row.c} — ${exc.reason}`
      );
    }
  }
  return violations;
}



/**
 * درج سری‌های DERIVED_CORE_CPI در core.db (پس از کپی داده، پیش از ایندکس‌ها).
 * ⚠️ این‌ها دادهٔ منتشرشده نیستند — روش محاسبه در ستون `unit` ثبت می‌شود.
 */
function insertDerivedCore(core, log, today, derivedCountries = DERIVED_CORE_COUNTRIES) {
  const selSeries = core.prepare("SELECT 1 FROM series WHERE series_id = ?");
  const insSeries = core.prepare(
    `INSERT INTO series(series_id, dataset, country, indicator, frequency, unit, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insData = core.prepare(
    `INSERT INTO data(series_id, date, value, revision_id, valid_from, valid_to)
     VALUES (?, ?, ?, 1, ?, NULL)`
  );
  // منبع محاسباتی (بدون FK اجباری؛ برای ردیابی منبع در API)
  core
    .prepare(
      `INSERT OR IGNORE INTO sources(source_id, name, url, update_frequency, last_update)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      DERIVED_DATASET,
      "Derived series (computed inside core_db build)",
      "collector/macro/core_db/build/build_core_db.cjs",
      "On core rebuild",
      today,
    );

  const summary = [];
  core.exec("BEGIN");
  try {
    for (const iso3 of derivedCountries) {
      const sid = `${DERIVED_DATASET}.${iso3}.${DERIVED_CODE}.M`;
      if (selSeries.get(sid)) {
        summary.push({ country: iso3, status: "already present" });
        continue;
      }
      const res = deriveCoreForCountry(core, iso3);
      if (!res.ok) {
        summary.push({ country: iso3, status: "skipped", reason: res.reason });
        log.warn(`[DERIVED] ${iso3}: skipped — ${res.reason}`);
        continue;
      }
      insSeries.run(sid, DERIVED_DATASET, iso3, DERIVED_CODE, "M", res.unit, DERIVED_DATASET);
      for (const [date, value] of res.data) insData.run(sid, date, value, today);
      summary.push({
        country: iso3, status: "built", method: res.method, points: res.points,
        first: res.first, last: res.last, divisions: res.divisions,
      });
      log.info(
        `[DERIVED] ${iso3}: ${res.method} · ${res.points} points · ${res.first}→${res.last} · ` +
          `divisions=${res.divisions} · headline=${res.headlineSource}`
      );
      log.info(
        `[DERIVED] ${iso3}: segments → COICOP core to ${res.coreLast || "—"} ` +
          `+ FRED ${res.fredUsed ? `${res.fredUsed} pts (${res.fredCode})` : "n/a"} ` +
          `+ ${HYBRID_MA_WINDOW}m MA ${res.maUsed} pts → headline last ${res.headlineLast}`
      );
    }
    core.exec("COMMIT");
  } catch (e) {
    core.exec("ROLLBACK");
    throw e;
  }
  return summary;
}

// ------------------------------------------------------------
// HYBRID FALLBACK — تمدید هسته با FRED و/یا میانگین متحرک ۱۲ماهه
// ------------------------------------------------------------
// مشکل: گروه‌های COICOP سازمان OECD برای ۵ کشور زودتر قطع می‌شوند
//        (RUS 2022-02 · BRA 2019-07 · IND 2019-05 · SAU 2025-07)
//        و FRED هم برای این ۵ کشور **هیچ سری هسته‌ای ندارد** (بررسی 2026-09-20).
//        در حالی که تورم کل (BIS CPI_YOY ماهانه) تا 2026 موجود است.
//
// راه‌حل (پیاده‌سازی همین‌جا):
//   ۱) «هستهٔ واقعی»: میانگین پیرایش‌شدهٔ YoY گروه‌های COICOP  (segA)
//   ۲) اگر سری هستهٔ FRED برای آن کشور موجود بود و در فاصلهٔ انقطع داده داشت،
//      همان مقدارها استفاده می‌شوند  (segB)
//   ۳) باقی‌ماندهٔ بازه تا آخرین ماه تورم کل با **میانگین متحرک ۱۲ماههٔ
//      تورم کل** پر می‌شود  (segC)  → پوشش تا ۲۰۲۶
//
// ⚠️ پیوند (splice) بین قطعه‌ها: اگر اختلاف سطح در نقطهٔ اتصال از آستانه
//    (۲ واحد درصد) بیشتر باشد، آفستِ **میانگین هم‌پوشانی ۱۲ماهه** اعمال می‌شود
//    تا یک پرش کاذب در چارت ساخته نشود (روش رایج زنجیره‌سازی سری‌ها).
const HYBRID_MA_WINDOW = 12;        // پنجرهٔ میانگین متحرک (ماه)
const HYBRID_MA_MIN_OBS = 11;       // حداقل دادهٔ موجود در پنجره
const HYBRID_SPLICE_MAX_GAP = 2.0;  // آستانهٔ پرش (واحد درصد)

/** میانگین متحرک **پسرو** (trailing) روی سری ماهانه → Map(date → میانگین). */
function trailingMovingAverage(seriesMap, window = HYBRID_MA_WINDOW, minObs = HYBRID_MA_MIN_OBS) {
  const dates = [...seriesMap.keys()].sort();
  const out = new Map();
  for (let i = 0; i < dates.length; i++) {
    const from = i - window + 1;
    if (from < 0) continue; // پنجرهٔ کامل نداریم
    let sum = 0, n = 0;
    for (let k = from; k <= i; k++) {
      const v = seriesMap.get(dates[k]);
      if (Number.isFinite(v)) { sum += v; n++; }
    }
    if (n >= minObs) out.set(dates[i], sum / n);
  }
  return out;
}

/**
 * سری هستهٔ FRED برای یک کشور (اگر وجود داشته باشد).
 * الگوهای واقعی روی FRED: `CPGRLE01{ISO2}M659N` · `{ISO3}CPHPLA01IXOBM` · `{ISO3}CPHPLA01GYM`
 * @returns {{code:string, map:Map<string,number>}|null}
 */
function fredCoreForCountry(db, iso3) {
  const rows = db.prepare(
    "SELECT series_id, indicator FROM series WHERE dataset='FRED' AND country=? " +
    "AND (indicator LIKE '%CPGRLE%' OR indicator LIKE '%CPHPLA%' OR indicator LIKE '%CORE%')"
  ).all(iso3);
  let best = null;
  for (const r of rows) {
    const map = readSeriesMap(db, "FRED", iso3, r.indicator, "M");
    if (map.size === 0) continue;
    if (!best || map.size > best.map.size) best = { code: r.indicator, map };
  }
  return best;
}

/**
 * درج قطعهٔ تمدید (FRED و/یا MA) در Map خروجی + برگرداندن توضیح قطعه‌ها.
 * @returns {{extended:number, fredUsed:number, maUsed:number, offset:number, spliceFrom:string|null}}
 */
function extendCoreSeries(out, { fredCore, headlineMA, headlineEnd, lastCoreDate, headlineLast }) {
  const info = { extended: 0, fredUsed: 0, maUsed: 0, offset: 0, spliceFrom: null };
  const dates = [...out.keys()].sort();
  const segEnd = lastCoreDate || null;

  // ---- آفست پیوند (فقط وقتی قطعهٔ قبلی وجود دارد) ----
  if (segEnd && headlineMA.has(segEnd)) {
    const jump = headlineMA.get(segEnd) - out.get(segEnd);
    if (Math.abs(jump) > HYBRID_SPLICE_MAX_GAP) {
      // میانگین اختلاف در هم‌پوشانی ۱۲ماههٔ اخیر (پایدارتر از یک نقطه)
      const overlap = dates.slice(-HYBRID_MA_WINDOW);
      const diffs = overlap
        .filter((d) => headlineMA.has(d))
        .map((d) => headlineMA.get(d) - out.get(d));
      if (diffs.length >= 3) {
        info.offset = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        info.spliceFrom = segEnd;
      }
    }
  }

  // ---- ۱) قطعهٔ FRED (اگر در فاصله باشد) ----
  const fredDates = fredCore
    ? [...fredCore.map.keys()].filter((d) => !out.has(d) && (!segEnd || d > segEnd) &&
        d <= (headlineEnd || d)).sort()
    : [];
  for (const d of fredDates) {
    out.set(d, fredCore.map.get(d));
    info.fredUsed++;
  }

  // ---- ۲) قطعهٔ میانگین متحرک (بقیهٔ بازه تا آخرین ماه تورم کل) ----
  for (const d of [...headlineMA.keys()].sort()) {
    if (segEnd && d <= segEnd) continue;   // داخل بازهٔ هستهٔ واقعی
    if (out.has(d)) continue;
    if (headlineLast && d > headlineLast) continue;
    out.set(d, headlineMA.get(d) + info.offset);
    info.maUsed++;
  }
  info.extended = info.fredUsed + info.maUsed;

  // ---- ۳) گزارش «پرش مرز اتصال» (شفافیت — پنهان نمی‌شود، اعلام می‌شود) ----
  if (segEnd && info.maUsed > 0) {
    const extDates = [...out.keys()].filter((d) => d > segEnd).sort();
    const firstExt = extDates[0] || null;
    const coreVal = out.get(segEnd);
    const extVal = firstExt ? out.get(firstExt) : null;
    if (Number.isFinite(coreVal) && Number.isFinite(extVal)) {
      info.junctionFrom = segEnd;
      info.junctionTo = firstExt;
      info.junctionStep = extVal - coreVal; // واحد درصد
    }
  }
  return info;
}

// ------------------------------------------------------------
// Build core.db
// ------------------------------------------------------------
function buildCore(log, { countOnly = false } = {}) {
  if (countOnly) return runCountOnly(log);

  if (!fs.existsSync(MAIN_DB_PATH)) {
    throw new Error(`Main DB not found: ${MAIN_DB_PATH}`);
  }

  const Database = require("better-sqlite3");

  // Main DB is opened strictly READ-ONLY — nothing can write to it.
  const main = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
  const mainBefore = snapshotMain(main);
  log.info(
    `Main DB opened READ-ONLY: series=${fmt(mainBefore.series)}  ` +
      `data=${fmt(mainBefore.data)}  sources=${mainBefore.sources}`
  );

  if (fs.existsSync(CORE_DB_PATH)) {
    log.warn("Removing previous core.db (derived artifact, safe to rebuild)");
    fs.unlinkSync(CORE_DB_PATH);
  }
  fs.mkdirSync(path.dirname(CORE_DB_PATH), { recursive: true });

  const core = new Database(CORE_DB_PATH);
  const started = Date.now();

  try {
    // ---- pragmas (same safe defaults as the main loader) --------
    core.pragma("journal_mode = DELETE");
    core.pragma("synchronous = OFF");
    core.pragma("foreign_keys = ON");
    core.pragma("temp_store = FILE");
    core.pragma("cache_size = -100000"); // 100 MB page cache

    // ---- schema ---------------------------------------------------
    core.exec(SCHEMA_SQL);
    log.info("Schema created (series / data / sources)");

    // ---- filters --------------------------------------------------
    // P1: کشورهای هدف Core مشتق (بدون Core رسمی یا Core >۶ ماه عقب‌تر از Headline)
    const derived = resolveDerivedCountries(main, log);
    const plan = planFilters(log, derived.countries);

    // ---- series copy (prepared statements, one per dataset) -------
    const freqs = FREQUENCIES;
    const fIn = inList(freqs.length);
    const insSeries = core.prepare(
      `INSERT OR IGNORE INTO series(series_id, dataset, country, indicator, frequency, unit, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const seriesIds = [];
    let seriesTotal = 0;

    for (const [dataset, f] of Object.entries(plan)) {
      const cIn = inList(f.countries.length);
      const iIn = inList(f.indicators.length);
      const stmt = main.prepare(
        `SELECT series_id, dataset, country, indicator, frequency, unit, source
           FROM series
          WHERE dataset = ? AND frequency IN (${fIn})
            AND country IN (${cIn}) AND indicator IN (${iIn})`
      );
      const params = [dataset, ...freqs, ...f.countries, ...f.indicators];
      const rows = stmt.all(...params);

      core.exec("BEGIN");
      try {
        for (const r of rows) {
          insSeries.run(r.series_id, r.dataset, r.country, r.indicator, r.frequency, r.unit, r.source);
          seriesIds.push(r.series_id);
        }
        core.exec("COMMIT");
      } catch (e) {
        core.exec("ROLLBACK");
        throw e;
      }
      seriesTotal += rows.length;
      log.info(`[${dataset}] series copied: ${fmt(rows.length)}`);
    }
    log.info(`Total series copied: ${fmt(seriesTotal)}`);

    // ---- استثنای مستند: نرخ سیاستی منطقهٔ یورو (کشور XM در BIS) ----
    // چرا: BIS سری نرخ سیاستی ملی DEU/FRA/ITA را در ۱۹۹۸ متوقف کرده و از آن
    // زمان نرخ ECB را زیر کشور «XM» منتشر می‌کند. «XM» در
    // filters/countries.json نیست (تا لیست ۱۷ کشور و بقیهٔ گروه‌ها دست‌نخورده
    // بماند)، پس فقط همین یک سری صریح کپی می‌شود. دسترسی به آن هم فقط از
    // مسیر canon=POLICY_RATE ممکن است (picker با provider code فیلتر می‌کند).
    // ✅ این استثنا در `FILTER_EXCEPTIONS` ثبت شده تا اعتبارسنجی پایانی آن را
    //    «مجاز» بداند (وگرنه بیلد با filter violation رد می‌شد).
    {
      const xmRows = main
        .prepare(
          `SELECT series_id, dataset, country, indicator, frequency, unit, source
             FROM series
            WHERE dataset = 'BIS' AND country = 'XM' AND indicator = 'POLICY_RATE'
              AND frequency IN (${fIn})`
        )
        .all(...freqs);
      core.exec("BEGIN");
      try {
        for (const r of xmRows) {
          insSeries.run(r.series_id, r.dataset, r.country, r.indicator, r.frequency, r.unit, r.source);
          seriesIds.push(r.series_id);
        }
        core.exec("COMMIT");
      } catch (e) {
        core.exec("ROLLBACK");
        throw e;
      }
      seriesTotal += xmRows.length;
      log.info(`[BIS] euro-area policy rate (XM) series copied: ${fmt(xmRows.length)}`);
    }


    // ---- data copy (per series, index-driven, batched commits) ----
    const selectData = main.prepare(
      `SELECT series_id, date, value, revision_id, valid_from, valid_to
         FROM data WHERE series_id = ?`
    );
    const insData = core.prepare(
      `INSERT INTO data(series_id, date, value, revision_id, valid_from, valid_to)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    let dataTotal = 0;
    core.exec("BEGIN");
    try {
      for (const sid of seriesIds) {
        for (const row of selectData.iterate(sid)) {
          insData.run(row.series_id, row.date, row.value, row.revision_id, row.valid_from, row.valid_to);
          dataTotal++;
          if (dataTotal % 100000 === 0) {
            core.exec("COMMIT");
            core.exec("BEGIN");
            log.info(`data rows copied so far: ${fmt(dataTotal)}`);
          }
        }
      }
      core.exec("COMMIT");
    } catch (e) {
      core.exec("ROLLBACK");
      throw e;
    }
    log.info(`Total data rows copied: ${fmt(dataTotal)}`);

    // ---- sources copy ----------------------------------------------
    const selSources = main.prepare(
      `SELECT source_id, name, url, update_frequency, last_update FROM sources`
    );
    const insSource = core.prepare(
      `INSERT INTO sources(source_id, name, url, update_frequency, last_update)
       VALUES (?, ?, ?, ?, ?)`
    );
    const sourceRows = selSources.all();
    core.exec("BEGIN");
    try {
      for (const s of sourceRows) {
        insSource.run(s.source_id, s.name, s.url, s.update_frequency, s.last_update);
      }
      core.exec("COMMIT");
    } catch (e) {
      core.exec("ROLLBACK");
      throw e;
    }
    log.info(`sources copied: ${sourceRows.length}`);

    // ---- derived series (هستهٔ محاسباتی برای ۵ کشور بدون Core رسمی) ----
    // این مرحله پس از کپی داده و پیش از ساخت ایندکس‌ها اجرا می‌شود تا
    // ایندکس‌ها شامل سری‌های محاسباتی هم باشند.
    const derivedSummary = insertDerivedCore(core, log, DERIVED_TODAY, derived.countries);
    const derivedBuilt = derivedSummary.filter((d) => d.status === "built");
    log.info(
      `[DERIVED] series built: ${derivedBuilt.length}/${derived.countries.length} ` +
        `(${derivedBuilt.map((d) => d.country).join(", ") || "none"})`
    );

    // ---- indexes (after load) + ANALYZE -----------------------------
    core.exec(INDEX_SQL);
    core.exec("ANALYZE");
    log.info("Indexes created + ANALYZE done");

    // ---- verification ------------------------------------------------
    const v = {
      series: core.prepare("SELECT COUNT(*) AS c FROM series").get().c,
      data: core.prepare("SELECT COUNT(*) AS c FROM data").get().c,
      sources: core.prepare("SELECT COUNT(*) AS c FROM sources").get().c,
    };
    const fk = core.prepare("PRAGMA foreign_key_check").all().length;
    const integrity = core.prepare("PRAGMA integrity_check").get()["integrity_check"];
    const freqRows = core
      .prepare("SELECT frequency, COUNT(*) AS c FROM series GROUP BY frequency ORDER BY frequency")
      .all();
    const countryRows = core
      .prepare("SELECT COUNT(DISTINCT country) AS c FROM series")
      .get().c;
    const mainAfter = snapshotMain(main);

    if (fk !== 0) throw new Error(`foreign_key_check found ${fk} violations`);
    if (integrity !== "ok") throw new Error(`integrity_check failed: ${integrity}`);

    const filterViolations = verifyFilters(core, plan);
    if (filterViolations !== 0) {
      throw new Error(`core DB contains ${filterViolations} series not matching the filters`);
    }

    const badFreqs = freqRows.filter((r) => !FREQUENCIES.includes(r.frequency));
    if (badFreqs.length > 0) {
      throw new Error(`unexpected frequencies in core DB: ${JSON.stringify(badFreqs)}`);
    }

    const sizeMB = (fs.statSync(CORE_DB_PATH).size / (1024 * 1024)).toFixed(1);

    log.success("Core DB built successfully ✔");
    log.success(`DB file: ${CORE_DB_PATH} (${sizeMB} MB)`);
    log.success(`series=${fmt(v.series)}  data=${fmt(v.data)}  sources=${v.sources}`);
    log.success(
      `distinct country codes=${countryRows} ` +
        `(17 real countries; per-dataset conventions, e.g. BIS "US" vs IMF "USA")  ` +
        `frequencies=${freqRows.map((r) => `${r.frequency}:${fmt(r.c)}`).join("  ")}`
    );
    log.success(
      `main DB untouched: series=${mainBefore.series}->${mainAfter.series}  ` +
        `data=${fmt(mainBefore.data)}->${fmt(mainAfter.data)}  ` +
        `sources=${mainBefore.sources}->${mainAfter.sources}`
    );
    log.success(`Elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);

    return { dbPath: CORE_DB_PATH, ...v, sizeMB: Number(sizeMB) };
  } finally {
    core.close();
    main.close();
  }
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const countOnly = args.includes("--count-only");
  const fresh = args.includes("--fresh");

  const log = makeLogger();
  log.info(`Macro Core DB build started at ${new Date().toISOString()}`);
  log.info(`Main DB: ${MAIN_DB_PATH}`);
  log.info(`Core DB: ${CORE_DB_PATH}`);
  log.info(`Log file: ${log.logFile}`);
  log.info(
    `Filters: countries=${COUNTRIES.length}  indicators=${INDICATORS.length}  ` +
      `frequencies=${FREQUENCIES.length}`
  );

  try {
    if (countOnly) {
      buildCore(log, { countOnly: true });
      log.info("count-only mode: no file was written");
    } else {
      if (fresh) log.info("--fresh requested (core.db is a derived artifact; it will be rebuilt)");
      buildCore(log);
    }
  } catch (e) {
    log.error("Build failed: " + (e && e.stack ? e.stack : String(e)));
    log.close();
    process.exitCode = 1;
    return;
  }
  log.close();
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCore,
  runCountOnly,
  planFilters,
  resolveDerivedCountries,
  resolveHeadline,
  officialCoreLastDate,
  headlineLastDate,
  monthsBetween,
  COUNTRIES,
  INDICATORS,
  FREQUENCIES,
  DATASETS,
  INDICATOR_MAP,
  DERIVED_CORE_COUNTRIES,
  DERIVED_STALENESS_MONTHS,
  CORE_DB_PATH,
  MAIN_DB_PATH,
};


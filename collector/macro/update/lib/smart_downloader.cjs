/**
 * ============================================================
 * Macro Live Update System — Module 2: Smart Downloader + Extractor
 * File: collector/macro/update/lib/smart_downloader.cjs
 *
 * Runs ONLY when the Light Checker reported new data.
 *
 *   - downloads only the files that are actually needed
 *   - BIS downloads exactly two ZIPs:
 *         bis_policy_rates.zip  <- WS_CBPOL_csv_col.zip  (policy rates)
 *         bis_credit.zip        <- WS_CBS_PUB_csv_col.zip (credit)
 *   - ZIP files are extracted ONLY when new data arrived, and only
 *     the required entries are pulled out
 *   - everything lands under downloaded/<source>/ (raw) and
 *     extracted/<source>/ (unzipped)
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Readable } = require("stream");

const {
  DOWNLOAD_DIR,
  BIS_DOWNLOAD_DIRS,
  EXTRACT_DIR,
  DB_PATH,
} = require("./paths.cjs");
const { query: sqlQuery } = require("./sqlite.cjs");
const logger = require("./update_logger.cjs");
const { SOURCES } = require("../../config/config.cjs"); // central provider URLs/config

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// P1 — آپدیت افزایشی (incremental / watermark)
// ------------------------------------------------------------
// هدف: به‌جای دانلود کل تاریخچه، فقط دوره‌های جدیدتر از آخرین رکورد موجود
// در `macro.db` گرفته شود تا اجرای روزانه سبک بماند.
//
// امنیت این کار: `comparator_writer.cjs` فقط INSERT/REVISION می‌کند و هیچ‌وقت
// رکورد غایب را حذف نمی‌کند ⇒ CSV جزئی، دادهٔ قدیمی را از بین نمی‌برد.
/**
 * آخرین تاریخ موجود در macro.db برای یک منبع + الگوی کد شاخص.
 * @returns {Promise<string|null>} تاریخ کانونیکال (YYYY-MM | YYYY-Qn | YYYY)
 */
async function latestDbDate({ dataset, indicatorLike, frequency = null }) {
  try {
    const sql =
      `SELECT MAX(d.date) AS mx FROM data d JOIN series s ON s.series_id = d.series_id ` +
      `WHERE s.dataset = '${dataset}' AND s.indicator LIKE '${indicatorLike}'` +
      (frequency ? ` AND s.frequency = '${frequency}'` : "") +
      ` AND d.valid_to IS NULL;`;
    const out = (await sqlQuery(sql, DB_PATH)).trim();
    return out || null;
  } catch (e) {
    logger.warn(`[incremental] watermark query failed (${dataset}/${indicatorLike}): ${e.message}`);
    return null;
  }
}

/** اختلاف ماه بین دو تاریخ کانونیکال ماهانه (b - a). */
function monthsBetween(a, b) {
  const pa = /^(\d{4})-(\d{2})$/.exec(String(a || "").trim());
  const pb = /^(\d{4})-(\d{2})$/.exec(String(b || "").trim());
  if (!pa || !pb) return null;
  return (Number(pb[1]) - Number(pa[1])) * 12 + (Number(pb[2]) - Number(pa[2]));
}

/**
 * `startPeriod` برای فلوی SDMX سازمان OECD.
 * یک دوره به عقب برمی‌گردیم تا **بازنگری‌ها** هم گرفته شوند.
 */
function oecdStartPeriod(canonicalDate, freq) {
  const s = String(canonicalDate || "").trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const total = Number(m[1]) * 12 + (Number(m[2]) - 1) - 1; // یک ماه عقب
    const y = Math.floor(total / 12);
    const mo = (((total % 12) + 12) % 12) + 1;
    return `${y}-${String(mo).padStart(2, "0")}`; // freq=M
  }
  const q = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (q) {
    const qi = Number(q[2]);
    return qi > 1 ? `${q[1]}-Q${qi - 1}` : `${Number(q[1]) - 1}-Q4`;
  }
  const y = /^(\d{4})$/.exec(s);
  if (y) return s; // سالانه: همان سال را کامل دوباره بگیر
  return null;     // نامعلوم ⇒ تاریخچهٔ کامل
}

/** `lastTimePeriod` برای Eurostat (تعداد دورهٔ آخر). */
function eurostatLastTimePeriod(canonicalDate, kind /* "M" | "A" */) {
  const s = String(canonicalDate || "").trim();
  if (kind === "A") {
    const y = /^(\d{4})/.exec(s);
    if (!y) return null;
    return Math.min(10, Math.max(2, new Date().getUTCFullYear() - Number(y[1]) + 2));
  }
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const now = new Date();
  const diff = (now.getUTCFullYear() - Number(m[1])) * 12 + (now.getUTCMonth() + 1 - Number(m[2]));
  return Math.min(60, Math.max(3, diff + 2)); // +۲ برای بازنگری‌های اخیر
}

// ------------------------------------------------------------
// Source catalogues (identical to the offline downloaders so the
// update system refreshes exactly the series already in the DB)
// ------------------------------------------------------------

// FRED: metric file -> series ids (keyless fredgraph.csv endpoint)
const FRED_CATALOGUE = [
  { metric: "interest_rate", unit: "%", frequency: "Daily", series: [
    { id: "FEDFUNDS", label: "FEDFUNDS" }, { id: "DGS10", label: "DGS10" }, { id: "DGS2", label: "DGS2" } ] },
  { metric: "cpi", unit: "index", frequency: "Monthly", series: [{ id: "CPIAUCSL", label: "CPIAUCSL" }] },
  // P1 (2026-09-20): زیرشاخص‌های CPI آمریکا (خوراک/انرژی/مسکن/برق/بنزین/اجاره).
  // همان فهرستِ تأییدشدهٔ offline/fred/download_fred_offline.cjs
  { metric: "cpi_sub", unit: "index", frequency: "Monthly", series: [
    { id: "CPIFABSL", label: "CPIFABSL" },
    { id: "CPIENGSL", label: "CPIENGSL" },
    { id: "CPIHOSSL", label: "CPIHOSSL" },
    { id: "CUUR0000SAF11", label: "CUUR0000SAF11" },
    { id: "CUUR0000SAF112", label: "CUUR0000SAF112" },
    { id: "CUUR0000SAH1", label: "CUUR0000SAH1" },
    { id: "CUUR0000SEHA", label: "CUUR0000SEHA" },
    { id: "CUUR0000SETB01", label: "CUUR0000SETB01" },
    { id: "CUUR0000SEHF01", label: "CUUR0000SEHF01" },
    { id: "CUUR0000SETA01", label: "CUUR0000SETA01" },
  ] },
  // core CPI: US + verified foreign core series (OECD/Eurostat on FRED).
  // `area` (ISO3) makes multi-country FRED series land under the right country;
  // see offline/fred/download_fred_offline.cjs for the verified ranges.
  { metric: "core_cpi", unit: "index", frequency: "Monthly", series: [
    { id: "CPILFESL", label: "CPILFESL" },
    { id: "DEUCPHPLA01GYM",   label: "DEUCPHPLA01GYM",   area: "DEU" },
    { id: "FRACPHPLA01GYM",   label: "FRACPHPLA01GYM",   area: "FRA" },
    { id: "ITACPHPLA01GYM",   label: "ITACPHPLA01GYM",   area: "ITA" },
    { id: "DEUCPHPLA01IXOBM", label: "DEUCPHPLA01IXOBM", area: "DEU" },
    { id: "FRACPHPLA01IXOBM", label: "FRACPHPLA01IXOBM", area: "FRA" },
    { id: "ITACPHPLA01IXOBM", label: "ITACPHPLA01IXOBM", area: "ITA" },
    { id: "GBRCPHPLA01IXOBM", label: "GBRCPHPLA01IXOBM", area: "GBR" },
    { id: "CPGRLE01DEM659N",  label: "CPGRLE01DEM659N",  area: "DEU" },
    { id: "CPGRLE01FRM659N",  label: "CPGRLE01FRM659N",  area: "FRA" },
    { id: "CPGRLE01ITM659N",  label: "CPGRLE01ITM659N",  area: "ITA" },
    { id: "CPGRLE01GBM659N",  label: "CPGRLE01GBM659N",  area: "GBR" },
    { id: "CPGRLE01CAM659N",  label: "CPGRLE01CAM659N",  area: "CAN" },
    { id: "CPGRLE01KRM659N",  label: "CPGRLE01KRM659N",  area: "KOR" },
    { id: "TURCPHPLA01IXOBM", label: "TURCPHPLA01IXOBM", area: "TUR" }, // P1: core تُرکیه
  ] },
  { metric: "ppi", unit: "index", frequency: "Monthly", series: [
    { id: "PPIACO", label: "PPIACO" }, { id: "PPIFIS", label: "PPIFIS" } ] },
  { metric: "gdp", unit: "billions USD", frequency: "Quarterly", series: [
    { id: "GDP", label: "GDP" }, { id: "GDPC1", label: "GDPC1" } ] },
  { metric: "money_supply", unit: "billions USD", frequency: "Monthly", series: [
    { id: "M1SL", label: "M1SL" }, { id: "M2SL", label: "M2SL" } ] },
  { metric: "unemployment", unit: "%", frequency: "Monthly", series: [{ id: "UNRATE", label: "UNRATE" }] },
  // P3-Signals (2026-09-22): بازدهی اوراق ۱۰ساله (Yield10Y) — آینهٔ
  // offline/fred/download_fred_offline.cjs (همان فهرستِ تأییدشده).
  // ⚠️ BRA/CHN/SAU/TUR روی FRED نیستند (404) ⇒ سیگنال برایشان رسم نمی‌شود.
  { metric: "long_term_rate", unit: "%", frequency: "Monthly", series: [
    { id: "DGS10", label: "DGS10" },
    { id: "IRLTLT01USM156N", label: "IRLTLT01USM156N", area: "USA" },
    { id: "IRLTLT01AUM156N", label: "IRLTLT01AUM156N", area: "AUS" },
    { id: "IRLTLT01CAM156N", label: "IRLTLT01CAM156N", area: "CAN" },
    { id: "IRLTLT01DEM156N", label: "IRLTLT01DEM156N", area: "DEU" },
    { id: "IRLTLT01FRM156N", label: "IRLTLT01FRM156N", area: "FRA" },
    { id: "INDIRLTLT01STM", label: "INDIRLTLT01STM", area: "IND" },
    { id: "IRLTLT01ITM156N", label: "IRLTLT01ITM156N", area: "ITA" },
    { id: "IRLTLT01JPM156N", label: "IRLTLT01JPM156N", area: "JPN" },
    { id: "IRLTLT01KRM156N", label: "IRLTLT01KRM156N", area: "KOR" },
    { id: "IRLTLT01MXM156N", label: "IRLTLT01MXM156N", area: "MEX" },
    { id: "IRLTLT01RUM156N", label: "IRLTLT01RUM156N", area: "RUS" },
    { id: "IRLTLT01ZAM156N", label: "IRLTLT01ZAM156N", area: "ZAF" },
  ] },
];

// Eurostat: dataset -> metric CSV (dimension constraints + geo list)
const EUROSTAT_GEO = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI", "EL", "PL", "SE", "UK", "NO", "CH"];
// P1 (2026-09-20): کدهای COICOP برای زیرشاخص‌ها/هسته/وزن — آینهٔ
// offline/eurostat/download_eurostat_offline.cjs (همه با API تأیید شده‌اند).
//   TOT_X_NRG_FOOD = «Overall index excluding energy and food» = Core
//   ⚠️ CP00_X_FOOD_ENG وجود ندارد.
const EUROSTAT_COICOP_SUB = [
  "CP00", "CP01", "CP02", "CP03", "CP04", "CP05", "CP06", "CP07", "CP08", "CP09", "CP10", "CP11", "CP12",
  "CP045", "CP071", "CP0722", "NRG", "FOOD", "IGD", "SERV", "TOT_X_NRG", "TOT_X_NRG_FOOD",
];
// در prc_hicp_iw نام بُعد `coicop18` و کد کل سبد `TOTAL` است (مقادیر ‰)
const EUROSTAT_COICOP_WEIGHTS = ["TOTAL", "CP01", "CP02", "CP03", "CP04", "CP05", "CP06",
                                 "CP07", "CP08", "CP09", "CP10", "CP11", "CP12"];
const EUROSTAT_CATALOGUE = [
  { metric: "cpi_yoy", indicator: "HICP_ANR", dataset: "prc_hicp_manr", incremental: true,
    dimensions: { unit: "RCH_A", coicop: "CP00", freq: "M" }, frequency: "Monthly", unit: "%" },
  { metric: "cpi_index", indicator: "HICP_MIDX", dataset: "prc_hicp_midx", incremental: true,
    dimensions: { unit: "I15", coicop: "CP00", freq: "M" }, frequency: "Monthly", unit: "index" },
  // ---- P1: زیرشاخص‌های COICOP (شاخص + نرخ) و وزن سبد ----
  // `incremental: true` ⇒ فقط N دورهٔ آخر (watermark از macro.db) دانلود می‌شود.
  { metric: "cpi_index_sub", indicatorPrefix: "HICP_MIDX", dataset: "prc_hicp_midx",
    coicopDim: "coicop", codes: EUROSTAT_COICOP_SUB, incremental: true,
    dimensions: { unit: "I15", freq: "M" }, frequency: "Monthly", unit: "index" },
  { metric: "cpi_yoy_sub", indicatorPrefix: "HICP_ANR", dataset: "prc_hicp_manr",
    coicopDim: "coicop", codes: EUROSTAT_COICOP_SUB, incremental: true,
    dimensions: { unit: "RCH_A", freq: "M" }, frequency: "Monthly", unit: "%" },
  { metric: "cpi_weights", indicatorPrefix: "HICP_IW", dataset: "prc_hicp_iw",
    coicopDim: "coicop18", codes: EUROSTAT_COICOP_WEIGHTS, incremental: true,
    dimensions: { statinfo: "IW", freq: "A" }, frequency: "Annual", unit: "per_mille" },
  { metric: "gdp", indicator: "GDP_CLV10_MEUR", dataset: "namq_10_gdp",
    dimensions: { unit: "CLV10_MEUR", na_item: "B1GQ", s_adj: "NSA", freq: "Q" }, frequency: "Quarterly", unit: "million EUR" },
  { metric: "gdp_yoy", indicator: "GDP_CLV_PCH_SM", dataset: "namq_10_gdp",
    dimensions: { unit: "CLV_PCH_SM", na_item: "B1GQ", s_adj: "NSA", freq: "Q" }, frequency: "Quarterly", unit: "%" },
  { metric: "unemployment", indicator: "UNE_RT_M", dataset: "une_rt_m",
    dimensions: { sex: "T", age: "TOTAL", unit: "PC_ACT", s_adj: "SA", freq: "M" }, frequency: "Monthly", unit: "%" },
  { metric: "employment", indicator: "LFSI_EMP_Q", dataset: "lfsi_emp_q",
    dimensions: { indic_em: "EMP_LFS", sex: "T", age: "Y15-64", unit: "THS_PER", s_adj: "SA", freq: "Q" }, frequency: "Quarterly", unit: "thousand persons" },
  { metric: "trade", indicator: "EXT_LT_INTRATRD", dataset: "ext_lt_intratrd",
    dimensions: { freq: "A", indic_et: "MIO_EXP_VAL", sitc06: "TOTAL", partner: "EU27_2020" }, frequency: "Annual", unit: "EUR" },
];

// IMF Data Mapper indicator sets (annual values)
const IMF_WEO_INDICATORS = [
  "NGDP_RPCH", "NGDP_RPATPCH", "PCPIPCH", "LUR", "GGXWDG_NGDP", "GGXCNL_NGDP",
  "BCA_NGDPD", "NGDPD", "NGDPDPC", "PPPEX",
];
const IMF_IFS_INDICATORS = [
  "NGDPD", "NGDPDPC", "NGDP_RPCH", "NGDP_R_PCH", "PCPIPCH", "PCPIEPCH",
  "PPPEX", "PPPGDP", "PPPPC", "EREER", "ENEER", "FMB_GDP", "FMB_PCH",
  "FDSAOP_GDP", "FDSAOP_PCH", "BCA_NGDPD", "BT_GDP", "BX_GDP", "BM_GDP",
  "Reserves_M", "Reserves_M2",
];
const IMF_GFS_INDICATORS = [
  "GGR_G01_GDP_PT", "GGRXG_GDP", "GGX_GDP", "GGXCNL_GDP", "GGXWDG_GDP",
  "GGXWDG_NGDP", "GGXONLB_G01_GDP_PT", "GGXCNL_NGDP", "GGXCNLXG_GDP",
  "GGXWDN_G01_GDP_PT", "GGXGB_GDP", "GG_DEBT_GDP",
];

// OECD flows (full dumps; the endpoint ignores the request key)
const OECD_FLOWS = ["KEI", "QNA", "MEI_CLI"];

// ------------------------------------------------------------
// OECD Prices (P1): زیرشاخص‌های COICOP + Core رسمی
// ------------------------------------------------------------
// فلوی جدید (`DSD_PRICES@DF_PRICES_ALL`) که KEI ندارد.
// ⚠️ دو نکتهٔ حیاتی (تأییدشده 2026-09-20):
//   ۱) باید با ماژول `https` گرفته شود — سرور OECD به `fetch` نود ۵۰۰ می‌دهد.
//   ۲) جداکنندهٔ OR در کلید SDMX باید `%2B` باشد (`+` در URL = فاصله ⇒ 404).
const OECD_PRICES_BASE = "https://sdmx.oecd.org/public/rest/v1/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0";
const OECD_PRICES_ACCEPT = "application/vnd.sdmx.data+csv;version=1.0;labels=both";
const OECD_PRICES_FILE = "cpi_sub.csv";

// گروه‌های COICOP موردنیاز (`_TXCP01_NRG` = هستهٔ رسمی)
const OECD_PRICES_EXPENDITURE = [
  "_T", "_TXCP01_NRG", "_TXNRG_01_02",
  "CP01", "CP02", "CP03", "CP04", "CP05", "CP06",
  "CP07", "CP08", "CP09", "CP10", "CP11", "CP12",
  "CP045_0722", "SERV", "GD",
];

// کشورها: بُعد REF_AREA هم OR-پذیر است ⇒ با چند درخواست همه را می‌گیریم.
// ⚠️ استرالیا/نیوزیلند فصلی‌اند.
const OECD_PRICES_GROUPS = [
  { freq: "M", label: "Monthly", countries: ["USA", "CHN", "JPN", "DEU", "GBR", "FRA", "ITA", "CAN",
                                             "KOR", "IND", "TUR", "MEX", "BRA", "RUS", "SAU", "ZAF"] },
  { freq: "Q", label: "Quarterly", countries: ["AUS"] },
];

const OECD_PRICE_CODE_ALIAS = { _T: "TOTAL", _TXCP01_NRG: "TXCP01_NRG", _TXNRG_01_02: "TXNRG_01_02" };
const oecdPriceSuffix = (code) =>
  OECD_PRICE_CODE_ALIAS[code] || String(code).replace(/^_+/, "");

/** تقسیم آرایه به بسته‌های n عضوی (سرور OECD به درخواست بزرگ کند جواب می‌دهد). */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** GET متنی با ماژول https (نه fetch — دلیل بالا). */
function httpsGetText(url, headers, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, agent: false }, (r) => {
      let d = "";
      r.setEncoding("utf8");
      r.on("data", (c) => (d += c));
      r.on("end", () => resolve({ status: r.statusCode, text: d }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
  });
}

// ⚠️ TODO (P1 follow-up — 2026-09-20): زیرشاخص‌های COICOP + Core رسمی OECD
//    از فلوی جدید `OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL` می‌آیند که در
//    `offline/oecd/download_oecd_offline.cjs` (`downloadOecdPrices`) پیاده شد
//    و فایل `offline/oecd/cpi_sub.csv` را می‌سازد. برای هم‌سنجی با این updater
//    باید همان تابع (با ماژول `https` — نه fetch؛ سرور OECD به fetch نود
//    500 می‌دهد) این‌جا هم اضافه شود. تا آن زمان، تازه‌سازی زیرشاخص‌های OECD
//    فقط با اجرای دستی downloader آفلاین انجام می‌شود.

/** پارس CSV برچسب‌دار SDMX → [{area, code, time, value}] */
function parseOecdPricesCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const splitCsv = (line) => {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = splitCsv(lines[0]);
  const iArea = head.findIndex((h) => h.startsWith("REF_AREA"));
  const iExp = head.findIndex((h) => h.startsWith("EXPENDITURE"));
  const iTime = head.findIndex((h) => h.startsWith("TIME_PERIOD"));
  const iVal = head.indexOf("OBS_VALUE");
  if (iArea < 0 || iExp < 0 || iTime < 0 || iVal < 0) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsv(lines[i]);
    if (c.length <= iVal) continue;
    const value = Number(c[iVal]);
    if (!Number.isFinite(value)) continue;
    rows.push({
      area: String(c[iArea]).split(":")[0].trim(),
      code: String(c[iExp]).split(":")[0].trim(),
      time: c[iTime].trim(),
      value,
    });
  }
  return rows;
}

/**
 * دانلود زیرشاخص‌های COICOP + Core از OECD با **startPeriod افزایشی**.
 * watermark از macro.db خوانده می‌شود (آخرین `OECD.CPI_IDX_*`).
 */
async function downloadOecdPrices(opts = {}) {
  const retries = Math.max(1, opts.retries || 3);
  const sleepMs = opts.sleepMs != null ? opts.sleepMs : 4000;
  const dest = path.join(DOWNLOAD_DIR.OECD, OECD_PRICES_FILE);

  const rows = [];
  let requests = 0, failures = 0;
  const watermarks = {};
  for (const group of OECD_PRICES_GROUPS) {
    // ---- watermark مخصوص همین فرکانس (سری فصلی استرالیا با ماهانه قاطی نشود) ----
    const wm = await latestDbDate({
      dataset: "OECD",
      indicatorLike: "CPI_IDX_%",
      frequency: group.freq,
    });
    const startPeriod = wm ? oecdStartPeriod(wm, group.freq) : null;
    const query = startPeriod ? `?startPeriod=${startPeriod}` : "";
    watermarks[group.freq] = { watermark: wm, startPeriod };

    const areas = group.countries.join("%2B");
    const base = `${areas}.${group.freq}.N`;
    for (const codes of chunk(OECD_PRICES_EXPENDITURE, 6)) {
      const expList = codes.join("%2B");
      const url = `${OECD_PRICES_BASE}/${base}.CPI.IX.${expList}.N._Z${query}`;
      let attempt = 0, done = false, lastErr = null;
      while (attempt < retries && !done) {
        attempt++;
        try {
          const res = await httpsGetText(url, { Accept: OECD_PRICES_ACCEPT });
          requests++;
          if (res.status === 200) {
            for (const r of parseOecdPricesCsv(res.text)) {
              rows.push([r.area, `CPI_IDX_${oecdPriceSuffix(r.code)}`, r.time, r.value, "index", group.label]);
            }
            done = true;
          } else if (res.status === 404) {
            done = true; // NoRecordsFound — خطا نیست
          } else {
            lastErr = `HTTP ${res.status}`;
            await sleep(sleepMs);
          }
        } catch (e) {
          lastErr = e.message;
          await sleep(sleepMs);
        }
      }
      if (!done) {
        failures++;
        logger.warn(`[OECD prices] chunk failed: ${codes[0]}…${codes[codes.length - 1]} (${lastErr})`);
      }
      await sleep(sleepMs);
    }
  }

  if (rows.length === 0) {
    return {
      status: failures ? "failed" : "no-new-data",
      reason: failures ? "all requests failed" : "no new periods",
      dest, watermarks,
    };
  }
  // حذف تکراری‌ها و نوشتن CSV (جزئی — merge فقط INSERT/REVISION می‌کند)
  const seen = new Set();
  const body = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
  const header = "REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY";
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, header + "\n" + body.join("\n") + "\n");
  return { status: "downloaded", dest, rows: body.length, requests, failures, watermarks };
}

// ------------------------------------------------------------
// Generic download helpers
// ------------------------------------------------------------
/**
 * Stream a file to disk with retries.
 * - skips existing non-empty files unless opts.force
 * - uses a .part temp file then renames (atomic)
 */
async function downloadFile(url, destFile, { force = false, retries = 3, timeoutMs = 300000 } = {}) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  if (!force && fs.existsSync(destFile) && fs.statSync(destFile).size > 0) {
    return { status: "skipped", size: fs.statSync(destFile).size };
  }
  for (let n = 1; n <= Math.max(1, retries); n++) {
    const tmp = destFile + ".part";
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        clearTimeout(t);
        if (n === Math.max(1, retries)) return { status: "failed", reason: "HTTP " + (res.status || "no-body") };
        await sleep(500 * n);
        continue;
      }
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmp);
        const nodeStream = Readable.fromWeb(res.body);
        nodeStream.pipe(out);
        nodeStream.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => { clearTimeout(t); out.close(resolve); });
      });
      const st = fs.statSync(tmp);
      if (st.size > 0) {
        fs.renameSync(tmp, destFile);
        return { status: "downloaded", size: st.size };
      }
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      if (n === Math.max(1, retries)) return { status: "failed", reason: "empty file" };
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
      if (n === Math.max(1, retries)) return { status: "failed", reason: e.message };
      await sleep(500 * n);
    }
  }
  return { status: "failed", reason: "unknown" };
}

/** GET text with retries (used by IMF/Eurostat/FRED builders). */
async function fetchText(url, retries = 4) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      return { ok: true, text };
    } catch (e) {
      lastErr = e;
      await sleep(800 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, error: lastErr.message };
}

/** CSV-escape a field. */
function csvEsc(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Decode a Eurostat JSON-stat payload into rows of dimension combos.
 * Returns rows [{ <dim>: label, value: obs }].
 */
function decodeJSONStat(json) {
  const id = json.id || [];
  const size = json.size || [];
  const dims = json.dimension || {};
  const values = json.value || {};
  const catOrder = {};
  for (const d of id) {
    const cat = (dims[d] && dims[d].category) || {};
    const indexMap = cat.index || {};
    const labels = new Array(size[id.indexOf(d)] || 0).fill(null);
    for (const label in indexMap) labels[indexMap[label]] = label;
    catOrder[d] = labels;
  }
  const sizeMap = {};
  id.forEach((d, i) => (sizeMap[d] = size[i]));
  const rows = [];
  for (const key in values) {
    const obs = values[key];
    if (obs === null || obs === undefined) continue;
    let idx = Number(key);
    if (!Number.isFinite(idx)) continue;
    const combo = {};
    for (let d = id.length - 1; d >= 0; d--) {
      const dim = id[d];
      const dimSize = sizeMap[dim] || 1;
      const pos = idx % dimSize;
      combo[dim] = catOrder[dim][pos];
      idx = Math.floor(idx / dimSize);
    }
    combo.value = obs;
    rows.push(combo);
  }
  return { rows };
}

// ------------------------------------------------------------
// Per-source downloaders
// ------------------------------------------------------------

/** BIS: exactly the two required ZIPs. */
async function downloadBis(opts) {
  const bulkBase = SOURCES.BIS.bulkBase;
  const jobs = [
    { name: SOURCES.BIS.dumpPillPolicyRates, ori: SOURCES.BIS.policyRatesZip,
      url: `${bulkBase}/${SOURCES.BIS.policyRatesZip}`,
      dest: path.join(BIS_DOWNLOAD_DIRS.policy_rates, SOURCES.BIS.dumpPillPolicyRates) },
    { name: SOURCES.BIS.dumpCredit, ori: SOURCES.BIS.creditZip,
      url: `${bulkBase}/${SOURCES.BIS.creditZip}`,
      dest: path.join(BIS_DOWNLOAD_DIRS.credit, SOURCES.BIS.dumpCredit) },
  ];
  const results = [];
  for (const job of jobs) {
    const res = await downloadFile(job.url, job.dest, opts);
    results.push({ file: job.name, dest: job.dest, ...res });
  }
  return results;
}

/** IMF: rebuild IFS/GFS/WEO CSVs from the Data Mapper API. */
async function downloadImf(opts) {
  const base = SOURCES.IMF.apiBase; // e.g. https://www.imf.org/external/datamapper/api/v1/
  const jobs = [
    { file: "ifs.csv", indicators: IMF_IFS_INDICATORS },
    { file: "gfs.csv", indicators: IMF_GFS_INDICATORS },
    { file: "weo.csv", indicators: IMF_WEO_INDICATORS },
  ];
  const results = [];
  for (const job of jobs) {
    const dest = path.join(DOWNLOAD_DIR.IMF, job.file);
    if (!opts.force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      results.push({ file: job.file, dest, status: "skipped", size: fs.statSync(dest).size });
      continue;
    }
    const lines = ["ISO3,Country,IndicatorCode,Units,Scale,Year,Value"];
    let failed = 0;
    for (const ind of job.indicators) {
      const r = await fetchText(base + ind, opts.retries);
      if (!r.ok) { failed++; continue; }
      let json;
      try { json = JSON.parse(r.text); } catch { failed++; continue; }
      const series = (json.values && json.values[ind]) || {};
      for (const [iso, yrVals] of Object.entries(series)) {
        for (const [yr, val] of Object.entries(yrVals)) {
          if (val === "" || val === null || val === undefined) continue;
          lines.push([iso, iso, ind, "", "", yr, val].map(csvEsc).join(","));
        }
      }
    }
    fs.writeFileSync(dest, lines.join("\n") + "\n");
    results.push({ file: job.file, dest, status: "downloaded", size: Buffer.byteLength(lines.join("\n")), failedIndicators: failed });
  }
  return results;
}

/** World Bank: only the WDI bulk CSV ZIP (282 MB) is required. */
async function downloadWorldBank(opts) {
  const dest = path.join(DOWNLOAD_DIR.WORLD_BANK, "WDI_CSV.zip");
  const res = await downloadFile(
    SOURCES.WORLD_BANK.wdiZip, // central config
    dest,
    { ...opts, timeoutMs: 1200000 }
  );
  return [{ file: "WDI_CSV.zip", dest, ...res }];
}

/** OECD: three raw SDMX-JSON 2.0 dumps (KEI / QNA / MEI_CLI). */
async function downloadOecd(opts) {
  const base = SOURCES.OECD.sdmxBase; // central config
  const results = [];
  for (const flow of SOURCES.OECD.flows || OECD_FLOWS) {
    const dest = path.join(DOWNLOAD_DIR.OECD, `${flow}.json`);
    const res = await downloadFile(`${base}/${flow}/USA`, dest, { ...opts, timeoutMs: 600000 });
    results.push({ file: `${flow}.json`, dest, ...res });
  }
  // ---- P1: زیرشاخص‌های COICOP + Core رسمی (فلوی جدید Data Explorer) ----
  // فقط دوره‌های جدیدتر از watermark موجود در macro.db (~۸ درخواست سبک).
  if (!opts || opts.skipPrices !== true) {
    try {
      const prices = await downloadOecdPrices(opts || {});
      results.push({ file: OECD_PRICES_FILE, dest: prices.dest, ...prices });
      logger.info(
        `[OECD prices] ${prices.status} rows=${prices.rows || 0} ` +
          `watermarks=${JSON.stringify(prices.watermarks || {})}`
      );
    } catch (e) {
      results.push({ file: OECD_PRICES_FILE, status: "failed", reason: e.message });
      logger.warn(`[OECD prices] failed: ${e.message}`);
    }
  }
  return results;
}

/** Eurostat: tidy CSV per metric via the dissemination API. */
async function downloadEurostat(opts) {
  const base = SOURCES.EUROSTAT.apiBase; // central config
  const header = "REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY";
  const GEO_LIST = SOURCES.EUROSTAT.geos || EUROSTAT_GEO;
  const results = [];
  for (const entry of EUROSTAT_CATALOGUE) {
    const file = `${entry.metric}.csv`;
    const dest = path.join(DOWNLOAD_DIR.EUROSTAT, file);
    if (!opts.force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      results.push({ file, dest, status: "skipped", size: fs.statSync(dest).size });
      continue;
    }
    // ---- P1: آپدیت افزایشی — فقط N دورهٔ آخر (watermark از macro.db) ----
    let lastN = null;
    if (entry.incremental) {
      const wm = await latestDbDate({
        dataset: "EUROSTAT",
        indicatorLike: entry.indicatorPrefix ? `${entry.indicatorPrefix}_%` : entry.indicator,
      });
      lastN = wm ? eurostatLastTimePeriod(wm, entry.frequency === "Annual" ? "A" : "M") : null;
      if (lastN) {
        logger.info(`[EUROSTAT] ${file}: incremental lastTimePeriod=${lastN} (watermark=${wm})`);
      }
    }
    const q = ["format=JSON"];
    for (const [dim, val] of Object.entries(entry.dimensions)) q.push(`${dim}=${encodeURIComponent(String(val))}`);
    if (lastN) q.push(`lastTimePeriod=${lastN}`);
    // P1: بُعد COICOP یک بار به ازای هر کد تکرار می‌شود (هم‌الگوی geo)
    const codeDim = entry.coicopDim || null;
    for (const code of entry.codes || []) q.push(`${codeDim}=${encodeURIComponent(String(code))}`);
    for (const g of GEO_LIST) q.push(`geo=${encodeURIComponent(g)}`);
    const url = `${base}/${entry.dataset}?${q.join("&")}`;
    const r = await fetchText(url, opts.retries);
    if (!r.ok) {
      results.push({ file, dest, status: "failed", reason: r.error });
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(r.text); }
    catch (e) { results.push({ file, dest, status: "failed", reason: "parse: " + e.message }); continue; }
    const decoded = decodeJSONStat(parsed);
    const dims = parsed.dimension || {};
    const geoDim = "geo" in dims ? "geo" : null;
    const timeDim = "time" in dims ? "time" : ("TIME_PERIOD" in dims ? "TIME_PERIOD" : null);

    const lines = [header];
    for (const row of decoded.rows) {
      const area = geoDim ? row[geoDim] : null;
      const time = timeDim ? row[timeDim] : null;
      if (!area || !time || row.value === null || row.value === undefined) continue;
      // P1: کد COICOP در INDICATOR پخته می‌شود (لودر فقط همین ستون را می‌خواند)
      const code = codeDim ? (row[codeDim] || "") : "";
      const indicator = entry.indicatorPrefix
        ? (code ? `${entry.indicatorPrefix}_${code}` : entry.indicatorPrefix)
        : entry.indicator;
      lines.push([area, indicator, time, row.value, entry.unit, entry.frequency].map(csvEsc).join(","));
    }
    const seen = new Set();
    const body = lines.slice(1).filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
    const content = header + "\n" + body.join("\n") + "\n";
    fs.writeFileSync(dest, content);
    results.push({ file, dest, status: "downloaded", size: Buffer.byteLength(content), rows: body.length });
  }
  return results;
}

/** FRED: tidy CSV per metric from the keyless fredgraph.csv endpoint.
 *  سری‌های چندکشوری: هر entry می‌تواند `area` (ISO3) داشته باشد؛
 *  در غیر این صورت `REGION` (USA) استفاده می‌شود — لازم برای تورم هستهٔ
 *  کشورهای دیگر (مثل DEUCPHPLA01GYM → DEU). */
async function downloadFred(opts) {
  const REGION = "USA";
  const header = "REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY";
  const results = [];
  const accum = new Map();
  for (const e of FRED_CATALOGUE) accum.set(e.metric, []);
  for (const entry of FRED_CATALOGUE) {
    for (const s of entry.series) {
      const area = s.area || REGION;
      const url = `${SOURCES.FRED.graphsBase}/fredgraph.csv?id=${encodeURIComponent(s.id)}`;
      const r = await fetchText(url, opts.retries);
      if (!r.ok) {
        results.push({ file: `${entry.metric}.csv`, series: s.id, dest: path.join(DOWNLOAD_DIR.FRED, `${entry.metric}.csv`), status: "failed", reason: r.error });
        continue;
      }
      const lines = r.text.replace(/\r/g, "").split("\n").filter(Boolean);
      const bucket = accum.get(entry.metric);
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length < 2) continue;
        const val = parts[1];
        if (val === undefined || val === "" || val === ".") continue;
        bucket.push([s.label, parts[0], val, area]);
      }
    }
  }
  for (const entry of FRED_CATALOGUE) {
    const file = `${entry.metric}.csv`;
    const dest = path.join(DOWNLOAD_DIR.FRED, file);
    if (!opts.force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      results.push({ file, dest, status: "skipped", size: fs.statSync(dest).size });
      continue;
    }
    const lines = [header];
    for (const [indicator, date, value, area] of accum.get(entry.metric) || []) {
      lines.push([area || REGION, indicator, date, value, entry.unit, entry.frequency].map(csvEsc).join(","));
    }
    const seen = new Set();
    const body = lines.slice(1).filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
    const content = header + "\n" + body.join("\n") + "\n";
    fs.writeFileSync(dest, content);
    results.push({ file, dest, status: "downloaded", size: Buffer.byteLength(content), rows: body.length });
  }
  return results;
}

// ------------------------------------------------------------
// ZIP extraction
// ------------------------------------------------------------
/**
 * Extract a ZIP, keeping ONLY entries that pass the filter.
 * Uses the installed `unzipper` package (same as the rest of the repo).
 */
async function extractZip(zipPath, extractDir, { filter, force = false } = {}) {
  fs.mkdirSync(extractDir, { recursive: true });
  if (!fs.existsSync(zipPath)) return { ok: false, error: "zip not found" };
  const unzipper = require("unzipper");
  const entries = [];

  await new Promise((resolve) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        const name = entry.path;
        const want = filter ? filter(name) : true;
        if (entry.type === "File" && want) {
          entries.push(name);
          const dest = path.join(extractDir, path.basename(name));
          if (force || !fs.existsSync(dest) || fs.statSync(dest).size === 0) {
            entry.pipe(fs.createWriteStream(dest));
          } else {
            entry.autodrain();
          }
        } else {
          entry.autodrain();
        }
      })
      .on("close", resolve)
      .on("error", (e) => { entries.length = 0; entries._error = e.message; resolve(); });
  });

  if (entries._error) return { ok: false, error: entries._error };
  return { ok: true, entries };
}

/** Extract the required files for a source into extracted/<source>/. */
async function runExtract(source) {
  const report = [];

  if (source === "BIS") {
    const zips = [
      { zip: path.join(BIS_DOWNLOAD_DIRS.policy_rates, "bis_policy_rates.zip"), prefix: "WS_CBPOL" },
      { zip: path.join(BIS_DOWNLOAD_DIRS.credit, "bis_credit.zip"), prefix: "WS_CBS_PUB" },
    ];
    for (const z of zips) {
      const r = await extractZip(z.zip, EXTRACT_DIR.BIS, { filter: (n) => /\.csv$/i.test(n) });
      report.push({ file: path.basename(z.zip), ...r });
    }
  } else if (source === "WORLD_BANK") {
    const r = await extractZip(
      path.join(DOWNLOAD_DIR.WORLD_BANK, "WDI_CSV.zip"),
      EXTRACT_DIR.WORLD_BANK,
      { filter: (n) => /WDICSV\.csv$/i.test(n) }
    );
    report.push({ file: "WDI_CSV.zip", ...r });
  }
  // IMF/OECD/EUROSTAT/FRED download plain files (no ZIP) -> nothing to extract.

  return report;
}

// ------------------------------------------------------------
// Dispatcher
// ------------------------------------------------------------
const DOWNLOADERS = {
  BIS: downloadBis,
  IMF: downloadImf,
  WORLD_BANK: downloadWorldBank,
  OECD: downloadOecd,
  EUROSTAT: downloadEurostat,
  FRED: downloadFred,
};

/**
 * Run the Smart Downloader for one source.
 * @returns {Promise<{source, results, ok}>}
 */
async function runSmartDownload(source, opts = {}) {
  const fn = DOWNLOADERS[source];
  if (!fn) {
    logger.warn(`[${source}] no smart downloader defined`);
    return { source, ok: false, results: [], error: "no downloader" };
  }
  logger.info(`[${source}] smart download started...`);
  const results = await fn({ force: !!opts.force, retries: opts.retries || 3 });
  const failed = results.filter((r) => r.status === "failed");
  for (const r of results) {
    logger.info(`[${source}]   ${r.file}  ${r.status}${r.size ? ` (${r.size} bytes)` : ""}${r.reason ? ` — ${r.reason}` : ""}`);
  }
  if (failed.length) logger.warn(`[${source}] ${failed.length} file(s) failed`);
  return { source, ok: failed.length === 0 && results.length > 0, results };
}

module.exports = {
  runSmartDownload,
  runExtract,
  downloadFile,
  FRED_CATALOGUE,
  EUROSTAT_CATALOGUE,
  IMF_IFS_INDICATORS,
  IMF_GFS_INDICATORS,
  IMF_WEO_INDICATORS,
  OECD_FLOWS,
  // ---- P1 (2026-09-20): آپدیت افزایشی + قیمت‌های OECD ----
  downloadOecdPrices,
  latestDbDate,
  oecdStartPeriod,
  eurostatLastTimePeriod,
  OECD_PRICES_EXPENDITURE,
  OECD_PRICES_GROUPS,
};


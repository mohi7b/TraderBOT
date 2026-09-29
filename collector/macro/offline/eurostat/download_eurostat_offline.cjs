/**
 * ============================================================
 * Project: Macro Engine Collector — Offline Eurostat Downloader
 * File: collector/macro/offline/eurostat/download_eurostat_offline.cjs
 * Description:
 *   Downloads Eurostat bulk datasets into:
 *       collector/macro/offline/eurostat/
 *
 *   Datasets (EU-wide macro indicators):
 *     - cpi_yoy.csv        : HICP annual rate of change (prc_hicp_manr)
 *     - cpi_index.csv      : HICP monthly index, 2015=100 (prc_hicp_midx)
 *     - cpi_yoy_sub.csv    : HICP YoY % for 21 COICOP groups + special aggregates
 *     - cpi_index_sub.csv  : HICP index for the same 21 COICOP groups
 *     - cpi_weights.csv    : HICP item weights in ‰ (prc_hicp_iw, coicop18 dim)
 *     - gdp.csv            : Quarterly GDP, chain-linked volumes (namq_10_gdp)
 *     - unemployment.csv   : Monthly unemployment rate (une_rt_m)
 *     - employment.csv     : Quarterly employment (lfsi_emp_q)
 *     - trade.csv          : Extra-EU trade by SITC (ext_st_27_2020sitc)
 *
 *   Sub-index convention (IMPORTANT):
 *     The offline loader only reads the CSV `INDICATOR` column, so the
 *     COICOP code is baked into it by this script:
 *       HICP_MIDX_CP01  ·  HICP_ANR_CP04  ·  HICP_IW_TOTAL
 *     ⇒ each group becomes its own series
 *       (e.g. EUROSTAT.DEU.HICP_MIDX_CP01.M) with no header/staging clash.
 *
 *   Verified codes (Eurostat API, 2026-09-20):
 *     CP00..CP12, CP045, CP071, CP0722, NRG, FOOD, IGD, SERV,
 *     TOT_X_NRG, TOT_X_NRG_FOOD  ← «بدون خوراک و انرژی» = Core
 *     ⚠️ `CP00_X_FOOD_ENG` DOES NOT EXIST (that code returns no data).
 *
 *   Data access:
 *     Eurostat SDMX 2.1 / JSON-stat dissemination API
 *       https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<dataset>?format=JSON
 *     Dimension filters (freq, geo, na_item, unit, s_adj, sex, age, ...)
 *     are appended as query parameters.
 *
 *   Output format:
 *     Long/tidy CSV per metric with header:
 *       REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY
 *     Matches the offline loader conventions.
 *
 *   Behaviour:
 *     - Creates the target dir if missing.
 *     - Skips existing non-empty files (no re-download).
 *     - Prints a per-file report and the final folder size.
 *
 * Usage:
 *   node collector/macro/offline/eurostat/download_eurostat_offline.cjs
 *   node collector/macro/offline/eurostat/download_eurostat_offline.cjs --dry-run
 *   node collector/macro/offline/eurostat/download_eurostat_offline.cjs --force
 * ============================================================
 */
const fs = require("fs");
const path = require("path");

const TARGET_DIR = __dirname; // collector/macro/offline/eurostat
const BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

// Representative EU member states + key non-EU European economies.
const GEO = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI", "EL", "PL", "SE", "UK", "NO", "CH"];

// ------------------------------------------------------------
// COICOP code lists for the sub-index / core / weights downloads
// ------------------------------------------------------------
// ✅ همهٔ این کدها در `prc_hicp_midx` با API رسمی Eurostat تأیید شده‌اند
//    (تست 2026-09-20: DE, 2024-01 → مقدار برگشت داده شد).
//    نمونه: CP01=146.3 · CP04=130.7 · NRG=150.2 · FOOD=143.7 · SERV=118.1
//
// ⚠️ نکتهٔ مهم: کد «همهٔ اقلام منهای خوراک و انرژی» در Eurostat
//    `TOT_X_NRG_FOOD` است — NOT `CP00_X_FOOD_ENG` (آن کد وجود ندارد و
//    API برایش پاسخ خالی/خطا می‌دهد).
const COICOP_SUB = [
  // ---- کل سبد (مرجع؛ سری موجود را دوباره تولید نمی‌کند چون فایل جداست) ----
  "CP00",
  // ---- ۱۲ گروه اصلی COICOP ----
  "CP01", // Food and non-alcoholic beverages
  "CP02", // Alcoholic beverages, tobacco
  "CP03", // Clothing and footwear
  "CP04", // Housing, water, electricity, gas and other fuels
  "CP05", // Furnishings, household equipment
  "CP06", // Health
  "CP07", // Transport
  "CP08", // Communications
  "CP09", // Recreation and culture
  "CP10", // Education
  "CP11", // Restaurants and hotels
  "CP12", // Miscellaneous goods and services
  // ---- ریزگروه‌های کلیدی (انرژی/برق و گاز/حمل‌ونقل) ----
  "CP045",   // Electricity, gas and other fuels
  "CP071",   // Purchase of vehicles
  "CP0722",  // Fuels and lubricants for personal transport equipment
  // ---- تجمیع‌های ویژهٔ Eurostat (پایهٔ محاسبهٔ Core) ----
  "NRG",             // Energy
  "FOOD",            // Food (incl. alcohol & tobacco)
  "IGD",             // Industrial goods
  "SERV",            // Services
  "TOT_X_NRG",       // Overall index excluding energy
  "TOT_X_NRG_FOOD",  // ⭐ Overall index excluding energy and food  == Core
];

// وزن‌های سبد مصرف‌کننده: در `prc_hicp_iw` بُعدش `coicop18` نام دارد
// (نه `coicop`) و کد کل سبد `TOTAL` است. مقادیر در هزار (‰) و جمعشان ۱۰۰۰.
const COICOP_WEIGHTS = [
  "TOTAL",
  "CP01", "CP02", "CP03", "CP04", "CP05", "CP06",
  "CP07", "CP08", "CP09", "CP10", "CP11", "CP12",
];

// ------------------------------------------------------------
// Dataset catalogue. Each entry maps to one output CSV file.
// `dimensions` are appended as query params to constrain the cube.
// `filter` (optional) keeps only observations matching a dimension=value.
// `frequency`/`unit` are inferred from data where possible.
// ------------------------------------------------------------
const CATALOGUE = [
  {
    metric: "cpi_yoy",
    indicator: "HICP_ANR",
    dataset: "prc_hicp_manr",
    dimensions: { unit: "RCH_A", coicop: "CP00", freq: "M" },
    frequency: "Monthly",
    unit: "%",
  },
  {
    metric: "cpi_index",
    indicator: "HICP_MIDX",
    dataset: "prc_hicp_midx",
    dimensions: { unit: "I15", coicop: "CP00", freq: "M" },
    frequency: "Monthly",
    unit: "index",
  },
  // ---- زیرشاخص‌های COICOP (خوراک/انرژی/مسکن/...) — شاخص ----
  // indicator = <indicatorPrefix>_<coicop>  ⇒ هر گروه یک سری جداست و
  // در loader با series_id مستقل (EUROSTAT.DEU.HICP_MIDX_CP01.M) ذخیره می‌شود.
  {
    metric: "cpi_index_sub",
    indicatorPrefix: "HICP_MIDX",
    dataset: "prc_hicp_midx",
    coicopDim: "coicop",
    codes: COICOP_SUB,
    dimensions: { unit: "I15", freq: "M" },
    frequency: "Monthly",
    unit: "index",
  },
  // ---- زیرشاخص‌های COICOP — نرخ سالانه (٪) ----
  {
    metric: "cpi_yoy_sub",
    indicatorPrefix: "HICP_ANR",
    dataset: "prc_hicp_manr",
    coicopDim: "coicop",
    codes: COICOP_SUB,
    dimensions: { unit: "RCH_A", freq: "M" },
    frequency: "Monthly",
    unit: "%",
  },
  // ---- وزن‌های سبد مصرف‌کننده (HICP item weights, ECOICOP v2) ----
  // مقادیر در هزار (‰)؛ برای محاسبهٔ Core با فرمول حذفی
  //   Core ≈ (CPI − w_food·food − w_energy·energy) / (1 − w_food − w_energy)
  {
    metric: "cpi_weights",
    indicatorPrefix: "HICP_IW",
    dataset: "prc_hicp_iw",
    coicopDim: "coicop18",
    codes: COICOP_WEIGHTS,
    dimensions: { statinfo: "IW", freq: "A" },
    frequency: "Annual",
    unit: "per_mille",
  },
  {
    metric: "gdp",
    indicator: "GDP_CLV10_MEUR",
    dataset: "namq_10_gdp",
    dimensions: { unit: "CLV10_MEUR", na_item: "B1GQ", s_adj: "NSA", freq: "Q" },
    frequency: "Quarterly",
    unit: "million EUR",
  },
  {
    metric: "gdp_yoy",
    indicator: "GDP_CLV_PCH_SM",
    dataset: "namq_10_gdp",
    dimensions: { unit: "CLV_PCH_SM", na_item: "B1GQ", s_adj: "NSA", freq: "Q" },
    frequency: "Quarterly",
    unit: "%",
  },
  {
    metric: "unemployment",
    indicator: "UNE_RT_M",
    dataset: "une_rt_m",
    dimensions: { sex: "T", age: "TOTAL", unit: "PC_ACT", s_adj: "SA", freq: "M" },
    frequency: "Monthly",
    unit: "%",
  },
  {
    metric: "employment",
    indicator: "LFSI_EMP_Q",
    dataset: "lfsi_emp_q",
    dimensions: { indic_em: "EMP_LFS", sex: "T", age: "Y15-64", unit: "THS_PER", s_adj: "SA", freq: "Q" },
    frequency: "Quarterly",
    unit: "thousand persons",
  },
  {
    metric: "trade",
    indicator: "EXT_LT_INTRATRD",
    dataset: "ext_lt_intratrd",
    dimensions: { freq: "A", indic_et: "MIO_EXP_VAL", sitc06: "TOTAL", partner: "EU27_2020" },
    frequency: "Annual",
    unit: "EUR",
  },
];

const DEFAULTS = {
  force: false,
  dryRun: false,
  concurrency: 3,
  retries: 4,
};

// ----------------------------- Utils -----------------------------
function parseArgs(argv) {
  const flags = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--force": flags.force = true; break;
      case "--dry-run": flags.dryRun = true; break;
      case "--concurrency": flags.concurrency = Number(argv[++i]) || DEFAULTS.concurrency; break;
      case "--retries": flags.retries = Number(argv[++i]) || DEFAULTS.retries; break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }
  return flags;
}

function printHelp() {
  console.log(`
Eurostat offline downloader
  Downloads EU macro datasets into:
      collector/macro/offline/eurostat/

Options:
  --force          Re-download even if the file already exists
  --dry-run        Report what would be downloaded, download nothing
  --concurrency <n> Parallel downloads (default 3)
  --retries <n>    Attempts per file (default 4)
  -h, --help       Show this help
`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, retries) {
  let lastErr;
  for (let i = 0; i < Math.max(1, retries); i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)", Accept: "application/json" },
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { ok: true, json: await res.json() };
    } catch (e) {
      lastErr = e;
      await sleep(800 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, error: lastErr };
}

/**
 * Decode a Eurostat JSON-stat dataset into rows.
 * Eurostat returns the "data cube" representation:
 *   - `id`     : ordered list of dimension names
 *   - `size`   : ordered list of dimension lengths
 *   - `dimension[<name>].category.index` : value -> index map
 *   - `value`  : flat map of linear index -> observation value
 *
 * Returns: [{ <dim>: value, ... , value: <obs> }] with a helper `geo`,
 * `time` and `value` extraction.
 */
function decodeJSONStat(json) {
  const id = json.id || [];
  const size = json.size || [];
  const dims = json.dimension || {};
  const values = json.value || {};

  // Build, for each dimension, an ordered list of category labels.
  const catOrder = {};
  for (const d of id) {
    const cat = (dims[d] && dims[d].category) || {};
    const indexMap = cat.index || {};
    const labels = new Array(size[id.indexOf(d)] || 0).fill(null);
    for (const label in indexMap) labels[indexMap[label]] = label;
    catOrder[d] = labels;
  }

  // Precompute cumulative product for index decoding.
  const sizeMap = {};
  id.forEach((d, i) => (sizeMap[d] = size[i]));
  const total = size.reduce((a, b) => a * b, 1);

  const rows = [];
  for (const key in values) {
    const obs = values[key];
    if (obs == null) continue;
    let idx = Number(key);
    if (!Number.isFinite(idx)) continue;
    const combo = {};
    // decode from last dimension (fastest varying) to first.
    for (let d = id.length - 1; d >= 0; d--) {
      const dim = id[d];
      const dimSize = sizeMap[dim];
      const pos = idx % dimSize;
      idx = Math.floor(idx / dimSize);
      combo[dim] = catOrder[dim][pos];
    }
    combo.value = obs;
    rows.push(combo);
  }
  return { rows, total };
}

function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).reduce((acc, f) => {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    return acc + (st.isDirectory() ? dirSize(p) : st.size);
  }, 0);
}

// ----------------------------- Main -----------------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  const header = "REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY";
  const results = [];

  for (const entry of CATALOGUE) {
    const file = `${entry.metric}.csv`;
    const dest = path.join(TARGET_DIR, file);

    if (!args.force && !args.dryRun && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      results.push({ file, status: "skipped", size: fs.statSync(dest).size });
      continue;
    }
    if (args.dryRun) {
      results.push({ file, status: "dry-run" });
      continue;
    }

    // Build query string: fix listed dimensions + constrain geo.
    // NOTE: Eurostat requires REPEATED geo= params (comma-separated values
    // return an empty geo dimension → zero observations).
    // Sub-index / weights entries repeat their COICOP dimension once per code
    // (same rule as geo) — verified with prc_hicp_midx + prc_hicp_iw.
    const q = ["format=JSON"];
    for (const [dim, val] of Object.entries(entry.dimensions)) q.push(`${dim}=${encodeURIComponent(String(val))}`);
    const codeDim = entry.coicopDim || null;
    for (const code of entry.codes || []) q.push(`${codeDim}=${encodeURIComponent(String(code))}`);
    for (const g of GEO) q.push(`geo=${encodeURIComponent(g)}`);
    const url = `${BASE}/${entry.dataset}?${q.join("&")}`;

    const r = await fetchJson(url, args.retries);
    if (!r.ok) {
      results.push({ file, status: "failed", reason: r.error?.message });
      continue;
    }

    const { rows } = decodeJSONStat(r.json);
    const lines = [header];
    const geoDim = r.json.dimension && r.json.dimension.geo ? "geo" : null;
    const timeDim = r.json.dimension && r.json.dimension.time ? "time"
      : (r.json.dimension && r.json.dimension.TIME_PERIOD ? "TIME_PERIOD" : null);

    let count = 0;
    const codeSeen = new Set();
    for (const row of rows) {
      const area = geoDim ? row[geoDim] : null;
      const time = timeDim ? row[timeDim] : null;
      const value = row.value;
      if (!area || !time || value == null) continue;
      // زیرشاخص/وزن: کد COICOP همان ردیف را به INDICATOR اضافه می‌کند
      // (loader فقط ستون INDICATOR را می‌خواند ⇒ باید این‌جا تفکیک شود)
      const code = codeDim ? (row[codeDim] || "") : "";
      if (code) codeSeen.add(code);
      const indicator = entry.indicatorPrefix
        ? (code ? `${entry.indicatorPrefix}_${code}` : entry.indicatorPrefix)
        : entry.indicator;
      // Decompose a "TIME_PERIOD" like "2024-01" vs "2024-Q1" into a date-ish
      // token we keep as-is (loaders normalize it later).
      const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
      lines.push([area, indicator, time, value, entry.unit, entry.frequency].map(esc).join(","));
      count++;
    }

    // De-duplicate.
    const seen = new Set();
    const body = lines.slice(1).filter((l) => {
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    });
    const content = header + "\n" + body.join("\n") + "\n";
    fs.writeFileSync(dest, content);
    results.push({ file, status: "downloaded", size: Buffer.byteLength(content), rows: body.length,
                   codes: codeDim ? codeSeen.size : null, codesWanted: codeDim ? entry.codes.length : null });
  }

  console.log("===  Eurostat Report ===");
  console.log(`Folder: ${TARGET_DIR}`);
  for (const r of results) {
    const extra = r.size ? ` (${humanSize(r.size)})` : r.rows ? ` (${r.rows} rows)` : r.reason ? ` — ${r.reason}` : "";
    const codes = (r.codes != null) ? `  [COICOP ${r.codes}/${r.codesWanted}]` : "";
    const tick = r.status === "downloaded" ? "✅" : r.status === "skipped" ? "⏭️" : r.status === "failed" ? "❌" : "ℹ️";
    console.log(`  ${tick} ${r.file}  ${r.status}${extra}${codes}`);
  }
  console.log(`\nTotal size: ${humanSize(dirSize(TARGET_DIR))}`);
})().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
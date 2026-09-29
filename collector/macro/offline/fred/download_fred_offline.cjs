/**
 * ============================================================
 * Project: Macro Engine Collector — Offline FRED Downloader
 * File: collector/macro/offline/fred/download_fred_offline.cjs
 * Description:
 *   Downloads FRED (St. Louis Fed) time series into:
 *       collector/macro/offline/fred/
 *
 *   Datasets (US-centric macro indicators + global core CPI):
 *     - interest_rate.csv  : Fed Funds (DFF/FEDFUNDS) + 10Y Treasury (DGS10)
 *     - cpi.csv            : CPI all urban (CPIAUCSL)
 *     - core_cpi.csv       : US core (CPILFESL) **+ verified foreign core CPI**
 *     - ppi.csv            : PPI final demand (PPIACO)
 *     - gdp.csv            : GDP (GDP / GDPC1 real)
 *     - money_supply.csv   : M1 (M1SL) + M2 (M2SL)
 *     - unemployment.csv   : Unemployment rate (UNRATE)
 *
 *   Multi-country series:
 *     FRED is US-centric, but OECD/Eurostat re-publications hosted on FRED
 *     carry specific countries. Every series entry may therefore set its own
 *     `area` (ISO3); when omitted, `REGION` (USA) is used.
 *     Verified core-CPI families (2026-09-19):
 *       {ISO3}CPHPLA01GYM    core HICP, YoY %, monthly      (DEU/FRA/ITA)
 *       {ISO3}CPHPLA01IXOBM  core HICP, index 2015=100, M   (DEU/FRA/ITA/GBR)
 *       CPGRLE01{ISO2}M659N  core CPI (COICOP non-food non-energy), YoY %, M
 *                            (DEU/FRA/ITA/GBR/CAN/KOR)
 *     ⚠️ NOT available on FRED (404 / discontinued): JPN (stale 2021-06),
 *        AUS, CHN, IND, TUR, MEX, BRA, RUS, SAU, ZAF — those need the OECD
 *        `DF_PRICES_ALL` / Eurostat COICOP ingest (see MACRO_DATA_INVENTORY.md).
 *
 *   Data access:
 *     Uses the keyless FRED graph CSV endpoint
 *       https://fred.stlouisfed.org/graph/fredgraph.csv?id=<series>
 *     so no API token is required. If FRED_API_KEY is set in the
 *     environment, the JSON observations API is used instead for the
 *     same series (metadata parity with other collectors).
 *
 *   Output format:
 *     Long/tidy CSV per metric with header:
 *       REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY
 *     Matches the offline loader conventions (country/variable/date/value).
 *
 *   Behaviour:
 *     - Creates the target dir if missing.
 *     - Skips existing non-empty files (no re-download).
 *     - Prints a per-file report and the final folder size.
 *
 * Usage:
 *   node collector/macro/offline/fred/download_fred_offline.cjs
 *   node collector/macro/offline/fred/download_fred_offline.cjs --dry-run
 *   node collector/macro/offline/fred/download_fred_offline.cjs --force
 * ============================================================
 */
const fs = require("fs");
const path = require("path");

const TARGET_DIR = __dirname; // collector/macro/offline/fred
const REGION = "USA";         // FRED only covers the United States

// ------------------------------------------------------------
// Series catalogue: metric file -> list of FRED series.
// `id` is the FRED series identifier, `label` a human descriptor
// used as the INDICATOR column value.
// ------------------------------------------------------------
const CATALOGUE = [
  {
    metric: "interest_rate",
    unit: "%",
    frequency: "Daily",
    series: [
      { id: "FEDFUNDS", label: "FEDFUNDS" },   // Effective Federal Funds Rate (monthly)
      { id: "DGS10",    label: "DGS10" },      // 10-Year Treasury Constant Maturity Rate
      { id: "DGS2",     label: "DGS2" },       // 2-Year Treasury Constant Maturity Rate
    ],
  },
  {
    metric: "cpi",
    unit: "index",
    frequency: "Monthly",
    series: [
      { id: "CPIAUCSL", label: "CPIAUCSL" },   // Consumer Price Index for All Urban Consumers
    ],
  },
  // ---- زیرشاخص‌های CPI آمریکا (Food / Energy / Housing / …) ----
  // ✅ همهٔ این series_id ها با fredgraph.csv تأیید شده‌اند (2026-09-20).
  //    خانوادهٔ SA (CPIFABSL/CPIENGSL/CPIHOSSL) = گروه‌های اصلی فصلی‌تعدیل‌شده
  //    و خانوادهٔ CUUR0000S* = سری‌های NSA ریزتر (سوخت، برق، اجاره، خودرو).
  //
  // ⚠️ تأیید نشد (404 روی fredgraph): CUUR0000SA0، CUUR0000SAF1، CUUR0000SAM،
  //    CUSR0000SA0 — عمداً اضافه نشده‌اند (برای «همهٔ اقلام» همان CPIAUCSL هست).
  {
    metric: "cpi_sub",
    unit: "index",
    frequency: "Monthly",
    series: [
      { id: "CPIFABSL",      label: "CPIFABSL" },      // Food and beverages (SA)
      { id: "CPIENGSL",      label: "CPIENGSL" },      // Energy (SA)
      { id: "CPIHOSSL",      label: "CPIHOSSL" },      // Housing (SA)
      { id: "CUUR0000SAF11", label: "CUUR0000SAF11" }, // Food at home (NSA)
      { id: "CUUR0000SAF112",label: "CUUR0000SAF112" },// Meats, poultry, fish and eggs
      { id: "CUUR0000SAH1",  label: "CUUR0000SAH1" },  // Shelter
      { id: "CUUR0000SEHA",  label: "CUUR0000SEHA" },  // Rent of primary residence
      { id: "CUUR0000SETB01",label: "CUUR0000SETB01" },// Gasoline, all types
      { id: "CUUR0000SEHF01",label: "CUUR0000SEHF01" },// Electricity
      { id: "CUUR0000SETA01",label: "CUUR0000SETA01" },// New vehicles
    ],
  },
  {
    metric: "core_cpi",
    unit: "index",
    frequency: "Monthly",
    series: [
      // ---- USA (تنها سری هستهٔ کشوری که خود FRED منتشر می‌کند) ----
      { id: "CPILFESL", label: "CPILFESL" },
      // ---- تورم هستهٔ HICP (OECD/Eurostat روی FRED) — YoY ٪ ----
      //  اعداد و بازه‌ها با API رسمی FRED تأیید شده‌اند (2026-09-19)
      { id: "DEUCPHPLA01GYM",   label: "DEUCPHPLA01GYM",   area: "DEU" }, // 1997-01..2025-04
      { id: "FRACPHPLA01GYM",   label: "FRACPHPLA01GYM",   area: "FRA" }, // 1997-01..2025-04
      { id: "ITACPHPLA01GYM",   label: "ITACPHPLA01GYM",   area: "ITA" }, // 1997-01..2025-04
      // ---- شاخص هستهٔ HICP (2015=100) ----
      { id: "DEUCPHPLA01IXOBM", label: "DEUCPHPLA01IXOBM", area: "DEU" }, // 1995-01..2025-03
      { id: "FRACPHPLA01IXOBM", label: "FRACPHPLA01IXOBM", area: "FRA" }, // 1990-01..2025-04
      { id: "ITACPHPLA01IXOBM", label: "ITACPHPLA01IXOBM", area: "ITA" }, // 1990-01..2025-04
      { id: "GBRCPHPLA01IXOBM", label: "GBRCPHPLA01IXOBM", area: "GBR" }, // 1988-01..2025-03
      // ---- هستهٔ CPI (COICOP: همه اقلام منهای خوراک و انرژی) — YoY ٪ ----
      { id: "CPGRLE01DEM659N",  label: "CPGRLE01DEM659N",  area: "DEU" }, // 1963-01..2025-03
      { id: "CPGRLE01FRM659N",  label: "CPGRLE01FRM659N",  area: "FRA" }, // 1971-01..2025-03
      { id: "CPGRLE01ITM659N",  label: "CPGRLE01ITM659N",  area: "ITA" }, // 1961-01..2025-03
      { id: "CPGRLE01GBM659N",  label: "CPGRLE01GBM659N",  area: "GBR" }, // 1971-01..2025-03
      { id: "CPGRLE01CAM659N",  label: "CPGRLE01CAM659N",  area: "CAN" }, // 1962-01..2025-03
      { id: "CPGRLE01KRM659N",  label: "CPGRLE01KRM659N",  area: "KOR" }, // 1990-01..2025-04
      // ---- تُرکیه: تنها کشوری از ۱۰ کشور «بدون Core» که Core آن روی FRED هست ----
      { id: "TURCPHPLA01IXOBM", label: "TURCPHPLA01IXOBM", area: "TUR" }, // 1996-01..2025-03 (تأیید 2026-09-20)
      // ⚠️ عمداً اضافه نشده: JPN (CPGRLE01JPM659N تا 2021-06 متوقف است)
      //    و AUS/CHN/IND/MEX/BRA/RUS/SAU/ZAF که در FRED وجود ندارند (404).
      //    برای این ۹ کشور باید OECD DF_PRICES_ALL (EXPENDITURE=_TXCP01_NRG)
      //    یا Eurostat COICOP استفاده شود — نگاه کنید به MACRO_DATA_INVENTORY.md §۷.
    ],
  },
  {
    metric: "ppi",
    unit: "index",
    frequency: "Monthly",
    series: [
      { id: "PPIACO", label: "PPIACO" },       // Producer Price Index for All Commodities
      { id: "PPIFIS", label: "PPIFIS" },       // PPI Final Demand, finished goods
    ],
  },
  {
    metric: "gdp",
    unit: "billions USD",
    frequency: "Quarterly",
    series: [
      { id: "GDP",  label: "GDP" },            // Gross Domestic Product (nominal, quarterly)
      { id: "GDPC1", label: "GDPC1" },         // Real Gross Domestic Product (quarterly)
    ],
  },
  {
    metric: "money_supply",
    unit: "billions USD",
    frequency: "Monthly",
    series: [
      { id: "M1SL", label: "M1SL" },           // M1 Money Stock
      { id: "M2SL", label: "M2SL" },           // M2 Money Stock
    ],
  },
  {
    metric: "unemployment",
    unit: "%",
    frequency: "Monthly",
    series: [
      { id: "UNRATE", label: "UNRATE" },       // Civilian Unemployment Rate
    ],
  },
  // ---- بازدهی اوراق دولتی ۱۰ساله (Yield10Y) — P3-Signals (2026-09-22) ----
  // منبع: OECD «Long-Term Government Bond Yields: 10-Year (Main)» بازنشرِ FRED
  //       با الگوی `IRLTLT01{ISO2}M156N` + `DGS10` برای آمریکا (روزانه، تازه‌تر).
  // کاربرد: سیگنال 📈 «شرایط مالی» در چارت تورمی (`aux.yield10y`).
  //
  // ✅ تأییدشده با fredgraph.csv (2026-09-22) — تعداد ردیف ماهانه:
  //    AUS 686 · CAN 860 · DEU 844 · FRA 800 · ITA 426 · JPN 452 · KOR 311 ·
  //    MEX 302 · RUS 234 · ZAF 836 · USA 881 (+DGS10 روزانه) · EZ 673 · IND 176
  // ⚠️ روی FRED **وجود ندارد** (404): BRA، CHN، SAU، TUR ⇒ این چهار کشور
  //    فعلاً سیگنال بازدهی ندارند (بج رسم نمی‌شود؛ مقدار ساختگی نمی‌سازیم).
  //    مسیر آینده: BIS «Long-term government bond yields» یا ورود دستی.
  {
    metric: "long_term_rate",
    unit: "%",
    frequency: "Monthly",
    series: [
      { id: "DGS10",            label: "DGS10" },             // USA — 10Y Treasury (Daily)
      { id: "IRLTLT01USM156N",  label: "IRLTLT01USM156N",  area: "USA" },
      { id: "IRLTLT01AUM156N",  label: "IRLTLT01AUM156N",  area: "AUS" },
      { id: "IRLTLT01CAM156N",  label: "IRLTLT01CAM156N",  area: "CAN" },
      { id: "IRLTLT01DEM156N",  label: "IRLTLT01DEM156N",  area: "DEU" },
      { id: "IRLTLT01FRM156N",  label: "IRLTLT01FRM156N",  area: "FRA" },
      { id: "INDIRLTLT01STM",   label: "INDIRLTLT01STM",   area: "IND" },
      { id: "IRLTLT01ITM156N",  label: "IRLTLT01ITM156N",  area: "ITA" },
      { id: "IRLTLT01JPM156N",  label: "IRLTLT01JPM156N",  area: "JPN" },
      { id: "IRLTLT01KRM156N",  label: "IRLTLT01KRM156N",  area: "KOR" },
      { id: "IRLTLT01MXM156N",  label: "IRLTLT01MXM156N",  area: "MEX" },
      { id: "IRLTLT01RUM156N",  label: "IRLTLT01RUM156N",  area: "RUS" },
      { id: "IRLTLT01ZAM156N",  label: "IRLTLT01ZAM156N",  area: "ZAF" },
    ],
  },
  // ---- شاخص‌های بازار جهانی (P5-Financial — 2026-09-23) ----
  // برای چارت «شرایط مالی» (FAS): نوسان · دلار · سهام · اسپرد اعتباری · نقدینگی.
  // ⚠️ همهٔ این‌ها **بازار جهانی/آمریکا**اند (ارزش کشوری ندارند) و در چارت
  //    به‌عنوان شاخص جهانی برای هر کشور خوانده می‌شوند (مستند + در tooltip).
  // ✅ تأییدشده با fredgraph.csv (2026-09-23):
  //    VIXCLS 9580 · DTWEXBGS 5405 · SP500 2608 · BAMLC0A0CM 793 · M2SL
  {
    metric: "market_global",
    unit: "%",
    frequency: "Daily",
    /**
     * ⚠️ این سری‌ها **روزانه**اند و فیلتر core.db فقط M/Q/A را کپی می‌کند
     * (`frequencies.json`) ⇒ در همین دانلودر به **ماهانه** تجمیع می‌شوند
     * (آخرین مشاهدهٔ هر ماه). بدون این کار، هیچ ردیفی به چارت نمی‌رسید.
     */
    aggregate: "monthly",
    series: [
      { id: "VIXCLS",     label: "VIXCLS" },     // نوسان انتظاری S&P500 (VIX)
      { id: "DTWEXBGS",   label: "DTWEXBGS" },   // شاخص دلار (broad, trade-weighted)
      { id: "SP500",      label: "SP500" },      // شاخص سهام S&P 500
      { id: "BAMLC0A0CM", label: "BAMLC0A0CM" }, // اسپرد اعتباری IG (OAS)
      { id: "M2SL",       label: "M2SL" },       // نقدینگی (M2 آمریکا — پروکسی جهانی)
    ],
  },
];

const DEFAULTS = {
  force: false,
  dryRun: false,
  concurrency: 4,
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
FRED offline downloader
  Downloads key US macro series into:
      collector/macro/offline/fred/

Options:
  --force          Re-download even if the file already exists
  --dry-run        Report what would be downloaded, download nothing
  --concurrency <n> Parallel downloads (default 4)
  --retries <n>    Attempts per file (default 4)
  -h, --help       Show this help

Environment:
  FRED_API_KEY     Optional. If set, the JSON observations API is used;
                   otherwise the keyless fredgraph CSV endpoint is used.
`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch text with retries and per-attempt timeout. */
async function fetchText(url, retries) {
  let lastErr;
  for (let i = 0; i < Math.max(1, retries); i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
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
      await sleep(500 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, error: lastErr };
}

/**
 * Fetch a FRED series as a list of [date, value] pairs.
 * Prefers the keyless fredgraph CSV endpoint; falls back to the JSON
 * observations API when FRED_API_KEY is present.
 */
async function fetchSeries(seriesId, apiKey, retries) {
  if (apiKey) {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${encodeURIComponent(seriesId)}` +
      `&api_key=${encodeURIComponent(apiKey)}` +
      `&file_type=json`;
    const r = await fetchText(url, retries);
    if (!r.ok) return { ok: false, error: r.error };
    try {
      const json = JSON.parse(r.text);
      const obs = json.observations || [];
      return {
        ok: true,
        rows: obs
          .filter((o) => o.value && o.value !== ".")
          .map((o) => [o.date, o.value]),
      };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  // Keyless CSV endpoint: first row is a header, subsequent rows are
  // "observation_date,<series>" pairs.
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const r = await fetchText(url, retries);
  if (!r.ok) return { ok: false, error: r.error };
  const lines = r.text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length <= 1) return { ok: true, rows: [] };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const date = parts[0];
    const val = parts[1];
    if (val === undefined || val === "" || val === ".") continue;
    rows.push([date, val]);
  }
  return { ok: true, rows };
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
  const apiKey = process.env.FRED_API_KEY || "";
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  const tasks = [];
  for (const entry of CATALOGUE) {
    for (const s of entry.series) {
      tasks.push({ ...entry, seriesId: s.id, label: s.label, area: s.area || REGION });
    }
  }

  // Keep a per-metric accumulator: metric -> array of [indicator, date, value]
  const accum = new Map();
  for (const e of CATALOGUE) accum.set(e.metric, []);

  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      if (args.dryRun) {
        results.push({ metric: task.metric, series: task.seriesId, status: "dry-run" });
        continue;
      }
      const r = await fetchSeries(task.seriesId, apiKey, args.retries);
      if (!r.ok) {
        results.push({ metric: task.metric, series: task.seriesId, status: "failed", reason: r.error?.message });
        continue;
      }
      const bucket = accum.get(task.metric);
      for (const [date, value] of r.rows) {
        // area (ISO3) به ازای هر سری — لازم برای سری‌های چندکشوری FRED
        bucket.push([task.label, date, value, task.area]);
      }
      results.push({ metric: task.metric, series: task.seriesId, status: "ok", count: r.rows.length });
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(args.concurrency, tasks.length)) }, () => worker())
  );

  // Write per-metric CSV files.
  const header = "REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY";
  const written = [];
  for (const entry of CATALOGUE) {
    const bucket = accum.get(entry.metric) || [];
    const file = `${entry.metric}.csv`;
    const dest = path.join(TARGET_DIR, file);
    if (args.dryRun) {
      written.push({ file, status: "dry-run" });
      continue;
    }
    if (!args.force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      written.push({ file, status: "skipped", size: fs.statSync(dest).size, rows: bucket.length });
      continue;
    }
    const lines = [header];
    for (const [indicator, date, value, area] of bucket) {
      const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
      lines.push([area || REGION, indicator, date, value, entry.unit, entry.frequency].map(esc).join(","));
    }
    // ⚠️ پس از تجمیع ماهانه، برچسب فرکانس هم باید Monthly شود (زیر پایین‌تر)
    // De-duplicate preserving order (a series may repeat across retries).
    const seen = new Set();
    let body = lines.slice(1).filter((l) => {
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    });
    /**
     * تجمیع به ماهانه (`aggregate: "monthly"`): سری‌های **روزانه** بازار
     * (VIX/DXY/S&P/اسپرد) باید ماهانه شوند، چون فیلتر core.db فقط M/Q/A را
     * کپی می‌کند (frequencies.json) وگرنه هیچ ردیفی وارد چارت‌ها نمی‌شود.
     * قاعده: **آخرین مشاهدهٔ هر ماه** (ماه‌پایان) — بدون میانگین‌گیری، تا
     * مقدار همان روز باشد (نوسان/اسپرد میانگین‌گیری‌شده معنایش عوض می‌شود).
     */
    let freqOut = entry.frequency;
    if (entry.aggregate === "monthly") {
      const byMonth = new Map(); // "area|indicator|YYYY-MM" -> line
      for (const l of body) {
        const c = l.split(",").map((x) => x.replace(/^"|"$/g, ""));
        const key = `${c[0]}|${c[1]}|${String(c[2]).slice(0, 7)}`;
        byMonth.set(key, l); // خطوط به‌ترتیب تاریخ‌اند ⇒ آخری برنده می‌شود
      }
      body = [...byMonth.values()];
      freqOut = "Monthly";
      // برچسب فرکانس در همهٔ ردیف‌ها به Monthly تغییر می‌کند (ستون ۶)
      body = body.map((l) => {
        const c = l.split(",");
        c[c.length - 1] = `"${freqOut}"`;
        return c.join(",");
      });
    }
    const content = header + "\n" + body.join("\n") + "\n";
    fs.writeFileSync(dest, content);
    written.push({ file, status: "downloaded", size: Buffer.byteLength(content), rows: body.length });
  }

  // Report.
  console.log("===  FRED Report ===");
  console.log(`Folder: ${TARGET_DIR}`);
  for (const w of written) {
    const extra = w.size ? ` (${humanSize(w.size)})` : w.rows ? ` (${w.rows} rows)` : "";
    console.log(`  ${w.file}  ${w.status}${extra}`);
  }
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length) {
    console.log("\nFailed series:");
    for (const f of failed) console.log(`  - ${f.metric}/${f.series}: ${f.reason}`);
  }
  console.log(`\nTotal size: ${humanSize(dirSize(TARGET_DIR))}`);
})().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
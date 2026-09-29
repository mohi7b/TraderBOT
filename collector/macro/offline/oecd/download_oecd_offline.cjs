/**
 * ============================================================
 * Project: Macro Engine Collector — Offline OECD Downloader
 * File: collector/macro/offline/oecd/download_oecd_offline.cjs
 * Description:
 *   Downloads OECD data into collector/macro/offline/oecd/
 *
 *   NOTE on the OECD endpoint behaviour (verified 2026-08):
 *     The legacy stats.oecd.org/SDMX-JSON endpoint returns
 *     SDMX-JSON 2.0 payloads and IGNORES the request key
 *     (KEI/USA returns the FULL KEI flow for all 56 areas).
 *     We therefore download each flow ONCE, cache the raw
 *     dump under raw/, and extract the metric series locally.
 *
 *   Flows used:
 *     - KEI     : Main Economic Indicators (CPI, PPI, unemployment,
 *                 GDP growth, trade, CLI, ULC, industrial production)
 *     - QNA     : Quarterly National Accounts (GDP volume index)
 *     - MEI_CLI : Composite Leading Indicator (CLI, broader set)
 *
 *   Output: tidy CSV per metric with the loader-compatible header
 *       REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY
 *
 * Usage:
 *   node collector/macro/offline/oecd/download_oecd_offline.cjs
 *   node collector/macro/offline/oecd/download_oecd_offline.cjs --force
 *   node collector/macro/offline/oecd/download_oecd_offline.cjs --dry-run
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const TARGET = __dirname;          // offline/oecd
const RAW_DIR = path.join(TARGET, "raw"); // cached full-flow JSON dumps
const BASE = "https://stats.oecd.org/SDMX-JSON/data";

const DEFAULTS = { force: false, dryRun: false, retries: 3, sleepMs: 400, pricesOnly: false, skipPrices: false };

const FLOWS = ["KEI", "QNA", "MEI_CLI"];

// ------------------------------------------------------------
// Metric definitions (extracted from the cached flow dumps).
//   match: predicate on decoded series dims (dim-id → value id)
//   FREQUENCY is derived from the TIME_PERIOD id pattern.
// ------------------------------------------------------------
const METRICS = [
  {
    flow: "KEI", output: "cpi.csv", indicator: "CPI_IDX", unit: "index",
    match: (s) => s.MEASURE === "CP" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "_Z",
  },
  {
    flow: "KEI", output: "cpi_yoy.csv", indicator: "CPI_YOY", unit: "%",
    match: (s) => s.MEASURE === "CP" && s.UNIT_MEASURE === "GR" && s.TRANSFORMATION === "GY",
  },
  {
    flow: "KEI", output: "ppi.csv", indicator: "PPI", unit: "index",
    match: (s) => s.MEASURE === "PP" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "_Z",
  },
  {
    flow: "KEI", output: "unemployment.csv", indicator: "UNEMP_RATE", unit: "%",
    match: (s) => s.MEASURE === "UNEMP" && s.UNIT_MEASURE === "PT_LF",
  },
  {
    flow: "KEI", output: "gdp_yoy.csv", indicator: "GDP_YOY", unit: "%",
    match: (s) => s.MEASURE === "B1GQ_Q" && s.UNIT_MEASURE === "GR" && s.TRANSFORMATION === "GY",
  },
  {
    flow: "KEI", output: "trade.csv", unit: "USD",
    indicator: (s) => (s.MEASURE === "EX" ? "EXPORT" : "IMPORT"),
    match: (s) => (s.MEASURE === "EX" || s.MEASURE === "IM") && s.UNIT_MEASURE === "USD" && s.TRANSFORMATION === "_Z",
  },
  {
    flow: "KEI", output: "cli.csv", indicator: "CLI", unit: "index",
    match: (s) => s.MEASURE === "LI" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "_Z",
  },
  {
    flow: "KEI", output: "unit_labour_cost.csv", indicator: "ULC", unit: "index",
    match: (s) => s.MEASURE === "ULC" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "_Z",
  },
  {
    flow: "KEI", output: "industrial_production.csv", indicator: "INDPRO", unit: "index",
    match: (s) => s.MEASURE === "PRVM" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "_Z",
  },
  {
    flow: "QNA", output: "gdp_qna_yoy.csv", indicator: "GDP_VPV_YOY", unit: "%",
    match: (s) => s.TRANSACTION === "B1GQ" && s.UNIT_MEASURE === "PC" && s.PRICE_BASE === "L" && s.TRANSFORMATION === "GY",
  },
  {
    flow: "QNA", output: "gdp_qna_qoq.csv", indicator: "GDP_VPV_QOQ", unit: "%",
    match: (s) => s.TRANSACTION === "B1GQ" && s.UNIT_MEASURE === "PC" && s.PRICE_BASE === "L" && s.TRANSFORMATION === "G1",
  },
  {
    flow: "MEI_CLI", output: "cli_mei.csv", indicator: "CLI", unit: "index",
    match: (s) => s.MEASURE === "LI" && s.UNIT_MEASURE === "IX" && s.TRANSFORMATION === "IX",
  },
];

const HEADER = "REF_AREA,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT,FREQUENCY";

// ----------------------------- Utils -----------------------------
function parseArgs(argv) {
  const f = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--force": f.force = true; break;
      case "--dry-run": f.dryRun = true; break;
      case "--prices-only": f.pricesOnly = true; break;
      case "--skip-prices": f.skipPrices = true; break;
      case "--retries": f.retries = Number(argv[++i]) || DEFAULTS.retries; break;
      case "--sleep": f.sleepMs = Number(argv[++i]) || DEFAULTS.sleepMs; break;
      case "-h": case "--help":
        console.log(`OECD offline downloader
  Flows: KEI (main indicators), QNA (national accounts), MEI_CLI (leading index)
  Prices: DSD_PRICES@DF_PRICES_ALL → COICOP sub-indices + core CPI + weights
  Writes tidy CSVs into collector/macro/offline/oecd/ plus raw cached dumps in /raw.

Options:
  --force            Re-download cached raw dumps
  --dry-run          Print plan only
  --prices-only      Only run the prices (sub-index/core/weights) step
  --skip-prices      Skip the prices step
  --retries <n>      Retry attempts per download
  --sleep <ms>       Delay between OECD prices requests (default ${DEFAULTS.sleepMs})
`); process.exit(0);
      default: break;
    }
  }
  return f;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url, outFile, retries, force) {
  if (!force && fs.existsSync(outFile) && fs.statSync(outFile).size > 0) return "cached";
  const tmp = outFile + ".part";
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 240000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, outFile);
      return `downloaded (${humanSize(buf.length)})`;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1500 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
}

function humanSize(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

function dirSize(d) {
  if (!fs.existsSync(d)) return 0;
  let t = 0;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    t += fs.statSync(p).isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return t;
}

/**
 * Decode an OECD SDMX-JSON 2.0 payload.
 * The legacy endpoint returns `data.structures[]` (or `data.structure`)
 * plus `data.dataSets[0].series`. Series keys are positional indexes
 * into each series-dimension values array; observation keys are
 * positional indexes into the TIME_PERIOD values array.
 *
 * Returns:
 *   { seriesDims: [{id,values}], obsDim: {id,values}|null,
 *     series: [{ keys, observations:[{time,value}] }] }
 */
function decodeJson2(j) {
  const data = j.data || {};
  const struct = (data.structures && data.structures.length) ? data.structures[0] : (data.structure || {});
  const dimensions = struct.dimensions || {};
  const seriesDims = dimensions.series || [];
  const obsDims = dimensions.observation || [];
  const obsDim = obsDims[0] || null;

  const cat = (dim) => ({
    id: dim.id,
    values: (dim.values || []).map((v) => (typeof v === "string" ? { id: v, name: v } : v)),
  });
  const sd = seriesDims.map(cat);
  const od = obsDim ? cat(obsDim) : null;

  const out = [];
  for (const ds of data.dataSets || []) {
    for (const key of Object.keys(ds.series || {})) {
      const parts = key.split(":").map(Number);
      const keys = {};
      sd.forEach((d, i) => { keys[d.id] = d.values[parts[i]] ? d.values[parts[i]].id : null; });
      const obsMap = ds.series[key].observations || {};
      const idxs = Object.keys(obsMap).sort((a, b) => Number(a) - Number(b));
      const observations = [];
      for (const idx of idxs) {
        const v = obsMap[idx];
        const raw = Array.isArray(v) ? v[0] : v;
        observations.push({
          time: od && od.values[Number(idx)] ? od.values[Number(idx)].id : String(idx),
          value: (typeof raw === "number" || typeof raw === "string") && raw !== "" ? +raw : null,
        });
      }
      out.push({ keys, observations });
    }
  }
  return { seriesDims: sd, obsDim: od, series: out };
}

/** Infer frequency from a TIME_PERIOD id like "2024-07" / "2024-Q3" / "2024". */
function freqFromTime(t) {
  if (/^\d{4}-\d{2}$/.test(t)) return "Monthly";
  if (/^\d{4}-Q[1-4]$/i.test(t)) return "Quarterly";
  if (/^\d{4}$/.test(t)) return "Annual";
  return null;
}

// ------------------------------------------------------------
// OECD Prices (Data Explorer) — sub-indices + core + weights
// ------------------------------------------------------------
// چرا این بخش جدا از KEI است؟
//   فلو قدیمی KEI هیچ بُعد زیرشاخصی ندارد (dims: REF_AREA, FREQ, MEASURE,
//   UNIT_MEASURE, ACTIVITY, ADJUSTMENT, TRANSFORMATION) ⇒ زیرشاخص COICOP
//   فقط در فلو جدید «DSD_PRICES@DF_PRICES_ALL» وجود دارد.
//
// ✅ ساختار با API رسمی تأیید شده (2026-09-20):
//   GET /v1/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/<KEY>
//   KEY = REF_AREA.FREQ.METHODOLOGY.MEASURE.UNIT_MEASURE.EXPENDITURE.ADJUSTMENT.TRANSFORMATION
//   مثال کارکرده:  DEU.M.N.CPI.IX._TXCP01_NRG%2BCP01%2BCP04.N._Z
//                  → 3 کد زیرشاخص در یک درخواست (جداساز OR باید %2B باشد؛
//                    "+" در URL به فاصله تفسیر می‌شود و 404 می‌دهد)
//
// ✅ کدهای تأییدشده: _T (همهٔ اقلام) · _TXCP01_NRG (⭐ Core: all items
//   non-food non-energy) · _TXNRG_01_02 · CP01..CP12 · CP045_0722 (انرژی)
//   · SERV (خدمات) · GD (کالاها)
//   همهٔ ۱۷ کشور هدف در constraint موجودند (REF_AREA شامل USA/CHN/JPN/…/ZAF).
const PRICES_BASE = "https://sdmx.oecd.org/public/rest/v1/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0";
const PRICES_ACCEPT = "application/vnd.sdmx.data+csv;version=1.0;labels=both";

// گروه‌های COICOP مورد نیاز فرانت‌اند (خوراک، انرژی، مسکن، خدمات، هسته)
const PRICES_EXPENDITURE = [
  "_T",             // همهٔ اقلام
  "_TXCP01_NRG",    // ⭐ Core: all items non-food non-energy
  "_TXNRG_01_02",   // بدون انرژی و خوراک فرآوری‌نشده
  "CP01", "CP02", "CP03", "CP04", "CP05", "CP06",
  "CP07", "CP08", "CP09", "CP10", "CP11", "CP12",
  "CP045_0722",     // برق/گاز + سوخت حمل‌ونقل  (پروکسی انرژی)
  "SERV",           // خدمات
  "GD",             // کالاها
];

// کشورهای هدف پروژه (OECD) + فرکانس مناسب هرکدام.
// ⚠️ استرالیا (و نیوزیلند) در این فلو فقط فصلی منتشر می‌شوند.
const PRICES_COUNTRIES = [
  { iso3: "USA", freq: "M" }, { iso3: "CHN", freq: "M" }, { iso3: "JPN", freq: "M" },
  { iso3: "DEU", freq: "M" }, { iso3: "GBR", freq: "M" }, { iso3: "FRA", freq: "M" },
  { iso3: "ITA", freq: "M" }, { iso3: "CAN", freq: "M" }, { iso3: "AUS", freq: "Q" },
  { iso3: "KOR", freq: "M" }, { iso3: "IND", freq: "M" }, { iso3: "TUR", freq: "M" },
  { iso3: "MEX", freq: "M" }, { iso3: "BRA", freq: "M" }, { iso3: "RUS", freq: "M" },
  { iso3: "SAU", freq: "M" }, { iso3: "ZAF", freq: "M" },
];

// خروجی: هر گروه یک INDICATOR مستقل (loader فقط ستون INDICATOR را می‌خواند)
//   شاخص   → CPI_IDX_CP01   (سری OECD.USA.CPI_IDX_CP01.M)
//   وزن‌ها → CPI_W_CP01     (MEASURE=IT_W)
const PRICES_OUT_INDEX = "cpi_sub.csv";
const PRICES_OUT_WEIGHTS = "cpi_weights.csv";
const PRICES_FREQ_LABEL = { M: "Monthly", Q: "Quarterly", A: "Annual" };
// نام تمیز برای کدهایی که با _ شروع می‌شوند (تا INDICATOR دو-زیرخطی نشود):
//   _T           → CPI_IDX_TOTAL
//   _TXCP01_NRG  → CPI_IDX_TXCP01_NRG   (Core)
//   _TXNRG_01_02 → CPI_IDX_TXNRG_01_02
const PRICES_CODE_ALIAS = { "_T": "TOTAL", "_TXCP01_NRG": "TXCP01_NRG", "_TXNRG_01_02": "TXNRG_01_02" };
const pricesSuffix = (code) => PRICES_CODE_ALIAS[code] || String(code).replace(/^_+/, "");

/** یک GET متنی با ماژول https (نه fetch!) */
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

/** یک درخواست CSV از فلوی قیمت‌های OECD (با retry روی 429/5xx). */
async function fetchPricesCsv(key, query, retries) {
  let lastErr = null;
  for (let i = 0; i < Math.max(1, retries); i++) {
    try {
      // ⚠️ چرا https و نه fetch؟  سرور OECD (NSI Web Service) وقتی درخواست از
      //    undici/fetch نود بیاید و هدر Accept داشته باشد پاسخ **500
      //    Internal server error** می‌دهد (تست‌شده 2026-09-20)، در حالی که
      //    همین درخواست با curl یا ماژول https نود 200/CSV برمی‌گرداند.
      const res = await httpsGetText(`${PRICES_BASE}/${key}${query}`, { Accept: PRICES_ACCEPT });
      if (res.status === 429 || res.status >= 500) throw new Error("HTTP " + res.status);
      if (res.status !== 200) {
        // NoRecordsFound = این ترکیب برای این کشور وجود ندارد (خطا نیست)
        return { ok: true, empty: true, note: res.text.trim().slice(0, 40) };
      }
      return { ok: true, empty: false, text: res.text };
    } catch (e) {
      lastErr = e;
      await sleep(8000 * (i + 1));
    }
  }
  return { ok: false, error: lastErr };
}

/** پارس CSV برچسب‌دار SDMX → [{area, code, time, value}] */
function parsePricesCsv(text) {
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
    // سلول برچسب‌دار: "CP01: Food and non-alcoholic beverages" → CP01
    const code = String(c[iExp]).split(":")[0].trim();
    rows.push({ area: String(c[iArea]).split(":")[0].trim(), code, time: c[iTime].trim(), value });
  }
  return rows;
}

// گروه‌های درخواست: بُعد REF_AREA هم OR-پذیر است ⇒ با ۴ درخواست
// (۲ فرکانس × «شاخص» + «وزن») همهٔ ۱۷ کشور را می‌گیریم.
// ⚠️ استرالیا در این فلو فقط فصلی منتشر می‌شود ⇒ گروه جدا.
const PRICES_GROUPS = [
  { freq: "M", countries: ["USA", "CHN", "JPN", "DEU", "GBR", "FRA", "ITA", "CAN",
                           "KOR", "IND", "TUR", "MEX", "BRA", "RUS", "SAU", "ZAF"] },
  { freq: "Q", countries: ["AUS"] },
];

/** تقسیم یک آرایه به بسته‌های n عضوی */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * دانلود زیرشاخص‌های COICOP + Core (+ وزن‌ها در صورت وجود) از OECD.
 *
 * چرا بسته‌بندی؟  یک درخواست «۱۶ کشور × ۱۸ کد از ۱۹۹۰» برای سرور OECD
 * سنگین است و پاسخ آن دقیقه‌ها طول می‌کشد (یا timeout می‌شود). پس:
 *   ۲ گروه فرکانسی × ۳ بستهٔ ۶-کدی برای شاخص + ۲ بسته برای وزن  ≈ ۸ درخواست
 *   index   : <area1%2B…>.<FREQ>.N.CPI.IX.<code1%2B…>.N._Z
 *   weights : …IT_W.PC.<codes>.N._Z   (اگر منتشر نشده → empty)
 */
async function downloadOecdPrices(args) {
  const report = [];
  const indexRows = [];   // [REF_AREA, INDICATOR, TIME_PERIOD, OBS_VALUE, UNIT, FREQUENCY]
  const weightRows = [];
  const seenCodes = new Set();
  let requests = 0, empties = 0, failures = 0;
  const CODE_CHUNKS = chunk(PRICES_EXPENDITURE, 6);

  for (const group of PRICES_GROUPS) {
    const areas = group.countries.join("%2B");
    const base = `${areas}.${group.freq}.N`;
    const freqLabel = PRICES_FREQ_LABEL[group.freq] || "";

    for (const codes of CODE_CHUNKS) {
      const expList = codes.join("%2B"); // OR-encoded (باید %2B باشد، نه +)
      const rIx = await fetchPricesCsv(`${base}.CPI.IX.${expList}.N._Z`, "?startPeriod=1990-01", args.retries);
      requests++;
      if (!rIx.ok) {
        failures++;
        report.push({ file: PRICES_OUT_INDEX, status: `failed [${group.freq}] ${rIx.error?.message}` });
      } else if (rIx.empty) {
        empties++;
        report.push({ file: PRICES_OUT_INDEX, status: `empty [${group.freq}] ${codes[0]}…: ${rIx.note}` });
      } else {
        const rows = parsePricesCsv(rIx.text);
        for (const r of rows) {
          seenCodes.add(r.code);
          indexRows.push([r.area, `CPI_IDX_${pricesSuffix(r.code)}`, r.time, r.value, "index", freqLabel]);
        }
        console.log(`  ✓ indices[${group.freq}] ${codes[0]}…${codes[codes.length - 1]}: +${rows.length} rows (total ${indexRows.length})`);
      }
      await sleep(args.sleepMs);
    }

    // ---- وزن‌های سبد (MEASURE=IT_W) ----
    // ⚠️ نتیجهٔ جست‌وجوی کامل (2026-09-20): OECD در این فلو برای کشورهای ما
    //    **وزن سبد منتشر نمی‌کند**. کلیدهای زیر همه 404/NoRecordsFound دادند:
    //      USA.M.N.IT_W.PC._T.N._Z
    //      USA.M.N.IT_W.10P3EXP_CNSMR._T.N._Z
    //      FRA.M.HICP.IT_W.PC._T.N._Z
    //    (MEASURE و UNIT_MEASURE در constraint وجود دارند، ولی برای این
    //     کشورها/دوره‌ها داده‌ای ندارند.)
    //    ⇒ وزن سبد فقط از Eurostat می‌آید (prc_hicp_iw، EU-4 کشور).
    //    همچنین TRANSFORMATION=GY (نرخ سالانه) هم NoRecordsFound می‌دهد؛
    //    نرخ YoY از خود شاخص محاسبه می‌شود (خط لولهٔ فرانت‌اند).
    for (const codes of CODE_CHUNKS) {
      const expList = codes.join("%2B");
      let rW = await fetchPricesCsv(`${base}.IT_W.PC.${expList}.N._Z`, "?startPeriod=1990", args.retries);
      requests++;
      if (rW.ok && rW.empty) {
        await sleep(args.sleepMs);
        // واحد جایگزین: 10P3EXP_CNSMR (وزن بر حسب هزارم کل مخارج مصرف‌کننده)
        rW = await fetchPricesCsv(`${base}.IT_W.10P3EXP_CNSMR.${expList}.N._Z`, "?startPeriod=1990", args.retries);
        requests++;
      }
      if (!rW.ok) {
        failures++;
        report.push({ file: PRICES_OUT_WEIGHTS, status: `failed [${group.freq}] ${rW.error?.message}` });
      } else if (rW.empty) {
        empties++;
        report.push({ file: PRICES_OUT_WEIGHTS, status: `empty [${group.freq}] ${codes[0]}… (OECD weights n/a)` });
      } else {
        const rows = parsePricesCsv(rW.text);
        for (const r of rows) {
          weightRows.push([r.area, `CPI_W_${pricesSuffix(r.code)}`, r.time, r.value, "per_cent", "Annual"]);
        }
        console.log(`  ✓ weights[${group.freq}] ${codes[0]}…: +${rows.length} rows (total ${weightRows.length})`);
      }
      await sleep(args.sleepMs);
    }
  }

  const writeTidy = (file, rows) => {
    if (!rows.length) { report.push({ file, status: "0 rows (nothing written)" }); return; }
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const body = rows.map((r) => r.map(esc).join(","));
    fs.writeFileSync(path.join(TARGET, file), HEADER + "\n" + body.join("\n") + "\n");
    report.push({ file, status: `${rows.length} rows (${seenCodes.size || "—"} codes)` });
  };
  writeTidy(PRICES_OUT_INDEX, indexRows);
  writeTidy(PRICES_OUT_WEIGHTS, weightRows);

  console.log(`\n=== OECD Prices ===`);
  console.log(`  requests=${requests}  empty=${empties}  failed=${failures}  COICOP codes seen=${seenCodes.size}`);
  console.log(`  codes: ${[...seenCodes].sort().join(", ") || "(none)"}`);
  return report;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(TARGET, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  if (args.dryRun) {
    for (const flow of FLOWS) {
      console.log(`[dry-run] would GET ${BASE}/${flow}/USA → raw/${flow}.json`);
    }
    for (const m of METRICS) console.log(`[dry-run] would build ${m.output}`);
    for (const c of PRICES_COUNTRIES) {
      console.log(`[dry-run] would GET prices ${c.iso3}.${c.freq} (${PRICES_EXPENDITURE.length} COICOP codes)`);
    }
    return;
  }

  const report = [];
  // 0) Prices (sub-indices + core + weights) — فلوی جدید Data Explorer
  if (!args.skipPrices) {
    const priceReport = await downloadOecdPrices(args);
    report.push(...priceReport);
    if (args.pricesOnly) {
      console.log("\n=== OECD Prices Report ===");
      for (const r of priceReport) console.log(`  ${r.status.startsWith("failed") ? "❌" : "✅"} ${r.file}  ${r.status}`);
      return;
    }
  }
  if (args.pricesOnly) return; // --prices-only بدون prices اجرا نمی‌شود

  // 1) Download one dump per flow (the endpoint returns the full flow).
  for (const flow of FLOWS) {
    const outFile = path.join(RAW_DIR, `${flow}.json`);
    try {
      const status = await download(`${BASE}/${flow}/USA`, outFile, args.retries, args.force);
      report.push({ file: `raw/${flow}.json`, status });
    } catch (e) {
      report.push({ file: `raw/${flow}.json`, status: "failed: " + e.message });
    }
    await sleep(args.sleepMs);
  }

  // 2) Extract metrics from the cached dumps.
  let totalRows = 0;
  for (const m of METRICS) {
    const raw = path.join(RAW_DIR, `${m.flow}.json`);
    const lines = [HEADER];
    let rows = 0;
    if (fs.existsSync(raw) && fs.statSync(raw).size > 0) {
      let decoded;
      try {
        decoded = decodeJson2(JSON.parse(fs.readFileSync(raw, "utf8")));
      } catch (e) {
        report.push({ file: m.output, status: "parse error: " + e.message });
        continue;
      }
      for (const s of decoded.series) {
        if (!m.match(s.keys)) continue;
        const freq = s.observations.length ? freqFromTime(s.observations[0].time) : null;
        const indicator = typeof m.indicator === "function" ? m.indicator(s.keys) : m.indicator;
        for (const o of s.observations) {
          if (o.value === null || o.value === undefined || !o.time) continue;
          const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
          lines.push([s.keys.REF_AREA, indicator, o.time, o.value, m.unit, freq || ""].map(esc).join(","));
          rows++;
        }
      }
    }
    const dest = path.join(TARGET, m.output);
    fs.writeFileSync(dest, lines.join("\n") + "\n");
    report.push({ file: m.output, status: `${rows} rows` });
    totalRows += rows;
  }

  // 3) Report
  console.log("\n=== OECD Offline Report ===");
  for (const r of report) {
    console.log(`  ${r.status.startsWith("failed") || r.status.startsWith("parse") ? "❌" : "✅"} ${r.file}  ${r.status}`);
  }
  console.log(`\nTotal rows written: ${totalRows}`);
  console.log(`Folder size: ${humanSize(dirSize(TARGET))}`);
})().catch((e) => { console.error("Fatal:", e); process.exit(1); });



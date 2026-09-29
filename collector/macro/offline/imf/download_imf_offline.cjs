/**
 * ============================================================
 * Project: Macro Engine Collector — Offline IMF Downloader
 * File: collector/macro/offline/imf/download_imf_offline.cjs
 * Description:
 *   Downloads IMF bulk datasets into:
 *       collector/macro/offline/imf/
 *
 *   Datasets:
 *     - IFS  (International Financial Statistics) : SDMX (JSON) via dataservices.imf.org
 *     - WEO  (World Economic Outlook)             : CSV via IMF Data Mapper API
 *     - GFS  (Government Finance Statistics)      : SDMX (JSON) via dataservices.imf.org
 *
 *   Behaviour:
 *     - Creates the target dir if missing.
 *     - For SDMX-style datasets, attempts to discover the live dataflow ID via
 *       the Dataflow listing endpoint (fallback to a configured default).
 *     - Downloads each file with its exact target name.
 *     - Skips existing non-empty files (no re-download).
 *     - Prints a per-file report and the final folder size.
 *
 *   NOTE: dataservices.imf.org document "full" IFS bulk via SDMX API
 *   (rate-limited, ~3000 series/request). For a true 100% snapshot the IMF
 *   Data Portal / enterprise bulk export is used upstream; this script pulls
 *   the full dataset dimension set via the REST service.
 *
 * Usage:
 *   node collector/macro/offline/imf/download_imf_offline.cjs
 *   node collector/macro/offline/imf/download_imf_offline.cjs --dry-run
 *   node collector/macro/offline/imf/download_imf_offline.cjs --force
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const TARGET_DIR = __dirname; // collector/macro/offline/imf
const SDMX_BASE = "https://dataservices.imf.org/REST/SDMX_JSON.svc";

// Configured dataset list. type = 'sdmx' (dataservices) or 'csv' (datamapper).
const DATASETS = [
  {
    name: "IFS",
    file: "ifs_sdmx.json",
    type: "sdmx",
    dataflowId: "IFS",            // discovered at runtime, fallback here
    desc: "International Financial Statistics",
  },
  {
    name: "GFS",
    file: "gfs_sdmx.json",
    type: "sdmx",
    dataflowId: "GFS",
    desc: "Government Finance Statistics",
  },
  {
    name: "WEO",
    file: "weo.csv",
    type: "csv",
    url: null,
    desc: "World Economic Outlook",
  },
];

// IMF Data Mapper API exposes a broad macro indicator set drawn from the IFS /
// GFS / WEO families. These are used to produce CSV bulk files whenever the
// true SDMX host (dataservices.imf.org) is unreachable from the current host.
const DATAMAPPER_BASE = "https://www.imf.org/external/datamapper/api/v1/";

const WEO_INDICATORS = [
  "NGDP_RPCH", "NGDP_RPATPCH", "PCPIPCH", "LUR", "GGXWDG_NGDP", "GGXCNL_NGDP",
  "BCA_NGDPD", "NGDPD", "NGDPDPC", "PPPEX",
];

// IFS family indicators (monetary, prices, external sector, exchange rates).
const IFS_INDICATORS = [
  "NGDPD", "NGDPDPC", "NGDP_RPCH", "NGDP_R_PCH", "PCPIPCH", "PCPIEPCH",
  // P1 (2026-09-20): دو کد تورمی تأییدشدهٔ دیگر از کاتالوگ DataMapper
  //   PCPI_PCH  = Consumer Prices, Average (Annual % Change)
  //   PCPIE_PCH = Consumer Prices, End of Period (Annual % Change)
  // ℹ️ این‌ها **معادل نسل جدید** همان PCPIPCH/PCPIEPCH هستند؛ عمداً به
  //    canonical `CPI` در build_core_db اضافه نشدند تا سری تکراری در چارت
  //    ساخته نشود (در macro.db ذخیره می‌شوند: ۶۷ کشور × ۲ کد).
  "PCPI_PCH", "PCPIE_PCH",
  "PPPEX", "PPPGDP", "PPPPC", "EREER", "ENEER", "FMB_GDP", "FMB_PCH",
  "FDSAOP_GDP", "FDSAOP_PCH", "BCA_NGDPD", "BT_GDP", "BX_GDP", "BM_GDP",
  "Reserves_M", "Reserves_M2",
];

// ------------------------------------------------------------------
// P1 — زیرشاخص‌های COICOP در IMF (Food / Energy / Non-food-non-energy)
// ------------------------------------------------------------------
// نتیجهٔ بررسی رسمی (2026-09-20):
//   • DataMapper فقط **۱۳۲ اندیکاتور** دارد و از میان آن‌ها تنها ۴ کد قیمتی:
//       PCPIPCH · PCPIEPCH · PCPI_PCH · PCPIE_PCH   (همه تورم «کل»)
//     ⇒ هیچ کد COICOP (خوراک/انرژی/هسته) در این API وجود ندارد.
//   • مسیر جایگزین SDMX (dataservices.imf.org) از این هاست **در دسترس نیست**
//     (اتصال برقرار نمی‌شود: HTTP 000) — همان دلیلی که این دانلودر از
//     DataMapper استفاده می‌کند.
// ⇒ کدهای زیر «نامزد» هستند: در هر اجرا با کاتالوگ رسمی مقایسه می‌شوند و
//   **هر کدی که واقعاً موجود باشد** خودکار به لیست دانلود اضافه می‌شود.
//   (اگر IMF روزی این‌ها را منتشر کند، بدون تغییر کد برداشته می‌شوند.)
const IMF_SUBINDEX_CANDIDATES = [
  "PCPIFOOD", "PCPIFOOD_PCH", "PCPIFOOD_IX",
  "PCPINRG", "PCPINRG_PCH", "PCPIENERGY", "PCPIENERGY_PCH",
  "PCPICORE", "PCPICORE_PCH", "PCPILFE", "PCPILFE_PCH",
  "PCPI_X_NRG_FOOD", "PCPI_XNRG", "PCPI_XFOOD", "PCPI_XNRG_FOOD",
];

/**
 * کشف زندهٔ اندیکاتورهای موجود در IMF DataMapper.
 * @returns {{ok:boolean, size?:number, priceCodes?:string[], subindices?:string[], reason?:string}}
 */
async function discoverImfIndicators(retries) {
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
    try {
      const res = await fetch(DATAMAPPER_BASE + "indicators", {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const map = json?.indicators || json || {};
      const codes = Object.keys(map);
      const priceLike = codes.filter((c) => /PCPI|CPI|INFLAT/i.test(c)).sort();
      // کدهای زیرشاخص = نامزدهایی که واقعاً در کاتالوگ هستند
      const subindices = IMF_SUBINDEX_CANDIDATES.filter((c) => codes.includes(c));
      return { ok: true, size: codes.length, priceCodes: priceLike, subindices };
    } catch (e) {
      if (attempt === Math.max(1, retries)) return { ok: false, reason: e.message };
      await sleep(400 * attempt);
    }
  }
  return { ok: false, reason: "unknown" };
}

// GFS indicators (fiscal balances, revenue, expenditure, debt).
const GFS_INDICATORS = [
  "GGR_G01_GDP_PT", "GGRXG_GDP", "GGX_GDP", "GGXCNL_GDP", "GGXWDG_GDP",
  "GGXWDG_NGDP", "GGXONLB_G01_GDP_PT", "GGXCNL_NGDP", "GGXCNLXG_GDP",
  "GGXWDN_G01_GDP_PT", "GGXGB_GDP", "GG_DEBT_GDP",
];

const DEFAULTS = {
  force: false,
  dryRun: false,
  concurrency: 3,
  retries: 4,
  listFlows: false,
};

// ----------------------------- Utils -----------------------------
function parseArgs(argv) {
  const flags = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--force":     flags.force = true; break;
      case "--dry-run":   flags.dryRun = true; break;
      case "--list-flows": flags.listFlows = true; break;
      case "--concurrency": flags.concurrency = Number(argv[++i]) || DEFAULTS.concurrency; break;
      case "--retries":   flags.retries = Number(argv[++i]) || DEFAULTS.retries; break;
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
IMF offline downloader
  Downloads IFS + WEO + GFS bulk into:
      collector/macro/offline/imf/

Options:
  --force         Re-download even if the file already exists
  --dry-run       List what would be downloaded, download nothing
  --list-flows    Print available SDMX dataflow IDs from dataservices.imf.org
  --concurrency <n> Parallel downloads (default 3)
  --retries <n>   Attempts per file (default 4)
  -h, --help      Show this help
`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Human-readable size. */
function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Total size in bytes of a directory (recursive). */
function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

/** Discover the SDMX dataflow (KeyFamily) IDs served by dataservices.imf.org. */
async function listDataflows(retries) {
  const url = `${SDMX_BASE}/Dataflow`;
  let lastErr;
  for (let i = 0; i < Math.max(1, retries); i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const flows = json?.Structure?.Dataflows?.Dataflow || [];
      return flows
        .map((f) => ({ id: f["@id"], name: f.Name?.["#text"] || f.Name || "" }))
        .filter((f) => f.id);
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr || new Error("failed to list dataflows");
}

/**
 * Build the CompactData URL that requests the FULL dataset.
 * Leave dimension slots empty except FREQ=all to pull max series.
 * Many datasets exceed the API series cap; the query returns the first batch.
 */
function buildSdmxUrl(dataflowId) {
  return `${SDMX_BASE}/CompactData/${dataflowId}/`;
}

/** Stream download a single file; skips existing non-empty unless force. */
async function download(url, destFile, { force, retries }) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });

  if (!force && fs.existsSync(destFile)) {
    const st = fs.statSync(destFile);
    if (st.size > 0) return { status: "skipped", size: st.size };
  }

  const attempts = Math.max(1, retries);
  for (let n = 1; n <= attempts; n++) {
    const tmpFile = destFile + ".part";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
      });
      if (!res.ok || !res.body) {
        if (n === attempts) return { status: "failed", reason: "HTTP " + (res.status || "no-body") };
        await sleep(500 * n);
        continue;
      }
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmpFile);
        const nodeStream = Readable.fromWeb(res.body);
        nodeStream.pipe(out);
        nodeStream.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => out.close(resolve));
      });
      const st = fs.statSync(tmpFile);
      if (st.size > 0) {
        fs.renameSync(tmpFile, destFile);
        return { status: "downloaded", size: st.size };
      }
      fs.unlinkSync(tmpFile);
      if (n === attempts) return { status: "failed", reason: "empty file" };
    } catch (e) {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
      if (n === attempts) return { status: "failed", reason: e.message };
      await sleep(500 * n);
    }
  }
  return { status: "failed", reason: "unknown" };
}

/** Pull a set of indicators via the IMF Data Mapper API into one CSV. */
async function buildDataMapper(indicators, retries) {
  const lines = [];
  lines.push("ISO3,Country,IndicatorCode,Units,Scale,Year,Value");
  for (const ind of indicators) {
    for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
      try {
        const res = await fetch(DATAMAPPER_BASE + ind, {
          headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
          redirect: "follow",
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        const series = json?.values?.[ind] || {};
        for (const [iso, yrVals] of Object.entries(series)) {
          // Use the ISO3 code as the country key: it is comma/quote-free and
          // survives the naive comma-split CSV parser used by the offline loader.
          const country = iso;
          for (const [yr, val] of Object.entries(yrVals)) {
            if (val === "" || val === null || val === undefined) continue;
            lines.push(`${iso},${country},${ind},,,${yr},${val}`);
          }
        }
        break; // success
      } catch {
        if (attempt === Math.max(1, retries)) {
          // skip indicator after all retries
        } else {
          await sleep(300 * attempt);
        }
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** True only when the host can't physically reach dataservices.imf.org. */
async function isSdmxReachable(retries) {
  try {
    const res = await fetch(`${SDMX_BASE}/Dataflow`, {
      headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ----------------------------- Main -----------------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log(`📁 Target: ${TARGET_DIR}`);
  console.log(args.dryRun ? "\n[DRY-RUN] Nothing downloaded.\n" : "");

  // Optional: dump available dataflow IDs to help re-map a dataset.
  if (args.listFlows) {
    try {
      const flows = await listDataflows(args.retries);
      console.log(`\n=== Available SDMX dataflows (${flows.length}) ===`);
      flows.forEach((f) => console.log(`  ${f.id.padEnd(24)} ${f.name}`));
      return;
    } catch (e) {
      console.error("❌ Could not list dataflows:", e.message);
      process.exit(1);
    }
  }

  // Resolve the dataflow IDs dynamically so we always use the live id.
  let flowMap = {};
  try {
    const flows = await listDataflows(args.retries);
    flowMap = Object.fromEntries(flows.map((f) => [f.id.toUpperCase(), f.id]));
    console.log(`🔍 Discovered ${flows.length} SDMX dataflows.`);
  } catch (e) {
    console.log("⚠️ Dataflow discovery failed — using configured defaults.", e.message);
  }

  const results = [];
  let cursor = 0;
  const buildJobs = () => {
    const jobs = [];
    for (const ds of DATASETS) {
      if (ds.type === "sdmx") {
        const id = flowMap[ds.name] || ds.dataflowId;
        jobs.push({
          name: ds.name,
          file: ds.file,
          kind: "sdmx",
          url: buildSdmxUrl(id),
          flowId: id,
          label: `${ds.name} (${id})`,
        });
      } else if (ds.type === "csv" && ds.name === "WEO") {
        jobs.push({
          name: ds.name,
          file: ds.file,
          kind: "weo",
          url: null,
          label: `${ds.name} (${WEO_INDICATORS.length} indicators)`,
        });
      }
    }
    return jobs;
  };

  const jobs = buildJobs();
  if (args.dryRun) {
    console.log("\nPlanned downloads:");
    jobs.forEach((j) => console.log(`  · ${j.file}  (${j.label})`));
    return;
  }

  // Decide whether the true SDMX host is reachable. If not, IFS/GFS will be
  // produced as CSV bulk files from the Data Mapper API instead.
  const sdmxOk = await isSdmxReachable(args.retries);
  if (!sdmxOk) {
    console.log("⚠️ dataservices.imf.org unreachable — IFS/GFS will be built as CSV from the Data Mapper API.");
  }

  // ---- P1: کشف زندهٔ کدهای تورمی/زیرشاخص در DataMapper ----
  // نتیجه در هر اجرا گزارش می‌شود؛ هر کد نامزدِ موجود خودکار به دانلود اضافه
  // می‌شود (پیش‌فرض فعلی: هیچ کد COICOPی وجود ندارد ⇒ فقط گزارش می‌شود).
  const disc = await discoverImfIndicators(args.retries);
  if (disc.ok) {
    console.log(
      `ℹ️ DataMapper catalogue: ${disc.size} indicators · ` +
        `price codes: ${disc.priceCodes.join(", ")}`
    );
    if (disc.subindices.length) {
      console.log(`✅ COICOP sub-index codes found & queued: ${disc.subindices.join(", ")}`);
    } else {
      console.log(
        "⛔ No COICOP sub-index code in the IMF DataMapper catalogue " +
          `(checked ${IMF_SUBINDEX_CANDIDATES.length} candidates) — ` +
          "sub-indices for CHN/IND/BRA/RUS/SAU come from OECD COICOP instead."
      );
    }
  } else {
    console.log(`⚠️ DataMapper catalogue probe failed: ${disc.reason}`);
  }
  const ifsIndicators = [...new Set([...IFS_INDICATORS, ...(disc.subindices || [])])];

  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const destPath = path.join(TARGET_DIR, job.file);
      let res;

      if (job.kind === "weo") {
        // WEO CSV is always built from the Data Mapper API.
        if (!args.force && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
          const st = fs.statSync(destPath);
          res = { status: "skipped", size: st.size };
        } else {
          const csv = await buildDataMapper(WEO_INDICATORS, args.retries);
          fs.writeFileSync(destPath, csv);
          res = { status: "downloaded", size: Buffer.byteLength(csv) };
        }
      } else if (job.kind === "sdmx" && !sdmxOk) {
        // dataservices unreachable -> build a CSV fallback for IFS/GFS.
        const canon = job.name.toLowerCase() + ".csv";           // ifs.csv / gfs.csv
        const detail = job.file.replace(/\.json$/i, "") + "_datamapper.csv";
        const outPath = path.join(TARGET_DIR, detail);
        if (!args.force && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
          const st = fs.statSync(outPath);
          res = { status: "skipped", size: st.size, note: canon };
        } else {
          const indicators = job.name === "GFS" ? GFS_INDICATORS : ifsIndicators;
          const csv = await buildDataMapper(indicators, args.retries);
          fs.writeFileSync(outPath, csv);
          res = { status: "downloaded", size: Buffer.byteLength(csv), note: canon };
        }
        // Canonical copy so collector/macro/collectors/offline/imf_loader_offline.cjs
        // can read ifs.csv / gfs.csv unchanged.
        const canonPath = path.join(TARGET_DIR, canon);
        if (fs.existsSync(outPath) && (!fs.existsSync(canonPath) || args.force)) {
          fs.copyFileSync(outPath, canonPath);
        }
        // Keep a small marker to signal that the true SDMX file still needs
        // a host with access to dataservices.imf.org.
        const noteFile = path.join(TARGET_DIR, job.file);
        if (!fs.existsSync(noteFile)) {
          fs.writeFileSync(noteFile, JSON.stringify({
            dataset: job.name,
            status: "dataservices_imf_org_unreachable_from_this_host",
            fallback_csv: canon,
            sdmx_url: `${SDMX_BASE}/CompactData/${job.flowId}/`,
            generated_at: new Date().toISOString(),
          }, null, 2));
        }
      } else {
        res = await download(job.url, destPath, {
          force: args.force,
          retries: args.retries,
        });
      }
      results.push({ fileName: job.file, ...res });
      const tick = res.status === "downloaded" ? "✅" : res.status === "skipped" ? "⏭️" : "❌";
      const extra = res.reason ? ` — ${res.reason}` : res.size ? ` (${res.size} bytes)` : "";
      console.log(`${tick} ${res.note || job.file}  ${res.status}${extra}`);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(args.concurrency, jobs.length)) },
      () => worker()
    )
  );

  const ok = results.filter((r) => r.status !== "failed").length;
  console.log(`\nDone: ${ok}/${results.length} files OK.`);

  console.log(`\n=== 📊 IMF Report ===`);
  console.log(`Folder: ${TARGET_DIR}`);
  console.log(`Total size: ${humanSize(dirSize(TARGET_DIR))}`);
})();
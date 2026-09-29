/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/download_bis_bulk.cjs
 * Description:
 *   Bulk downloader for BIS statistics (Data Portal "Bulk downloads").
 *   - Reads the "Full data sets" page and extracts every file that has a
 *     download link (currently: 27 datasets x 4 formats = 108 ZIP files).
 *   - Downloads files into collector/macro/data/bis/
 *   - Optional: extract each ZIP (--unzip), filter by format/dataset,
 *     force re-download, limit concurrency, retries.
 *
 * IMPORTANT:
 *   The page shows relative hrefs like /static/bulk/xxx.zip that resolve to
 *   www.bis.org (which returns 404). The real files are served from
 *   https://data.bis.org/static/bulk/...  (confirmed working).
 *
 * Run:
 *   node collector/macro/download_bis_bulk.cjs
 *   node collector/macro/download_bis_bulk.cjs --format csv_col
 *   node collector/macro/download_bis_bulk.cjs --dataset WS_XRU --unzip
 *   node collector/macro/download_bis_bulk.cjs --force
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

// ----------------------------- Config -----------------------------
const PAGE_URL = "https://www.bis.org/statistics/full_data_sets.htm";
const DOWNLOAD_HOST = "https://data.bis.org"; // real host serving the bulk Zips
const TARGET_DIR = path.join(__dirname, "data", "bis"); // collector/macro/data/bis

const DEFAULTS = {
  format: "all",        // csv_col | csv_flat | sdmx-compact-2.1 | sdmx-generic-2.1 | all
  dataset: null,        // e.g. "WS_CREDIT_GAP"
  force: false,
  unzip: false,
  dryRun: false,
  concurrency: 4,
  retries: 4,
  limit: Infinity,
};

// ----------------------------- Utils -----------------------------
function parseArgs(argv) {
  const flags = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--format":       flags.format = argv[++i]; break;
      case "--dataset":      flags.dataset = argv[++i]; break;
      case "--unzip":        flags.unzip = true; break;
      case "--force":        flags.force = true; break;
      case "--dry-run":      flags.dryRun = true; break;
      case "--concurrency":  flags.concurrency = Number(argv[++i]) || DEFAULTS.concurrency; break;
      case "--retries":      flags.retries = Number(argv[++i]) || DEFAULTS.retries; break;
      case "--limit":        flags.limit = Number(argv[++i]) || DEFAULTS.limit; break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        // ignore unknown
    }
  }
  return flags;
}

function printHelp() {
  console.log(`
BIS Bulk Downloader
  Downloads every file that has a download link on the BIS "Full downloads"
  page into collector/macro/data/bis/

Usage:
  node download_bis_bulk.cjs [options]

Options:
  --format <fmt>       csv | csv_flat | sdmx-compact-2.1 | sdmx-generic-2.1 | all
  --dataset <code>     Only a dataset by code, e.g. WS_XRU
  --unzip              Extract ZIPs into .../data/bis/extracted/
  --force              Re-download even if the file exists
  --dry-run            List links only, download nothing
  --concurrency <n>    Parallel downloads (default ${DEFAULTS.concurrency})
  --retries <n>        Attempts per file (default ${DEFAULTS.retries})
  --limit <n>          Max number of files to process
  -h, --help           Show this help
`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch page HTML using global fetch (handles HTTP/2 + redirects automatically) */
async function getPageHtml(retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(PAGE_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

/** Extract every bulk href from the page, resolved to data.bis.org */
function extractLinks(html) {
  const set = new Set();
  const re = /href="(\/static\/bulk\/(?:[a-zA-Z0-9_.-]+))"/g;
  let m;
  while ((m = re.exec(html)) !== null) set.add(DOWNLOAD_HOST + m[1]);
  return [...set].sort();
}

/** Stream download a single file; skips existing non-empty unless --force.
 *  Uses global fetch (HTTP/2-friendly) and pipes the body to disk. */
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

/** Expand a ZIP into extractDir (uses the unzipper dependency, already installed) */
function unzipFile(zipPath, extractDir) {
  const unzipper = require("unzipper");
  return new Promise((resolve) => {
    fs.mkdirSync(extractDir, { recursive: true });
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .on("close", () => resolve({ ok: true }))
      .on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

// ----------------------------- Main -----------------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));

  console.log("🔍 Fetching BIS bulk page:", PAGE_URL);
  const html = await getPageHtml(args.retries);
  const allLinks = extractLinks(html);

  if (allLinks.length === 0) {
    console.error("❌ No bulk download links found on the page.");
    process.exit(1);
  }

  console.log(`Found ${allLinks.length} bulk files on the page.`);

  // Apply filters
  let links = allLinks;
  if (args.format && args.format !== "all") {
    links = links.filter((u) => u.includes(`_${args.format}.zip`));
  }
  if (args.dataset) {
    links = links.filter((u) => {
      const base = path.basename(u);
      return base.startsWith(args.dataset + "_") || base.startsWith(args.dataset + ".");
    });
  }
  if (Number.isFinite(args.limit) && links.length > args.limit) {
    links = links.slice(0, args.limit);
  }

  console.log(`📦 ${links.length} file(s) queued into ${TARGET_DIR}`);

  if (args.dryRun) {
    links.forEach((u) => console.log("  " + u));
    console.log("\nDry run – nothing downloaded.");
    return;
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  // Async pool downloader
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < links.length) {
      const url = links[cursor++];
      const fileName = path.basename(url);
      const destPath = path.join(TARGET_DIR, fileName);
      const res = await download(url, destPath, {
        force: args.force,
        retries: args.retries,
      });
      results.push({ fileName, ...res });
      const tick =
        res.status === "downloaded" ? "✅" : res.status === "skipped" ? "⏭️" : "❌";
      const extra = res.reason ? ` — ${res.reason}` : res.size ? ` (${res.size} bytes)` : "";
      console.log(`${tick} ${fileName}  ${res.status}${extra}`);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(args.concurrency, links.length)) },
      () => worker()
    )
  );

  const ok = results.filter((r) => r.status !== "failed").length;
  const fail = results.filter((r) => r.status === "failed");
  console.log(`\nDone: ${ok}/${results.length} files OK. Output: ${TARGET_DIR}`);
  if (fail.length) {
    console.log("Failed files:");
    fail.forEach((f) => console.log("  ❌ " + f.fileName + " — " + f.reason));
  }

  // Optional extraction
  if (args.unzip) {
    console.log("\n🗜 Extracting ZIP files...");
    const extractRoot = path.join(TARGET_DIR, "extracted");
    for (const r of results) {
      if (r.status === "failed") continue;
      const zp = path.join(TARGET_DIR, r.fileName);
      if (!fs.existsSync(zp)) continue;
      const base = r.fileName.replace(/\.zip$/i, "");
      const out = await unzipFile(zp, path.join(extractRoot, base));
      console.log(`${out.ok ? "✅" : "❌"} ${base} ${out.ok ? "extracted" : out.error}`);
    }
    console.log(`Extracted into: ${extractRoot}`);
  }

  // Manifest of what was processed
  const manifestPath = path.join(TARGET_DIR, "downloads-manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        source_page: PAGE_URL,
        download_host: DOWNLOAD_HOST,
        updated_at: new Date().toISOString(),
        total_on_page: allLinks.length,
        files: results,
      },
      null,
      2
    )
  );
  console.log(`Manifest saved to: ${manifestPath}`);

  console.log("\nفایل‌ها در پوشه collector/macro/data/bis دانلود شدند.");
  console.log("راهنما: node collector/macro/download_bis_bulk.cjs --help");
})();
/**
 * ============================================================
 * Project: Macro Engine Collector — Offline World Bank Downloader
 * File: collector/macro/offline/worldbank/download_worldbank_offline.cjs
 * Description:
 *   Downloads the World Bank WDI bulk files into:
 *       collector/macro/offline/worldbank/
 *
 *   Files obtained:
 *     1) WDI bulk CSV zip        -> WDI_CSV.zip   (+ extracted WDI_CSV/)
 *     2) WDI metadata + Excel    -> WDIEXCEL.zip  (metadata/Series + country)
 *     3) Country codes (ISO3)    -> country_codes.csv via World Bank API
 *
 *   The package is self-contained: no external npm deps beyond the
 *   already-installed `unzipper` (used optionally to extract metadata).
 *
 *   - Creates the target dir if missing.
 *   - Tries scraping the official Data Catalog page as a fallback to
 *     discover the actual bulk .zip links when the known defaults change.
 *   - Saves each file using its exact original basename.
 *   - Skips re-downloading files that already exist (non-empty).
 *   - Prints a per-file report and the final folder size.
 *
 * Usage:
 *   node collector/macro/offline/worldbank/download_worldbank_offline.cjs
 *   node collector/macro/offline/worldbank/download_worldbank_offline.cjs --dry-run
 *   node collector/macro/offline/worldbank/download_worldbank_offline.cjs --force
 *   node collector/macro/offline/worldbank/download_worldbank_offline.cjs --extract
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const TARGET_DIR = __dirname; // collector/macro/offline/worldbank
const CATALOG_PAGE = "https://datacatalog.worldbank.org/search/dataset/0037712";

// Primary (confirmed) bulk URLs. The scraping fallback below re-discovers them
// automatically if these ever change and return 404.
const PRIMARY_URLS = [
  { name: "WDI_CSV.zip", kind: "file", url: "https://databank.worldbank.org/data/download/WDI_CSV.zip" },
  { name: "WDIEXCEL.zip", kind: "file", url: "https://databank.worldbank.org/data/download/WDIEXCEL.zip" },
  { name: "country_codes.csv", kind: "api-country", url: "https://api.worldbank.org/v2/country?format=json&per_page=500" },
];

const DEFAULTS = {
  force: false,
  dryRun: false,
  extract: false,
  concurrency: 3,
  retries: 4,
};

// ----------------------------- Utils -----------------------------
function parseArgs(argv) {
  const flags = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--force":      flags.force = true; break;
      case "--dry-run":    flags.dryRun = true; break;
      case "--extract":    flags.extract = true; break;
      case "--concurrency": flags.concurrency = Number(argv[++i]) || DEFAULTS.concurrency; break;
      case "--retries":    flags.retries = Number(argv[++i]) || DEFAULTS.retries; break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (!String(argv[i]).startsWith("--")) break; // positional ok
        break;
    }
  }
  return flags;
}

function printHelp() {
  console.log(`
World Bank WDI offline downloader
  Downloads WDI bulk CSV + metadata + country codes into:
      collector/macro/offline/worldbank/

Options:
  --force          Re-download even if the file already exists
  --extract        Extract WDI_CSV.zip + WDIEXCEL.zip after download
  --dry-run        Report what would be downloaded, download nothing
  --concurrency <n> Parallel downloads (default 3)
  --retries <n>    Attempts per file (default 4)
  -h, --help       Show this help
`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolve a possibly-relative URL against a base page URL. */
function resolveUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Scrape the Data Catalog page for .zip bulk download links (fallback). */
async function scrapeBulkLinks(pageUrl, retries) {
  let html = "";
  let lastErr;
  for (let i = 0; i < Math.max(1, retries); i++) {
    try {
      const res = await fetch(pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      html = await res.text();
      break;
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  if (!html) throw lastErr || new Error("failed to fetch " + pageUrl);

  const found = [];
  const re = /href=["']([^"']+\.(?:zip|csv)(?:[?#][^"']*)?)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = resolveUrl(pageUrl, m[1]);
    if (/\.zip$/i.test(full) && (/(?:csv|excel|wdi|data|download)/i.test(full))) {
      found.push({ name: path.basename(new URL(full).pathname), url: full });
    }
  }
  return found;
}

/** Build country_codes.csv from the World Bank JSON API (format=csv is unreliable). */
async function buildCountries(apiUrl, retries) {
  let lastErr;
  for (let i = 0; i < Math.max(1, retries); i++) {
    try {
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const list = Array.isArray(json) ? json[1] : json;
      if (!Array.isArray(list)) throw new Error("unexpected API shape");
      const lines = ["id,iso2Code,name,region,incomeLevel,lendingType,capitalCity,longitude,latitude"];
      for (const c of list) {
        const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
        lines.push([
          c.id,
          c.iso2Code,
          esc(c.name),
          esc(c.region?.value),
          esc(c.incomeLevel?.value),
          esc(c.lendingType?.value),
          esc(c.capitalCity),
          c.longitude,
          c.latitude,
        ].join(","));
      }
      return lines.join("\n") + "\n";
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr || new Error("failed to build country codes");
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

/** Extract a zip into a sibling folder using the installed `unzipper`. */
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

/** Human-readable size. */
function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// ----------------------------- Main -----------------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log(`📁 Target: ${TARGET_DIR}`);
  console.log(args.dryRun ? "\n[DRY-RUN] Nothing downloaded.\n" : "");

  // 1) Determine the URL set (primary + scraped fallbacks)
  let jobs = [...PRIMARY_URLS];
  let scrapedMap = {};
  try {
    const scraped = await scrapeBulkLinks(CATALOG_PAGE, args.retries);
    if (scraped.length) {
      console.log(`🔍 Scraped ${scraped.length} bulk link(s) from the Data Catalog page.`);
      scrapedMap = Object.fromEntries(scraped.map((s) => [s.name.toLowerCase(), s.url]));
    } else {
      console.log("ℹ️ No extra bulk links scraped — using primary URLs.");
    }
  } catch (e) {
    console.log("⚠️ Could not scrape catalog page:", e.message);
  }

  // 2) Download (pooled), with kind handling + zip fallback to scraped
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const destPath = path.join(TARGET_DIR, job.name);
      if (args.dryRun) {
        results.push({ fileName: job.name, status: "dry-run" });
        continue;
      }

      let res;
      if (job.kind === "api-country") {
        // Country codes are built from the JSON API -> CSV.
        if (!args.force && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
          const st = fs.statSync(destPath);
          res = { status: "skipped", size: st.size };
        } else {
          const csv = await buildCountries(job.url, args.retries);
          fs.writeFileSync(destPath, csv);
          res = { status: "downloaded", size: Buffer.byteLength(csv) };
        }
      } else {
        res = await download(job.url, destPath, {
          force: args.force,
          retries: args.retries,
        });
        // Fallback: if the primary zip 404'd and we scraped a versioned link, use it.
        if (res.status === "failed" && /\.zip$/i.test(job.name)) {
          const key = job.name.toLowerCase();
          const fallback =
            scrapedMap[key] ||
            scrapedMap[Object.keys(scrapedMap).find((k) => key.includes("excel") && k.includes("excel"))] ||
            scrapedMap[Object.keys(scrapedMap).find((k) => key.includes("csv") && k.includes("csv"))];
          if (fallback) {
            console.log(`  ↻ ${job.name} primary failed — retrying scraped link`);
            res = await download(fallback, destPath, {
              force: args.force,
              retries: args.retries,
            });
          }
        }
      }
      results.push({ fileName: job.name, url: job.url, ...res });
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(args.concurrency, jobs.length)) },
      () => worker()
    )
  );

  // 3) Report downloads
  for (const r of results) {
    if (r.status === "dry-run") { console.log(`  · ${r.fileName}`); continue; }
    const tick = r.status === "downloaded" ? "✅" : r.status === "skipped" ? "⏭️" : "❌";
    const extra = r.reason ? ` — ${r.reason}` : r.size ? ` (${r.size} bytes)` : "";
    console.log(`${tick} ${r.fileName}  ${r.status}${extra}`);
  }
  const ok = results.filter((r) => r.status !== "failed").length;
  console.log(`\nDone: ${ok}/${results.length} files OK.`);

  // 4) Optional extraction of the CSVs (WDI bulk contains Country/metadata)
  if (args.extract && !args.dryRun) {
    for (const z of ["WDI_CSV.zip", "WDIEXCEL.zip"]) {
      const zp = path.join(TARGET_DIR, z);
      if (fs.existsSync(zp)) {
        const base = z.replace(/\.zip$/i, "");
        console.log(`🗜 Extracting ${z} -> ${base}/`);
        await unzipFile(zp, path.join(TARGET_DIR, base));
      }
    }
  }

  // 5) Final report
  console.log(`\n=== 📊 World Bank WDI Report ===`);
  console.log(`Folder: ${TARGET_DIR}`);
  console.log(`Total size: ${humanSize(dirSize(TARGET_DIR))}`);
  if (args.dryRun) console.log("\nDry-run finished — nothing was downloaded.");
})();
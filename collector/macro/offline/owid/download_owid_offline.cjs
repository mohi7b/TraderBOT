/**
 * ============================================================
 * Project: Macro Engine Collector — Offline OWID Downloader
 * File: collector/macro/offline/owid/download_owid_offline.cjs
 * Description:
 *   Downloads the OWID "Consumer price index (2010 = 100)" grapher
 *   CSV into:
 *       collector/macro/offline/owid/owid_cpi.csv
 *
 *   Source:
 *     https://ourworldindata.org/grapher/consumer-price-index.csv
 *     (World Bank / IMF CPI series, rebased to 2010 = 100, annual)
 *
 *   Output format (header):
 *     Entity,Code,Year,CPI
 *   - Code is ISO3 (AFG, AUS, USA, ...) -> matches core's country codes.
 *   - Frequency: annual (A).
 *   - The raw OWID header's long value column name is renamed to `CPI`
 *     so the offline loader stays a simple, tidy parse.
 *
 *   Behaviour:
 *     - Creates the target dir if missing.
 *     - Skips re-downloading when owid_cpi.csv already exists (non-empty)
 *       unless --force is given.
 *     - Retries with backoff; writes via a .part temp file then renames.
 *     - Prints a per-file report and the final folder size.
 *
 * Usage:
 *   node collector/macro/offline/owid/download_owid_offline.cjs
 *   node collector/macro/offline/owid/download_owid_offline.cjs --dry-run
 *   node collector/macro/offline/owid/download_owid_offline.cjs --force
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const TARGET_DIR = __dirname; // collector/macro/offline/owid
const SOURCE_URL =
  "https://ourworldindata.org/grapher/consumer-price-index.csv";
const OUT_FILE = path.join(TARGET_DIR, "owid_cpi.csv");

const DEFAULTS = { force: false, dryRun: false, retries: 4 };

// ----------------------------- Utils -----------------------------
function parseArgs(argv) {
  const flags = { ...DEFAULTS };
  for (const a of argv) {
    if (a === "--force") flags.force = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(`
OWID offline downloader
  Downloads OWID CPI (2010=100) into:
      collector/macro/offline/owid/owid_cpi.csv

Options:
  --force      Re-download even if the file already exists
  --dry-run    Report what would be downloaded, download nothing
  -h, --help   Show this help
`);
      process.exit(0);
    }
  }
  return flags;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Rename the OWID value column to a short canonical `CPI` header. */
function rewriteHeader(csvText) {
  const nl = csvText.indexOf("\n");
  if (nl < 0) return csvText;
  const header = csvText.slice(0, nl);
  const body = csvText.slice(nl + 1);
  // OWID header: Entity,Code,Year,"Consumer price index (2010 = 100)"
  const cols = header.split(",");
  if (cols.length >= 4) {
    return "Entity,Code,Year,CPI\n" + body;
  }
  return csvText;
}

/** Download the CSV to disk with retries; skip if present unless force. */
async function download({ force, retries }) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  if (!force && fs.existsSync(OUT_FILE) && fs.statSync(OUT_FILE).size > 0) {
    return { status: "skipped", size: fs.statSync(OUT_FILE).size };
  }

  const attempts = Math.max(1, retries);
  for (let n = 1; n <= attempts; n++) {
    const tmp = OUT_FILE + ".part";
    try {
      const res = await fetch(SOURCE_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (MacroCollector/1.0)" },
        redirect: "follow",
      });
      if (!res.ok || !res.body) {
        if (n === attempts) return { status: "failed", reason: "HTTP " + (res.status || "no-body") };
        await sleep(500 * n);
        continue;
      }

      // Stream to a buffer-ish: OWID grapher CSV is small (~a few MB), so
      // reading fully then rewriting the header is simple and safe here.
      const text = await res.text();
      const rewritten = rewriteHeader(text);
      fs.writeFileSync(tmp, rewritten);

      const st = fs.statSync(tmp);
      if (st.size > 0) {
        fs.renameSync(tmp, OUT_FILE);
        return { status: "downloaded", size: st.size };
      }
      fs.unlinkSync(tmp);
      if (n === attempts) return { status: "failed", reason: "empty file" };
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
      if (n === attempts) return { status: "failed", reason: e.message };
      await sleep(500 * n);
    }
  }
  return { status: "failed", reason: "unknown" };
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

// ----------------------------- Main -----------------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log(`📁 Target: ${TARGET_DIR}`);
  console.log(`🌐 Source: ${SOURCE_URL}`);
  if (args.dryRun) {
    console.log("\n[DRY-RUN] Nothing downloaded.");
    console.log(`  · would write ${path.basename(OUT_FILE)}`);
    return;
  }

  const res = await download({ force: args.force, retries: args.retries });
  const tick = res.status === "downloaded" ? "✅" : res.status === "skipped" ? "⏭️" : "❌";
  const extra = res.reason ? ` — ${res.reason}` : res.size ? ` (${humanSize(res.size)})` : "";
  console.log(`${tick} ${path.basename(OUT_FILE)}  ${res.status}${extra}`);

  // quick sanity: count lines + sample
  if (res.status !== "failed" && fs.existsSync(OUT_FILE)) {
    const head = fs.readFileSync(OUT_FILE, "utf8").split("\n").slice(0, 3).join("\n");
    console.log("\n=== 📊 OWID Report ===");
    console.log(`Folder: ${TARGET_DIR}`);
    console.log(`Total size: ${humanSize(dirSize(TARGET_DIR))}`);
    console.log(`Header/sample:\n${head}`);
  } else if (res.status === "failed") {
    process.exitCode = 1;
  }
})();

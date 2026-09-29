/**
 * ============================================================
 * Project: Macro Engine Collector — Offline BIS Cleanup & Extract
 * File: collector/macro/offline/cleanup_extract_bis.cjs
 * Description:
 *   Slims down the offline BIS store and extracts the CSV sources.
 *
 *   1) Deletes the non-essential BIS bulk variants and keeps only:
 *          *_csv_col.zip
 *      Removed patterns:
 *          *_csv_flat.zip
 *          *_sdmx-compact-2.1.zip
 *          *_sdmx-generic-2.1.zip
 *
 *   2) Extracts every remaining *_csv_col.zip into:
 *          collector/macro/offline/bis_extracted/<zip-name-without-.zip>/
 *      (creates the directory if missing)
 *
 *   3) Prints a final report:
 *          - number of files left in  collector/macro/offline/bis/
 *          - number of extracted files in collector/macro/offline/bis_extracted/
 *          - total on-disk size (human-readable) of both folders
 *
 *   Safety: pass `--dry-run` to preview everything without touching disk.
 *   Pass `--force` to re-extract over existing output folders.
 *
 * Usage:
 *   node collector/macro/offline/cleanup_extract_bis.cjs
 *   node collector/macro/offline/cleanup_extract_bis.cjs --dry-run
 *   node collector/macro/offline/cleanup_extract_bis.cjs --force
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");

const OFFLINE_DIR = __dirname; // collector/macro/offline
const BIS_DIR = path.join(OFFLINE_DIR, "bis"); // zips live here
const DEST_DIR = path.join(OFFLINE_DIR, "bis_extracted"); // extracted csv here

// Zip variants + the only one we keep
const KEEP_SUFFIX = "_csv_col.zip";
const REMOVE_RE = /_(?:csv_flat|sdmx-generic-2\.1|sdmx-compact-2\.1)\.zip$/i;

// ----------------------------- Utils -----------------------------
/** Human-readable size, e.g. "2.1 GB" */
function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
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

/** Count real files (recursive) inside a directory. */
function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(full);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

/** List zip basenames currently present in the bis dir. */
function listZips() {
  if (!fs.existsSync(BIS_DIR)) return [];
  return fs
    .readdirSync(BIS_DIR)
    .filter((f) => /\.zip$/i.test(f))
    .sort();
}

/** Split zips into what to keep (csv_col) vs what to remove. */
function classify(zips) {
  const keep = zips.filter((f) => f.toLowerCase().endsWith(KEEP_SUFFIX));
  const remove = zips.filter((f) => !keep.includes(f));
  return { keep, remove };
}

/** Extract a single zip into its own subfolder under DEST_DIR. */
function extractOne(zipPath, force) {
  const base = path.basename(zipPath).replace(/\.zip$/i, "");
  const outDir = path.join(DEST_DIR, base);

  return new Promise((resolve) => {
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch (e) {
      return resolve({ zip: base, ok: false, error: e.message });
    }

    if (!force) {
      const hasFiles = fs.readdirSync(outDir).some((n) => n !== ".complete");
      if (hasFiles) {
        return resolve({
          zip: base,
          ok: true,
          skipped: true,
          files: fs.readdirSync(outDir),
        });
      }
    }

    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: outDir }))
      .on("close", () => {
        const files = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
        fs.writeFileSync(path.join(outDir, ".complete"), new Date().toISOString());
        resolve({ zip: base, ok: true, skipped: false, files });
      })
      .on("error", (e) => resolve({ zip: base, ok: false, error: e.message }));
  });
}

// ----------------------------- Main -----------------------------
(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  if (!fs.existsSync(BIS_DIR)) {
    console.error(`❌ BIS directory not found: ${BIS_DIR}`);
    process.exit(1);
  }

  const zips = listZips();
  console.log(`📁 Source: ${BIS_DIR}`);
  console.log(`🎯 Dest:   ${DEST_DIR}`);
  console.log(dryRun ? "\n[DRY-RUN] Nothing will be deleted or extracted.\n" : "");

  const { keep, remove } = classify(zips);

  // ---- Step 1: cleanup -------------------------------------------------
  console.log(`\n1) Cleanup`);
  console.log(`   Keep:   ${keep.length} *_csv_col.zip`);
  console.log(`   Remove: ${remove.length} non-csv_col zip(s)`);

  if (!dryRun) {
    for (const f of remove) {
      try {
        fs.unlinkSync(path.join(BIS_DIR, f));
      } catch (e) {
        console.error(`   ❌ Failed to delete ${f}: ${e.message}`);
      }
    }
  }

  // ---- Step 2: extract -------------------------------------------------
  console.log(`\n2) Extract ${keep.length} *_csv_col.zip → ${DEST_DIR}`);
  if (dryRun) {
    keep.forEach((z) => console.log(`   · ${z}`));
  } else {
    fs.mkdirSync(DEST_DIR, { recursive: true });
    for (const zip of keep) {
      const r = await extractOne(path.join(BIS_DIR, zip), force);
      const tick = !r.ok ? "❌" : r.skipped ? "⏭️" : "✅";
      const extra = !r.ok
        ? ` — ${r.error}`
        : r.skipped
          ? " (already extracted)"
          : ` (${r.files.length} item(s))`;
      console.log(`   ${tick} ${r.zip}${extra}`);
    }
  }

  // ---- Step 3: report ----------------------------------------------------
  const keptZips = dryRun ? keep : listZips();
  const finalColZips = keptZips.filter((f) => f.toLowerCase().endsWith(KEEP_SUFFIX)).length;
  const bisCount = countFiles(BIS_DIR);
  const bisSize = dirSize(BIS_DIR);
  const extCount = countFiles(DEST_DIR);
  const extSize = dirSize(DEST_DIR);

  console.log(`\n=== 📊 Final Report ===`);
  console.log(`Files remaining in ${BIS_DIR}:                       ${bisCount}`);
  console.log(`   of which *_csv_col.zip:                           ${finalColZips}`);
  console.log(`   total size of ${BIS_DIR}:                          ${humanSize(bisSize)}`);
  console.log(`Extracted files in ${DEST_DIR}:                     ${dryRun ? "(n/a in dry-run)" : extCount}`);
  console.log(`   total size of ${DEST_DIR}:                         ${humanSize(extSize)}`);

  if (dryRun) console.log("\nDry-run finished — nothing was changed. Run without --dry-run to apply.");
})();
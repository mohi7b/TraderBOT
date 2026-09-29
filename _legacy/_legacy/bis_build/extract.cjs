/**
 * ============================================================
 * BIS DB Pipeline - Step 1: Extract ZIPs
 * File: collector/macro/bis_build/extract.cjs
 *
 * Extracts every *_csv_*.zip inside:
 *     collector/macro/offline/biszip/
 * into:
 *     collector/macro/offline/bis_extracted/<zip-name-without-.zip>/
 *
 * Uses the already-installed `unzipper` dependency.
 * ============================================================
 */
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");

const SRC_DIR = path.join(__dirname, "..", "offline", "biszip");
const DEST_DIR = path.join(__dirname, "..", "offline", "bis_extracted");

/** List csv-related zip files (csv_col / csv_flat / csv_*) */
function listCsvZips() {
  if (!fs.existsSync(SRC_DIR)) return [];
  return fs
    .readdirSync(SRC_DIR)
    .filter((f) => /_csv_/.test(f) && /\.zip$/i.test(f))
    .sort();
}

/** Extract a single zip into its own subfolder under DEST_DIR */
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
      const hasFiles = fs
        .readdirSync(outDir)
        .some((n) => n !== ".complete");
      if (hasFiles) {
        return resolve({ zip: base, ok: true, skipped: true, files: fs.readdirSync(outDir) });
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

/** Extract all csv zips (sequential to keep the box happy), return results */
async function extractAll(force = false) {
  const zips = listCsvZips();
  if (zips.length === 0) {
    return { ok: true, results: [], message: `no *_csv_*.zip found in ${SRC_DIR}` };
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });

  const results = [];
  for (const zip of zips) {
    const r = await extractOne(path.join(SRC_DIR, zip), force);
    results.push(r);
  }
  return { ok: true, results };
}

module.exports = { listCsvZips, extractAll, SRC_DIR, DEST_DIR };

// Allow standalone run:  node extract.cjs [--force]
if (require.main === module) {
  (async () => {
    const force = process.argv.includes("--force");
    const { ok, results, message } = await extractAll(force);
    if (!ok) { console.error(message); process.exit(1); }
    if (message) { console.log(message); return; }
    console.log(`Extracted ${results.length} zip(s) into ${DEST_DIR}`);
    const bad = results.filter((r) => !r.ok);
    bad.forEach((r) => console.error("  FAIL", r.zip, r.error));
    results.filter((r) => r.ok).forEach((r) =>
      console.log(`  ${r.skipped ? "skip" : "ok  "} ${r.zip}  (${r.files.length} item(s))`)
    );
    process.exit(bad.length ? 1 : 0);
  })();
}

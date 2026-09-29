/**
 * ============================================================
 * Macro Live Update System — path registry
 * File: collector/macro/update/lib/paths.cjs
 *
 * Central definition of the exact folder layout required by the
 * live update system:
 *
 *   update/
 *     schedule/update_schedule.json
 *     status/light_status.json
 *     downloaded/<source>/...        raw downloaded files only
 *     extracted/<source>/...         unzipped files only
 *     normalized/<source>/...        normalized CSV only
 *     logs/update_log_YYYYMMDD.txt
 *
 * Also exposes the location of the final database
 * (collector/macro/db/macro.db) and the shared DB-build
 * normalization helpers (collector/macro/db_build/normalize.cjs).
 * ============================================================
 */
const path = require("path");
const fs = require("fs");

// ---- Root override for safe/testing runs -------------------------------------
// If UPDATE_TEST_ROOT is set, the ENTIRE live-update system (downloaded/extracted/normalized dirs, the
// schedule/status files, logs, and the target database) is redirected under that root. This lets an
// end-to-end test run the real update_live.cjs against an isolated temporary store WITHOUT ever touching
// the production db/macro.db or the production update/ folders. When unset, we use the default paths.
const TEST_ROOT = process.env.UPDATE_TEST_ROOT
  ? path.resolve(process.env.UPDATE_TEST_ROOT)
  : null;

// Default (production) roots — always derived from THIS module's real location, regardless of TEST_ROOT.
const DEFAULT_UPDATE_ROOT = path.join(__dirname, "..");      // collector/macro/update
const DEFAULT_MACRO_ROOT = path.join(DEFAULT_UPDATE_ROOT, ".."); // collector/macro

const UPDATE_ROOT = TEST_ROOT ? path.join(TEST_ROOT, "update") : DEFAULT_UPDATE_ROOT;
// Under a test root we still need the production helper scripts to normalize; they live under the real
// macro root. The dirs (downloaded/extracted/normalized/schedule/status/logs/db) go under TEST_ROOT instead,
// so production folders stay untouched, but we keep pointing at the real db_build normalize + real offline.
const MACRO_ROOT = TEST_ROOT ? path.join(TEST_ROOT, "macro") : DEFAULT_MACRO_ROOT;
const DB_PATH = TEST_ROOT ? path.join(MACRO_ROOT, "db", "macro.db") : path.join(DEFAULT_MACRO_ROOT, "db", "macro.db");
const DB_BUILD_NORMALIZE = path.join(DEFAULT_MACRO_ROOT, "db_build", "normalize.cjs"); // real helper
const OFFLINE_BIS = path.join(DEFAULT_MACRO_ROOT, "offline", "bis");                    // real data (read-only)

// ------------------------------------------------------------
// Update system folders
// ------------------------------------------------------------
const DIRS = {
  update: UPDATE_ROOT,
  schedule: path.join(UPDATE_ROOT, "schedule"),
  status: path.join(UPDATE_ROOT, "status"),
  logs: path.join(UPDATE_ROOT, "logs"),
  downloaded: path.join(UPDATE_ROOT, "downloaded"),
  extracted: path.join(UPDATE_ROOT, "extracted"),
  normalized: path.join(UPDATE_ROOT, "normalized"),
};

// ------------------------------------------------------------
// Per-source folder names (exact tree from the spec)
// ------------------------------------------------------------
const BIS_DOWNLOAD_DIRS = {
  policy_rates: path.join(DIRS.downloaded, "bis", "policy_rates"),
  credit: path.join(DIRS.downloaded, "bis", "credit"),
};

// downloaded/<source>/
const DOWNLOAD_DIR = {
  BIS: path.join(DIRS.downloaded, "bis"),
  IMF: path.join(DIRS.downloaded, "imf"),
  OECD: path.join(DIRS.downloaded, "oecd"),
  EUROSTAT: path.join(DIRS.downloaded, "eurostat"),
  FRED: path.join(DIRS.downloaded, "fred"),
  WORLD_BANK: path.join(DIRS.downloaded, "worldbank"),
};

// extracted/<source>/
const EXTRACT_DIR = {
  BIS: path.join(DIRS.extracted, "bis"),
  IMF: path.join(DIRS.extracted, "imf"),
  OECD: path.join(DIRS.extracted, "oecd"),
  EUROSTAT: path.join(DIRS.extracted, "eurostat"),
  WORLD_BANK: path.join(DIRS.extracted, "worldbank"),
};

// normalized/<source>/
const NORMALIZED_DIR = {
  BIS: path.join(DIRS.normalized, "bis"),
  IMF: path.join(DIRS.normalized, "imf"),
  OECD: path.join(DIRS.normalized, "oecd"),
  EUROSTAT: path.join(DIRS.normalized, "eurostat"),
  FRED: path.join(DIRS.normalized, "fred"),
  WORLD_BANK: path.join(DIRS.normalized, "worldbank"),
};

// Schedule key -> DB dataset code (sources table uses "WB", schedule uses "WORLD_BANK")
const SOURCE_TO_DATASET = {
  FRED: "FRED",
  OECD: "OECD",
  EUROSTAT: "EUROSTAT",
  IMF: "IMF",
  BIS: "BIS",
  WORLD_BANK: "WB",
};

const DATASET_TO_SOURCE = {
  FRED: "FRED",
  OECD: "OECD",
  EUROSTAT: "EUROSTAT",
  IMF: "IMF",
  BIS: "BIS",
  WB: "WORLD_BANK",
};

/** Ensure a directory exists (recursive). */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Ensure every update-system directory exists. */
function ensureAllDirs() {
  for (const d of Object.values(DIRS)) ensureDir(d);
  for (const d of Object.values(BIS_DOWNLOAD_DIRS)) ensureDir(d);
  for (const d of Object.values(DOWNLOAD_DIR)) ensureDir(d);
  for (const d of Object.values(EXTRACT_DIR)) ensureDir(d);
  for (const d of Object.values(NORMALIZED_DIR)) ensureDir(d);
  ensureDir(path.dirname(DB_PATH));
}

module.exports = {
  UPDATE_ROOT,
  MACRO_ROOT,
  DB_PATH,
  DB_BUILD_NORMALIZE,
  OFFLINE_BIS,
  DIRS,
  BIS_DOWNLOAD_DIRS,
  DOWNLOAD_DIR,
  EXTRACT_DIR,
  NORMALIZED_DIR,
  SOURCE_TO_DATASET,
  DATASET_TO_SOURCE,
  ensureDir,
  ensureAllDirs,
};

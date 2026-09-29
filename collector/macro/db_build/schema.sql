-- ============================================================
-- Macro DB SQLite Schema
-- File: collector/macro/db_build/schema.sql
--
-- The final database (collector/macro/db/macro.db) holds exactly
-- 3 persistent tables:
--   series   - identity / metadata of every macro series
--   data     - all observations + revision history + time validity
--   sources  - the 6 upstream data providers
--
-- Two auxiliary tables (series_raw / staging_raw / staging) are
-- used only during the build for bulk import + de-duplication and
-- are dropped once the merge finishes.
-- ============================================================

-- journal_mode=DELETE (the safe default). The bulk .import and the merge
-- are append-heavy, so the disk rollback journal stays small. (A RAM
-- journal was tried but ballooned to ~1.6 GB on the staging de-dup step
-- and the OS OOM-killed sqlite3 on this ~2 GB host.)
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = OFF;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = FILE;
PRAGMA cache_size = -100000;   -- 100 MB page cache (this host has ~2 GB RAM)

-- ------------------------------------------------------------
-- Table 1 - series : identity of each series
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS series (
    series_id   TEXT PRIMARY KEY,          -- <dataset>.<country>.<indicator>.<frequency>
    dataset     TEXT,                      -- BIS | IMF | WB | OECD | FRED | EUROSTAT
    country     TEXT,                      -- ISO code (per-source convention)
    indicator   TEXT,                      -- short indicator code
    frequency   TEXT,                      -- M | Q | A | D | W
    unit        TEXT,                      -- unit of measure
    source      TEXT                       -- FK-ish -> sources.source_id
);

-- ------------------------------------------------------------
-- Table 2 - data : observations + revisions + time validity
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data (
    series_id   TEXT,                      -- -> series.series_id
    date        TEXT,                      -- canonical period (YYYY, YYYY-Qx, YYYY-MM, YYYY-MM-DD)
    value       REAL,
    revision_id INTEGER,                   -- 1 = first published version, 2 = first revision, ...
    valid_from  TEXT,                      -- date this version became the published one
    valid_to    TEXT,                      -- date this version stopped being current (NULL = current)
    FOREIGN KEY(series_id) REFERENCES series(series_id)
);

-- ------------------------------------------------------------
-- Table 3 - sources : upstream providers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
    source_id        TEXT PRIMARY KEY,     -- BIS | IMF | WB | OECD | FRED | EUROSTAT
    name             TEXT,
    url              TEXT,
    update_frequency TEXT,
    last_update      TEXT
);

-- ------------------------------------------------------------
-- Speed indexes (required by spec).
-- NOTE: these are created AFTER the bulk merge (see importIntoDb)
-- so that bulk inserts don't pay index-maintenance cost.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Build-time helper tables (dropped at the end of the build)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS series_raw;
DROP TABLE IF EXISTS staging;

CREATE TABLE series_raw (
    series_id  TEXT,
    dataset    TEXT,
    country    TEXT,
    indicator  TEXT,
    frequency  TEXT,
    unit       TEXT,
    source     TEXT
);

-- staging holds every observation to merge into `data`.
-- No PK here: bulk .import is fastest without index maintenance.
-- Duplicates on (series_id, date) are removed right after import
-- (first row wins), then an index is added for the merge step.
CREATE TABLE staging (
    series_id  TEXT,
    date       TEXT,
    value      REAL,
    loaded_on  TEXT
);

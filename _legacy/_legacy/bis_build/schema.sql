-- ============================================================
-- BIS SQLite Schema
-- File: collector/macro/bis_build/schema.sql
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA synchronous = OFF;
PRAGMA foreign_keys = ON;

-- Metadata / series master table
CREATE TABLE IF NOT EXISTS series (
    series_id   TEXT PRIMARY KEY,
    dataset     TEXT,
    country     TEXT,
    indicator   TEXT,
    frequency   TEXT,
    unit        TEXT,
    description TEXT
);

-- Time-series observations
CREATE TABLE IF NOT EXISTS data (
    series_id TEXT,
    date      TEXT,
    value     REAL,
    FOREIGN KEY(series_id) REFERENCES series(series_id)
);

-- Query index
CREATE INDEX IF NOT EXISTS idx_data_series_date ON data(series_id, date);
CREATE INDEX IF NOT EXISTS idx_series_dataset ON series(dataset);

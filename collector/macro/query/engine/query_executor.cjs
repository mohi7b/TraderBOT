/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/query_executor.cjs
 * Description:
 *   Query Executor — Phase 3. Runs validated parsed query objects
 *   against the macro databases and returns raw series rows.
 *
 *   Two databases are supported (selected via the `db` field):
 *     "core" -> collector/macro/core_db/core.db  (lightweight, fast)
 *     "full" -> collector/macro/db/macro.db      (complete database)
 *
 *   Rules enforced by this module:
 *     - Uses ONLY better-sqlite3 (no sqlite3 CLI, no child_process,
 *       no shell commands, no timeouts).
 *     - Every SQL statement is a FIXED prepared statement; values
 *       are always bound as parameters (no string concatenation).
 *     - No LIKE is used anywhere; matching is strict equality on
 *       country / indicator / frequency / series_id / date range.
 *     - Connections are opened READ-ONLY.
 *     - This layer only READS data: it never converts frequency,
 *       never merges, never analyzes (those are Phase 4 / Phase 5).
 *
 *   Parsed query object contract (produced by the Phase 2 parser):
 *     {
 *       db: "core" | "full",                  // DB selector
 *       country, indicator, frequency,         // direct series selector
 *       dataset,                               // optional (e.g. "OECD")
 *       series: [                             // alternative selector list
 *         { series_id: "OECD.USA.CPI_YOY.M" } | { dataset?, country, indicator, frequency },
 *         ...
 *       ],
 *       timeRange: { start, end }              // optional ISO bounds
 *     }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

"use strict";

const path = require("path");
const Database = require("better-sqlite3");

// ------------------------------------------------------------
// Database registry
// ------------------------------------------------------------
const DB_PATHS = {
  core: path.join(__dirname, "..", "..", "core_db", "core.db"),
  full: path.join(__dirname, "..", "..", "db", "macro.db"),
};
const DB_MODES = Object.keys(DB_PATHS);

// ISO bounds used when a query omits start / end (lexicographically
// lower/upper than any canonical period string in the data table).
const MIN_DATE = "0000-01-01";
const MAX_DATE = "9999-12-31";

// ------------------------------------------------------------
// QueryExecutor
// ------------------------------------------------------------
class QueryExecutor {
  /**
   * @param {string} [dbMode="core"] - "core" (core.db) or "full" (macro.db)
   */
  constructor(dbMode = "core") {
    if (!Object.prototype.hasOwnProperty.call(DB_PATHS, dbMode)) {
      throw new Error(`Unknown db mode "${dbMode}". Supported modes: ${DB_MODES.join(", ")}`);
    }
    this.dbMode = dbMode;
    this.dbPath = DB_PATHS[dbMode];
    this.db = new Database(this.dbPath, { readonly: true, fileMustExist: true });

    // ---- prepared statements (fixed SQL, values bound only) ----
    // series meta lookup by exact country + indicator + frequency
    this.stmtSeriesMatch = this.db.prepare(
      `SELECT series_id, dataset, country, indicator, frequency, unit, source
         FROM series
        WHERE country = ? AND indicator = ? AND frequency = ?
        ORDER BY series_id ASC`
    );
    // series meta lookup with an additional exact dataset filter
    this.stmtSeriesByDataset = this.db.prepare(
      `SELECT series_id, dataset, country, indicator, frequency, unit, source
         FROM series
        WHERE dataset = ? AND country = ? AND indicator = ? AND frequency = ?
        ORDER BY series_id ASC`
    );
    // series meta lookup by primary key
    this.stmtSeriesById = this.db.prepare(
      `SELECT series_id, dataset, country, indicator, frequency, unit, source
         FROM series
        WHERE series_id = ?`
    );
    // data rows for one series within a date range (indexed)
    this.stmtDataRange = this.db.prepare(
      `SELECT series_id, date, value
         FROM data
        WHERE series_id = ? AND date >= ? AND date <= ?
        ORDER BY date ASC`
    );
    // lightweight connectivity check
    this.stmtPing = this.db.prepare("SELECT 1 AS ok");
  }

  /** @returns {boolean} true while the underlying connection is open. */
  get isOpen() {
    return Boolean(this.db && this.db.open);
  }

  /** Closes the database connection. Safe to call more than once. */
  close() {
    if (this.db && this.db.open) {
      this.db.close();
    }
  }

  /** Light connectivity check: executes SELECT 1. */
  ping() {
    return this.stmtPing.get();
  }

  /**
   * Normalizes one series descriptor.
   * @param {object} desc - { series_id } or { dataset?, country, indicator, frequency }
   * @returns {object} - internal descriptor with plain fields
   */
  _normalizeDescriptor(desc) {
    if (!desc || typeof desc !== "object") {
      throw new Error("series descriptor must be an object");
    }
    if (typeof desc.series_id === "string" && desc.series_id) {
      return {
        series_id: desc.series_id,
        dataset: null,
        country: null,
        indicator: null,
        frequency: null,
      };
    }
    const dataset = desc.dataset || null;
    const { country, indicator, frequency } = desc;
    if (!country || !indicator || !frequency) {
      throw new Error(
        `series descriptor needs series_id or country+indicator+frequency: ${JSON.stringify(desc)}`
      );
    }
    return { series_id: null, dataset, country, indicator, frequency };
  }

  /**
   * Turns a parsed query into a list of normalized descriptors.
   * @param {object} parsedQuery - parsed query object
   * @returns {Array<object>} - normalized descriptors
   */
  _seriesDescriptors(parsedQuery) {
    if (Array.isArray(parsedQuery.series) && parsedQuery.series.length > 0) {
      return parsedQuery.series.map((d) => this._normalizeDescriptor(d));
    }
    if (parsedQuery.country && parsedQuery.indicator && parsedQuery.frequency) {
      return [
        {
          series_id: null,
          dataset: parsedQuery.dataset || null,
          country: parsedQuery.country,
          indicator: parsedQuery.indicator,
          frequency: parsedQuery.frequency,
        },
      ];
    }
    throw new Error("parsedQuery must provide series[] or country+indicator+frequency");
  }

  /**
   * Resolves the effective date-range bounds for a parsed query.
   * @param {object} parsedQuery - parsed query object
   * @returns {{start: string, end: string}} - ISO bounds
   */
  _rangeBounds(parsedQuery) {
    const tr = (parsedQuery && parsedQuery.timeRange) || {};
    return {
      start: (tr.start && String(tr.start)) || MIN_DATE,
      end: (tr.end && String(tr.end)) || MAX_DATE,
    };
  }

  /**
   * Finds the series that exactly match the parsed query
   * (country + indicator + frequency, optionally narrowed by dataset).
   *
   * @param {object} parsedQuery - parsed query object
   * @returns {Array<object>} - matching series metadata rows
   */
  loadSeriesMeta(parsedQuery) {
    const out = [];
    const seen = new Set();
    for (const d of this._seriesDescriptors(parsedQuery)) {
      let rows;
      if (d.series_id) {
        const row = this.stmtSeriesById.get(d.series_id);
        rows = row ? [row] : [];
      } else if (d.dataset) {
        rows = this.stmtSeriesByDataset.all(d.dataset, d.country, d.indicator, d.frequency);
      } else {
        rows = this.stmtSeriesMatch.all(d.country, d.indicator, d.frequency);
      }
      for (const r of rows) {
        if (!seen.has(r.series_id)) {
          seen.add(r.series_id);
          out.push(r);
        }
      }
    }
    return out;
  }

  /**
   * Reads one series' data rows (date + value), filtered to the
   * parsed query's time range and ordered by date ascending.
   *
   * @param {string} seriesId     - series identifier
   * @param {object} parsedQuery  - parsed query object (timeRange)
   * @returns {object} - { series_id, dataset, country, indicator,
   *                     frequency, unit, source, data: [{ date, value }] }
   */
  loadSeriesData(seriesId, parsedQuery) {
    const bounds = this._rangeBounds(parsedQuery);
    const rows = this.stmtDataRange.all(seriesId, bounds.start, bounds.end);
    const meta = this.stmtSeriesById.get(seriesId);
    return {
      series_id: seriesId,
      dataset: meta ? meta.dataset : null,
      country: meta ? meta.country : null,
      indicator: meta ? meta.indicator : null,
      frequency: meta ? meta.frequency : null,
      unit: meta ? meta.unit : null,
      source: meta ? meta.source : null,
      data: rows.map((r) => ({ date: r.date, value: r.value })),
    };
  }

  /**
   * Runs the full read pipeline for a parsed query:
   *   1) load series metadata  2) load each series' data
   *   3) build the final result object.
   *
   * @param {object} parsedQuery - parsed query object
   * @returns {object} - { status, db, count, results: [...] }
   */
  execute(parsedQuery) {
    if (!parsedQuery || typeof parsedQuery !== "object") {
      throw new Error("execute() requires a parsed query object");
    }
    const metaRows = this.loadSeriesMeta(parsedQuery);
    const results = metaRows.map((m) => this.loadSeriesData(m.series_id, parsedQuery));
    return {
      status: "ok",
      db: this.dbMode,
      count: results.length,
      results,
    };
  }
}

// ------------------------------------------------------------
// Module-level helpers (pick the DB from parsedQuery.db)
// ------------------------------------------------------------
function resolveDbMode(parsedQuery, options) {
  const q = parsedQuery && typeof parsedQuery === "object" ? parsedQuery : {};
  if (typeof q.db === "string" && q.db) return q.db;
  if (options && typeof options.db === "string" && options.db) return options.db;
  return "core";
}

function withExecutor(dbMode, fn) {
  const executor = new QueryExecutor(dbMode);
  try {
    return fn(executor);
  } finally {
    executor.close();
  }
}

/**
 * Executes a fully validated parsed query object against the DB
 * selected by `parsedQuery.db` ("core" | "full"). Returns the raw
 * result set without any conversion or merging (Phases 4/5).
 *
 * @param {object} parsedQuery - parsed query object
 * @param {object} [options]   - optional execution options ({ db })
 * @returns {Promise<object>}  - { status, db, count, results }
 */
async function executeParsedQuery(parsedQuery, options) {
  return withExecutor(resolveDbMode(parsedQuery, options), (ex) => ex.execute(parsedQuery));
}

/**
 * Fetches one series' data rows within an optional time range.
 *
 * @param {string} seriesId    - series identifier
 * @param {object} [timeRange] - { start, end } ISO date range
 * @param {object} [options]   - { db: "core" | "full" }
 * @returns {Promise<object>}  - { series_id, frequency, data }
 */
async function executeSeriesQuery(seriesId, timeRange, options) {
  const dbMode = (options && options.db) || "core";
  return withExecutor(dbMode, (ex) => ex.loadSeriesData(seriesId, { timeRange }));
}

/**
 * Fetches several series and groups the rows by series id.
 *
 * @param {Array<string>} seriesIds - list of series identifiers
 * @param {object} [timeRange]      - { start, end } ISO date range
 * @param {object} [options]        - { db: "core" | "full" }
 * @returns {Promise<Array>}        - array of { series_id, frequency, data }
 */
async function executeMultiSeriesQuery(seriesIds, timeRange, options) {
  const dbMode = (options && options.db) || "core";
  return withExecutor(dbMode, (ex) => {
    const query = { series: seriesIds.map((id) => ({ series_id: id })), timeRange };
    return ex.execute(query).results;
  });
}

module.exports = {
  QueryExecutor,
  DB_PATHS,
  DB_MODES,
  executeParsedQuery,
  executeSeriesQuery,
  executeMultiSeriesQuery,
};


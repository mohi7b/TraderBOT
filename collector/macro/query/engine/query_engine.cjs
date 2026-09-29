/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/query_engine.cjs
 * Description:
 *   Query Engine — public entry point of the Macro Query Engine.
 *   Responsibilities:
 *     - Receive raw macro query strings
 *     - Orchestrate the full pipeline:
 *         parse → validate → execute → frequency-convert → merge
 *     - Return a normalized, ready-to-use result object
 *   This file is a Phase 1 skeleton: stub functions only, no logic.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

/**
 * Top-level entry point. Accepts a raw query string, runs the full
 * pipeline (parse → validate → execute → convert → merge) and returns
 * a normalized result object.
 *
 * @param {string} queryString - raw query string (e.g. "CPI.US.M?from=2010&freq=A")
 * @param {object} [options]   - optional execution options (limits, output format, ...)
 * @returns {Promise<object>}  - normalized query result
 */
async function runQuery(queryString, options) {
  // TODO(Phase 2): orchestrate parser → validator → executor → converter → merger
}

/**
 * Executes a pre-parsed (and validated) query object without re-parsing.
 * Used by internal callers that already hold a parsed query.
 *
 * @param {object} parsedQuery - validated query object (see parser/query_parser.cjs)
 * @param {object} [options]   - optional execution options
 * @returns {Promise<object>}  - normalized query result
 */
async function runParsedQuery(parsedQuery, options) {
  // TODO(Phase 2): dispatch to query_executor.cjs then convert + merge
}

/**
 * Executes a single series query and returns the raw rows without any
 * post-processing (no conversion, no merging). Convenience for internal use.
 *
 * @param {string} seriesId    - series identifier (e.g. "BIS.US.CREDIT.M")
 * @param {object} timeRange   - { start, end } ISO date range
 * @returns {Promise<Array>}   - raw series rows
 */
async function runSeriesQuery(seriesId, timeRange) {
  // TODO(Phase 2): delegate to query_executor.cjs
}

module.exports = {
  runQuery,
  runParsedQuery,
  runSeriesQuery
};

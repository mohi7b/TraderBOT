/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/utils/validation_utils.cjs
 * Description:
 *   Validation utilities for the Macro Query Engine.
 *   Responsibilities:
 *     - Validate parsed query objects
 *     - Validate series identifiers
 *     - Validate time ranges (start ≤ end, supported format)
 *     - Validate frequencies
 *   This file is a Phase 1 skeleton: stub functions only, no logic.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

/**
 * Validates a full parsed query object. Returns a list of errors
 * (empty array means valid).
 *
 * @param {object} queryObject - parsed query object
 * @returns {Array<string>} - list of validation errors
 */
function validateQueryObject(queryObject) {
  // TODO(Phase 2): validate all query parts
}

/**
 * Validates a series identifier like "BIS.US.CREDIT.M".
 *
 * @param {string} seriesId - series identifier
 * @returns {Array<string>} - list of errors (empty = valid)
 */
function validateSeriesId(seriesId) {
  // TODO(Phase 2): check <dataset>.<country>.<indicator>.<frequency>
}

/**
 * Validates a time range.
 *
 * @param {string|null} start - start ISO date
 * @param {string|null} end   - end ISO date
 * @returns {Array<string>}   - list of errors (empty = valid)
 */
function validateTimeRange(start, end) {
  // TODO(Phase 2): format + ordering checks
}

/**
 * Validates a frequency value.
 *
 * @param {string} freq - frequency value
 * @returns {Array<string>} - list of errors (empty = valid)
 */
function validateFrequency(freq) {
  // TODO(Phase 2): check supported frequency
}

module.exports = {
  validateQueryObject,
  validateSeriesId,
  validateTimeRange,
  validateFrequency
};

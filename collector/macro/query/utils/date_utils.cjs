/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/utils/date_utils.cjs
 * Description:
 *   Date utilities for the Macro Query Engine.
 *   Responsibilities:
 *     - Normalize date inputs to UTC ISO strings
 *     - Parse common date formats
 *     - Compute period boundaries (start of month/quarter/year)
 *     - Add/subtract time periods
 *   This file is a Phase 1 skeleton: stub functions only, no logic.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

/**
 * Converts any supported date input to a UTC ISO string.
 *
 * @param {string|Date} dateInput - "2024-01-15", "2024-01", "Q1 2024", Date, ...
 * @returns {string|null} - "YYYY-MM-DDTHH:mm:ss.sssZ" or null if invalid
 */
function toUTCIso(dateInput) {
  // TODO(Phase 2): normalize input to UTC ISO
}

/**
 * Extracts the calendar period key (period start) for a date.
 *
 * @param {string} dateIso  - UTC ISO date string
 * @param {string} frequency - M, Q, A, W, D
 * @returns {string} - period key, e.g. "2024-01" for monthly
 */
function getPeriodStart(dateIso, frequency) {
  // TODO(Phase 2): bucket date into period start
}

/**
 * Adds a number of periods to a date.
 *
 * @param {string} dateIso  - UTC ISO date string
 * @param {number} amount   - number of periods (can be negative)
 * @param {string} frequency - M, Q, A, W, D
 * @returns {string} - resulting UTC ISO date string
 */
function addPeriod(dateIso, amount, frequency) {
  // TODO(Phase 2): period arithmetic
}

/**
 * Returns the last day of the period that contains the given date.
 *
 * @param {string} dateIso  - UTC ISO date string
 * @param {string} frequency - M, Q, A, W, D
 * @returns {string} - UTC ISO date of the period end
 */
function getPeriodEnd(dateIso, frequency) {
  // TODO(Phase 2): compute period end date
}

module.exports = {
  toUTCIso,
  getPeriodStart,
  addPeriod,
  getPeriodEnd
};

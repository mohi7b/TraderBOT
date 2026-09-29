/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/utils/frequency_utils.cjs
 * Description:
 *   Frequency utilities for the Macro Query Engine.
 *   Responsibilities:
 *     - Normalize frequency labels (monthly → M, quarter → Q, ...)
 *     - Validate supported frequencies
 *     - Map frequencies to period keys and durations
 *   This file is a Phase 1 skeleton: stub functions only, no logic.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

/**
 * Normalizes a frequency label to the canonical single letter.
 *
 * @param {string} freq - "monthly", "MONTH", "M", "Quarterly", "Q", ...
 * @returns {string|null} - canonical letter (D, W, M, Q, A) or null
 */
function normalizeFrequency(freq) {
  // TODO(Phase 2): map label variants to D/W/M/Q/A
}

/**
 * Checks whether a value is a supported frequency.
 *
 * @param {string} freq - raw frequency value
 * @returns {boolean} - true if supported
 */
function isValidFrequency(freq) {
  // TODO(Phase 2): validate against supported set
}

/**
 * Converts a date into the canonical period key for a frequency.
 *
 * @param {string} dateIso  - UTC ISO date string
 * @param {string} frequency - normalized frequency letter
 * @returns {string} - period key, e.g. "2024-01" / "2024-Q1" / "2024"
 */
function toPeriodKey(dateIso, frequency) {
  // TODO(Phase 2): derive period key from date + frequency
}

/**
 * Returns an ordered list of supported frequency letters.
 *
 * @returns {Array<string>} - ["D", "W", "M", "Q", "A"]
 */
function supportedFrequencies() {
  // TODO(Phase 2): return canonical ordered list
}

module.exports = {
  normalizeFrequency,
  isValidFrequency,
  toPeriodKey,
  supportedFrequencies
};

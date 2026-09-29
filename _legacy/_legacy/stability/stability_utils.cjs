/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/stability/stability_utils.cjs
 * Description:
 *   Utility functions for Stability Window operations.
 *   Provides:
 *     - isNewValueDifferent()
 *     - calculateDurationDays()
 *     - closePreviousWindow()
 *     - buildNewWindowRecord()
 *   Fully CJS and used by stability_window.cjs + collectors.
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { diffDays, toUTC, extractDate } = require("../utils/time.cjs");

/**
 * Check if new macro value is different from previous one
 * Prevents duplicate entries
 */
function isNewValueDifferent(previous, newValue) {
  if (!previous) return true; // no previous → always new
  return Number(previous.value) !== Number(newValue);
}

/**
 * Calculate duration in days between start and end timestamps
 */
function calculateDurationDays(startUTC, endUTC) {
  return diffDays(startUTC, endUTC);
}

/**
 * Close previous stability window
 * Used inside stability_window.cjs
 */
function closePreviousWindow(previousRecord, newReleaseTimeUTC) {
  if (!previousRecord) return null;

  const updated = { ...previousRecord };

  updated.macro_value_end_time_utc = newReleaseTimeUTC;
  updated.macro_value_duration_days = calculateDurationDays(
    previousRecord.macro_value_start_time_utc,
    newReleaseTimeUTC
  );
  updated.macro_value_is_active = false;
  updated.last_updated = new Date().toISOString();

  return updated;
}

/**
 * Build new stability window record
 * Used inside stability_window.cjs
 */
function buildNewWindowRecord({
  country,
  variable,
  value,
  releaseTimeUTC,
  meta = {}
}) {
  const utc = toUTC(releaseTimeUTC);

  return {
    country,
    variable,
    value: Number(value),

    // Stability Window fields
    macro_value_start_time_utc: utc,
    macro_value_end_time_utc: null,
    macro_value_duration_days: null,
    macro_value_is_active: true,

    // Metadata
    category: meta.category || null,
    sub_category: meta.sub_category || null,
    frequency: meta.frequency || null,
    unit: meta.unit || null,
    source_primary: meta.source_primary || null,
    source_secondary: meta.source_secondary || null,
    release_lag_days: meta.release_lag_days || null,

    // Standard fields
    date: extractDate(utc),
    quality_flag: "official",
    revision_flag: "unknown",
    last_updated: new Date().toISOString()
  };
}

module.exports = {
  isNewValueDifferent,
  calculateDurationDays,
  closePreviousWindow,
  buildNewWindowRecord
};

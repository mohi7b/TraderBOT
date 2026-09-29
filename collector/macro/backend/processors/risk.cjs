"use strict";

/**
 * ============================================================
 * Macro Backend — Risk Flags Processor
 * File: collector/macro/backend/processors/risk.cjs
 * ============================================================
 * Builds the `risk_flags` block for a single series from its trend
 * statistics:
 *
 *   high_volatility : recent std-dev is %-large vs the window mean
 *   sharp_reversal  : latest moves against the prevailing 12m trend
 *                     ("whipsaw") with a magnitude beyond a threshold
 *   near_peak       : latest is within `PEAK_BAND` of its window max
 *   near_trough     : latest is within `TROUGH_BAND` of its window min
 *   vol_spike       : the most recent change is notably larger than the
 *                     typical step (tail volatility)
 *
 * Flags are data that the UI renders as warning badges; they are
 * intentionally conservative (noise-tolerant) so real signals stand out.
 * ============================================================
 */

const FLAT_EPS = 1e-9;
const PEAK_BAND = 0.015;      // 1.5% below window max
const TROUGH_BAND = 0.015;    // 1.5% above window min
const REVERSAL_SCALE = 0.5;   // reversal must undo >=50% of prior displacement
const VOL_SPIKE_RATIO = 2.5;  // latest |step| > that × the earlier volatility

/**
 * @param {object} trend - output of computeTrend()
 * @param {object} latestStep - { lastValue, prevValue, value } latest obs info
 * @returns {object} risk flags (all booleans) + one-line `notes`
 */
module.exports = function buildRiskFlags(trend, info) {
  if (!trend || !trend.classified || trend.volatility == null) {
    return {
      high_volatility: false, sharp_reversal: false, near_peak: false,
      near_trough: false, vol_spike: false, has_risk: false, notes: [],
    };
  }

  const { volatility, mean, max_1, min_1 } = trend;
  const { lastValue, prevValue } = info || {};

  const notes = [];

  // --- high_volatility: dispersion is meaningful vs scale ---
  const scaleRef = Math.abs(mean) > FLAT_EPS ? Math.abs(mean) : 1;
  let high_volatility = false;
  if (scaleRef > 0) {
    const cv = Math.abs(volatility) / scaleRef;
    high_volatility = cv > 0.55; // >55% coefficient of variation
  }
  if (high_volatility) notes.push("elevated dispersion");

  // --- near_peak / near_trough (sign-robust via window *range* span) ---
  // Denominator = (max-min) so it works whether values are positive,
  // negative or near zero (e.g. budget balance / growth-step series).
  const hasRange = max_1 != null && min_1 != null &&
    Math.abs(max_1 - min_1) > FLAT_EPS;

  let near_peak = false;
  if (hasRange && lastValue != null) {
    near_peak = (max_1 - lastValue) / Math.abs(max_1 - min_1) <= PEAK_BAND;
  }
  let near_trough = false;
  if (hasRange && lastValue != null) {
    near_trough = (lastValue - min_1) / Math.abs(max_1 - min_1) <= TROUGH_BAND;
  }
  if (near_peak) notes.push("near 12m peak");
  if (near_trough) notes.push("near 12m trough");

  // --- sharp_reversal (whipsaw) ---
  // Existing 12m slope direction (when observed) — if today's step points
  // the opposite way with enough magnitude, flag it.
  let sharp_reversal = false;
  if (trend.slope_12m != null && Math.abs(trend.slope_12m) > FLAT_EPS &&
      prevValue != null && lastValue != null) {
    const step = lastValue - prevValue;
    const reversal = step !== 0 && step * trend.slope_12m < 0;
    if (reversal) {
      const magnitude = Math.abs(step) / (Math.abs(trend.slope_12m) || 1);
      if (magnitude >= REVERSAL_SCALE) {
        sharp_reversal = true;
        notes.push("recent print reverses prevailing trend");
      }
    }
  }

  // --- vol_spike ---
  let vol_spike = false;
  if (prevValue != null && lastValue != null && volatility > FLAT_EPS) {
    const step = Math.abs(lastValue - prevValue);
    if (step > VOL_SPIKE_RATIO * volatility) {
      vol_spike = true;
      notes.push("unusually large latest move");
    }
  }

  return {
    high_volatility,
    sharp_reversal,
    near_peak,
    near_trough,
    vol_spike,
    has_risk: high_volatility || sharp_reversal || near_peak || near_trough || vol_spike,
    notes,
  };
};


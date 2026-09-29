"use strict";

/**
 * ============================================================
 * Macro Backend — Trend Processor
 * ============================================================
 * Professional trend + classification block for one series plus the
 * low-level statistics consumed by the Risk processor.
 */
const FLAT_EPS = 1e-9;
const STRENGTH_LOW_MAX = 0.35;
const STRENGTH_MED_MAX = 1.0;

module.exports = function computeTrend(history) {
  const rows = Array.isArray(history) ? history : [];
  if (rows.length < 3) {
    return {
      slope_3m: null, slope_6m: null, slope_12m: null,
      volatility: null, momentum: null,
      mean: null, max_1: null, min_1: null,
      direction: "flat", strength: "low", classified: false,
    };
  }

  const values = rows.map((r) => r.value).filter((v) => Number.isFinite(v));
  const n = values.length;
  if (n < 3) {
    return {
      slope_3m: null, slope_6m: null, slope_12m: null,
      volatility: null, momentum: null,
      mean: null, max_1: null, min_1: null,
      direction: "flat", strength: "low", classified: false,
    };
  }

  const at = (k) => values[values.length - 1 - k];

  const slope_3m = at(0) - at(2);
  const slope_6m = n >= 6 ? at(0) - at(5) : null;
  const slope_12m = n >= 12 ? at(0) - at(11) : null;

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const volatility = Math.sqrt(variance);

  const momentum = Math.abs(volatility) > FLAT_EPS ? slope_3m / volatility : 0;
  const max_1 = Math.max(...values);
  const min_1 = Math.min(...values);

  let direction = "flat";
  if (Math.abs(momentum) > 0.05) direction = momentum > 0 ? "up" : "down";

  const mAbs = Math.abs(momentum);
  let strength = "low";
  if (mAbs >= STRENGTH_MED_MAX) strength = "high";
  else if (mAbs >= STRENGTH_LOW_MAX) strength = "medium";

  return {
    slope_3m, slope_6m, slope_12m,
    volatility, momentum,
    mean, max_1, min_1,
    direction, strength,
    classified: true,
  };
};


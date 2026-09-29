"use strict";

/**
 * ============================================================
 * Macro Backend — Group Summary Processor
 * File: collector/macro/backend/processors/summary.cjs
 * ============================================================
 * Builds the top-level `summary` block of a group from its enriched
 * series:
 *
 *   {
 *     global_trend : "heating" | "cooling" | "stable" | "mixed",
 *     avg_yoy      : mean of latest YoY prints across series,
 *     avg_mom      : mean of latest MoM prints across series,
 *     rising_count / falling_count : directional tally,
 *     coverage     : { series, countries, datasets, as_of }
 *   }
 *
 * `global_trend` direction vocabulary stays generic (heating/cooling is
 * used even for labor sums as "tightening/easing"); on the inflation /
 * price groups it reads naturally as price pressure. We expose the raw
 * direction counts so the UI can render its own qualitative label.
 * ============================================================
 */

function finite(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function sign_label(v) {
  if (!finite(v)) return null;
  if (v > 1e-9) return "up";
  if (v < -1e-9) return "down";
  return "flat";
}

/**
 * @param {Array<object>} series - enriched series list (each has trend & latest)
 * @returns {object} group summary
 */
module.exports = function buildGroupSummary(seriesArr) {
  const list = Array.isArray(seriesArr) ? seriesArr : [];

  const yoyVals = [];
  const momVals = [];
  const directionTally = { up: 0, down: 0, flat: 0 };
  const countries = new Set();
  const datasets = new Set();
  let asOf = null;

  for (const s of list) {
    if (!s) continue;
    if (s.country && s.country.code) countries.add(s.country.code);
    if (s.dataset) datasets.add(s.dataset);

    const l = (s.latest || {});
    // ---- avg pool: only change-of-rate / %-growth-style series ----
    // A series_kind of "level" (e.g. millions USD, persons) has a stored
    // mom/yoy *change-in-level* that mixes incompatible absolute units, so
    // including it in a cross-series average is meaningless. Its own
    // directional read (from trend) is still tallied below.
    const kind = s.series_kind;
    const growthLike = kind === "rate" || kind === "percent" || kind === "index";
    if (growthLike && finite(l.yoy)) yoyVals.push(l.yoy);
    if (growthLike && finite(l.mom)) momVals.push(l.mom);

    if (s.trend && s.trend.direction) directionTally[s.trend.direction] =
      (directionTally[s.trend.direction] || 0) + 1;

    if (l.date && (!asOf || l.date > asOf)) asOf = l.date;
  }

  const avg = (arr) => {
    if (arr.length === 0) return null;
    return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3));
  };

  const avg_yoy = avg(yoyVals);
  const avg_mom = avg(momVals);

  // --- Global directional read by weighted plurality of direction votes.
  const up = directionTally.up || 0;
  const down = directionTally.down || 0;
  const flat = directionTally.flat || 0;

  let global_trend = "mixed";
  if (up + down + flat > 0) {
    if (up === 0 && down === 0) global_trend = "stable";
    else if (up === 0) global_trend = "cooling";      // all falling prints
    else if (down === 0) global_trend = "heating";     // all rising prints
    else {
      // majority wins; require a clear margin to avoid noise label.
      const total = up + down;
      const majority = Math.max(up, down);
      if (majority / total >= 0.6) global_trend = up > down ? "heating" : "cooling";
    }
  }

  return {
    global_trend,
    avg_yoy,
    avg_mom,
    rising: up,
    falling: down,
    flat: flat,
    coverage: {
      series: list.length,
      countries: [...countries].sort(),
      datasets: [...datasets].sort(),
      as_of: asOf,
    },
  };
};

"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/merger.cjs
 * Description:
 *   Series Merger — Phase 6 (Chalak / fast light build).
 *
 *   Merges several time series onto a COMMON timeline. Only the dates
 *   shared by every series survive (inner join) — no null padding, no
 *   extra dates, no heavy loops. At most two light passes per series
 *   (one Set build for the timeline, one Map build for the merge).
 *
 *   Series contract (input):
 *     [
 *       { series_id: "USA.CPI.M", data: [{ date, value }, ...] },
 *       { series_id: "USA.GDP.Q", data: [{ date, value }, ...] }
 *     ]
 *
 *   Result shape:
 *     {
 *       merged: [
 *         { date: "2020-01", "USA.CPI.M": 2.1, "USA.GDP.Q": 5.1 },
 *         ...
 *       ]
 *     }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

class SeriesMerger {
  constructor() {
    // No state, no connections, no side effects.
  }

  /**
   * Builds the common sorted timeline — the INTERSECTION of every
   * series' dates (dates present in ALL series), sorted ascending.
   *
   * @param {Array} seriesArray - array of { series_id, data }
   * @returns {Array<string>}   - sorted common dates (empty when none)
   */
  buildTimeline(seriesArray) {
    this._guardSeriesArray(seriesArray);
    let common = null;
    for (const series of seriesArray) {
      const dates = new Set();
      const data = Array.isArray(series.data) ? series.data : [];
      for (const row of data) dates.add(row.date);
      if (common === null) {
        common = dates;
      } else {
        const keep = new Set();
        for (const date of common) {
          if (dates.has(date)) keep.add(date);
        }
        common = keep;
        if (common.size === 0) break;
      }
    }
    return common === null ? [] : Array.from(common).sort();
  }

  /**
   * Merges several series onto the common timeline (inner join). Each
   * output row carries the shared date plus one column per series_id.
   * No nulls, no extra dates, no heavy loops.
   *
   * @param {Array} seriesArray - array of { series_id, data }
   * @returns {object}          - standard JSON result ({ merged: [...] })
   */
  merge(seriesArray) {
    this._guardSeriesArray(seriesArray);
    const timeline = this.buildTimeline(seriesArray);
    if (timeline.length === 0) return { merged: [] };
    // One light Map per series: date → value for O(1) lookups.
    const lookup = seriesArray.map((series) => {
      const map = new Map();
      const data = Array.isArray(series.data) ? series.data : [];
      for (const row of data) map.set(row.date, row.value);
      return { series_id: series.series_id, map };
    });
    const merged = timeline.map((date) => {
      const row = { date };
      for (const { series_id, map } of lookup) {
        if (series_id != null) row[series_id] = map.get(date);
      }
      return row;
    });
    return { merged };
  }

  /**
   * Validates the input shape. Throws on a missing / non-array input.
   * No data processing happens here — no loops over series data.
   */
  _guardSeriesArray(seriesArray) {
    if (!Array.isArray(seriesArray)) {
      throw new Error("SeriesMerger expects an array of { series_id, data } objects");
    }
  }
}

module.exports = { SeriesMerger };

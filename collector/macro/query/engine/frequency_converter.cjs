"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/frequency_converter.cjs
 * Description:
 *   Frequency Converter — Phase 6 (Chalak / fast light build).
 *
 *   Real, light resampling for the frequencies that actually exist in
 *   the Chalak macro DB — A, Q, M. Every conversion is a single light
 *   pass over the data array (filter + relabel): no averaging, no
 *   interpolation, no regex, no heavy loops.
 *
 *     M → Q   keep only the last month of each quarter (e.g. 2020-03 → 2020-Q1)
 *     Q → A   keep only Q4 of each year            (e.g. 2020-Q4 → 2020)
 *     M → A   keep only December of each year      (e.g. 2020-12 → 2020)
 *     X → X   same-frequency passthrough (M → M, Q → Q, A → A)
 *
 *   Unrealistic conversions for the Chalak DB (D → M, W → M, ...) throw
 *   an Error — they are never silently filled.
 *
 *   Series contract (input & output):
 *     {
 *       series_id: "USA.CPI.M",            // id + source frequency
 *       frequency: "M",                    // D | W | M | Q | A
 *       data:      [{ date: "2020-01", value: 2.1 }, ...]
 *     }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

// Canonical frequency letters understood by this module.
// Phase 6 (Chalak): only the frequencies that really exist in the DB.
const SUPPORTED_FREQUENCIES = ["A", "Q", "M"];

// Frequency label → canonical letter (lightweight lookup, no loops).
const FREQUENCY_MAP = {
  D: "D",
  DAILY: "D",
  W: "W",
  WEEKLY: "W",
  M: "M",
  MONTH: "M",
  MONTHLY: "M",
  Q: "Q",
  QUARTER: "Q",
  QUARTERLY: "Q",
  A: "A",
  ANNUAL: "A",
  YEARLY: "A",
  Y: "A",
};

// Last month of each quarter → quarter label (light lookup, no date math).
const QUARTER_LAST_MONTH = {
  "03": "Q1",
  "06": "Q2",
  "09": "Q3",
  "12": "Q4",
};

class FrequencyConverter {
  constructor() {
    // No state, no connections, no side effects.
  }

  /**
   * Main entry point — picks the appropriate conversion method based on
   * the series' source frequency and the requested target frequency.
   *
   * @param {object} seriesObject      - { series_id, frequency, data }
   * @param {string} targetFrequency   - target frequency (M, Q, A)
   * @returns {object}                 - standard JSON result
   */
  convert(seriesObject, targetFrequency) {
    if (!seriesObject || typeof seriesObject !== "object") {
      throw new Error("convert() requires a series object { series_id, frequency, data }");
    }

    const sourceFrequency = this._normalizeFrequency(seriesObject.frequency);
    const target = this._normalizeFrequency(targetFrequency);

    if (!target) {
      throw new Error(`Unsupported target frequency: "${targetFrequency}"`);
    }
    if (!sourceFrequency) {
      return this._buildResult(
        seriesObject,
        target,
        null,
        `Unsupported source frequency: "${seriesObject.frequency}"`
      );
    }

    // Select the conversion method for the (source → target) pair.
    switch (`${sourceFrequency}->${target}`) {
      case "M->Q":
        return this.convertMonthlyToQuarterly(seriesObject);
      case "Q->A":
        return this.convertQuarterlyToAnnual(seriesObject);
      case "M->A":
        return this.convertMonthlyToAnnual(seriesObject);
      case "M->M":
      case "Q->Q":
      case "A->A":
        // Same frequency — passthrough, nothing to convert.
        return this._copySeries(seriesObject, target);
      default:
        // Unrealistic for the Chalak DB (D→M, W→M, Q→M, ...) → hard error.
        throw new Error(
          `Unsupported conversion: ${sourceFrequency} -> ${target} (Chalak DB supports A, Q, M only: M->Q, Q->A, M->A)`
        );
    }
  }

  /**
   * M → Q : keep only the last month of each quarter and relabel it to
   * the quarter period (Jan/Feb/Mar → Q1, ..., Oct/Nov/Dec → Q4).
   * e.g. "2020-03" → "2020-Q1". Single light pass, no averaging.
   *
   * @param {object} seriesObject - monthly series ({ series_id, frequency: "M", data })
   * @returns {object}            - standard JSON result
   */
  convertMonthlyToQuarterly(seriesObject) {
    const data = Array.isArray(seriesObject.data) ? seriesObject.data : [];
    const rows = [];
    for (const row of data) {
      const date = typeof row.date === "string" ? row.date : "";
      const quarter = QUARTER_LAST_MONTH[date.slice(5, 7)];
      if (quarter) rows.push({ date: `${date.slice(0, 4)}-${quarter}`, value: row.value });
    }
    return this._buildResult(seriesObject, "Q", rows);
  }

  /**
   * Q → A : keep only the fourth quarter of each year and relabel it to
   * the year period (e.g. "2020-Q4" → "2020"). Single light pass.
   *
   * @param {object} seriesObject - quarterly series ({ series_id, frequency: "Q", data })
   * @returns {object}            - standard JSON result
   */
  convertQuarterlyToAnnual(seriesObject) {
    const data = Array.isArray(seriesObject.data) ? seriesObject.data : [];
    const rows = [];
    for (const row of data) {
      const date = typeof row.date === "string" ? row.date : "";
      if (date.slice(5) === "Q4") rows.push({ date: date.slice(0, 4), value: row.value });
    }
    return this._buildResult(seriesObject, "A", rows);
  }

  /**
   * M → A : keep only December of each year and relabel it to the year
   * period (e.g. "2020-12" → "2020"). Single light pass.
   *
   * @param {object} seriesObject - monthly series ({ series_id, frequency: "M", data })
   * @returns {object}            - standard JSON result
   */
  convertMonthlyToAnnual(seriesObject) {
    const data = Array.isArray(seriesObject.data) ? seriesObject.data : [];
    const rows = [];
    for (const row of data) {
      const date = typeof row.date === "string" ? row.date : "";
      if (date.slice(5) === "12") rows.push({ date: date.slice(0, 4), value: row.value });
    }
    return this._buildResult(seriesObject, "A", rows);
  }

  /**
   * D → M : NOT implemented — the Chalak DB only holds A, Q, M data.
   * Unrealistic conversion → hard error (never silently produces data).
   */
  convertDailyToMonthly() {
    throw new Error("Unsupported conversion: D -> M (Chalak DB frequencies are A, Q, M only)");
  }

  /**
   * W → M : NOT implemented — the Chalak DB only holds A, Q, M data.
   * Unrealistic conversion → hard error (never silently produces data).
   */
  convertWeeklyToMonthly() {
    throw new Error("Unsupported conversion: W -> M (Chalak DB frequencies are A, Q, M only)");
  }

  // ------------------------------------------------------------
  // Internal helpers — structure only, no heavy processing
  // ------------------------------------------------------------

  /**
   * Same-frequency passthrough: returns the series with a normalized
   * frequency label; the data array is passed through untouched.
   */
  _copySeries(seriesObject, targetFrequency) {
    return {
      series_id: this._rewriteSeriesId(
        seriesObject.series_id,
        this._normalizeFrequency(seriesObject.frequency),
        targetFrequency
      ),
      frequency: targetFrequency,
      data: Array.isArray(seriesObject.data) ? seriesObject.data : [],
    };
  }

  /**
   * Builds the standard JSON result shape. In Phase 4A the data array
   * stays empty — Phase 4C fills it with the converted rows.
   */
  _buildResult(seriesObject, targetFrequency, data, error) {
    const sourceFrequency = this._normalizeFrequency(seriesObject.frequency);
    const result = {
      series_id: this._rewriteSeriesId(seriesObject.series_id, sourceFrequency, targetFrequency),
      frequency: targetFrequency,
      data: data || [],
    };
    if (error) result.error = error;
    return result;
  }

  /**
   * Rewrites the series id so its trailing frequency token matches the
   * target frequency ("USA.CPI.M" → "USA.CPI.Q"). If the id carries no
   * frequency token, the target token is appended.
   */
  _rewriteSeriesId(seriesId, fromFrequency, toFrequency) {
    if (typeof seriesId !== "string" || !seriesId) return seriesId;
    if (!fromFrequency) return seriesId; // unknown source — leave the id untouched
    const suffix = `.${fromFrequency}`;
    if (seriesId.toUpperCase().endsWith(suffix.toUpperCase())) {
      return seriesId.slice(0, seriesId.length - fromFrequency.length) + toFrequency;
    }
    return `${seriesId}.${toFrequency}`;
  }

  /**
   * Normalizes any supported frequency label to its canonical letter.
   * Returns null when the label is unknown.
   */
  _normalizeFrequency(frequency) {
    if (frequency == null) return null;
    const key = String(frequency).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(FREQUENCY_MAP, key) ? FREQUENCY_MAP[key] : null;
  }
}

module.exports = { FrequencyConverter };

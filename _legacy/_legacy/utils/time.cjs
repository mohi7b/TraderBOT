/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/utils/time.cjs
 * Description:
 *   Time utilities for Macro Collector.
 *   Features:
 *     - Convert timestamps to UTC ISO
 *     - Parse various date formats
 *     - Calculate day differences
 *     - Normalize release dates
 *     - Fully CJS (CommonJS)
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

/**
 * Convert any timestamp to UTC ISO format
 * Examples:
 *   "2024-01-15" → "2024-01-15T00:00:00Z"
 *   "2024/01/15" → "2024-01-15T00:00:00Z"
 *   "2024-01-15 14:30" → "2024-01-15T14:30:00Z"
 */
function toUTC(timestamp) {
  if (!timestamp) return null;

  // Already ISO
  if (timestamp.includes("T") && timestamp.endsWith("Z")) {
    return timestamp;
  }

  // Replace "/" with "-"
  let ts = timestamp.replace(/\//g, "-").trim();

  // If only date → add time
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    return ts + "T00:00:00Z";
  }

  // If date + time (no Z)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(ts)) {
    const [date, time] = ts.split(" ");
    return `${date}T${time}:00Z`;
  }

  // Fallback: let JS parse it
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;

  return d.toISOString();
}

/**
 * Extract date (YYYY-MM-DD) from UTC ISO
 */
function extractDate(utcIso) {
  if (!utcIso) return null;
  return utcIso.split("T")[0];
}

/**
 * Calculate difference in days between two UTC timestamps
 */
function diffDays(startUTC, endUTC) {
  if (!startUTC || !endUTC) return null;

  const start = new Date(startUTC);
  const end = new Date(endUTC);

  const diffMs = end - start;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Normalize release date from raw API formats
 * Examples:
 *   "2024-01-15" → "2024-01-15T00:00:00Z"
 *   "Jan 2024" → "2024-01-01T00:00:00Z"
 *   "Q1 2024" → "2024-03-31T00:00:00Z"
 */
function normalizeReleaseDate(raw) {
  if (!raw) return null;

  raw = raw.trim();

  // Case: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw + "T00:00:00Z";
  }

  // Case: Month YYYY (e.g., Jan 2024)
  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04",
    may: "05", jun: "06", jul: "07", aug: "08",
    sep: "09", oct: "10", nov: "11", dec: "12"
  };

  const parts = raw.toLowerCase().split(" ");
  if (parts.length === 2 && monthMap[parts[0]]) {
    const year = parts[1];
    const month = monthMap[parts[0]];
    return `${year}-${month}-01T00:00:00Z`;
  }

  // Case: Q1 2024
  if (/^q[1-4] \d{4}$/i.test(raw)) {
    const [q, year] = raw.split(" ");
    const quarter = q.toLowerCase();

    const endMap = {
      q1: "03-31",
      q2: "06-30",
      q3: "09-30",
      q4: "12-31"
    };

    return `${year}-${endMap[quarter]}T00:00:00Z`;
  }

  // Fallback: try to parse
  return toUTC(raw);
}

module.exports = {
  toUTC,
  extractDate,
  diffDays,
  normalizeReleaseDate
};

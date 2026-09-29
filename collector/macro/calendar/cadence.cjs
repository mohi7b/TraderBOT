// ============================================================
// Macro Calendar — cadence rules (per-source cadence + anchor)
// File: collector/macro/calendar/cadence.cjs
//
// Single place describing "when each source publishes". cadence
// (daily/weekly/monthly) comes from the central config.cjs =
// SOURCES.<SRC>.cadence. Here we add default poll/update window
// (anchor + windowMs) for sources that publish on a schedule but
// have no explicit per-series release calendar.
//
// Consumed by calendar/is-due.cjs (and possibly update-light).
// ============================================================
const { SOURCES } = require("../config/config.cjs");

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Default anchor/window for a cadence if not provided per source.
 * - daily  : check every day, window 6h (so publish-later still found next run)
 * - weekly : check on Monday, window 1 day
 * - monthly: check on 1st day of month, window 2 days
 */
function defaultRuleFor(cadence) {
  switch (cadence) {
    case "daily":
      return { anchor: "daily", windowMs: 6 * 60 * 60 * 1000 };
    case "weekly":
      return { anchor: "weekly-monday", windowMs: 1 * DAY_MS };
    case "monthly":
      return { anchor: "monthly-day1", windowMs: 2 * DAY_MS };
    default:
      return { anchor: "daily", windowMs: DAY_MS };
  }
}

/** Build a full schedule model for all macro sources. */
function buildCalendarModel(extra = {}) {
  const order = ["FRED", "OECD", "EUROSTAT", "IMF", "BIS", "WORLD_BANK"];
  const output = {};
  for (const srcKey of order) {
    const base = SOURCES[srcKey];
    const cadence = base?.cadence || "daily";
    const ext = extra[srcKey] || {};
    output[srcKey] = {
      cadence,
      name: base?.name || srcKey,
      ...defaultRuleFor(cadence),
      ...ext, // allow per-source override of windowMs/anchor
    };
  }
  return output;
}

/**
 * Return the anchor weekday index for "weekly-monday" (1=Monday..7=Sunday).
 * Returns null for cadences that are not week-anchored.
 */
function anchorDayFor(rule) {
  if (rule.anchor === "weekly-monday") return 1; // Monday
  if (rule.anchor === "daily") return null;
  if (rule.anchor === "monthly-day1") return 1; // day-of-month placeholder
  return null;
}

module.exports = { buildCalendarModel, defaultRuleFor, anchorDayFor, DAY_MS, WEEK_MS };

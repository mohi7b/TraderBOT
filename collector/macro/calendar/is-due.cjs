// ============================================================
// Macro Calendar — isDue(source, ctx)
// File: collector/macro/calendar/is-due.cjs
//
// Decides whether a source is due for a poll/update based on its
// cadence rule (from cadence.cjs) and the last time it was checked.
// Replaces the ad-hoc isDue in update_live.cjs with a testable,
// calendar-aware version.
//
// isDue(source, { lastCheckMs, nowMs=Date.now(), extra })
//   -> true  if due
//   -> false otherwise
//
// Rules:
//   daily        : due when more than windowMs passed.
//   weekly-monday: due on a Monday if last check older than windowMs OR anchor day.
//   monthly-day1 : due near start-of-month when last check older than windowMs.
// ============================================================
const { buildCalendarModel } = require("./cadence.cjs");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Is the given source due according to its cadence rule? */
function isDue(source, { lastCheckMs = 0, nowMs = Date.now(), model = null, extra = {} } = {}) {
  const cal = model || buildCalendarModel(); // single build per call (cheap)
  const rule = cal[source];
  if (!rule) return false;

  const since = nowMs - (lastCheckMs > 0 ? lastCheckMs : 0);
  const windowMs = rule.windowMs || DAY_MS;

  // Primary rule: enough time passed since last check.
  if (since >= windowMs) return true;

  // Secondary: anchor-day trigger (so a daily/weekly still runs even if
  // window not fully elapsed but it's the anchor time of a new cycle).
  const d = new Date(nowMs);
  const weekday = d.getDay(); // 0=Sun..6=Sat; our anchor 1=Mon
  const normalizedWeekday = weekday === 0 ? 7 : weekday;
  if (rule.cadence === "weekly" || rule.anchor === "weekly-monday") {
    if (normalizedWeekday === 1) return true; // Monday always allows weekly refresh
  }
  if (rule.cadence === "monthly" || rule.anchor === "monthly-day1") {
    if (d.getDate() <= 2) return true; // 1st–2nd of month refresh window
  }
  return false;
}

/**
 * Compute the next "due date" for informational purposes.
 * Returns epoch-ms. For daily = now+window, etc. light helper.
 */
function nextDueMs(source, { lastCheckMs = 0, model = null } = {}) {
  const cal = model || buildCalendarModel();
  const rule = cal[source];
  const windowMs = (rule && rule.windowMs) || DAY_MS;
  return (lastCheckMs > 0 ? lastCheckMs : Date.now()) + windowMs;
}

module.exports = { isDue, nextDueMs };

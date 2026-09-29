// ============================================================
// Macro Calendar — public index
// File: collector/macro/calendar/index.cjs
// ============================================================
const { buildCalendarModel, defaultRuleFor, anchorDayFor } = require("./cadence.cjs");
const { isDue, nextDueMs } = require("./is-due.cjs");

module.exports = {
  buildCalendarModel,
  defaultRuleFor,
  anchorDayFor,
  isDue,
  nextDueMs,
};

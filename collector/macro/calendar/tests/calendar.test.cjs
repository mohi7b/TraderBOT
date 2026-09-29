// Calendar logic tests (pure, no DB). Run: node calendar/tests/calendar.test.cjs
const assert = require("node:assert/strict");
const { buildCalendarModel, anchorDayFor } = require("../cadence.cjs");
const { isDue, nextDueMs } = require("../is-due.cjs");

(function main() {
  // buildCalendarModel returns all 6 with cadence from config.
  const m = buildCalendarModel();
  assert.equal(Object.keys(m).length, 6, "six sources expected");
  assert.equal(m.FRED.cadence, "daily");
  assert.equal(m.IMF.cadence, "weekly");
  assert.equal(m.WORLD_BANK.cadence, "monthly");

  // anchorDayFor
  assert.equal(anchorDayFor(m.IMF), 1); // weekly-monday
  assert.equal(anchorDayFor(m.FRED), null); // daily

  const now = Date.now();

  // isDue when never checked (lastCheck=0) -> true (daily FRED window small)
  assert.equal(isDue("FRED", { model: m }), true);

  // freshly checked daily source, 1 min ago -> not due
  const oneMinAgo = now - 60 * 1000;
  assert.equal(isDue("FRED", { model: m, lastCheckMs: oneMinAgo, nowMs: now }), false);

  // daily source, last check 1 day ago window> elapses -> due
  const dayAgo = now - 24 * 3600 * 1000;
  assert.equal(isDue("FRED", { model: m, lastCheckMs: dayAgo, nowMs: now }), true);

  // nextDueMs
  const nd = nextDueMs("FRED", { model: m, lastCheckMs: oneMinAgo, nowMs: now });
  assert.ok(nd > now);

  console.log("calendar tests passed (6 sources / cadence / isDue / nextDueMs)");
})();

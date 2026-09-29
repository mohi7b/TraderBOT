// Release-window engine tests (pure, no DB). Run: node calendar/tests/window.test.cjs
const assert = require("node:assert/strict");
const {
  MINUTE_MS,
  windowBounds,
  windowState,
  nextPollDelayMs,
  decideOutcome,
} = require("../window.cjs");

(function main() {
  const T0 = Date.UTC(2026, 8, 6, 12, 0, 0); // 2026-09-06 12:00 UTC

  // --- FRED: non-polling, 5-minute window -------------------------------
  const fred = windowBounds(T0, "FRED");
  assert.equal(fred.start, T0, "FRED start = scheduled (offset 0)");
  assert.equal(fred.end, T0 + 5 * MINUTE_MS, "FRED end = +5m");
  assert.equal(windowState(T0, "FRED", T0 - 1), "before", "before window");
  assert.equal(windowState(T0, "FRED", T0 + 4 * MINUTE_MS), "inside", "inside window");
  assert.equal(windowState(T0, "FRED", T0 + 6 * MINUTE_MS), "after", "after window");
  assert.equal(nextPollDelayMs(T0, "FRED", T0), null, "FRED is not polling");

  // FRED outcome: non-polling -> single run inside window.
  assert.deepEqual(decideOutcome(T0, "FRED", T0 - 1), { action: "wait" });
  assert.deepEqual(decideOutcome(T0, "FRED", T0 + 1 * MINUTE_MS), { action: "run" });
  assert.deepEqual(decideOutcome(T0, "FRED", T0 + 6 * MINUTE_MS, true), { action: "release" });
  assert.deepEqual(decideOutcome(T0, "FRED", T0 + 6 * MINUTE_MS, false), { action: "miss" });

  // --- OECD: polling, 120-minute window, interval 15m -------------------
  const oecd = windowBounds(T0, "OECD");
  assert.equal(oecd.end, T0 + 120 * MINUTE_MS, "OECD end = +120m");
  assert.equal(windowState(T0, "OECD", T0 + 60 * MINUTE_MS), "inside", "OECD inside at +60m");
  assert.equal(nextPollDelayMs(T0, "OECD", T0 + 60 * MINUTE_MS), 15 * MINUTE_MS, "OECD next poll = 15m");
  // near the end the delay is clamped so the last attempt lands on window_end.
  assert.equal(nextPollDelayMs(T0, "OECD", T0 + 118 * MINUTE_MS), 2 * MINUTE_MS, "OECD clamp to window end");
  assert.equal(nextPollDelayMs(T0, "OECD", T0 + 121 * MINUTE_MS), null, "OECD no poll after end");

  // OECD outcome: polling -> "poll" inside, miss/release after.
  assert.deepEqual(decideOutcome(T0, "OECD", T0 + 10 * MINUTE_MS), { action: "poll" });
  assert.deepEqual(decideOutcome(T0, "OECD", T0 + 121 * MINUTE_MS, false), { action: "miss" });
  assert.deepEqual(decideOutcome(T0, "OECD", T0 + 121 * MINUTE_MS, true), { action: "release" });

  // --- EUROSTAT: polling + fallback "html" ------------------------------
  assert.equal(windowForFallback("EUROSTAT"), "html", "EUROSTAT fallback = html");
  assert.equal(windowForFallback("FRED"), null, "FRED fallback = null");

  // --- unknown source uses the safe default window ----------------------
  const unk = windowBounds(T0, "NOT_A_SOURCE");
  assert.equal(unk.end, T0 + 5 * MINUTE_MS, "unknown source -> default +5m window");

  console.log("window tests passed (bounds/state/poll/clamp/outcome/default)");
})();

// Tiny local helper mirroring calendar-config.windowFor().fallback for assertions.
function windowForFallback(source) {
  const { windowFor } = require("../calendar-config.cjs");
  return windowFor(source).fallback;
}

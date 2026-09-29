// ============================================================
// Macro Calendar — release window engine (pure)
// File: collector/macro/calendar/window.cjs
//
// Pure release-window logic (no DB, no network). It consumes the
// release_windows config from calendar-config.cjs and answers:
//   * what are the window bounds for a scheduled release?
//   * are we before / inside / after that window right now?
//   * how long until the next poll attempt (polling sources only)?
//   * what should the engine do next (wait / run / poll / release / miss)?
//
// Kept free of update/* and DB deps so it can be unit-tested in isolation.
//
// Window model (prampt1.txt §2):
//   window_start = scheduled_time + start_offset_minutes
//   window_end   = scheduled_time + end_offset_minutes
// ============================================================
const { windowFor } = require("./calendar-config.cjs");

const MINUTE_MS = 60 * 1000;

/** Compute { start, end, config } epoch-ms bounds for a scheduled release. */
function windowBounds(scheduledTimeMs, source) {
  const cfg = windowFor(source);
  const t = Number(scheduledTimeMs);
  const start = t + (cfg.start_offset_minutes || 0) * MINUTE_MS;
  const end = t + (cfg.end_offset_minutes || 0) * MINUTE_MS;
  return { start, end, config: cfg };
}

/** "before" | "inside" | "after" relative to the release window. */
function windowState(scheduledTimeMs, source, nowMs = Date.now()) {
  const { start, end } = windowBounds(scheduledTimeMs, source);
  if (nowMs < start) return "before";
  if (nowMs <= end) return "inside";
  return "after";
}

/**
 * Delay (ms) until the next poll attempt for a polling source, or null when
 * polling is disabled or the window has already closed. Never overshoots the
 * window end (the last attempt lands exactly on window_end).
 */
function nextPollDelayMs(scheduledTimeMs, source, nowMs = Date.now()) {
  const { end, config } = windowBounds(scheduledTimeMs, source);
  if (!config.polling) return null;
  if (nowMs >= end) return null;
  const interval = (config.poll_interval_minutes || 15) * MINUTE_MS;
  const remaining = end - nowMs;
  return interval < remaining ? interval : remaining;
}

/**
 * Decide the engine's next action for a scheduled release.
 *   action: "wait" (before window) | "run" (single attempt, non-polling) |
 *           "poll" (attempt + retry until window_end) |
 *           "release" (data received) | "miss" (window closed, no data)
 */
function decideOutcome(scheduledTimeMs, source, nowMs = Date.now(), gotData = false) {
  const state = windowState(scheduledTimeMs, source, nowMs);
  if (state === "before") return { action: "wait" };
  const { config } = windowBounds(scheduledTimeMs, source);
  if (state === "inside") return { action: config.polling ? "poll" : "run" };
  return { action: gotData ? "release" : "miss" };
}

module.exports = {
  MINUTE_MS,
  windowBounds,
  windowState,
  nextPollDelayMs,
  decideOutcome,
};

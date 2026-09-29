// ============================================================
// Macro Calendar — pure scheduler (timing reference only)
// File: collector/macro/calendar/scheduler.cjs
//
// The ONE timing engine shared by update_live and tests:
//   * dueSourcesFromCalendar(nowMs, dbPath?) -> which sources are DUE now
//     based solely on scheduled rows in release_events.
//   * markReleasedThrough(source, cutoffIso, dbPath?) -> close a due window
//     once the engine has picked it up.
//   * cadenceLabelFor(source) -> display-only label.
//
// It intentionally depends on nothing from update/* pipelines, so it can be
// unit-tested in isolation with a temp releases.db (no network, no heavy libs).
// ============================================================
const calStore = require("./store.cjs");
const Mk = require("./maketime.cjs");

/** Cadence label purely for informational logs (cadence-only stores their rule). */
function cadenceLabelFor(source) {
  const cm = Mk.CADENCE_SOURCES.find((c) => c.source === source);
  return cm ? cm.cadence : "explicit";
}

/**
 * Sources whose unified calendar has a *scheduled* event whose release_ts_ms is
 * on/before `nowMs` (i.e. due now). Ordering is by the soonest event, so we run
 * the nearest macro release first. Cadence-only sources appear here, too — their
 * rows are produced by calendar/maketime — so scheduling is 100% event-driven.
 * @param {number} nowMs
 * @param {string} [dbPath] optional store path (default releases.db). Useful for
 *   isolated engine tests.
 * @returns {Array<{source:string, cadence:string, dueIso:string, dueTs:number}>}
 */
function dueSourcesFromCalendar(nowMs = Date.now(), dbPath) {
  const db = calStore.openStore(dbPath);
  try {
    const rows = db
      .prepare(
        "SELECT source, release_date, release_ts_ms FROM release_events " +
          "WHERE status='scheduled' AND release_ts_ms IS NOT NULL AND release_ts_ms <= ? " +
          "ORDER BY release_ts_ms ASC"
      )
      .all(nowMs);
    const bySource = new Map();
    for (const r of rows) {
      if (!bySource.has(r.source)) {
        bySource.set(r.source, {
          source: r.source,
          cadence: cadenceLabelFor(r.source),
          dueIso: r.release_date,
          dueTs: r.release_ts_ms,
        });
      }
    }
    return [...bySource.values()].sort((a, b) => a.dueTs - b.dueTs);
  } finally {
    calStore.close(db);
  }
}

/**
 * Move passed/due release rows of a source to 'released' ONLY once the engine has
 * picked them up (the unified past-window is closed). Keeping them 'scheduled'
 * until then lets a same-day re-invocation intentionally no-op into the pipeline.
 */
function markReleasedThrough(source, cutoffIso, dbPath) {
  const db = calStore.openStore(dbPath);
  try {
    const info = db
      .prepare(
        "UPDATE release_events SET status='released', updated_at=? " +
          "WHERE source=? AND status='scheduled' AND release_date <= ?"
      )
      .run(new Date().toISOString(), source, cutoffIso);
    return info.changes;
  } finally {
    calStore.close(db);
  }
}

/**
 * Mark a source's due (still scheduled) release rows as 'missed' when its release
 * window closed without data (prampt1.txt §2.4). Mirrors markReleasedThrough.
 */
function markMissedThrough(source, cutoffIso, dbPath) {
  const db = calStore.openStore(dbPath);
  try {
    const info = db
      .prepare(
        "UPDATE release_events SET status='missed', updated_at=? " +
          "WHERE source=? AND status='scheduled' AND release_date <= ?"
      )
      .run(new Date().toISOString(), source, cutoffIso);
    return info.changes;
  } finally {
    calStore.close(db);
  }
}

module.exports = { cadenceLabelFor, dueSourcesFromCalendar, markReleasedThrough, markMissedThrough };

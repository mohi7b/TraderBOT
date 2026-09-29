// ============================================================
// Non-windowed miss test — covers prampt1 §2.4 behaviour for the
// --source / --force paths (which bypass the looping window engine).
// File: collector/macro/calendar/tests/nonwindow_miss.test.cjs
// Run:  node calendar/tests/nonwindow_miss.test.cjs
//
// Goal: when a MANUAL/forced run finishes for a target that references a real
// scheduled release whose window has ALREADY closed and no fresh data arrived,
// the engine must surface it as a MISSED_EVENT (instead of dropping silently).
// update_live exports a PURE decision for that rule (`shouldMarkMissed`); here we
// verify the rule across window states and then replay the real mark path
// (markMissedThrough + recordError) on a temp DB to prove the record lands.
// ============================================================
const assert = require("node:assert/strict");
const store = require("../store.cjs");
const eng = require("../scheduler.cjs");
const { windowState } = require("../window.cjs");
const upd = require("../../update/update_live.cjs");
const { shouldMarkMissed } = upd;

const MINUTE_MS = 60 * 1000;
// Fixed, realistic scheduled time far from any "today" so the test never flakes.
const SCHEDULED = Date.UTC(2031, 5, 3, 12, 0, 0); // 2031-06-03T12:00Z
const ISO = "2031-06-03";

/** Fake pipeline résults (mirror shapes update_live emits). */
const NO_DATA = { status: "no_new_data", dataReceived: false };
const RECEIVED = { status: "updated", dataReceived: true };

function target(source, dueTs, dueIso) {
  return { source, cadence: "explicit", dueTs, dueIso };
}

// ---------------------------------------------------------------
// 1) PURE DECISION across window states (OECD: window = +0..120m)
// ---------------------------------------------------------------
(function testDecision() {
  const source = "OECD";
  // window_end = SCHEDULED + 120m
  const afterMs = SCHEDULED + 121 * MINUTE_MS;   // outside window_end  -> "after"
  const insideMs = SCHEDULED + 60 * MINUTE_MS;   // between start & end -> "inside"
  const beforeMs = SCHEDULED - MINUTE_MS;         // before window open  -> "before"

  const t = target(source, SCHEDULED, ISO);

  // No data + window closed  -> MISSED (the whole point).
  assert.equal(windowState(SCHEDULED, source, afterMs), "after");
  assert.equal(shouldMarkMissed(source, t, NO_DATA, afterMs), true,
    "miss when window closed and no fresh data");

  // No data but window still open -> NOT missed yet (inside → will run/poll).
  assert.equal(windowState(SCHEDULED, source, insideMs), "inside");
  assert.equal(shouldMarkMissed(source, t, NO_DATA, insideMs), false,
    "not missed while window inside");

  // No data but window not yet open -> NOT missed.
  assert.equal(windowState(SCHEDULED, source, beforeMs), "before");
  assert.equal(shouldMarkMissed(source, t, NO_DATA, beforeMs), false,
    "not missed before window opens");

  // Data WAS received, even after the window closed -> NOT missed (it is a release).
  assert.equal(shouldMarkMissed(source, t, RECEIVED, afterMs), false,
    "data received means release, not miss");

  // No real scheduled ts (manual --source=BIS with no due event) -> never miss.
  assert.equal(shouldMarkMissed(source, target(source, null, null), NO_DATA, afterMs), false,
    "no scheduled ts => cannot reason about a window => not missed");

  // Non-polling source behaves the same way.
  assert.equal(shouldMarkMissed("FRED", target("FRED", SCHEDULED, ISO), NO_DATA, SCHEDULED + 6 * MINUTE_MS), true,
    "FRED non-polling miss after its +5m window closes");
  console.log("  ok  1) pure decision (after=miss, inside/before/data-received/no-ts etc.)");
})();

// ---------------------------------------------------------------
// 2) REAL MARK PATH on a temp DB — verify a MISSED_EVENT lands.
// ---------------------------------------------------------------
(function testMarkRecorded() {
  const dir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "nonwinmiss-"));
  const dbPath = require("path").join(dir, "releases.db");
  try {
    const db = store.openStore(dbPath);
    // Reinsert a scheduled OECD release that now sits BEFORE its due (in the past)
    // so the engine would report it as due only when its window is also closed.
    store.upsertEvents(db, [{ source: "OECD", event_label: "OECD monthly update",
      release_date: ISO, release_time: "12:00", status: "scheduled", release_ts_ms: SCHEDULED }]);
    store.close(db);

    // Engines sees it due (release_ts_ms < now) — we pick now WELL after window end.
    const nowMs = SCHEDULED + 121 * MINUTE_MS;
    const due = eng.dueSourcesFromCalendar(nowMs, dbPath);
    assert.equal(due.length, 1, "due source returned from calendar");

    const t0 = due[0];
    const res = NO_DATA; // pipeline completed but published no fresh data
    assert.equal(dataReceivedOf(res), false);

    // Replay exactly what the non-windowed path in update_live does for a real
    // scheduled (due) release that finished with no data after its window closed:
    const willMiss = shouldMarkMissed(t0.source, t0, res, nowMs);
    assert.equal(willMiss, true, "force/source path decides to mark this run missed");

    if (willMiss) {
      eng.markMissedThrough(t0.source, t0.dueIso, dbPath);
      const db2 = store.openStore(dbPath);
      store.recordError(db2, {
        error_code: "MISSED_EVENT",
        source: t0.source,
        event_id: t0.dueIso,
        details: "release window closed without data",
      });
      // read back + assert
      const errs = store.listErrors(db2, { error_code: "MISSED_EVENT" });
      assert.equal(errs.length, 1, "one MISSED_EVENT recorded");
      assert.equal(errs[0].source, "OECD");
      assert.equal(errs[0].event_id, ISO);
      const row = db2.prepare("SELECT status FROM release_events WHERE source='OECD'").get();
      assert.equal(row.status, "missed", "release event flipped to missed");
      store.close(db2);
    }
    console.log("  ok  2) real path marks release missed + records MISSED_EVENT (temp db)");
  } finally {
    try { require("fs").rmSync(dir, { recursive: true, force: true }); } catch {}
  }
})();

function dataReceivedOf(res) {
  return !!(res && (res.dataReceived === true || res.status === "updated"));
}

console.log("nonwindow miss tests passed (pure decision / real mark+record)");

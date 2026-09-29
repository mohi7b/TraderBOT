// ============================================================
// E2E — force/source path: "window closed, no data" flows all the
// way out to the HTTP GET /macro/errors endpoint.
// File: collector/macro/calendar/tests/macro_errors_e2e.test.cjs
// Run:  node calendar/tests/macro_errors_e2e.test.cjs
//
// End-to-end (still offline) using ONLY real production pieces wired exactly
// as update_live executes them on the non-windowed (--source / --force) path:
//   scheduler.dueSourcesFromCalendar → (pure) shouldMarkMissed decision →
//   scheduler.markMissedThrough + store.recordError(MISSED_EVENT) → HTTP GET.
// Everything runs against one throwaway DB, so the shared releases.db is never
// read or written during the scenario.
// ============================================================
const assert = require("node:assert/strict");
const store = require("../store.cjs");
const eng = require("../scheduler.cjs");
const upd = require("../../update/update_live.cjs");
const { newDb, cleanUp, withApi, getJson } = require("./api_helpers.cjs");

const MINUTE_MS = 60 * 1000;
// A scheduled OECD release stuck far back in time so any "now" is after window.
const SCHEDULED = Date.UTC(2032, 1, 9, 8, 0, 0); // 2032-02-09T08:00Z
const ISO = "2032-02-09";
const NOW_AFTER_WINDOW = SCHEDULED + 121 * MINUTE_MS; // beyond OECD +120m window

(async function e2e() {
  const t = newDb("e2e");
  try {
    // -- Phase 1: a scheduled OECD release whose window is (now) closed ------
    const db = store.openStore(t.dbPath);
    store.upsertEvents(db, [{
      source: "OECD", event_label: "OECD monthly update",
      release_date: ISO, release_time: "08:00", status: "scheduled", release_ts_ms: SCHEDULED,
    }]);
    store.close(db);

    // -- Phase 2: what the non-windowed engine sees as due, and decides -------
    const due = eng.dueSourcesFromCalendar(NOW_AFTER_WINDOW, t.dbPath);
    assert.equal(due.length, 1, "e2e: one due OECD source reported by the scheduler");
    const t0 = due[0];
    const noFreshData = { status: "no_new_data", dataReceived: false };
    const willMiss = upd.shouldMarkMissed(t0.source, t0, noFreshData, NOW_AFTER_WINDOW);
    assert.equal(willMiss, true, "e2e: window closed + no data  =>  should be marked missed");

    // -- Phase 3: perform the production mark (status + structured error) -----
    eng.markMissedThrough(t0.source, t0.dueIso, t.dbPath);
    const db2 = store.openStore(t.dbPath);
    store.recordError(db2, {
      error_code: "MISSED_EVENT", source: t0.source, event_id: t0.dueIso,
      details: "release window closed without data (force/source path)",
    });
    const row = db2.prepare("SELECT status FROM release_events WHERE source='OECD'").get();
    assert.equal(row.status, "missed", "e2e: release event now status=missed in the DB");
    store.close(db2);

    // -- Phase 4: that recorded error must surface through the HTTP API -------
    await withApi(t.dbPath, async (base) => {
      const all = await getJson(base + "/errors?source=OECD");
      assert.equal(all.status, 200);
      assert.equal(all.body.errors.length, 1, "e2e: OECD MISSED_EVENT visible via HTTP");
      assert.equal(all.body.errors[0].error_code, "MISSED_EVENT");
      assert.equal(all.body.errors[0].event_id, ISO);
      assert.match(all.body.errors[0].details, /window closed without data/);
    });
    console.log("e2e passed: closed-window miss recorded by engine surfaces via GET /macro/errors");
  } finally {
    cleanUp(t.dir);
  }
})().catch((e) => { console.error("e2e FAILED:\n" + (e && e.stack || e)); process.exitCode = 1; });

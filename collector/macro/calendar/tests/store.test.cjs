// Store test (pure, temp DB, no network, no production data).
// Run: node calendar/tests/store.test.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");
const store = require("../store.cjs");

(function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "macro-cal-"));
  const dbPath = path.join(tmp, "releases.db");
  const db = store.openStore(dbPath);

  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const evs = [
    { source: "FRED", category: "inflation", event_label: "CPI", country: "USA", release_date: future, release_time: "08:30", source_url: "https://fred.stlouisfed.org", status: "scheduled" },
    { source: "BIS", category: "banking", event_label: "Consolidated banking", country: null, release_date: future, status: "scheduled" },
  ];
  const n = store.upsertEvents(db, evs);
  assert.equal(n, 2, "upsert 2 inserts");

  // release_ts_ms is derived at insert time from date(+time), aligned to UTC:
  // CPI at 08:30 UTC, BIS (no time -> date-only default) at 00:00 UTC.
  const [y, mo, d] = String(future).split("-").map(Number);
  assert.equal(store.computeReleaseTsMs(evs[0]), Date.UTC(y, mo - 1, d, 8, 30, 0), "ts honors release_time 08:30 UTC");
  assert.equal(store.computeReleaseTsMs(evs[1]), Date.UTC(y, mo - 1, d, 0, 0, 0), "ts date-only => 00:00 UTC");

  const row0 = db.prepare("SELECT * FROM release_events WHERE event_label='CPI'").get();
  assert.ok(Number.isInteger(row0.release_ts_ms), "CPI row has integer release_ts_ms");
  assert.equal(row0.release_ts_ms, Date.UTC(y, mo - 1, d, 8, 30, 0), "stored CPI ts matches 08:30 UTC");
  const row1 = db.prepare("SELECT * FROM release_events WHERE event_label='Consolidated banking'").get();
  assert.equal(row1.release_ts_ms, Date.UTC(y, mo - 1, d, 0, 0, 0), "stored BIS ts matches 00:00 UTC");

  // re-upsert same -> conflict update, no duplicate; changes still counted 2
  const n2 = store.upsertEvents(db, evs);
  assert.equal(n2, 2, "idempotent update changes=2");

  const all = store.listEvents(db, { from: today });
  assert.equal(all.length, 2, "2 events after list");

  // past is rolled to released
  const past = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
  store.upsertEvents(db, [{ source: "FRED", event_label: "OLD", release_date: past, status: "scheduled" }]);
  const changed = store.rollPastToReleased(db);
  assert.ok(changed >= 1, "rolled 1 past event to released");
  // To see released (past) rows you must pass an explicit lower bound (default is from-today).
  const released = store.listEvents(db, { status: "released", from: "1970-01-01" });
  assert.ok(released.some((e) => e.event_label === "OLD"), "old is released");

  store.purgeBefore(db, 0); // drop all released (for our old test) but keep future
  const afterPurge = store.listEvents(db, { from: today });
  assert.equal(afterPurge.length, 2, "purge kept the 2 future scheduled");

  // Legacy-migration path: a DB created BEFORE release_ts_ms existed (no such
  // column) must be upgraded + its existing rows backfilled automatically by
  // openStore(). Simulate it on an isolated file.
  const legPath = path.join(tmp, "legacy.db");
  const Database = require("better-sqlite3");
  {
    const legOld = new Database(legPath);
    legOld.exec(`
      CREATE TABLE release_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL, category TEXT, event_label TEXT NOT NULL,
        country TEXT, release_date TEXT NOT NULL, release_time TEXT,
        source_url TEXT, status TEXT NOT NULL DEFAULT 'scheduled',
        revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
      );
    `);
    legOld.prepare(`INSERT INTO release_events (source,event_label,release_date,status,updated_at)
                    VALUES ('FRED','Legacy CPI','2026-12-10','scheduled',datetime('now'))`).run();
    legOld.close();
  }
  const legDB = store.openStore(legPath); // should ALTER + index + backfill
  const legRow = legDB.prepare("SELECT id,release_ts_ms FROM release_events WHERE event_label='Legacy CPI'").get();
  assert.ok(Number.isInteger(legRow.release_ts_ms), "legacy row got backfilled ts");
  assert.equal(legRow.release_ts_ms, Date.UTC(2026, 11, 10, 0, 0, 0), "legacy backfill is 00:00 UTC of its date");
  store.close(legDB);

  store.close(db);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("store tests passed (insert/upsert/idempotent/roll/purge/migrate+backfill+ts)");
})();

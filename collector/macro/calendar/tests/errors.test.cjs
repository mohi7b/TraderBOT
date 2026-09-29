// Error store tests (pure, temp DB, no network). Run: node calendar/tests/errors.test.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");
const store = require("../store.cjs");

(function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "macro-err-"));
  const dbPath = path.join(tmp, "releases.db");
  const db = store.openStore(dbPath);

  // macro_errors table exists
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='macro_errors'").get();
  assert.ok(table, "macro_errors table created");

  // record + list (most recent first)
  const n = store.recordErrors(db, [
    { error_code: "MISSED_EVENT", source: "FRED", event_id: "ev-1", details: "no data" },
    { error_code: "EMPTY_JSON", source: "EUROSTAT", details: "empty body" },
  ]);
  assert.equal(n, 2, "recordErrors inserts 2");

  const all = store.listErrors(db, { limit: 10 });
  assert.equal(all.length, 2, "listErrors returns 2");
  assert.equal(all[0].error_code, "EMPTY_JSON", "most recent first");

  const onlyFred = store.listErrors(db, { source: "FRED" });
  assert.equal(onlyFred.length, 1, "filter by source");
  assert.equal(onlyFred[0].event_id, "ev-1", "event_id preserved");
  assert.ok(onlyFred[0].timestamp, "timestamp auto-set");

  // rollPastToReleased must NOT overwrite 'missed' rows back to 'released'
  const past = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
  store.upsertEvents(db, [
    { source: "FRED", event_label: "MISSED_CPI", release_date: past, status: "missed" },
    { source: "FRED", event_label: "OLD_CPI", release_date: past, status: "scheduled" },
  ]);
  store.rollPastToReleased(db);
  const missedRow = db.prepare("SELECT status FROM release_events WHERE event_label='MISSED_CPI'").get();
  const oldRow = db.prepare("SELECT status FROM release_events WHERE event_label='OLD_CPI'").get();
  assert.equal(missedRow.status, "missed", "missed row stays missed");
  assert.equal(oldRow.status, "released", "scheduled past row -> released");

  store.close(db);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("error store tests passed (table/record/list/filter/missed-preserve)");
})();

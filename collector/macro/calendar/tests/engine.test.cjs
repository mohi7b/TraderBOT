// ============================================================
// Engine scheduler tests — pure & isolated (temp DBs, no network
// except one optional LIVE probe that self-skips when offline).
// File: collector/macro/calendar/tests/engine.test.cjs
// Run:  node calendar/tests/engine.test.cjs
//
// Covers:
//   1. run-once behaviour (event picked + marked released -> not re-run)
//   2. engine behaviour over a 24h window (same-day vs next-day events)
//   3. behaviour on a day with NO due events (idle)
//   4. behaviour on a day with MULTIPLE due events (all, nearest-first)
//   5. cadence sources (OECD/IMF/WORLD_BANK -> maketime rows picked by engine)
//   6. fallback parser (official eventsJson empty -> SSR Euro-indicators page)
// ============================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");

const store = require("../store.cjs");
// scheduler is pipeline-independent (pure timing) -> tests stay isolated.
const eng = require("../scheduler.cjs");
const Mk = require("../maketime.cjs");
const sync = require("../sync.cjs");

const DAY = 24 * 60 * 60 * 1000;
// Deterministic "today" far from host clock so tests never flake.
const BASE = Date.UTC(2030, 0, 10, 9, 30, 0); // 2030-01-10T09:30Z

function isoAt(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function addIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
/** A release row whose timestamp is exactly the ISO midnight (like real sync). */
function mk(source, event_label, iso, status = "scheduled") {
  return { source, event_label, release_date: iso, release_time: "00:00", status };
}
function newDb(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `engine-${tag}-`));
  return { dir, dbPath: path.join(dir, "releases.db") };
}
function cleanUp(dbDir) {
  try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------
// 1) RUN-ONCE: due event picked -> released -> not re-picked.
// ---------------------------------------------------------------
(function testRunOnce() {
  const t = newDb("runonce");
  const d0 = isoAt(BASE - DAY); // yesterday (scheduled, ts in past) => due now
  const db = store.openStore(t.dbPath);
  store.upsertEvents(db, [mk("OECD", "OECD monthly update", d0)]);
  store.close(db);

  const due1 = eng.dueSourcesFromCalendar(BASE, t.dbPath);
  assert.equal(due1.length, 1, "run-once: one due source at T0");
  assert.equal(due1[0].source, "OECD");

  // engine "runs" the source, then flips its window to released:
  const changed = eng.markReleasedThrough("OECD", d0, t.dbPath);
  assert.equal(changed, 1, "run-once: due row flipped to released");

  // a second invocation at the same instant must NOT pick it again:
  const due2 = eng.dueSourcesFromCalendar(BASE + 30 * 60000, t.dbPath);
  assert.equal(due2.length, 0, "run-once: no re-run after release");

  const db2 = store.openStore(t.dbPath);
  const st = db2.prepare("SELECT status FROM release_events WHERE source='OECD'").get();
  store.close(db2);
  assert.equal(st.status, "released");
  console.log("  ok  1) run-once (picked -> released -> not re-picked)");
  cleanUp(t.dir);
})();

// ---------------------------------------------------------------
// 2) NO-EVENT DAY: future-only table keeps the engine idle.
// ---------------------------------------------------------------
(function testNoEventDay() {
  const t = newDb("noevent");
  const f1 = addIso(isoAt(BASE), 30);
  const f2 = addIso(isoAt(BASE), 400);
  const db = store.openStore(t.dbPath);
  store.upsertEvents(db, [
    mk("FRED", "FOMC", f1),
    mk("WORLD_BANK", "World Bank annual update", f2),
  ]);
  store.close(db);
  const due = eng.dueSourcesFromCalendar(BASE, t.dbPath);
  assert.equal(due.length, 0, "no-event day: nothing due -> idle");
  console.log("  ok  2) day without due events -> engine idle");
  cleanUp(t.dir);
})();

// ---------------------------------------------------------------
// 3) MULTIPLE EVENTS: same window, several sources -> all, nearest first.
// ---------------------------------------------------------------
(function testMultipleEvents() {
  const t = newDb("multi");
  const isoToday = isoAt(BASE);
  const pastA = addIso(isoToday, -3); // older => smaller ts
  const pastB = addIso(isoToday, -1);
  const db = store.openStore(t.dbPath);
  store.upsertEvents(db, [
    mk("FRED", "CPI", pastB),
    mk("OECD", "OECD monthly update", pastA),
    mk("BIS", "BIS releases test", pastA), // shares ts with OECD
    mk("EUROSTAT", "released-marker", pastB, "released"), // must be ignored
  ]);
  store.close(db);

  const due = eng.dueSourcesFromCalendar(BASE, t.dbPath);
  assert.equal(due.length, 3, "multiple: 3 scheduled due (released row ignored)");
  assert.deepEqual(
    due.map((x) => x.source),
    ["OECD", "BIS", "FRED"],
    "multiple: nearest-first by release_ts"
  );
  console.log("  ok  3) multiple due events -> all, nearest-first, released ignored");
  cleanUp(t.dir);
})();
// ---------------------------------------------------------------
// 4) 24h WINDOW: a due event is released at T0, and the event whose
//    release lands ~24h later becomes due only after that time.
// ---------------------------------------------------------------
(function testAcross24h() {
  const t = newDb("window24");
  const isoToday = isoAt(BASE);
  const tomorrow = addIso(isoToday, 1);
  const db = store.openStore(t.dbPath);
  store.upsertEvents(db, [
    mk("OECD", "OECD monthly update", isoToday),
    mk("IMF", "IMF quarterly update", tomorrow),
  ]);
  store.close(db);

  const day1 = eng.dueSourcesFromCalendar(BASE, t.dbPath);
  assert.deepEqual(day1.map((x) => x.source), ["OECD"], "24h: day1 only OECD");
  eng.markReleasedThrough("OECD", isoToday, t.dbPath);

  const day1pm = eng.dueSourcesFromCalendar(BASE + 6 * 3600 * 1000, t.dbPath);
  assert.equal(day1pm.length, 0, "24h: day1 afternoon nothing new due");

  const day2 = eng.dueSourcesFromCalendar(BASE + 24 * 3600 * 1000, t.dbPath);
  assert.deepEqual(day2.map((x) => x.source), ["IMF"], "24h: day2 IMF due, OECD not repeated");

  eng.markReleasedThrough("IMF", tomorrow, t.dbPath);
  const day3 = eng.dueSourcesFromCalendar(BASE + 48 * 3600 * 1000, t.dbPath);
  assert.equal(day3.length, 0, "24h: after both windows closed -> idle");
  console.log("  ok  4) 24h behaviour (same-day vs +24h sources, no repeats)");
  cleanUp(t.dir);
})();

// ---------------------------------------------------------------
// 5) CADENCE SOURCES: maketime materialises OECD/IMF/WORLD_BANK rows;
//    the engine treats them exactly like explicit-calendar rows.
// ---------------------------------------------------------------
(function testCadenceSources() {
  const t = newDb("cadence");

  // -- Phase A: shapes & counts. Use the same starting point the standalone CLI
  //    used (sandbox date 2026-09-05) so 10y = Oct2026..Sep2036 and counts are
  //    exactly OECD 120 / IMF 40 / WORLD_BANK 10.
  const sepBase = Date.UTC(2026, 8, 5, 0, 0, 0);
  const oecd = Mk.CADENCE_SOURCES.find((c) => c.source === "OECD");
  const imf = Mk.CADENCE_SOURCES.find((c) => c.source === "IMF");
  const wb = Mk.CADENCE_SOURCES.find((c) => c.source === "WORLD_BANK");

  const oecdEvs = Mk.buildCadenceEvents(oecd, { nowMs: sepBase, horizonYears: 10 });
  const imfEvs = Mk.buildCadenceEvents(imf, { nowMs: sepBase, horizonYears: 10 });
  const wbEvs = Mk.buildCadenceEvents(wb, { nowMs: sepBase, horizonYears: 10 });

  assert.equal(oecdEvs.length, 120, "cadence OECD = 10y x monthly (Oct26..Sep36)");
  assert.equal(imfEvs.length, 40, "cadence IMF = 10y x quarterly");
  assert.equal(wbEvs.length, 10, "cadence WORLD_BANK = 10y x yearly");
  assert.equal(oecdEvs[0].release_date, "2026-10-01", "OECD first future month day-1");
  assert.equal(imfEvs[0].release_date, "2026-10-01", "IMF first future quarter day-1");
  assert.equal(wbEvs[0].release_date, "2027-01-01", "WB first future year day-1");
  assert.ok(
    oecdEvs.every((e) => e.release_time === "00:00" && Number.isInteger(e.release_ts_ms) && e.status === "scheduled"),
    "cadence rows fully shaped (time 00:00, ts integer, scheduled)"
  );

  // -- Phase B: idempotent ensure + engine picks cadence rows.
  const janBase = Date.UTC(2026, 0, 1, 0, 0, 0); // distinct OECD(Feb1) vs IMF(Apr1)
  const janExpected = Mk.CADENCE_SOURCES.map((c) => [
    c.source,
    Mk.buildCadenceEvents(c, { nowMs: janBase, horizonYears: 10 }).length,
  ]);
  const s1 = Mk.ensureMacroCadenceEvents({ now: janBase, dbPath: t.dbPath });
  for (const [src, expLen] of janExpected) {
    assert.equal(s1.find((s) => s.source === src).added, expLen, `first ensure adds ${src}`);
  }
  const s2 = Mk.ensureMacroCadenceEvents({ now: janBase, dbPath: t.dbPath });
  assert.equal(s2.reduce((a, s) => a + s.added, 0), 0, "re-ensure adds nothing (no duplicates)");

  // Engine integration: mid-Feb only OECD (Feb-1) is due; IMF (Apr-1) and WB not.
  const febDue = eng.dueSourcesFromCalendar(Date.UTC(2026, 1, 15), t.dbPath);
  assert.deepEqual(febDue.map((x) => x.source), ["OECD"], "cadence engine: OECD due mid-Feb");
  // After Apr-1 the IMF quarterly row is due as well.
  const aprDue = eng.dueSourcesFromCalendar(Date.UTC(2026, 3, 5), t.dbPath);
  assert.ok(aprDue.map((x) => x.source).includes("IMF"), "cadence engine: IMF due after Apr-1");
  assert.ok(aprDue.map((x) => x.source).includes("OECD"), "cadence engine: OECD still due in Apr window");

  console.log("  ok  5) cadence sources (OECD 120 / IMF 40 / WB 10, idempotent, engine-driven)");
  cleanUp(t.dir);
})();

// ---------------------------------------------------------------
// 6) FALLBACK: when eventsJson is empty the SSR Euro-indicators page
//    is parsed (published macro releases become released rows; a future
//    row is scheduled). The official-empty -> fallback logic is covered
//    by sync.parseEuroIndHtml + the engine must stay idle for released rows.
// ---------------------------------------------------------------
(function testFallbackParser() {
  const t = newDb("fallback");
  const NOW = Date.UTC(2026, 8, 4, 12, 0, 0); // 2026-09-04T12Z
  // Minimal but faithful snippet of the euro-indicators SSR list.
  const html = `
<div class="search-results">
  <li class="ecl-content-block__item">
    <strong class="ecl-u-type-...">PUBLISHED: </strong> 1 September 2026
    <a class="ecl-link" aria-label='Euro area unemployment at 6.4%'
       href="https://ec.europa.eu/eurostat/product?code=4-01092026-ap">…</a>
  </li>
  <li class="ecl-content-block__item">
    <strong>PUBLISHED: </strong> 7 September 2026
    <a class="ecl-link" aria-label='Euro area annual inflation up to 3.3%'
       href="https://ec.europa.eu/eurostat/product?code=4-07092026-ap">…</a>
  </li>
</div>`;
  const evs = sync.parseEuroIndHtml(html, { now: NOW });
  assert.equal(evs.length, 2, "fallback parser found both macro items");
  const first = evs.find((e) => e.release_date === "2026-09-01");
  const second = evs.find((e) => e.release_date === "2026-09-07");
  assert.ok(first, "item 1 parsed with date");
  assert.equal(first.status, "released", "published-before-now -> released");
  assert.equal(first.event_label, "Euro area unemployment at 6.4%");
  assert.ok(second, "item 2 parsed");
  assert.equal(second.status, "scheduled", "published-after-now -> scheduled");
  assert.equal(second.event_label, "Euro area annual inflation up to 3.3%");
  assert.ok(Number.isInteger(first.release_ts_ms), "fallback row has ts");

  // Storing released fallback rows must NOT wake the engine.
  const db = store.openStore(t.dbPath);
  store.upsertEvents(db, evs);
  store.close(db);
  const due = eng.dueSourcesFromCalendar(NOW + 3600 * 1000, t.dbPath);
  assert.equal(due.length, 0, "released fallback rows do not trigger the scheduler");
  console.log("  ok  6) fallback parser (released vs scheduled, engine stays idle)");
  cleanUp(t.dir);
})();

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
console.log("engine tests passed (run-once / no-event / multi / 24h / cadence / fallback)");



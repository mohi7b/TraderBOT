// ============================================================
// Macro API — GET /macro/errors endpoint test (prampt1 §4)
// File: collector/macro/calendar/tests/errors_api.test.cjs
// Run:  node calendar/tests/errors_api.test.cjs
//
// Verifies the structured-error read path: rows written with the SAME recordError
// calls the macro engine uses (SYNC_FAILED / MISSED_EVENT / ...) are returned by
// the real HTTP route under { errors: [...] }, with ?source and ?limit honoured,
// newest-first, without ever touching the real releases.db (temp DB via env).
// ============================================================
const assert = require("node:assert/strict");
const store = require("../store.cjs");
const { newDb, cleanUp, withApi, getJson } = require("./api_helpers.cjs");

(async function run() {
  const t = newDb("errors-api");
  try {
    // Seed the temp DB the way the engine would (recent first when read back).
    const db = store.openStore(t.dbPath);
    // Insert order => A (id1), B (id2), C (id3) -> read back newest-first C,B,A.
    store.recordError(db, { error_code: "SYNC_FAILED",  source: "FRED",    event_id: null,
      details: "download failed: {}" });                                                   // A (oldest)
    store.recordError(db, { error_code: "MISSED_EVENT", source: "OECD",    event_id: "X",
      details: "release window closed without data" });                                    // B
    store.recordError(db, { error_code: "EMPTY_JSON",   source: "EUROSTAT",event_id: null,
      details: "empty feed" });                                                            // C (newest)
    store.close(db);

    await withApi(t.dbPath, async (base) => {
      // --- all rows, newest (inserted-last) first ---------------------
      const all = await getJson(base + "/errors");
      assert.equal(all.status, 200);
      assert.ok(Array.isArray(all.body.errors), "response has { errors: [...] }");
      assert.equal(all.body.errors.length, 3, "all three seeded errors returned");
      assert.equal(all.body.errors[0].error_code, "EMPTY_JSON",   "C first (newest id)");
      assert.equal(all.body.errors[1].error_code, "MISSED_EVENT", "B second");
      assert.equal(all.body.errors[2].error_code, "SYNC_FAILED",  "A last (oldest)");
      // --- filter by source -------------------------------------------
      const fr = await getJson(base + "/errors?source=FRED");
      assert.equal(fr.body.errors.length, 1);
      assert.equal(fr.body.errors[0].error_code, "SYNC_FAILED");
      const oecd = await getJson(base + "/errors?source=OECD");
      assert.equal(oecd.body.errors[0].error_code, "MISSED_EVENT");

      // --- limit: newest N only ---------------------------------------
      const one = await getJson(base + "/errors?limit=1");
      assert.equal(one.body.errors.length, 1);
      assert.equal(one.body.errors[0].error_code, "EMPTY_JSON", "limit=1 takes newest (C)");
      const two = await getJson(base + "/errors?limit=2");
      assert.equal(two.body.errors.length, 2);
      assert.equal(two.body.errors[1].error_code, "MISSED_EVENT");

      // --- malformed limit falls back to default (100) -----------------
      const bad = await getJson(base + "/errors?limit=abc");
      assert.equal(bad.body.errors.length, 3, "non-numeric limit defaults to 100");
    });

    // filter query went to the temp DB -> nothing in the shared DB was modified.
    console.log("errors api tests passed (shape / newest-first / source filter / limit / bad limit)");
  } finally {
    cleanUp(t.dir);
  }
})().catch((e) => { console.error("errors_api.test FAILED:\n" + (e && e.stack || e)); process.exitCode = 1; });


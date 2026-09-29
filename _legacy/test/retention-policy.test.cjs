/* ============================================================
 * File: _legacy/test/retention-policy.test.cjs
 * Section: _legacy (retired code)
 *
 * Moved from test/retention-policy.test.cjs (Phase-2 step 1).
 *
 * Why it lives here:
 *   retention-policy.cjs was retired with the historical aggregator
 *   (archived to _legacy/historical/retention-policy.cjs); retention is
 *   now handled by the per-database pruning of the historical section.
 *   The test was left in test/ long after its subject moved, so it
 *   always failed with MODULE_NOT_FOUND — unrelated to the
 *   collector/crypto restructure.
 *
 * Run it from the repo root:
 *   node _legacy/test/retention-policy.test.cjs
 * ============================================================ */

const assert = require("node:assert/strict");
const { isExpired, prune } = require("../historical/retention-policy.cjs");

(function main() {
    const now = 1_000_000_000;
    assert.equal(isExpired("1m", now - 25 * 60 * 60 * 1000, now), true);
    assert.equal(isExpired("1m", now - 1 * 60 * 60 * 1000, now), false);
    assert.equal(isExpired("1d", now - 999 * 24 * 60 * 60 * 1000, now), false);

    const records = [{ timestamp: now - 48 * 60 * 60 * 1000 }, { timestamp: now - 1000 }];
    const kept = prune(records, { interval: "1m" }, now);
    assert.equal(kept.length, 1);
    console.log("retention policy validation passed");
})();

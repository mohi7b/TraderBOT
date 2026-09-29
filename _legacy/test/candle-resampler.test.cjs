/* ============================================================
 * File: _legacy/test/candle-resampler.test.cjs
 * Section: _legacy (retired code)
 *
 * Moved from test/candle-resampler.test.cjs (Phase-2 step 1).
 *
 * Why it lives here:
 *   Its two subjects — CandleHistoryStore and resample() — were retired
 *   with the historical aggregator on 2026-08-24 and archived to
 *   _legacy/historical/aggregator/ (the historical section now builds
 *   timeframes on the fly from the 1m store, see _engine/timeframe).
 *   Keeping the test in test/ made the live suite permanently red with
 *   a MODULE_NOT_FOUND that predates the collector/crypto restructure.
 *
 * Run it from the repo root:
 *   node _legacy/test/candle-resampler.test.cjs
 * ============================================================ */

const assert = require("node:assert/strict");
const { CandleHistoryStore } = require("../historical/aggregator/candle-history-store.cjs");
const { resample } = require("../historical/aggregator/candle-resampler.cjs");

(function main() {
    const store = new CandleHistoryStore();
    const base = 1_700_000_000_000 - (1_700_000_000_000 % (5 * 60 * 1000));

    for (let i = 0; i < 5; i += 1) {
        store.upsert("BTCUSDT", "spot", "1m", {
            openTime: base + i * 60 * 1000,
            open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i,
            volume: 10, buyVolume: 6, sellVolume: 4
        });
    }

    const oneMinCandles = store.values("BTCUSDT", "spot", "1m");
    assert.equal(oneMinCandles.length, 5);

    const fiveMin = resample(oneMinCandles, "5m");
    assert.equal(fiveMin.openTime, base);
    assert.equal(fiveMin.open, 100);
    assert.equal(fiveMin.close, 104.5);
    assert.equal(fiveMin.high, 105);
    assert.equal(fiveMin.low, 99);
    assert.equal(fiveMin.volume, 50);
    assert.equal(fiveMin.sourceCandles, 5);

    store.upsert("BTCUSDT", "spot", "5m", fiveMin);
    assert.equal(store.values("BTCUSDT", "spot", "5m").length, 1);

    const now = base + 5 * 24 * 60 * 60 * 1000; // beyond 1m retention (1 day), within 5m retention (30 days)
    store.pruneAll(now);
    assert.equal(store.values("BTCUSDT", "spot", "1m").length, 0);
    assert.equal(store.values("BTCUSDT", "spot", "5m").length, 1);
    console.log("candle resampler and rollup validation passed");
})();

// Golden test — dynamic timeframe aggregation: SQL path vs JS path.
//
// The dynamic engine aggregates raw 1m candles into any higher timeframe. It used to do that purely in
// JS (read every 1m row, group in a loop); the hot path now pushes the grouping into SQLite (see
// _engine/timeframe/build-tf.cjs) after a measured 50x latency win. This test pins the *equivalence* of
// the two implementations on real data, so the optimisation can never silently change the candles:
//
//   node test/tf-golden.test.cjs [symbol] [tf] [days]
//
// Expected output: "تفاوت…=0" for every counter and a non-empty bucket list.
// Notes on the two intentional (and documented) differences:
//   · timestamp = bucket start (UTC epoch-aligned floor) in SQL, while the JS path returned the first
//     *available* 1m row's timestamp; the test accepts them when SQL's value equals floor(JS value).
//   · sums (volume/quote_volume) can differ in the last floating-point digit because SQLite and JS add
//     in a different order; they are compared with a relative tolerance of 1e-9.
const assert = require("assert");
const { aggregateRangeJs, aggregateRangeSql, clearCaches } = require("../_engine/timeframe/build-tf.cjs");
const { tfWidthMs } = require("../_engine/timeframe/utils.cjs");

const SYMBOL = (process.argv[2] || "BTCUSDT").toUpperCase();
const TF = process.argv[3] || "1h";
const DAYS = Number(process.argv[4] || 208);
const EXCHANGE = process.env.HIST_EXCHANGE || "binance_spot";

const to = Date.now();
const from = to - DAYS * 86400000;
const width = tfWidthMs(TF);

clearCaches();

const t0 = Date.now();
const sql = aggregateRangeSql(SYMBOL, EXCHANGE, TF, from, to);
const sqlMs = Date.now() - t0;

const t1 = Date.now();
const js = aggregateRangeJs(SYMBOL, EXCHANGE, TF, from, to);
const jsMs = Date.now() - t1;

console.log(`${SYMBOL} ${TF} · ${DAYS}d · ${EXCHANGE}`);
console.log(`  SQL: ${sql.length} buckets در ${sqlMs}ms · JS: ${js.length} candles در ${jsMs}ms → ×${(jsMs / Math.max(1, sqlMs)).toFixed(1)}`);

assert.ok(sql.length > 0, "SQL aggregation returned no buckets (is the raw store populated?)");
assert.strictEqual(sql.length, js.length, "bucket count differs between SQL and JS");

let ohlcDiff = 0;
let floatDiff = 0;
let tsDiff = 0;
let firstDiff = null;
for (let i = 0; i < sql.length; i++) {
    const a = sql[i];
    const b = js[i];
    if (a.timestamp !== Math.floor(b.timestamp / width) * width) tsDiff++;
    const ohlcSame = a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close;
    const sumSame =
        Math.abs(a.volume - b.volume) <= Math.max(1e-6, Math.abs(b.volume) * 1e-9) &&
        Math.abs(a.quoteVolume - b.quoteVolume) <= Math.max(1e-6, Math.abs(b.quoteVolume) * 1e-9) &&
        a.trades === b.trades;
    if (!ohlcSame) {
        ohlcDiff++;
        if (!firstDiff) firstDiff = { i, sql: a, js: b };
    } else if (!sumSame) {
        floatDiff++;
    }
}

console.log(`  تفاوت واقعی OHLC=${ohlcDiff} · شناور جمع‌ها=${floatDiff} · timestamp=${tsDiff}`);
assert.strictEqual(ohlcDiff, 0, `OHLC differs at ${JSON.stringify(firstDiff)}`);
assert.strictEqual(tsDiff, 0, "bucket floors differ");
assert.strictEqual(floatDiff, 0, "sums differ beyond 1e-9 relative tolerance");
console.log(`tf-golden: ${sql.length} buckets · SQL≡JS ✓`);

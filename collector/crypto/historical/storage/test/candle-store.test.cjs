/* ============================================================
 * File: collector/crypto/historical/storage/test/candle-store.test.cjs
 * Section: collector/crypto/historical/storage/test
 * Version: 1.0.0
 *
 * Role:
 *   The candle storage engine, offline: no network, no real database,
 *   no wall clock. These tests own three claims the migration depends on:
 *
 *     a month file holds exactly its month,
 *     a write is atomic and a rewrite replaces (never appends),
 *     a number that was not published stays null.
 *
 * Run:
 *   node --test collector/crypto/historical/storage/test/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const layout = require("../candle-layout.cjs");
const store = require("../candle-store.cjs");

const JANUARY = Date.UTC(2025, 0, 15, 12, 0, 0);

function tempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "traderbot-candles-"));
}

function candle(at, price = 100) {
    /* A spread that stays positive even at a price of 1 — the store refuses
     * anything else, so a fixture must be a candle it would accept. */
    const half = Math.max(price * 0.001, 0.001);
    return {
        timestamp: at,
        open: price,
        high: price + half,
        low: price - half,
        close: price + half / 2,
        volume: 12.5,
        quoteVolume: 1250,
        trades: 7
    };
}

test("the layout is a contract, not a convention", () => {
    assert.equal(layout.monthKeyOf(JANUARY), "2025-01");
    assert.equal(layout.monthKeyOf(Date.UTC(2025, 0, 1) - 1), "2024-12", "UTC, to the millisecond");
    assert.deepEqual(layout.monthBounds("2025-01"), { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 1, 1) });
    assert.equal(layout.minuteOf(Date.UTC(2025, 0, 15, 12, 0, 59, 999)), JANUARY);

    assert.equal(
        layout.datasetDir("/data", "binance_spot", "BTCUSDT"),
        path.join("/data", "crypto", "binance_spot", "BTCUSDT", "1m")
    );
    assert.equal(
        layout.monthFile("/data", "okx_futures", "ETHUSDT", "2025-01"),
        path.join("/data", "crypto", "okx_futures", "ETHUSDT", "1m", "2025-01.parquet")
    );
    assert.equal(layout.monthOfFile("2025-01.parquet"), "2025-01");
    assert.equal(layout.monthOfFile(".tmp-42-2025-01.parquet"), null, "an interrupted write is not a month");
    assert.equal(layout.isTempName(".tmp-42-2025-01.parquet"), true);
    assert.match(layout.describeLayout("/data"), /<YYYY-MM>\.parquet$/);

    assert.throws(() => layout.assertExchange("binance"), /<venue>_<spot\|futures>/);
    assert.throws(() => layout.assertExchange("binance_perp"), /<venue>_<spot\|futures>/);
    assert.throws(() => layout.assertSymbol("btc/usdt"), /uppercase alphanumeric/);
    assert.throws(() => layout.assertMonthKey("2025-13"), /YYYY-MM/);
    assert.throws(() => layout.assertMonthKey("2025-1"), /YYYY-MM/);
});

test("a month file holds exactly its month, and reads back exactly what was written", async () => {
    const root = tempRoot();
    const engine = store.openStore({ root });

    const first = candle(JANUARY, 100);
    const rows = [
        first,
        candle(JANUARY + 60_000, 101),
        candle(JANUARY + 120_000, 102),
        candle(Date.UTC(2025, 1, 1), 103),                       /* next month: refused */
        { ...candle(JANUARY + 180_000), high: 99, low: 100 },     /* high below low: refused */
        { ...candle(JANUARY + 240_000), low: 0 }                  /* a zero low is not a price: refused */
    ];

    const written = await engine.writeMonth({ exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-01", rows });

    assert.equal(written.written, true);
    assert.equal(written.rows, 3);
    assert.equal(written.replaced, false);
    assert.equal(written.rejected.length, 3);
    assert.match(written.rejected[0].problems.join("; "), /is outside 2025-01/);
    assert.match(written.rejected[1].problems.join("; "), /is below low/);
    assert.match(written.rejected[2].problems.join("; "), /low is not a positive price/);
    assert.match(written.sha256, /^[0-9a-f]{64}$/);
    assert.equal(written.bytes, fs.statSync(written.file).size);
    assert.deepEqual(engine.months("binance_spot", "BTCUSDT"), ["2025-01"]);
    assert.equal(fs.readdirSync(path.dirname(written.file)).filter(layout.isTempName).length, 0, "no half-written month is left behind");

    const back = await engine.readMonth({ exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-01" });
    assert.deepEqual(back.map((row) => row.timestamp), [JANUARY, JANUARY + 60_000, JANUARY + 120_000]);
    assert.equal(typeof back[0].timestamp, "number", "an epoch stays an epoch, whatever the Parquet reader hands back");
    assert.equal(back[0].open, first.open, "the price that went in is the price that comes out");
    assert.equal(back[0].close, first.close);
    assert.equal(back[0].low, first.low);
    assert.equal(back[0].volume, first.volume);
    assert.equal(back[0].trades, first.trades);
    assert.equal(back[0].exchange, "binance_spot", "a file describes its own rows");
    assert.equal(back[0].symbol, "BTCUSDT");
});

test("an empty month is not a file, and a rewrite replaces instead of appending", async () => {
    const root = tempRoot();
    const engine = store.openStore({ root });
    const where = { exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-01" };

    const empty = await engine.writeMonth({ ...where, rows: [] });
    assert.equal(empty.written, false);
    assert.equal(empty.reason, "the month is empty");
    assert.equal(fs.existsSync(empty.file), false, "no file is created to say \"nothing\"");
    assert.deepEqual(engine.months(where.exchange, where.symbol), []);

    const refused = await engine.writeMonth({ ...where, rows: [candle(Date.UTC(2024, 11, 31))] });
    assert.equal(refused.written, false);
    assert.equal(refused.reason, "every row was refused");
    assert.equal(fs.existsSync(refused.file), false);

    const first = await engine.writeMonth({ ...where, rows: [candle(JANUARY, 1), candle(JANUARY + 60_000, 2), candle(JANUARY + 120_000, 3)] });
    const again = await engine.writeMonth({ ...where, rows: [candle(JANUARY, 1), candle(JANUARY + 60_000, 2), candle(JANUARY + 120_000, 3)] });
    assert.equal(again.replaced, true, "the second write knew a month was already there");
    assert.deepEqual(engine.months(where.exchange, where.symbol), ["2025-01"], "a rewrite does not become a second month");
    assert.equal((await engine.readMonth(where)).length, 3, "and it does not double the rows");
    assert.equal(again.sha256, first.sha256, "the same rows make the same file");

    const smaller = await engine.writeMonth({ ...where, rows: [candle(JANUARY, 1)] });
    assert.equal(smaller.rows, 1);
    assert.equal((await engine.readMonth(where)).length, 1, "a month file is the truth, not a merge of every past write");
});

test("a range read crosses months, and a missing month stays missing", async () => {
    const root = tempRoot();
    const engine = store.openStore({ root });
    const where = { exchange: "okx_spot", symbol: "ETHUSDT" };

    await engine.writeMonth({ ...where, monthKey: "2025-01", rows: [candle(Date.UTC(2025, 0, 1)), candle(Date.UTC(2025, 0, 31))] });
    await engine.writeMonth({ ...where, monthKey: "2025-03", rows: [candle(Date.UTC(2025, 2, 1)), candle(Date.UTC(2025, 2, 31))] });

    const januaryToApril = await engine.readRange({ ...where, from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 3, 1) });
    assert.equal(januaryToApril.length, 4);
    assert.deepEqual(januaryToApril.map((row) => row.timestamp), [
        Date.UTC(2025, 0, 1), Date.UTC(2025, 0, 31), Date.UTC(2025, 2, 1), Date.UTC(2025, 2, 31)
    ]);

    assert.deepEqual(await engine.readRange({ ...where, from: Date.UTC(2025, 1, 1), to: Date.UTC(2025, 2, 1) }), [],
        "February was never collected: empty is the honest answer, not an interpolation");

    const summary = engine.stats(where.exchange, where.symbol);
    assert.equal(summary.months, 2);
    assert.equal(summary.firstMonth, "2025-01");
    assert.equal(summary.lastMonth, "2025-03");
    assert.ok(summary.bytes > 0);
    assert.equal(summary.dir, layout.datasetDir(root, where.exchange, where.symbol));
});

test("strict mode refuses the whole month, and GZIP is a choice not a surprise", async () => {
    const root = tempRoot();
    const engine = store.openStore({ root });
    const where = { exchange: "bybit_futures", symbol: "BTCUSDT", monthKey: "2025-01" };

    await assert.rejects(
        () => engine.writeMonth({ ...where, strict: true, rows: [candle(JANUARY), { ...candle(JANUARY + 60_000), close: 0 }] }),
        /close is not a positive price/
    );
    assert.equal(fs.existsSync(layout.monthFile(root, where.exchange, where.symbol, where.monthKey)), false);
    assert.deepEqual(engine.months(where.exchange, where.symbol), []);

    assert.throws(() => store.openStore({ root, compression: "BROTLI" }), /compression must be one of/);

    const gzipped = store.openStore({ root, compression: "GZIP" });
    const fixture = candle(JANUARY, 42);
    const written = await gzipped.writeMonth({ ...where, rows: [fixture] });
    assert.equal(written.written, true);
    const back = await gzipped.readMonth(where);
    assert.equal(back.length, 1);
    assert.equal(back[0].close, fixture.close);
    assert.equal(back[0].quoteVolume, fixture.quoteVolume);
    assert.equal(back[0].timestamp, JANUARY);
});

test("a candle that was never published stays null", async () => {
    const root = tempRoot();
    const engine = store.openStore({ root });
    const row = candle(JANUARY);
    delete row.quoteVolume;
    delete row.trades;
    row.volume = null;

    const written = await engine.writeMonth({ exchange: "kucoin_spot", symbol: "SOLUSDT", monthKey: "2025-01", rows: [row] });
    assert.equal(written.rows, 1);

    const [back] = await engine.readMonth({ exchange: "kucoin_spot", symbol: "SOLUSDT", monthKey: "2025-01" });
    assert.equal(back.volume, null, "a missing volume is not a volume of zero");
    assert.equal(back.quoteVolume, null);
    assert.equal(back.trades, null);
    assert.equal(back.close, row.close);
});

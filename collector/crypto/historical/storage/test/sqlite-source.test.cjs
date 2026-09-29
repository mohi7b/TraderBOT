/* ============================================================
 * File: collector/crypto/historical/storage/test/sqlite-source.test.cjs
 * Section: collector/crypto/historical/storage/test
 * Version: 1.0.0
 *
 * Role:
 *   The migration path, end to end and offline: a real (small) SQLite
 *   file in the downloader's own schema → the source reader → the Parquet
 *   store → the command that ties them together.
 *
 *   The database here is built by better-sqlite3, the same library the
 *   downloader uses, so the column names and the NULL handling under test
 *   are the real ones.
 *
 * Run:
 *   node --test collector/crypto/historical/storage/test/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const layout = require("../candle-layout.cjs");
const { openCandleSource } = require("../sqlite-candle-source.cjs");
const { openStore } = require("../candle-store.cjs");
const compact = require("../run-compact.cjs");

const JANUARY = Date.UTC(2025, 0, 10, 0, 0, 0);
const FEBRUARY = Date.UTC(2025, 1, 1, 0, 0, 0);
const MAY = Date.UTC(2025, 4, 1, 0, 0, 0);

const SCHEMA = `CREATE TABLE candles_1m (
    timestamp_raw    INTEGER NOT NULL,
    open             REAL NOT NULL,
    high             REAL NOT NULL,
    low              REAL NOT NULL,
    close            REAL NOT NULL,
    volume           REAL,
    quote_volume     REAL,
    number_of_trades INTEGER,
    exchange         TEXT NOT NULL,
    symbol           TEXT NOT NULL,
    PRIMARY KEY (symbol, exchange, timestamp_raw)
);`;

function tempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A small stand-in for the downloader's database. */
function makeDb() {
    const file = path.join(tempDir("traderbot-candles-db-"), "candles_1m.db");
    const db = new Database(file);
    db.exec(SCHEMA);
    const insert = db.prepare("insert into candles_1m values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    insert.run(JANUARY, 100, 101, 99, 100.5, 10, 1000, 5, "binance_spot", "BTCUSDT");
    insert.run(JANUARY + 60_000, 100.5, 102, 100, 101.5, null, null, null, "binance_spot", "BTCUSDT");
    insert.run(FEBRUARY, 101.5, 103, 101, 102.5, 12, 1200, 6, "binance_spot", "BTCUSDT");
    /* March and April were never collected: the source must not invent them. */
    insert.run(MAY, 110, 111, 109, 110.5, 13, 1300, 7, "binance_spot", "BTCUSDT");
    insert.run(JANUARY, 50, 51, 49, 50.5, 1, 50, 1, "okx_spot", "BTCUSDT");
    db.close();
    return file;
}

test("the source reads the downloader's own columns, one month at a time", () => {
    const source = openCandleSource({ file: makeDb() });

    assert.deepEqual(source.datasets(), [
        { exchange: "binance_spot", symbol: "BTCUSDT", rows: 4, firstAt: JANUARY, lastAt: MAY },
        { exchange: "okx_spot", symbol: "BTCUSDT", rows: 1, firstAt: JANUARY, lastAt: JANUARY }
    ]);
    assert.deepEqual(source.months(), ["2025-01", "2025-02", "2025-05"], "the empty months in between are absent, not invented");
    assert.deepEqual(source.months({ exchange: "okx_spot" }), ["2025-01"]);
    assert.deepEqual(source.months({ exchange: "binance_spot", symbol: "BTCUSDT" }), ["2025-01", "2025-02", "2025-05"]);
    assert.deepEqual(source.months({ exchange: "kraken_spot", symbol: "BTCUSDT" }), []);
    assert.deepEqual(source.boundsOf({ exchange: "binance_spot", symbol: "BTCUSDT" }), { rows: 4, firstAt: JANUARY, lastAt: MAY });
    assert.equal(source.countMonth({ exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-03" }), 0, "a gap has no rows to count");

    const january = source.readMonth({ exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-01" });
    assert.deepEqual(january.map((row) => row.timestamp), [JANUARY, JANUARY + 60_000], "oldest first");
    assert.equal(january[0].close, 100.5);
    assert.equal(january[0].quoteVolume, 1000, "quote_volume is mapped once, here");
    assert.equal(january[0].trades, 5);
    assert.equal(january[1].volume, null, "a NULL in SQLite stays null, not zero");
    assert.equal(january[1].quoteVolume, null);
    assert.equal(january[1].trades, null);

    assert.deepEqual(source.readMonth({ exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-03" }), []);

    const summary = source.stats();
    assert.equal(summary.rows, 5);
    assert.equal(summary.exchanges, 2);
    assert.equal(summary.table, "candles_1m");
    source.close();
});

test("a database that cannot answer is refused, not guessed", () => {
    assert.throws(() => openCandleSource({ file: "/nowhere/candles_1m.db" }), /candle database not found/);

    const empty = path.join(tempDir("traderbot-candles-empty-"), "candles_1m.db");
    new Database(empty).close();
    assert.throws(() => openCandleSource({ file: empty }), /does not exist/);

    const partial = path.join(tempDir("traderbot-candles-partial-"), "candles_1m.db");
    const db = new Database(partial);
    db.exec("CREATE TABLE candles_1m (timestamp_raw INTEGER, exchange TEXT, symbol TEXT, open REAL, high REAL, low REAL)");
    db.close();
    assert.throws(() => openCandleSource({ file: partial }), /missing close/);
});

test("SQLite in, Parquet out: the same candles come back", async () => {
    const dbFile = makeDb();
    const root = tempDir("traderbot-candles-out-");
    const source = openCandleSource({ file: dbFile });
    const store = openStore({ root });

    for (const dataset of source.datasets()) {
        for (const monthKey of source.months({ exchange: dataset.exchange, symbol: dataset.symbol })) {
            const rows = source.readMonth({ exchange: dataset.exchange, symbol: dataset.symbol, monthKey });
            const written = await store.writeMonth({ exchange: dataset.exchange, symbol: dataset.symbol, monthKey, rows, strict: true });
            assert.equal(written.written, true, `${dataset.exchange} ${monthKey} was written`);
            assert.equal(written.rows, rows.length);
            assert.equal(written.rejected.length, 0, "real candles have nothing to refuse");

            const back = await store.readMonth({ exchange: dataset.exchange, symbol: dataset.symbol, monthKey });
            assert.deepEqual(back.map((row) => row.timestamp), rows.map((row) => row.timestamp));
            assert.deepEqual(back.map((row) => row.close), rows.map((row) => row.close));
            assert.deepEqual(back.map((row) => row.volume), rows.map((row) => row.volume), "including the nulls");
            assert.deepEqual(back.map((row) => row.trades), rows.map((row) => row.trades));
        }
    }

    assert.deepEqual(store.months("binance_spot", "BTCUSDT"), ["2025-01", "2025-02", "2025-05"]);
    assert.equal(store.stats("okx_spot", "BTCUSDT").months, 1);
    assert.equal(
        layout.monthFile(root, "binance_spot", "BTCUSDT", "2025-01"),
        path.join(root, "crypto", "binance_spot", "BTCUSDT", "1m", "2025-01.parquet")
    );
    source.close();
});

test("the command parses its flags and can look before it writes", async () => {
    const dbFile = makeDb();
    const root = tempDir("traderbot-candles-cli-");

    const bare = compact.parseArgs([]);
    assert.equal(bare.db, null);
    assert.equal(bare.root, layout.DEFAULT_ROOT);
    assert.equal(bare.compression, "SNAPPY");
    assert.equal(bare.dryRun, false);
    assert.equal(bare.strict, false);
    assert.equal(bare.skipExisting, false);
    assert.equal(bare.limit, null);

    const flags = compact.parseArgs(["--symbol", "eth-usdt", "--exchange", "okx_spot", "--month", "2025-01", "--limit", "2", "--root", "/tmp/out", "--compression", "gzip", "--dry-run", "--strict", "--skip-existing"]);
    assert.equal(flags.symbol, "eth-usdt");
    assert.equal(flags.exchange, "okx_spot");
    assert.equal(flags.month, "2025-01");
    assert.equal(flags.limit, 2);
    assert.equal(flags.root, "/tmp/out");
    assert.equal(flags.compression, "GZIP", "the flag is case-insensitive");
    assert.equal(flags.dryRun, true);
    assert.equal(flags.strict, true);
    assert.equal(flags.skipExisting, true, "the flag is parsed");

    assert.equal(compact.normalizeSymbol("btc-usdt"), "BTCUSDT");
    assert.equal(compact.normalizeSymbol("eth_usdt"), "ETHUSDT");
    assert.match(compact.defaultDb("btc-usdt"), /crypto\/BTCUSDT\/candles_1m\.db$/);
    assert.equal(compact.formatBytes(512), "512 B");
    assert.match(compact.formatBytes(5 * 1024 ** 3), /GB$/);

    const lines = [];
    const report = await compact.compact({ ...bare, db: dbFile, root, limit: 2, dryRun: true }, (line) => lines.push(line));
    assert.equal(report.dryRun, true);
    assert.equal(report.written, 0);
    assert.equal(report.months, 2, "--limit 2 stopped after two months");
    assert.equal(report.rows, 3, "two January rows plus February's");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^\[dry-run\] binance_spot\/BTCUSDT 2025-01: 2 rows$/);
    assert.equal(fs.existsSync(path.join(root, "crypto")), false, "a dry run writes nothing at all");
});

test("the command migrates a database, and running it twice changes nothing", async () => {
    const dbFile = makeDb();
    const root = tempDir("traderbot-candles-run-");
    const options = { ...compact.parseArgs([]), db: dbFile, root };
    const lines = [];

    const first = await compact.compact(options, (line) => lines.push(line));
    assert.equal(first.written, 4, "three months of binance_spot plus one of okx_spot");
    assert.equal(first.refused, 0);
    assert.equal(first.rows, 5);
    assert.ok(first.bytes > 0);
    assert.ok(lines.every((line) => !/refused/.test(line)), "nothing was refused, and nothing says otherwise");

    const fingerprints = lines.map((line) => line.match(/sha256 ([0-9a-f]{12})/)[1]);

    const second = await compact.compact(options, (line) => lines.push(line));
    assert.equal(second.written, 4);
    const again = lines.slice(lines.length - 4).map((line) => line.match(/sha256 ([0-9a-f]{12})/)[1]);
    assert.deepEqual(again, fingerprints, "the same rows make the same files, byte for byte");

    const store = openStore({ root });
    const january = await store.readMonth({ exchange: "binance_spot", symbol: "BTCUSDT", monthKey: "2025-01" });
    assert.equal(january.length, 2, "a second run replaces the month instead of doubling it");
    assert.equal(january[0].timestamp, JANUARY);
    assert.equal(january[1].volume, null);

    await assert.rejects(() => compact.compact({ ...options, exchange: "kraken_spot" }), /no dataset in .* matches kraken_spot/);
    await assert.rejects(() => compact.compact({ ...options, compression: "BROTLI" }), /--compression must be one of/);
});

test("--skip-existing makes a long migration resumable", async () => {
    const dbFile = makeDb();
    const root = tempDir("traderbot-candles-resume-");
    const options = { ...compact.parseArgs([]), db: dbFile, root };
    const lines = [];

    const first = await compact.compact(options, (line) => lines.push(line));
    assert.equal(first.written, 4);
    assert.equal(first.skipped, 0, "a plain run leaves nothing alone");

    const resumed = await compact.compact({ ...options, skipExisting: true }, (line) => lines.push(line));
    assert.equal(resumed.written, 0, "nothing was rewritten");
    assert.equal(resumed.skipped, 4, "all four months were left alone");
    assert.equal(resumed.rows, 0, "and not a single row was read for them");
    assert.ok(
        lines.slice(lines.length - 4).every((line) => /already on disk — skipped$/.test(line)),
        "each skipped month says so"
    );

    /* A month that is missing from disk is migrated again: the flag resumes a
     * run, it does not trust the filesystem to be complete. */
    fs.unlinkSync(layout.monthFile(root, "binance_spot", "BTCUSDT", "2025-02"));
    const again = await compact.compact({ ...options, skipExisting: true }, (line) => lines.push(line));
    assert.equal(again.written, 1, "only the missing month was written");
    assert.equal(again.skipped, 3);
    assert.equal(again.rows, 1);
    assert.equal(again.refused, 0);
});


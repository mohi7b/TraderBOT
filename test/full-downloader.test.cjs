// Deterministic test for the Full Downloader (no network; mock fetchImpl). Covers standardize/validate,
// merge dedup, resume-from-last, and the end-to-end runFull cycle.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { runFull } = require("../collector/crypto/historical/full/run-full.cjs");
const { runScheduler } = require("../collector/crypto/historical/full/scheduler.cjs");
const { standardizeCandle, validateCandle, mergeChunk, openRaw1mDatabase, lastFilledTimestamp, resolveRaw1mPath } = require("../collector/crypto/historical/full/merge-into-1m-db.cjs");
const { createRateController } = require("../collector/crypto/historical/full/rate-controller.cjs");

const MINUTE = 60000;
const START = 1_690_000_000_000;

// Binance-format kline row at openTime.
function kline(openTime) {
    const t = openTime / MINUTE;
    return [openTime, String(100 + t), String(102 + t), String(98 + t), String(101 + t), "10", openTime + MINUTE - 1, "1000", 4, "6", "600"];
}

// Mock fetchImpl: returns candles filtered to the requested (startTime, endTime, limit) window.
function makeMock(candles) {
    return async function fetchImpl(url) {
        const u = new URL(url);
        const startTime = Number(u.searchParams.get("startTime"));
        const endTime = u.searchParams.get("endTime");
        const limit = Number(u.searchParams.get("limit")) || 1000;
        let rows = candles.filter((c) => c[0] >= startTime && (endTime === null || c[0] <= Number(endTime)));
        rows = rows.slice(0, limit);
        return { ok: true, status: 200, headers: { get: () => null }, async json() { return rows; } };
    };
}

function candles(count, start = START) { return Array.from({ length: count }, (_, i) => kline(start + i * MINUTE)); }

(async function main() {
    // ---- standardize + validate ----
    {
        const norm = { venue: "binance", symbol: "btcusdt", openTime: START, open: 100, high: 102, low: 98, close: 101, volume: 10, closeTime: START + MINUTE - 1, quoteVolume: 1000, trades: 4, market: "spot" };
        assert.equal(validateCandle(norm), true);
        const row = standardizeCandle(norm);
        assert.equal(row.timestamp_raw, START);
        assert.equal(row.exchange, "binance");
        assert.equal(row.symbol, "BTCUSDT");
        assert.equal(row.number_of_trades, 4);
        assert.equal(row.quote_volume, 1000);
        // invalid high < low
        assert.equal(validateCandle({ ...norm, high: 90, low: 98 }), false);
    }

    // ---- merge dedup + commit + lastFilled ----
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "full-dl-"));
    {
        const db = openRaw1mDatabase("BTCUSDT", { rootDir: root });
        const rows = candles(10).map((k) => standardizeCandle({ symbol: "BTCUSDT", exchange: "binance_spot", openTime: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], quoteVolume: +k[7], trades: +k[8] }));
        const inserted = mergeChunk(db, rows);
        assert.equal(inserted, 10);
        // re-merge same rows -> 0 inserted (dedup)
        assert.equal(mergeChunk(db, rows), 0);
        db.close();
        assert.equal(lastFilledTimestamp("BTCUSDT", "binance_spot", { rootDir: root }), START + 9 * MINUTE);
    }

    // ---- end-to-end runFull with mock (60 candles, spot) ----
    {
        const fetchImpl = makeMock(candles(60));
        const result = await runFull("BTCUSDT", { exchange: "binance", market: "spot", fetchImpl, rootDir: root, now: START + 59 * MINUTE });
        assert.equal(result.exchange, "binance_spot");
        assert.equal(result.total, 60, "all 60 spot candles merged (with overlap dedup preserving earlier 10)");

        const db = new Database(resolveRaw1mPath("BTCUSDT", { rootDir: root }), { readonly: true });
        const rows = db.prepare("SELECT DISTINCT exchange FROM candles_1m ORDER BY exchange").all();
        db.close();
        assert.deepEqual(rows.map((r) => r.exchange), ["binance_spot"], "only binance_spot present");
    }

    // ---- futures is kept fully separate from spot ----
    {
        const fetchImpl = makeMock(candles(30));
        const result = await runFull("BTCUSDT", { exchange: "binance", market: "futures", fetchImpl, rootDir: root, now: START + 29 * MINUTE });
        assert.equal(result.exchange, "binance_futures");

        const db = new Database(resolveRaw1mPath("BTCUSDT", { rootDir: root }), { readonly: true });
        const spot = db.prepare("SELECT COUNT(*) AS c FROM candles_1m WHERE exchange = 'binance_spot'").get().c;
        const futures = db.prepare("SELECT COUNT(*) AS c FROM candles_1m WHERE exchange = 'binance_futures'").get().c;
        db.close();
        assert.equal(spot, 60, "spot count unchanged");
        assert.equal(futures, 30, "futures stored separately, no mixing");
    }

    // ---- resume: run spot again with a superset, expect no duplicate work ----
    {
        const fetchImpl = makeMock(candles(120));
        const result = await runFull("BTCUSDT", { exchange: "binance", market: "spot", fetchImpl, rootDir: root, now: START + 119 * MINUTE });
        assert.equal(result.total, 120, "resumed spot and completed to 120 without duplicates");
        const db = new Database(resolveRaw1mPath("BTCUSDT", { rootDir: root }), { readonly: true });
        const c = db.prepare("SELECT COUNT(*) AS c FROM candles_1m WHERE exchange = 'binance_spot'").get().c;
        db.close();
        assert.equal(c, 120, "no duplicate spot rows after resume");
    }

    console.log("full downloader validation passed");
})().catch((e) => { console.error(e); process.exitCode = 1; });

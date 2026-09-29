// Deterministic test for the Real-Time 1m Updater (no network). Covers spot/futures separation, resume
// per market, up-to-date no-op, and empty-db cases.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { update1m } = require("../collector/crypto/historical/full/update-1m.cjs");
const { runFull } = require("../collector/crypto/historical/full/run-full.cjs");
const { resolveRaw1mPath } = require("../collector/crypto/historical/full/merge-into-1m-db.cjs");

const MINUTE = 60000;
const START = 1_690_000_000_000;

function kline(openTime) {
    const t = openTime / MINUTE;
    return [openTime, String(100 + t), String(102 + t), String(98 + t), String(101 + t), "10", openTime + MINUTE - 1, "1000", 4, "6", "600"];
}
function candles(count, start = START) { return Array.from({ length: count }, (_, i) => kline(start + i * MINUTE)); }

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

function countExchange(dbPath, exchange) {
    const db = new Database(dbPath, { readonly: true });
    const c = db.prepare("SELECT COUNT(*) AS c FROM candles_1m WHERE exchange = ?").get(exchange).c;
    db.close();
    return c;
}

(async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "update-1m-"));
    const dbPath = resolveRaw1mPath("BTCUSDT", { rootDir: root });

    // Seed spot with 60 candles via runFull, futures with 30 via runFull (separate keys).
    await runFull("BTCUSDT", { exchange: "binance", market: "spot", fetchImpl: makeMock(candles(60)), rootDir: root, now: START + 59 * MINUTE });
    await runFull("BTCUSDT", { exchange: "binance", market: "futures", fetchImpl: makeMock(candles(30)), rootDir: root, now: START + 29 * MINUTE });
    assert.equal(countExchange(dbPath, "binance_spot"), 60);
    assert.equal(countExchange(dbPath, "binance_futures"), 30);

    // ---- empty-db case (unseeded market -> no resume point) ----
    {
        const r = await update1m("BTCUSDT", { exchange: "binance", market: "delivery", fetchImpl: makeMock(candles(10)), rootDir: root, now: START + 9 * MINUTE });
        assert.equal(r.updated, false);
        assert.equal(r.reason, "empty-db");
    }

    // ---- up-to-date (no new data) ----
    {
        const r = await update1m("BTCUSDT", { exchange: "binance", market: "spot", fetchImpl: makeMock(candles(60)), rootDir: root, now: START + 59 * MINUTE });
        assert.equal(r.updated, false);
        assert.equal(r.reason, "up-to-date");
    }

    // ---- new spot data only ----
    {
        const r = await update1m("BTCUSDT", { exchange: "binance", market: "spot", fetchImpl: makeMock(candles(120)), rootDir: root, now: START + 119 * MINUTE });
        assert.equal(r.updated, true);
        assert.equal(countExchange(dbPath, "binance_spot"), 120, "spot grew to 120");
        assert.equal(countExchange(dbPath, "binance_futures"), 30, "futures untouched");
    }

    // ---- futures resumes independently ----
    {
        const r = await update1m("BTCUSDT", { exchange: "binance", market: "futures", fetchImpl: makeMock(candles(90)), rootDir: root, now: START + 89 * MINUTE });
        assert.equal(r.updated, true);
        assert.equal(countExchange(dbPath, "binance_futures"), 90, "futures grew to 90");
        assert.equal(countExchange(dbPath, "binance_spot"), 120, "spot untouched");
    }

    // ---- verify no overlap/mixing: distinct exchange keys only ----
    {
        const db = new Database(dbPath, { readonly: true });
        const keys = db.prepare("SELECT DISTINCT exchange FROM candles_1m ORDER BY exchange").all().map((r) => r.exchange);
        db.close();
        assert.deepEqual(keys, ["binance_futures", "binance_spot"]);
    }

    console.log("realtime 1m updater validation passed");
})().catch((e) => { console.error(e); process.exitCode = 1; });

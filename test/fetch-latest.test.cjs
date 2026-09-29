// Deterministic test for fetch-latest (no network). Verifies spot/futures separation, API routing by
// marketType, safe merge, and per-market independent resume.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { fetchLatest } = require("../collector/crypto/historical/full/fetch-latest.cjs");
const { runFull } = require("../collector/crypto/historical/full/run-full.cjs");
const { resolveRaw1mPath } = require("../collector/crypto/historical/full/merge-into-1m-db.cjs");
const { splitExchangeKey, apiMarketOf } = require("../collector/crypto/historical/full/markets.cjs");

const MINUTE = 60000;
const START = 1_690_000_000_000;

function kline(openTime) {
    const t = openTime / MINUTE;
    return [openTime, String(100 + t), String(102 + t), String(98 + t), String(101 + t), "10", openTime + MINUTE - 1, "1000", 4, "6", "600"];
}
function candles(count, start = START) { return Array.from({ length: count }, (_, i) => kline(start + i * MINUTE)); }

// Records the (venue, market) each fetch would target, so we can assert correct API routing.
function makeMock(candles, calls) {
    return async function fetchImpl(url) {
        const u = new URL(url);
        // For binance the market is implied by host; for okx/binance we just record the query params.
        calls.push({ startTime: u.searchParams.get("startTime"), limit: u.searchParams.get("limit") });
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
    // ---- marketType -> exchange key + apiMarket routing ----
    assert.equal(apiMarketOf("binance_spot"), "spot");
    assert.equal(apiMarketOf("binance_futures"), "futures");
    assert.equal(apiMarketOf("okx_swap"), "futures");
    assert.equal(apiMarketOf("bybit_inverse"), "futures");
    assert.deepEqual(splitExchangeKey("bybit_futures"), { venue: "bybit", marketType: "futures" });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fetch-latest-"));
    const dbPath = resolveRaw1mPath("BTCUSDT", { rootDir: root });

    // Seed spot + futures with distinct histories.
    await runFull("BTCUSDT", { exchange: "binance", market: "spot", fetchImpl: makeMock(candles(60), []), rootDir: root, now: START + 59 * MINUTE });
    await runFull("BTCUSDT", { exchange: "binance", market: "futures", fetchImpl: makeMock(candles(30), []), rootDir: root, now: START + 29 * MINUTE });
    assert.equal(countExchange(dbPath, "binance_spot"), 60);
    assert.equal(countExchange(dbPath, "binance_futures"), 30);

    // ---- fetchLatest separates spot from futures ----
    {
        const r = await fetchLatest("BTCUSDT", "binance_spot", { fetchImpl: makeMock(candles(120), []), rootDir: root, now: START + 119 * MINUTE });
        assert.equal(r.updated, true);
        assert.equal(r.exchange, "binance_spot");
        assert.equal(countExchange(dbPath, "binance_spot"), 120, "spot grew");
        assert.equal(countExchange(dbPath, "binance_futures"), 30, "futures untouched");
    }

    // ---- fetchLatest resumes futures independently ----
    {
        const r = await fetchLatest("BTCUSDT", "binance_futures", { fetchImpl: makeMock(candles(90), []), rootDir: root, now: START + 89 * MINUTE });
        assert.equal(r.updated, true);
        assert.equal(countExchange(dbPath, "binance_futures"), 90, "futures grew");
        assert.equal(countExchange(dbPath, "binance_spot"), 120, "spot untouched");
    }

    // ---- up-to-date no-op ----
    {
        const r = await fetchLatest("BTCUSDT", "binance_spot", { fetchImpl: makeMock(candles(120), []), rootDir: root, now: START + 119 * MINUTE });
        assert.equal(r.updated, false);
        assert.equal(r.reason, "up-to-date");
    }

    // ---- empty-db for a fresh market type ----
    {
        const r = await fetchLatest("BTCUSDT", "binance_swap", { fetchImpl: makeMock(candles(10), []), rootDir: root, now: START + 9 * MINUTE });
        assert.equal(r.updated, false);
        assert.equal(r.reason, "empty-db");
    }

    // ---- no mixing: only two distinct exchange keys ----
    {
        const db = new Database(dbPath, { readonly: true });
        const keys = db.prepare("SELECT DISTINCT exchange FROM candles_1m ORDER BY exchange").all().map((r) => r.exchange);
        db.close();
        assert.deepEqual(keys, ["binance_futures", "binance_spot"]);
    }

    console.log("fetch-latest validation passed");
})().catch((e) => { console.error(e); process.exitCode = 1; });

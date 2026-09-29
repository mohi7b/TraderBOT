// Integration test: the real fetchChunk -> fetchRange path (what run-full uses after earliest resolution)
// for every venue × market, using a small 1-hour window. Verifies the scheduler's core download+merge for
// all 10 markets works live. Run: node test/historical-runfull-all-venues.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { fetchChunk } = require("../collector/crypto/historical/full/fetch-chunk.cjs");
const { openRaw1mDatabase, mergeChunk, lastFilledTimestamp } = require("../collector/crypto/historical/full/merge-into-1m-db.cjs");

const MINUTE = 60000;
const CASES = [
    ["binance", "BTCUSDT", "spot"], ["binance", "BTCUSDT", "futures"],
    ["bybit", "BTCUSDT", "spot"], ["bybit", "BTCUSDT", "futures"],
    ["okx", "BTCUSDT", "spot"], ["okx", "BTCUSDT", "futures"],
    ["kucoin", "BTC-USDT", "spot"], ["kucoin", "BTCUSDT", "futures"],
    ["bitget", "BTCUSDT", "spot"], ["bitget", "BTCUSDT", "futures"],
];

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "runfull-all-"));
    const now = Date.now();
    let failures = 0;

    for (const [venue, symbol, market] of CASES) {
        const exchange = `${venue}_${market === "spot" ? "spot" : "futures"}`;
        process.stdout.write(`${venue.padEnd(8)} ${market.padEnd(8)} ... `);
        try {
            // Fetch a 1-hour chunk through the real fetchChunk -> fetchRange path.
            const chunk = await fetchChunk({
                symbol, exchange, startTime: now - 3600 * 1000, endTime: now,
                timeoutMs: 10000, limit: 300,
            });
            assert.ok(chunk.rows.length > 0, `no rows for ${venue} ${market}`);
            // Merge into the per-symbol raw DB and check storage.
            const db = openRaw1mDatabase(symbol.toUpperCase(), { rootDir: root });
            const inserted = mergeChunk(db, chunk.rows);
            db.close();
            assert.ok(inserted > 0, `inserted 0 for ${venue} ${market}`);
            console.log(`OK  fetched=${chunk.fetched} valid=${chunk.valid} inserted=${inserted}`);
        } catch (e) {
            failures += 1;
            console.log(`FAIL: ${e.message}`);
        }
    }

    console.log(failures === 0 ? "\nALL 10 MARKETS PASSED" : `\n${failures} FAILURES`);
    if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

// Comprehensive live test: every venue × market (spot/futures) for the three fetch operations.
// Run with network access:  node test/historical-all-venues.test.cjs
// NOTE: earliestRemote probes are expected to differ per venue (some venues cannot express
// "earliest" via startTime=0); this test documents the current behavior of the shared probe.
const assert = require("node:assert/strict");
const adapters = require("../collector/crypto/historical/_engine/fetch/crypto/index.cjs");

const VENUES = ["binance", "bybit", "okx", "kucoin", "bitget"];
const SYMBOLS = { binance: "BTCUSDT", bybit: "BTCUSDT", okx: "BTCUSDT", kucoin: "BTC-USDT", bitget: "BTCUSDT" };

async function main() {
    const results = [];
    for (const venue of VENUES) {
        for (const market of ["spot", "futures"]) {
            const symbol = venue === "kucoin" ? (market === "spot" ? "BTC-USDT" : "BTCUSDT") : "BTCUSDT";
            const adapter = adapters[venue]({ timeoutMs: 10000 });
            const now = Date.now();
            const row = { venue, market, symbol };

            // 1) fetchKlines — single page
            try {
                const page = await adapter.fetchKlines({ symbol, market, startTime: now - 3600 * 1000, endTime: undefined, limit: 10 });
                row.fetchKlines = `${page.length} candles`;
            } catch (e) {
                row.fetchKlines = `ERROR: ${e.message.slice(0, 60)}`;
            }

            // 2) fetchRange — full pagination of a 1-hour window
            try {
                const range = await adapter.fetchRange({ symbol, market, startTime: now - 3600 * 1000, endTime: now, limit: 300 });
                const sorted = range.every((c, i) => i === 0 || c.openTime >= range[i - 1].openTime);
                row.fetchRange = `${range.length} candles, sorted=${sorted}`;
            } catch (e) {
                row.fetchRange = `ERROR: ${e.message.slice(0, 60)}`;
            }

            // 3) earliestRemote probe (the shared startTime=0 approach)
            try {
                if (typeof adapter.earliestOpenTime === "function") {
                    const e = await adapter.earliestOpenTime({ symbol, market });
                    row.earliest = e ? new Date(e).toISOString() : "(null)";
                } else {
                    const p = await adapter.fetchKlines({ symbol, market, startTime: 0, endTime: undefined, limit: 1 });
                    row.earliest = p[0] ? new Date(p[0].openTime).toISOString() : "(empty)";
                }
            } catch (e) {
                row.earliest = `ERROR: ${e.message.slice(0, 60)}`;
            }

            results.push(row);
            console.log(`${row.venue.padEnd(8)} ${row.market.padEnd(8)} | klines=${row.fetchKlines} | range=${row.fetchRange} | earliest=${row.earliest}`);
        }
    }

    // Hard assertion: fetchRange must return data for every venue × market.
    // NOTE: parse the count instead of matching /0 candles/ — that substring also occurs inside
    // legit counts such as "10 candles" / "60 candles" / "300 candles" (false negative).
    for (const r of results) {
        assert.ok(!String(r.fetchRange).startsWith("ERROR"), `${r.venue} ${r.market} fetchRange failed: ${r.fetchRange}`);
        const count = String(r.fetchRange).match(/^(\d+) candles/);
        assert.ok(count && Number(count[1]) > 0, `${r.venue} ${r.market} fetchRange returned no data: ${r.fetchRange}`);
    }
    console.log("\nall fetchRange checks passed (every venue × market returns data)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

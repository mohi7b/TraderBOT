const assert = require("node:assert/strict");
const { BinanceHistoricalFetcher } = require("../collector/crypto/historical/_engine/fetch/crypto/binance.cjs");

async function main() {
    if (process.env.HISTORICAL_LIVE_TEST !== "1") {
        console.log("historical P4 live test skipped (set HISTORICAL_LIVE_TEST=1 to enable network access)");
        return;
    }

    const fetcher = new BinanceHistoricalFetcher({ timeoutMs: 10000, maxRetries: 2 });
    const candleTime = 1_700_000_040_000;
    const candles = await fetcher.fetchRange({
        symbol: process.env.HISTORICAL_LIVE_SYMBOL || "BTCUSDT",
        market: "spot",
        startTime: candleTime,
        endTime: candleTime,
        limit: 1,
    });
    assert.equal(candles.length, 1);
    assert.equal(candles[0].venue, "binance");
    assert.equal(candles[0].openTime, candleTime);
    console.log("historical P4 live validation passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
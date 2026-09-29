const assert = require("node:assert/strict");
const adapters = require("../collector/crypto/historical/_engine/fetch/crypto/index.cjs");

async function main() {
    if (process.env.HISTORICAL_LIVE_TEST !== "1") {
        console.log("historical P5 live test skipped (set HISTORICAL_LIVE_TEST=1 to enable network access)");
        return;
    }

    const venues = (process.env.HISTORICAL_P5_VENUES || "bybit,okx,kucoin,bitget").split(",");
    const candleTime = 1_788_357_720_000;
    for (const venue of venues) {
        const adapter = adapters[venue]();
        const candles = await adapter.fetchRange({ symbol: "BTCUSDT", market: "futures", startTime: candleTime, endTime: candleTime, limit: 1 });
        assert.equal(candles.length, 1, `${venue} returned no candle`);
        assert.equal(candles[0].venue, venue);
        assert.equal(candles[0].openTime, candleTime);
    }
    console.log("historical P5 live validation passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
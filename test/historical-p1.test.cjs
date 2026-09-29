const assert = require("node:assert/strict");
const { BinanceHistoricalFetcher } = require("../collector/crypto/historical/_engine/fetch/crypto/binance.cjs");
const { getGaps, mergeCoverage } = require("../collector/crypto/historical/_engine/fetch/coverage.cjs");
const { createHttpClient } = require("../collector/crypto/historical/_engine/fetch/client.cjs");

const requests = [];
const rows = [
    [1_000, "100", "101", "99", "100.5", "12", 1_059, "1206", 4, "7", "702"],
    [61_000, "100.5", "102", "100", "101", "13", 61_059, "1313", 5, "8", "808"],
];
const fetcher = new BinanceHistoricalFetcher({
    httpClient: {
        async requestJson(url) {
            requests.push(url);
            if (requests.length === 3) return [];
            return requests.length === 1 ? rows : rows.slice().reverse();
        },
    },
});

(async function main() {
    const retryDelays = [];
    let attempts = 0;
    const reliableClient = createHttpClient({
        maxRetries: 2,
        sleep: async (delayMs) => retryDelays.push(delayMs),
        fetchImpl: async () => {
            attempts += 1;
            if (attempts === 1) return { ok: false, status: 429, headers: { get: () => "2" } };
            return { ok: true, async json() { return { ok: true }; } };
        },
    });
    assert.deepEqual(await reliableClient.requestJson("https://example.test"), { ok: true });
    assert.equal(attempts, 2);
    assert.deepEqual(retryDelays, [2000]);

    const candles = await fetcher.fetchKlines({
        symbol: "btcusdt",
        market: "futures",
        startTime: 1_000,
        endTime: 61_000,
        limit: 2,
    });
    assert.equal(requests.length, 1);
    assert.match(requests[0], /^https:\/\/fapi\.binance\.com\/fapi\/v1\/klines\?/);
    assert.match(requests[0], /symbol=BTCUSDT/);
    assert.equal(candles[0].symbol, "BTCUSDT");
    assert.equal(candles[0].close, 100.5);
    assert.equal(candles[0].quoteVolume, 1206);
    const range = await fetcher.fetchRange({ symbol: "BTCUSDT", market: "futures", startTime: 1_000, endTime: 61_000, limit: 2 });
    assert.deepEqual(range.map(({ openTime }) => openTime), [1_000, 61_000]);

    assert.deepEqual(mergeCoverage([
        { startTime: 10, endTime: 20 },
        { startTime: 21, endTime: 30 },
        { startTime: 40, endTime: 50 },
    ]), [{ startTime: 10, endTime: 30 }, { startTime: 40, endTime: 50 }]);
    assert.deepEqual(getGaps([{ startTime: 10, endTime: 20 }], 0, 30), [
        { startTime: 0, endTime: 9 },
        { startTime: 21, endTime: 30 },
    ]);
    console.log("historical P1 validation passed");
})();
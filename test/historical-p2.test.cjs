const assert = require("node:assert/strict");
const adapters = require("../collector/crypto/historical/_engine/fetch/crypto/index.cjs");

const cases = [
    ["bybit", { retCode: 0, result: { list: [["1000", "1", "2", "0.5", "1.5", "10"]] } }],
    ["okx", { code: "0", data: [["1000", "1", "2", "0.5", "1.5", "10", "10", "9", "3", "0", "0"]] }],
    ["kucoin", { code: "200000", data: [["1", "1", "1.5", "2", "0.5", "10", "9"]] }],
    ["bitget", { code: "00000", data: [["1000", "1", "2", "0.5", "1.5", "10", "9", "3", "0", "0", "0"]] }],
];

(async function main() {
    for (const [venue, response] of cases) {
        const adapter = adapters[venue]({ httpClient: { requestJson: async () => response } });
        const [candle] = await adapter.fetchKlines({ symbol: "btcusdt", startTime: 1000, endTime: 2000, limit: 10 });
        assert.equal(candle.venue, venue);
        assert.equal(candle.symbol, "BTCUSDT");
        assert.equal(candle.close, 1.5);
        assert.equal(candle.openTime, venue === "kucoin" ? 1000 : 1000);
    }
    console.log("historical P2 validation passed");
})();
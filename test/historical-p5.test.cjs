const assert = require("node:assert/strict");
const adapters = require("../collector/crypto/historical/_engine/fetch/crypto/index.cjs");

const responses = {
    bybit: { retCode: 0, result: { list: [["1000", "1", "2", "0.5", "1.5", "10"]] } },
    okx: { code: "0", data: [["1000", "1", "2", "0.5", "1.5", "10", "10", "9", "3", "0", "0"]] },
    kucoin: { code: "200000", data: [["1", "1", "2", "0.5", "1.5", "10", "9"]] },
    bitget: { code: "00000", data: [["1000", "1", "2", "0.5", "1.5", "10", "9", "3", "0", "0", "0"]] },
};

const expected = {
    bybit: ["category=linear", "symbol=BTCUSDT"],
    okx: ["instId=BTC-USDT-SWAP"],
    kucoin: ["symbol=XBTUSDTM"],
    bitget: ["productType=USDT-FUTURES", "symbol=BTCUSDT"],
};

(async function main() {
    for (const venue of Object.keys(responses)) {
        const urls = [];
        const adapter = adapters[venue]({
            httpClient: {
                async requestJson(url) {
                    urls.push(url);
                    return responses[venue];
                },
            },
        });
        const [candle] = await adapter.fetchKlines({ symbol: "BTCUSDT", market: "futures", startTime: 1000, endTime: 2000, limit: 10 });
        assert.equal(candle.venue, venue);
        assert.equal(candle.openTime, 1000);
        for (const fragment of expected[venue]) assert.match(urls[0], new RegExp(fragment));
        assert.equal(typeof adapter.fetchRange, "function");
    }
    console.log("historical P5 validation passed");
})();
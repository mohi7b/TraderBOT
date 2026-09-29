const assert = require("node:assert/strict");
const OKXFuturesWS = require("../collector/crypto/realtime/venues/okx/futures/ws.cjs");

async function main() {
    const events = [];
    const originalFetch = global.fetch;
    global.fetch = async (url) => ({
        ok: true,
        json: async () => {
            if (url.includes("funding-rate")) {
                return { code: "0", data: [{ fundingRate: "0.0001", nextFundingTime: "1787558400000", ts: "1787512364026" }] };
            }
            if (url.includes("mark-price")) {
                return { code: "0", data: [{ markPx: "77240.6", ts: "1787512364026" }] };
            }
            if (url.includes("open-interest")) {
                return { code: "0", data: [{ oi: "2959787.54", oiCcy: "29597.8754", oiUsd: "2285980067.36", ts: "1787512364296" }] };
            }
            return { code: "0", data: [["1787512320000", "77238.1", "77240.1", "77230", "77240.1", "763.24", "7.6324", "589473.8912", "0"]] };
        }
    });

    try {
        const ws = new OKXFuturesWS({
            symbol: "BTCUSDT",
            handler: (packet) => events.push(packet),
            onCritical: (error) => { throw error; }
        });

        await ws.fetchMarketFallbacks();
        ws.handleMessage(JSON.stringify({
            arg: { channel: "tickers", instId: "BTC-USDT-SWAP" },
            data: [{ last: "77234.5", ts: "1787512352367" }]
        }));
        ws.handleMessage(JSON.stringify({
            arg: { channel: "trades", instId: "BTC-USDT-SWAP" },
            data: [{ px: "77234.5", sz: "0.37", side: "buy", ts: "1787512352367" }]
        }));
        ws.handleMessage(JSON.stringify({
            arg: { channel: "candle1m", instId: "BTC-USDT-SWAP" },
            data: [["1787512320000", "77238.1", "77240.1", "77230", "77240.1", "763.24", "7.6324", "589473.8912", "0"]]
        }));

        const byType = (type) => events.find((event) => event.data.type === type);
        assert.equal(byType("funding").data.rate, 0.0001);
        assert.equal(byType("mark_price").data.price, 77240.6);
        assert.equal(byType("oi").data.oi, 2959787.54);
        assert.equal(byType("candle").data.close, 77240.1);
        assert.equal(byType("price").data.price, 77234.5);
        assert.equal(byType("trade").data.tradeQty, 0.37);
        console.log("okx futures live contract validation passed");
    } finally {
        global.fetch = originalFetch;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

const assert = require("node:assert/strict");
const KucoinFuturesWS = require("../collector/crypto/realtime/venues/kucoin/futures/ws.cjs");

async function main() {
    const events = [];
    const originalFetch = global.fetch;
    global.fetch = async (url) => ({
        ok: true,
        json: async () => {
            if (url.includes("/contracts/")) {
                return {
                    code: "200000",
                    data: {
                        markPrice: 77312.6,
                        indexPrice: 77323.49,
                        fundingFeeRate: 0.0001,
                        currentFundingRateGranularity: 28800000,
                        openInterest: "21404315",
                        multiplier: 0.001,
                        ts: 1787512000000
                    }
                };
            }

            return {
                code: "200000",
                data: [[1787511960000, 77309.5, 77320.1, 77302.3, 77312.6, 382, 29545012]]
            };
        }
    });

    try {
        const ws = new KucoinFuturesWS({
            symbol: "BTCUSDT",
            handler: (packet) => events.push(packet),
            onCritical: (error) => { throw error; }
        });

        await ws.fetchMarketFallbacks();
        ws.handleMessage(JSON.stringify({
            type: "message",
            topic: "/contractMarket/ticker:XBTUSDTM",
            data: { price: "77314.3", ts: "1787512000000000000" }
        }));
        ws.handleMessage(JSON.stringify({
            type: "message",
            topic: "/contractMarket/execution:XBTUSDTM",
            data: { price: "77314.3", size: 5, side: "buy", ts: "1787512000000000000" }
        }));

        const byType = (type) => events.find((event) => event.data.type === type);
        assert.equal(byType("mark_price").data.price, 77312.6);
        assert.equal(byType("funding").data.rate, 0.0001);
        assert.equal(byType("oi").data.oi, 21404315);
        assert.equal(byType("oi").data.oiBase, 21404.315);
        assert.equal(byType("oi").data.oiUsd, 21404.315 * 77312.6);
        assert.equal(byType("candle").data.close, 77312.6);
        assert.equal(byType("price").data.price, 77314.3);
        assert.equal(byType("trade").data.tradeQty, 5);
        console.log("kucoin futures live contract validation passed");
    } finally {
        global.fetch = originalFetch;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

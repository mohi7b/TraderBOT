const assert = require("node:assert/strict");
const spotHandler = require("../collector/crypto/realtime/aanode/spot-handler.cjs");

const exchanges = ["binance", "bybit", "bitget", "kucoin", "okx"];
const objectDepthExchanges = new Set(["binance", "bitget", "kucoin", "okx"]);

function emittedNames(events) {
    return events.map((event) => event.event).filter((event) => typeof event === "string");
}

(function main() {
    const events = [];
    global.healthEmit = (event) => events.push(event);
    global.orchestrator = { route: () => {} };

    for (const exchange of exchanges) {
        const before = events.length;
        const timestamp = Date.now();
        const depth = objectDepthExchanges.has(exchange)
            ? {
                bids: [{ price: 100.9, qty: 2 }],
                asks: [{ price: 101.1, qty: 1.5 }]
            }
            : {
                bids: [[100.9, 2]],
                asks: [[101.1, 1.5]]
            };

        spotHandler({
            symbol: "BTCUSDT",
            data: {
                exchange,
                price: 101,
                qty: 0.5,
                side: "buy",
                timestamp
            }
        });
        spotHandler({ symbol: "BTCUSDT", data: { exchange, timestamp, ...depth } });
        spotHandler({
            symbol: "BTCUSDT",
            data: {
                exchange,
                open: 100,
                high: 102,
                low: 99,
                close: 101,
                volume: 10,
                timestamp
            }
        });

        const names = emittedNames(events.slice(before));
        assert.ok(names.includes("depth_20"), `${exchange} depth should reach the Spot depth pipeline`);
        assert.ok(names.includes("liquidity_heatmap"), `${exchange} depth should reach the Spot liquidity pipeline`);
        assert.ok(names.includes("candle"), `${exchange} candle should reach the Spot candle pipeline`);
        assert.ok(names.includes("orderflow"), `${exchange} trade should reach the Spot order-flow pipeline`);
    }

    console.log(`spot stage validation passed: ${exchanges.length} exchanges × 3 core packet types`);
})();

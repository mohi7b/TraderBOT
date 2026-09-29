const assert = require("node:assert/strict");
const futuresHandler = require("../collector/crypto/realtime/aanode/futures-handler.cjs");

const exchanges = ["binance", "bybit", "bitget", "kucoin", "okx"];
const categories = [
    {
        key: "price",
        build: (exchange) => ({
            exchange,
            market: "futures",
            symbol: "BTCUSDT",
            type: "trade",
            price: 101.25,
            qty: 1.5,
            side: "buy"
        }),
        healthEvent: "price"
    },
    {
        key: "depth",
        build: (exchange) => ({
            exchange,
            market: "futures",
            symbol: "BTCUSDT",
            type: "depth_full_snapshot",
            bids: [{ price: 100.95, qty: 2.0 }, { price: 100.9, qty: 1.5 }],
            asks: [{ price: 101.05, qty: 1.8 }, { price: 101.1, qty: 2.2 }]
        }),
        healthEvent: "depth"
    },
    {
        key: "candles",
        build: (exchange) => ({
            exchange,
            market: "futures",
            symbol: "BTCUSDT",
            type: "candle",
            open: 100.5,
            high: 101.7,
            low: 99.8,
            close: 101.2,
            volume: 42.8
        }),
        healthEvent: "candles"
    },
    {
        key: "funding",
        build: (exchange) => ({
            exchange,
            market: "futures",
            symbol: "BTCUSDT",
            type: "funding",
            rate: 0.00012,
            nextFundingTime: 1700000000000
        }),
        healthEvent: "funding"
    },
    {
        key: "liquidation",
        build: (exchange) => ({
            exchange,
            market: "futures",
            symbol: "BTCUSDT",
            type: "liquidation",
            price: 100.3,
            qty: 5.4,
            side: "sell"
        }),
        healthEvent: "liquidation"
    },
    {
        key: "markPrice",
        build: (exchange) => ({
            exchange,
            market: "futures",
            symbol: "BTCUSDT",
            type: "mark_price",
            price: 101.18,
            indexPrice: 101.05
        }),
        healthEvent: "markPrice"
    },
    {
        key: "oi",
        build: (exchange) => ({
            exchange,
            market: "futures",
            symbol: "BTCUSDT",
            type: "oi",
            oi: 12345.67
        }),
        healthEvent: "oi"
    }
];

function runCase(exchange, category, healthEvents) {
    const packet = category.build(exchange);
    const output = futuresHandler({ symbol: packet.symbol, data: packet });
    assert.ok(Array.isArray(output), `${exchange} ${category.key} should return an array`);
    assert.ok(healthEvents.some(item => item.event === category.healthEvent), `${exchange} ${category.key} should trigger ${category.healthEvent}`);
}

(function main() {
    const healthEvents = [];
    global.healthEmit = (event) => {
        if (event && event.event) healthEvents.push(event);
    };
    global.debugTrace = () => {};

    for (const exchange of exchanges) {
        for (const category of categories) {
            runCase(exchange, category, healthEvents);
        }
    }

    console.log(`exchange stage validation passed: ${exchanges.length} exchanges × ${categories.length} stages = ${exchanges.length * categories.length} checks`);
})();

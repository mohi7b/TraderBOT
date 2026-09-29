const assert = require("node:assert/strict");
const { getMarketStatus } = require("../orchestrator/utils/runtime-status.cjs");

(function main() {
    global.marketAggregates = new Map([["BTCUSDT", { symbol: "BTCUSDT", crossMarket: { basis: 10 } }]]);
    global.marketIndicators = new Map([["BTCUSDT", { symbol: "BTCUSDT", basis: { value: 10 } }]]);
    global.fundamentalAggregates = new Map([["BTCUSDT", { symbol: "BTCUSDT", regime: { direction: "bullish" } }]]);
    global.marketHealth = [{ symbol: "BTCUSDT", status: "healthy" }, { symbol: "ETHUSDT", status: "stale" }];
    global.liquidationHealth = [{ exchange: "binance", status: "collecting" }];

    const status = getMarketStatus("BTCUSDT");
    assert.equal(status.aggregate.symbol, "BTCUSDT");
    assert.equal(status.indicators.basis.value, 10);
    assert.equal(status.fundamentals.regime.direction, "bullish");
    assert.equal(status.marketHealth.length, 1);
    assert.equal(status.liquidation[0].status, "collecting");
    console.log("runtime status validation passed");
})();
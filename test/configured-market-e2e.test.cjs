const assert = require("node:assert/strict");
const exchanges = require("../orchestrator/aanode/config/exchanges.cjs");
const collectorConfig = require("../collector/aanode/config/collector.cjs");

(function main() {
    const symbols = ["BTCUSDT"];
    const expectedExchanges = ["binance", "bybit", "bitget", "kucoin", "okx"];
    const plan = collectorConfig.buildCollectorPlan(symbols);

    for (const exchange of expectedExchanges) {
        assert.equal(exchanges.getEnabledMarkets(exchange).futures, true, `${exchange} Futures should be enabled`);
        assert.equal(exchanges.getEnabledMarkets(exchange).spot, true, `${exchange} Spot should be enabled`);
        assert.ok(plan.some((task) => task.exchange === exchange && task.marketType === "futures" && task.symbol === "BTCUSDT"));
        assert.ok(plan.some((task) => task.exchange === exchange && task.marketType === "spot" && task.symbol === "BTCUSDT"));
    }

    assert.equal(plan.length, expectedExchanges.length * 2);
    console.log(`configured market E2E validation passed: ${expectedExchanges.length} exchanges × 2 markets`);
})();

const assert = require("node:assert/strict");
const LiquidationObserver = require("../collector/crypto/common/liquidation-observer.cjs");

(function main() {
    const observer = new LiquidationObserver({
        exchanges: ["binance", "bybit"],
        capabilities: { bybit: false },
        windowMs: 1000,
        startedAt: 10000
    });

    assert.equal(observer.observe({ exchange: "binance", market: "spot", event: "liquidation" }), false);
    assert.equal(observer.observe({ exchange: "binance", market: "futures", event: "liquidation" }), true);

    const active = observer.snapshot(10500);
    assert.equal(active.find((item) => item.exchange === "binance").status, "validated");
    assert.equal(active.find((item) => item.exchange === "bybit").status, "unavailable_public_feed");

    const expired = observer.snapshot(11001);
    assert.equal(expired.find((item) => item.exchange === "bybit").status, "unavailable_public_feed");
    console.log("liquidation observer validation passed");
})();
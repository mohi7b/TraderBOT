const assert = require("node:assert/strict");
const { normalizeOpenInterest } = require("../collector/crypto/common/open-interest-normalizer.cjs");

(function main() {
    const rawOnly = normalizeOpenInterest({ exchange: "binance", payload: { oi: 1000 } });
    assert.equal(rawOnly.oiContracts, 1000);
    assert.equal(rawOnly.oiUsd, null);
    assert.equal(rawOnly.aggregateEligible, false);

    const usd = normalizeOpenInterest({ exchange: "okx", payload: { oi: 1000, oiCcy: 2, oiUsd: 150000 } });
    assert.equal(usd.oiContracts, 1000);
    assert.equal(usd.oiBase, 2);
    assert.equal(usd.oiUsd, 150000);
    assert.equal(usd.aggregateEligible, true);
    console.log("open interest normalization validation passed");
})();
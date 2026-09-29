const assert = require("node:assert/strict");
const indicators = require("../collector/crypto/realtime/aggregator/market-indicator-service.cjs");

(function main() {
    const buildAggregate = ({ basis, oiUsd, spotDelta, futuresDelta }) => ({
        symbol: "BTCUSDT",
        crossMarket: { basis, basisBps: basis },
        spot: { aggregate: { trades: { "1m": { deltaVolume: spotDelta } }, depth: { bucketsBps: { 5: { imbalance: 0.2 } } } } },
        futures: { aggregate: { trades: { "1m": { deltaVolume: futuresDelta } }, funding: { averageRate: 0.0001 }, oi: { totalUsd: oiUsd }, depth: { bucketsBps: { 5: { imbalance: -0.1 } } } } }
    });

    indicators.ingest(buildAggregate({ basis: 5, oiUsd: 100, spotDelta: 2, futuresDelta: 3 }));
    const value = indicators.ingest(buildAggregate({ basis: 7, oiUsd: 120, spotDelta: 2, futuresDelta: -3 }));
    assert.equal(value.basis.trend, 2);
    assert.equal(value.fundingOi.oiDeltaUsd, 20);
    assert.equal(value.orderFlow.divergence, true);
    assert.equal(value.liquidity.futuresImbalance5Bps, -0.1);
    assert.equal(value.technical.return1, null);
    console.log("market indicator validation passed");
})();
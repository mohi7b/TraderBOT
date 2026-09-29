const assert = require("node:assert/strict");
const { ChartDataService } = require("../collector/crypto/realtime/aggregator/chart-data-service.cjs");

(function main() {
    const service = new ChartDataService({ sampleMs: 1000, maxPoints: 2 });
    assert.equal(service.definitions().length, 5);
    const aggregate = {
        symbol: "BTCUSDT",
        spot: { aggregate: {
            price: { median: 100, weightedMedian: 100.1 },
            trades: { "1m": { vwap: 99.9, deltaVolume: 2, imbalance: 0.2 } },
            depth: { bidLiquidity: 10, askLiquidity: 8 }
        } },
        futures: { aggregate: {
            price: { median: 101, weightedMedian: 101.1 },
            markPrice: { median: 101.05 },
            trades: { "1m": { vwap: 101, deltaVolume: -1, imbalance: -0.1 } },
            funding: { averageRate: 0.0001 },
            oi: { totalUsd: 100000 },
            depth: { bidLiquidity: 12, askLiquidity: 15 }
        } },
        crossMarket: { basis: 1, basisBps: 100 }
    };
    const indicators = {
        technical: { ema9: 100.5, ema21: 100, sma20: 99.5 },
        basis: { trend: 0.1 },
        fundingOi: { oiDeltaUsd: 500 },
        liquidity: { spotSpreadBps: 2, spotImbalance5Bps: 0.1, futuresImbalance5Bps: -0.1 }
    };

    service.ingest(aggregate, indicators, 1000);
    service.ingest(aggregate, indicators, 1500);
    service.ingest(aggregate, indicators, 2000);
    const chart = service.get("BTCUSDT");
    assert.equal(chart.price.length, 2);
    assert.equal(chart.price[0].time, 1000);
    assert.equal(chart.price[1].time, 2000);
    assert.equal(chart.price[1].ema9, 100.5);
    assert.equal(chart.volumeFlow[1].spotDelta, 2);
    assert.equal(chart.basis[1].bps, 100);
    assert.equal(chart.fundingOi[1].oiUsd, 100000);
    assert.equal(chart.liquidity[1].futuresAskLiquidity, 15);
    console.log("chart data validation passed");
})();

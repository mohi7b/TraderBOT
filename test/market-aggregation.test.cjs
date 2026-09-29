const assert = require("node:assert/strict");
const MarketAggregationService = require("../collector/crypto/realtime/aggregator/market-aggregation-service.cjs");
const RealtimeSymbolAggregator = require("../collector/crypto/realtime/aggregator/realtime-symbol-aggregator.cjs");

(function main() {
    const now = Date.now();
    MarketAggregationService.ingest({
        exchange: "binance", market: "spot", symbol: "BTCUSDT", type: "depth", timestamp: now,
        bids: [[100, 2]], asks: [[101, 3]]
    });
    MarketAggregationService.ingest({
        exchange: "bybit", market: "spot", symbol: "BTCUSDT", type: "price", price: 102, timestamp: now + 1
    });
    MarketAggregationService.ingest({
        exchange: "binance", market: "spot", symbol: "BTCUSDT", type: "price", price: 100, timestamp: now + 2
    });
    MarketAggregationService.ingest({
        exchange: "binance", market: "spot", symbol: "BTCUSDT", type: "trade", price: 100, qty: 2, side: "buy", timestamp: now + 3
    });
    MarketAggregationService.ingest({
        exchange: "bybit", market: "spot", symbol: "BTCUSDT", type: "trade", price: 102, qty: 1, side: "sell", timestamp: now + 4
    });
    MarketAggregationService.ingest({
        exchange: "binance", market: "futures", symbol: "BTCUSDT", type: "price", price: 103, timestamp: now + 5
    });
    MarketAggregationService.ingest({
        exchange: "bybit", market: "futures", symbol: "BTCUSDT", type: "funding", rate: 0.0001, timestamp: now + 6
    });
    MarketAggregationService.ingest({
        exchange: "okx", market: "futures", symbol: "BTCUSDT", type: "oi", oi: 5000, oiUsd: 250000, timestamp: now + 7
    });

    const aggregate = MarketAggregationService.get("BTCUSDT");
    assert.equal(MarketAggregationService.venueState.values({ symbol: "BTCUSDT" }).length, 5);
    assert.equal(MarketAggregationService.symbolState.get("BTCUSDT").symbol, "BTCUSDT");
    assert.equal(aggregate.spot.aggregate.price.median, 101);
    assert.equal(aggregate.spot.aggregate.depth.bestBid, 100);
    assert.equal(aggregate.spot.aggregate.depth.askLiquidity, 3);
    assert.equal(aggregate.spot.aggregate.depth.bucketsBps[50].bidLiquidity, 2);
    assert.equal(aggregate.spot.aggregate.trades["1m"].buyVolume, 2);
    assert.equal(aggregate.spot.aggregate.trades["1m"].sellVolume, 1);
    assert.equal(aggregate.spot.aggregate.trades["1m"].vwap, 100 + 2 / 3);
    assert.equal(aggregate.spot.aggregate.candle["1m"].open, 100);
    assert.equal(aggregate.spot.aggregate.candle["1m"].close, 102);
    assert.equal(aggregate.spot.aggregate.candle["1m"].volume, 3);
    assert.equal(aggregate.futures.aggregate.price.median, 103);
    assert.equal(aggregate.futures.aggregate.funding.averageRate, 0.0001);
    assert.equal(aggregate.futures.aggregate.oi.totalUsd, 250000);
    assert.equal(aggregate.futures.aggregate.oi.rawByVenue.okx.oiContracts, 5000);
    assert.equal(aggregate.crossMarket.basis, 2);
    assert.equal(aggregate.crossMarket.basisBps, 2 / 101 * 10000);

    const staleAggregate = new RealtimeSymbolAggregator().aggregate("ETHUSDT", [{
        exchange: "binance",
        market: "spot",
        symbol: "ETHUSDT",
        price: 100,
        updatedAt: Date.now() - 30001,
        quality: { sequenceStatus: "healthy" }
    }]);
    assert.equal(staleAggregate.spot.aggregate.venuesHealthy, 0);
    assert.equal(staleAggregate.spot.aggregate.venuesExcluded, 1);
    console.log("market aggregation validation passed");
})();

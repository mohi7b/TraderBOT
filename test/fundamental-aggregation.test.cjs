const assert = require("node:assert/strict");
const { createFundamentalEvent } = require("../collector/crypto/common/fundamental-event.cjs");
const FundamentalStateStore = require("../collector/crypto/realtime/state/fundamental-state-store.cjs");
const FundamentalAggregator = require("../collector/crypto/realtime/aggregator/fundamental-aggregator.cjs");

(function main() {
    const store = new FundamentalStateStore({ clock: () => 1000 });
    store.ingest(createFundamentalEvent({ id: "macro-1", type: "macro", source: "fed", horizon: "yearly", direction: "bearish", importance: 0.8, timestamp: 900 }));
    store.ingest(createFundamentalEvent({ id: "macro-2", type: "macro", source: "cpi", horizon: "monthly", direction: "bearish", importance: 0.7, timestamp: 950 }));
    store.ingest(createFundamentalEvent({ id: "news-1", type: "news", source: "wire", horizon: "short", direction: "bullish", importance: 0.9, timestamp: 990 }));
    store.ingest(createFundamentalEvent({ id: "sentiment-1", type: "sentiment", source: "index", horizon: "short", direction: "bullish", importance: 0.8, timestamp: 995 }));
    assert.equal(store.ingest({ ...store.snapshot()[0] }), null);

    const aggregate = new FundamentalAggregator().aggregate("BTCUSDT", store.values({ symbol: "BTCUSDT" }));
    assert.equal(aggregate.regime.direction, "bearish");
    assert.equal(aggregate.shortShock.active, true);
    assert.equal(aggregate.byHorizon.short.count, 2);
    assert.equal(aggregate.rangeContext.eventCount, 4);
    console.log("fundamental aggregation validation passed");
})();

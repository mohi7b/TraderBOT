const assert = require("node:assert/strict");
const { MarketDataQuality } = require("../collector/crypto/common/market-data-quality.cjs");

(function main() {
    const quality = new MarketDataQuality();
    const packet = {
        exchange: "okx",
        market: "spot",
        symbol: "BTCUSDT",
        type: "depth",
        source: "websocket",
        timestamp: 1000,
        sequence: { seqId: 10 },
        bids: [[100, 2], [99, 1]],
        asks: [[101, 1.5]]
    };

    assert.equal(quality.accept(packet), true, "first packet should be accepted");
    assert.equal(quality.accept(packet), false, "identical packet should be deduplicated");
    assert.equal(quality.accept({ ...packet, timestamp: 1001, sequence: { seqId: 11 } }), true, "new sequence should be accepted");

    quality.record(packet);
    const [healthy] = quality.snapshot(Date.now());
    assert.equal(healthy.source, "websocket");
    assert.equal(healthy.depthLevels, 3);
    assert.equal(healthy.status, "healthy");

    const [stale] = quality.snapshot(healthy.lastReceivedAt + healthy.freshnessMs + 1);
    assert.equal(stale.status, "stale");

    quality.record({
        exchange: "binance",
        market: "futures",
        symbol: "BTCUSDT",
        type: "funding",
        source: "rest",
        timestamp: 1000
    });
    const funding = quality.snapshot().find((record) => record.eventType === "funding");
    assert.equal(funding.source, "rest");
    assert.equal(funding.freshnessMs, 30000);

    /* fix #7 — freshness always follows OUR clock, never the venue's:
     * a carrier with a wrong clock (±8h) must not make the feed look stale or
     * fresh, and an absurd `receiveTimestamp` is ignored rather than trusted. */
    const skewed = new MarketDataQuality();
    const now = Date.now();
    skewed.record({
        exchange: "bitget",
        market: "spot",
        symbol: "BTCUSDT",
        type: "price",
        timestamp: now - 8 * 60 * 60 * 1000,
        receiveTimestamp: now
    });

    const [skewedRecord] = skewed.snapshot(now + 100);
    assert.equal(skewedRecord.status, "healthy", "a late venue clock must not age the record");
    assert.equal(skewedRecord.clockSkewMs, -8 * 60 * 60 * 1000, "the skew is reported, not hidden");
    assert.equal(skewedRecord.lastReceivedAt, now, "freshness is measured from the local receive time");

    const foreign = new MarketDataQuality();
    foreign.record({ exchange: "x", market: "spot", symbol: "YUSDT", type: "price", receiveTimestamp: now + 60 * 60 * 1000 });
    const [foreignRecord] = foreign.snapshot(now);
    assert.equal(Math.abs(foreignRecord.lastReceivedAt - now) < 5000, true, "a foreign receiveTimestamp is not trusted");
    assert.equal(foreignRecord.status, "healthy");

    /* an explicit `now` argument keeps record()/snapshot() on the same clock */
    const explicit = new MarketDataQuality();
    explicit.record({ exchange: "x", market: "spot", symbol: "ZUSDT", type: "price" }, now);
    const [explicitRecord] = explicit.snapshot(now + 6000);
    assert.equal(explicitRecord.lastReceivedAt, now);
    assert.equal(explicitRecord.status, "stale", "6000ms > 5000ms freshness for price");

    console.log("market data quality validation passed");
})();

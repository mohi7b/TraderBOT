const assert = require("assert");
const { createCanonicalFuturesPacket } = require("../collector/crypto/common/canonical-futures-packet.cjs");
const CrossVenueDepthAggregator = require("../collector/crypto/common/cross-venue-depth-aggregator.cjs");

const aggregator = new CrossVenueDepthAggregator({ staleAfterMs: 1000, tickSize: 0.1 });
const now = Date.now();

function packet(exchange, bids, asks, status = "healthy") {
    return createCanonicalFuturesPacket({
        exchange,
        market: "futures",
        symbol: "BTCUSDT",
        type: "depth_full_diff",
        timestamp: now,
        receiveTimestamp: now,
        sequenceStatus: status,
        bids,
        asks,
        payload: { bids, asks }
    });
}

assert.equal(aggregator.update(packet("binance", [{ price: 100.04, qty: 2 }], [{ price: 100.16, qty: 1 }])).sourceCount, 1);
const result = aggregator.update(packet("okx", [{ price: 100.05, qty: 3 }], [{ price: 100.15, qty: 4 }]));
assert.equal(result.sourceCount, 2);
assert.equal(result.bids[0].price, 100);
assert.equal(result.bids[0].bidQty, 5);
assert.equal(result.asks[0].price, 100.2);
assert.equal(result.asks[0].askQty, 5);
assert.equal(aggregator.update(packet("bybit", [{ price: 99.9, qty: 1 }], [], "invalid")), null);
assert.equal(aggregator.snapshot("BTCUSDT").sourceCount, 2);
console.log("canonical depth aggregation tests passed");

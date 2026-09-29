const assert = require("node:assert/strict");
const Bybit = require("../collector/crypto/realtime/venues/bybit/futures/orderbook-sync.cjs");
const Bitget = require("../collector/crypto/realtime/venues/bitget/futures/orderbook-sync.cjs");
const OKX = require("../collector/crypto/realtime/venues/okx/futures/orderbook-sync.cjs");
const Kucoin = require("../collector/crypto/realtime/venues/kucoin/futures/orderbook-sync.cjs");

function run(name, Sync, snapshot, updates) {
    const output = [];
    const sync = new Sync({ onSnapshot: value => output.push({ kind: "snapshot", value }), onUpdate: value => output.push({ kind: "update", value }) });
    sync.setSnapshot(snapshot);
    assert.equal(sync.status, "healthy", `${name} snapshot should be healthy`);
    assert.equal(sync.push(updates.valid), true, `${name} valid update should apply`);
    assert.equal(sync.push(updates.stale), false, `${name} stale update should be rejected`);
    assert.equal(sync.status, "invalid", `${name} stale update should invalidate the book`);
    assert.equal(output[0].value.bids[0].price, 100, `${name} normalized snapshot bids`);
    assert.equal(output[1].value.bids[0].qty, 3, `${name} normalized update bids`);
}

run("Bybit", Bybit, { u: 10, b: [["100", "2"]], a: [["101", "4"]] }, {
    valid: { u: 11, pu: 10, b: [["100", "3"]], a: [], cts: 11 },
    stale: { u: 13, pu: 12, b: [], a: [], cts: 13 }
});

run("Bitget", Bitget, { seq: 20, bids: [["100", "2"]], asks: [["101", "4"]] }, {
    valid: { seq: 21, pseq: 20, bids: [["100", "3"]], asks: [], ts: 21 },
    stale: { seq: 23, pseq: 22, bids: [], asks: [], ts: 23 }
});

run("Bitget (legacy prevSeq payload)", Bitget, { seq: 20, bids: [["100", "2"]], asks: [["101", "4"]] }, {
    valid: { seq: 21, prevSeq: 20, bids: [["100", "3"]], asks: [], ts: 21 },
    stale: { seq: 23, prevSeq: 22, bids: [], asks: [], ts: 23 }
});

run("OKX", OKX, { seqId: 30, bids: [["100", "2"]], asks: [["101", "4"]] }, {
    valid: { seqId: 31, prevSeqId: 30, bids: [["100", "3"]], asks: [], ts: 31 },
    stale: { seqId: 33, prevSeqId: 32, bids: [], asks: [], ts: 33 }
});

run("KuCoin", Kucoin, { sequence: 40, bids: [["100", "2"]], asks: [["101", "4"]] }, {
    valid: { sequence: 41, change: "100,buy,3", timestamp: 41 },
    stale: { sequence: 43, change: "101,sell,0", timestamp: 43 }
});

// KuCoin futures emits `price,side,size`; the spot feed emits `side,price,size`.
assert.deepEqual(Kucoin.parseChange("100.5,buy,3"), { side: "buy", price: 100.5, size: 3 });
assert.deepEqual(Kucoin.parseChange("buy,100.5,3"), { side: "buy", price: 100.5, size: 3 });
assert.deepEqual(Kucoin.parseChange("sell,101,0"), { side: "sell", price: 101, size: 0 });
assert.deepEqual(Kucoin.parseChange(["100.5,sell,2"]), { side: "sell", price: 100.5, size: 2 });
assert.equal(Kucoin.parseChange("100.5,,3"), null);
assert.equal(Kucoin.parseChange(""), null);

console.log("depth pilot offline tests passed");
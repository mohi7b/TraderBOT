/* ============================================================
 * File: test/notional-thresholds.test.cjs
 *
 * Whale / micro classification must be quote-currency based (notional),
 * not a raw base-asset quantity: 5000 SHIB and 5000 BTC are not the same
 * trade. See collector/crypto/common/notional-thresholds.cjs.
 * ============================================================ */

const assert = require("node:assert/strict");
const { DEFAULT_THRESHOLDS, notionalOf, thresholdsFor, classifyNotional } = require("../collector/crypto/common/notional-thresholds.cjs");

/* ------------------------------------------------------------
 * 1. defaults + notional
 * ---------------------------------------------------------- */
assert.deepEqual(thresholdsFor("BTCUSDT"), { bigNotional: 50000, microNotional: 100 });
assert.equal(DEFAULT_THRESHOLDS.bigNotional, 50000);
assert.equal(DEFAULT_THRESHOLDS.microNotional, 100);

assert.equal(notionalOf({ price: 100, qty: 2 }), 200);
assert.equal(notionalOf({ price: 100, tradeQty: 3 }), 300, "spot trades carry tradeQty as well");
assert.equal(notionalOf({ price: 100 }), null, "a trade without size has no notional");
assert.equal(notionalOf({ qty: 1 }), null);
assert.equal(notionalOf({ price: 0, qty: 10 }), null, "price 0 is not a price");
assert.equal(notionalOf({ price: -1, qty: 10 }), null);

/* ------------------------------------------------------------
 * 2. the same size flips class with the asset price
 * ---------------------------------------------------------- */
assert.equal(classifyNotional({ price: 100000, qty: 1 }, "BTCUSDT").kind, "big");
assert.equal(classifyNotional({ price: 0.00002, qty: 1 }, "SHIBUSDT").kind, "micro");
assert.equal(classifyNotional({ price: 3000, qty: 1 }, "ETHUSDT").kind, "normal");
assert.equal(classifyNotional({ price: 100, qty: 500 }, "BTCUSDT").kind, "big", "the big boundary is inclusive");
assert.equal(classifyNotional({ price: 100, qty: 1 }, "BTCUSDT").kind, "micro", "the micro boundary is inclusive");
assert.equal(classifyNotional({ price: 100, qty: 10 }, "BTCUSDT").kind, "normal");
assert.equal(classifyNotional({ price: 100 }, "BTCUSDT").kind, "unknown");
assert.equal(classifyNotional({ price: 100 }, "BTCUSDT").notional, null);

/* ------------------------------------------------------------
 * 3. runtime + per-symbol overrides
 * ---------------------------------------------------------- */
global.CONFIG = { orderflow: { bigNotional: 1000, symbols: { BTCUSDT: { bigNotional: 250000 } } } };

try {
    assert.equal(thresholdsFor("BTCUSDT").bigNotional, 250000, "a per-symbol override wins");
    assert.equal(thresholdsFor("ETHUSDT").bigNotional, 1000, "the global override applies to every other symbol");
    assert.equal(classifyNotional({ price: 3000, qty: 1 }, "ETHUSDT").kind, "big");
    assert.equal(classifyNotional({ price: 3000, qty: 1 }, "BTCUSDT").kind, "normal", "the symbol override keeps 3000 USDT normal");
    assert.equal(thresholdsFor("X").microNotional <= thresholdsFor("X").bigNotional, true, "micro can never exceed big");
} finally {
    delete global.CONFIG;
}

/* ------------------------------------------------------------
 * 4. the order-flow modules use the notional thresholds
 * ---------------------------------------------------------- */
const spotBigTrades = require("../collector/crypto/realtime/spot/orderflow/big_trades.cjs");
const spotMicroTrades = require("../collector/crypto/realtime/spot/orderflow/micro_trades.cjs");

function run(module, symbol, data) {
    const emitted = [];
    module({ symbol, data, emit: (event) => emitted.push(event) });
    return emitted;
}

const whale = run(spotBigTrades, "BTCUSDT", { price: 60000, qty: 2, side: "buy", timestamp: 1 });
assert.equal(whale.length, 1);
assert.equal(whale[0].event, "big_trades");
assert.equal(whale[0].notional, 120000);
assert.equal(whale[0].notionalThreshold, 50000);
assert.equal(whale[0].qty, 2);

/* 4000 SHIB ≈ 0.08 USDT: the old `qty > 5000` rule ignored it, the new one
 * rejects it as a whale and accepts it as a micro trade */
assert.equal(run(spotBigTrades, "SHIBUSDT", { price: 0.00002, qty: 4000, side: "buy" }).length, 0);
assert.equal(run(spotMicroTrades, "SHIBUSDT", { price: 0.00002, qty: 4000, side: "sell" }).length, 1);

/* 0.0005 BTC ≈ 30 USDT: micro, even though the raw qty looks tiny */
const micro = run(spotMicroTrades, "BTCUSDT", { price: 60000, qty: 0.0005, side: "sell" });
assert.equal(micro.length, 1);
assert.equal(micro[0].notional, 30);
assert.equal(micro[0].notionalThreshold, 100);

/* 1 BTC ≈ 60000 USDT is neither micro nor ignored */
assert.equal(run(spotMicroTrades, "BTCUSDT", { price: 60000, qty: 1, side: "sell" }).length, 0);
assert.equal(run(spotBigTrades, "BTCUSDT", { price: 60000 }).length, 0, "a trade without size is ignored");

console.log("notional threshold tests passed: whale/micro are quote-currency based");

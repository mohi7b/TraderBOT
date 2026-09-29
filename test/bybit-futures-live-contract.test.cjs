const assert = require("node:assert/strict");
const BybitFuturesWS = require("../collector/crypto/realtime/venues/bybit/futures/ws.cjs");

(function main() {
    const events = [];
    const ws = new BybitFuturesWS({
        symbol: "BTCUSDT",
        handler: (packet) => events.push(packet),
        onCritical: () => {}
    });

    ws.emitMarketEvent("price", 1787514000000, { price: 77300 });
    ws.emitMarketEvent("mark_price", 1787514000000, { price: 77301, indexPrice: 77302 });
    ws.emitMarketEvent("funding", 1787514000000, { rate: 0.0001, nextFundingTime: 1787529600000 });
    ws.emitMarketEvent("oi", 1787514000000, { oi: 12000, oiBase: 12000, oiUsd: 927600000 });

    const byType = (type) => events.find((event) => event.data.type === type);
    assert.equal(byType("price").data.price, 77300);
    assert.equal(byType("mark_price").data.price, 77301);
    assert.equal(byType("funding").data.rate, 0.0001);
    assert.equal(byType("oi").data.oi, 12000);
    assert.equal(byType("oi").data.oiUsd, 927600000);
    assert.equal(byType("funding").data.packet.source, "websocket");
    console.log("bybit futures live contract validation passed");
})();
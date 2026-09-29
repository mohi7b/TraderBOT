const assert = require("node:assert/strict");
const BitgetFuturesWS = require("../collector/crypto/realtime/venues/bitget/futures/ws.cjs");

(function main() {
    const events = [];
    const ws = new BitgetFuturesWS({
        symbol: "BTCUSDT",
        handler: (packet) => events.push(packet),
        onCritical: () => {}
    });

    const rawTicker = JSON.stringify({
        arg: { instType: "USDT-FUTURES", channel: "ticker", instId: "BTCUSDT" },
        data: [{
            lastPr: "77379.4",
            markPrice: "77379.4",
            fundingRate: "0.000052",
            nextFundingTime: "1787529600000",
            indexPrice: "77409.55",
            ts: "1787511702386",
            openInterest: "35169.387800000029"
        }]
    });

    assert.equal(typeof ws.handleMessage, "function", "Bitget websocket should expose a message parser for real-time contract validation");
    ws.handleMessage(rawTicker);

    const markPriceEvent = events.find((event) => event.data && event.data.type === "mark_price");
    const fundingEvent = events.find((event) => event.data && event.data.type === "funding");
    const oiEvent = events.find((event) => event.data && event.data.type === "oi");

    assert.ok(markPriceEvent, "Ticker payload should emit a mark_price event");
    assert.ok(fundingEvent, "Ticker payload should emit a funding event");
    assert.equal(Number(markPriceEvent.data.price), 77379.4);
    assert.equal(Number(fundingEvent.data.rate), 0.000052);
    assert.equal(Number(oiEvent.data.oiUsd), Number(oiEvent.data.oi) * Number(markPriceEvent.data.price));

    console.log("bitget live contract validation passed");
})();

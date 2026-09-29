/**
 * A1 — Topic namespace
 * analytics-engine/topics.cjs
 * ============================================================
 * The topic is the only thing a downstream consumer subscribes to, so it
 * must be stable: one market → one topic, whatever the venue calls it, and
 * one event name → one topic segment (never "open_interest"/"openInterest"
 * producing two topics for the same reading).
 *
 * Run: node analytics-engine/tests/topics.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const {
    TOPIC_ROOT,
    ANALYTICS_EVENTS,
    ANALYTICS_EVENT_LIST,
    analyticsTopic,
    isAnalyticsTopic,
    parseTopic
} = require(path.join(__dirname, "..", "topics.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A1: ${msg}`);
    checks++;
};

function shapes() {
    ok(TOPIC_ROOT === "analytics", "root is \"analytics\"");
    ok(analyticsTopic({ symbol: "BTCUSDT", eventType: "cvd" }) === "analytics.crypto.btc.cvd", "symbol → topic");
    ok(analyticsTopic({ asset: "BTC", eventType: ANALYTICS_EVENTS.CVD }) === "analytics.crypto.btc.cvd", "asset → topic");
    ok(analyticsTopic({ asset: "BTC", eventType: "cvd", assetClass: "equities" }) === "analytics.equities.btc.cvd", "assetClass is honoured");
    ok(
        analyticsTopic({ symbol: "BTC-USDT-SWAP", eventType: "cvd" }) === "analytics.crypto.btc.cvd",
        "one market → one topic, whatever the venue spelling is"
    );
    ok(
        analyticsTopic({ symbol: "XBTUSDTM", eventType: "cvd" }) === "analytics.crypto.btc.cvd",
        "a kucoin contract maps onto the same topic"
    );
    ok(
        analyticsTopic({ symbol: "ETHUSDC", eventType: "cvd" }) === "analytics.crypto.eth.cvd",
        "only the base asset reaches the topic (the quote never leaks in)"
    );
    ok(
        analyticsTopic({ asset: "BTC/USDT", eventType: "open_interest" }) === "analytics.crypto.btcusdt.open_interest",
        "an explicit asset is only character-normalised — callers must pass a base asset"
    );
    ok(
        analyticsTopic({ asset: "BTC", eventType: "cvd.raw" }) === "analytics.crypto.btc.cvdraw",
        "a dot in the event name can never create a fifth segment"
    );
}

function guards() {
    assert.throws(() => analyticsTopic({ eventType: "cvd" }), /symbol or asset/, "no asset of any kind → throws");
    checks++;
    assert.throws(() => analyticsTopic({ symbol: "BTCUSDT" }), /eventType/, "no eventType → throws");
    checks++;
    assert.throws(() => analyticsTopic(), /symbol or asset/, "no argument at all → throws");
    checks++;
    ok(ANALYTICS_EVENT_LIST.length === Object.keys(ANALYTICS_EVENTS).length, "the event list mirrors the event map");
    ok(new Set(ANALYTICS_EVENT_LIST).size === ANALYTICS_EVENT_LIST.length, "no duplicate event names");
    for (const name of ANALYTICS_EVENT_LIST) {
        ok(name === name.toLowerCase().replace(/[^a-z0-9_]/g, ""), `event name "${name}" is already topic-safe`);
    }
}

function roundTrip() {
    const topic = analyticsTopic({ assetClass: "crypto", symbol: "BTCUSDT", eventType: "liquidation_heatmap" });

    ok(topic === "analytics.crypto.btc.liquidation_heatmap", "heatmap topic is built");
    ok(isAnalyticsTopic(topic), "recognised as an analytics topic");
    ok(!isAnalyticsTopic("crypto.btc.cvd"), "a bare chain is not an analytics topic");
    ok(!isAnalyticsTopic(null), "null is not an analytics topic");

    const parsed = parseTopic(topic);
    ok(parsed !== null && parsed.root === "analytics", "root parses back");
    ok(parsed !== null && parsed.assetClass === "crypto", "assetClass parses back");
    ok(parsed !== null && parsed.asset === "btc", "asset parses back");
    ok(parsed !== null && parsed.eventType === "liquidation_heatmap", "eventType parses back");

    ok(parseTopic("analytics.crypto.btc") === null, "a truncated topic does not parse");
    ok(parseTopic("nope") === null, "a foreign topic does not parse");
}

shapes();
guards();
roundTrip();

console.log(`A1 topics: ${checks} checks passed`);

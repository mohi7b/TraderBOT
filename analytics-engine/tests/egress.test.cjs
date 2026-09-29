/**
 * A2 — Egress: analytics envelope, topic, bus entry, bridge
 * analytics-engine/core/egress.cjs
 * ============================================================
 * Guards the two keys of an outgoing reading (bus channel + topic), the
 * "null, never a fabricated value" rule, and the promise that a broken sink
 * or an invalid envelope can never take the pipeline down.
 *
 * Run: node analytics-engine/tests/egress.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const { ASSET_CLASS, SOURCE_TYPE, validateEnvelope } = require(
    path.join(__dirname, "..", "..", "collector", "crypto", "common", "envelope.cjs")
);
const {
    ANALYTICS_MARKET,
    analyticsEnvelope,
    topicForEnvelope,
    analyticsChannel,
    analyticsEntry,
    createAnalyticsBridge
} = require(path.join(__dirname, "..", "core", "egress.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A2: ${msg}`);
    checks++;
};

function bareEnvelope(overrides = {}) {
    return analyticsEnvelope({
        eventType: "cvd",
        data: { net: 12.5 },
        symbol: "BTCUSDT",
        exchange: "binance",
        marketType: "spot",
        timestamp: 1_700_000_000_000,
        receiveTimestamp: 1_700_000_000_100,
        ...overrides
    });
}

function envelopeShape() {
    const envelope = bareEnvelope();

    ok(envelope.meta.sourceType === SOURCE_TYPE.ANALYTICS, "sourceType is \"analytics\" (never the collector's)");
    ok(envelope.meta.assetClass === ASSET_CLASS.CRYPTO, "assetClass defaults to crypto");
    ok(envelope.meta.baseAsset === "BTC", "baseAsset is derived from the symbol");
    ok(envelope.meta.eventType === "cvd", "eventType is carried");
    ok(envelope.payload.net === 12.5, "the reading itself is the payload");
    ok(envelope.meta.provenance.origin === "analytics-engine", "provenance marks the engine");
    ok(validateEnvelope(envelope).ok, "a built envelope validates before it is sent out");

    const swap = bareEnvelope({ symbol: "BTC-USDT-SWAP" });
    ok(swap.meta.symbol === "BTC-USDT-SWAP", "egress keeps the symbol it was given (canonicalisation is the router's job)");
    ok(swap.meta.baseAsset === "BTC", "even so, the base asset of a swap symbol is right");
    ok(topicForEnvelope(swap) === "analytics.crypto.btc.cvd", "spot and swap of one asset share one topic");
}

function topicsAndChannels() {
    const envelope = bareEnvelope();

    ok(topicForEnvelope(envelope) === "analytics.crypto.btc.cvd", "topic = analytics.<class>.<asset>.<event>");
    ok(topicForEnvelope(bareEnvelope({ symbol: null })) === null, "no symbol → no topic (null, not a placeholder)");
    ok(topicForEnvelope(null) === null, "no envelope → no topic");
    ok(topicForEnvelope({ meta: {} }) === null, "an unmappable envelope → no topic");

    ok(analyticsChannel({ market: ANALYTICS_MARKET, exchange: "crypto", symbol: "BTCUSDT", event: "cvd" })
        === "analytics:crypto:BTCUSDT:cvd", "channel = market:assetClass:symbol:event");
    ok(analyticsChannel({ market: null, exchange: null, symbol: null, event: null })
        === "analytics:unknown:unknown:unknown", "missing parts fall back to \"unknown\", not to an empty string");

    const entry = analyticsEntry(envelope);
    ok(entry.market === ANALYTICS_MARKET, "entry.market is analytics");
    ok(entry.exchange === "crypto", "entry.exchange carries the assetClass (bus axis)");
    ok(entry.symbol === "BTCUSDT", "entry.symbol is the symbol");
    ok(entry.asset === "BTC", "entry.asset is the base asset");
    ok(entry.event === "cvd", "entry.event is the event name");
    ok(entry.source === SOURCE_TYPE.ANALYTICS, "entry.source is analytics");
    ok(entry.topic === "analytics.crypto.btc.cvd", "entry carries the topic too");
    ok(entry.channel === "analytics:crypto:BTCUSDT:cvd", "entry.channel is derived");
    ok(entry.envelope === envelope, "entry keeps the envelope for consumers that want the full frame");
}

function bridge() {
    const seen = [];
    const calls = [];
    const bus = { publish: (entry, context) => calls.push({ entry, context }) };
    const publish = createAnalyticsBridge({ bus, sink: (entry) => seen.push(entry) });

    const entry = publish(bareEnvelope());
    ok(entry && entry.topic === "analytics.crypto.btc.cvd", "the bridge returns the entry it published");
    ok(seen.length === 1 && seen[0] === entry, "the sink received exactly that entry");
    ok(calls.length === 1 && calls[0].entry === entry, "the bus received the entry");
    ok(calls[0].context.market === "analytics" && calls[0].context.exchange === "crypto", "the bus context names the analytics axis");

    const invalid = bareEnvelope({ eventType: null });
    const errors = [];
    const guarded = createAnalyticsBridge({ sink: () => seen.push("should not happen"), onInvalid: (list, env) => errors.push({ list, env }) });
    ok(guarded(invalid) === null, "an invalid envelope is not published");
    ok(errors.length === 1 && errors[0].list.some((msg) => /eventType/.test(msg)), "onInvalid reports why");
    ok(guarded(null) === null, "a missing envelope is refused");
    ok(guarded({ meta: { sourceType: "analytics" } }) === null, "a partial frame is refused");

    const brokenCalls = [];
    const resilient = createAnalyticsBridge({
        bus: { publish: (item) => brokenCalls.push(item) },
        sink: () => { throw new Error("broken subscriber"); }
    });
    const survived = resilient(bareEnvelope());
    ok(survived !== null && brokenCalls.length === 1, "a throwing sink never blocks the bus");

    const noBus = createAnalyticsBridge({});
    ok(noBus(bareEnvelope()) !== null, "a bridge without a bus still hands entries to its sinks");
}

envelopeShape();
topicsAndChannels();
bridge();

console.log(`A2 egress: ${checks} checks passed`);

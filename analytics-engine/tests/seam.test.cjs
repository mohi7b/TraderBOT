/**
 * A5 — Seam: derivatives collector → realtime bus → analytics engine
 * collector/crypto/derivatives/core/bus-bridge.cjs + analytics-engine/engine.cjs
 * ============================================================
 * The two halves of the system only meet on the Realtime event bus: the
 * derivatives collector publishes envelopes there, the engine subscribes and
 * turns them into readings. This test reproduces the real bus shape (the
 * channel is derived from the context, the entry travels as `payload`) and
 * walks that path end to end, including the promise that the engine's own
 * analytics traffic never comes back in as an input.
 *
 * Run: node analytics-engine/tests/seam.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const {
    createEnvelope,
    ASSET_CLASS,
    SOURCE_TYPE,
    MARKET_TYPE
} = require(path.join(__dirname, "..", "..", "collector", "crypto", "common", "envelope.cjs"));
const { createBusBridge } = require(
    path.join(__dirname, "..", "..", "collector", "crypto", "derivatives", "core", "bus-bridge.cjs")
);
const { createEngine } = require(path.join(__dirname, "..", "engine.cjs"));

const START = 1_700_000_000_000;
let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A5: ${msg}`);
    checks++;
};

/** EventBus double that mimics collector/crypto/realtime/core/event-bus.cjs. */
function fakeBus(clock) {
    const state = { taps: new Set(), history: [] };

    return {
        state,
        subscribe(fn) {
            state.taps.add(fn);
            return () => state.taps.delete(fn);
        },
        publish(entry, context = {}) {
            const channel = [context.market, context.exchange, context.symbol, entry.event].join(":");
            const wrapped = {
                channel,
                event: entry.event,
                market: context.market || null,
                exchange: context.exchange || null,
                symbol: context.symbol || null,
                at: clock(),
                payload: entry
            };

            state.history.push(wrapped);
            for (const tap of [...state.taps]) tap(wrapped);
            return wrapped;
        }
    };
}

function derivativesEnvelope({
    exchange = "binance",
    symbol = "BTCUSDT",
    marketType = MARKET_TYPE.FUTURES
} = {}) {
    return createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.DERIVATIVES,
        marketType,
        exchange,
        symbol,
        eventType: "open_interest",
        data: { oiUsd: 1_000_000, markPrice: 100 },
        timestamp: START
    });
}


function collectorToEngine() {
    let at = START;
    const bus = fakeBus(() => at);
    const engine = createEngine({ bus, now: () => at });
    engine.attach(bus);

    const bridge = createBusBridge({ bus });
    const accepted = bridge(derivativesEnvelope());

    ok(typeof bridge === "function", "the derivatives bridge is reachable and loadable");
    ok(accepted !== null && accepted.channel === "futures:binance:BTCUSDT:open_interest", "a derivatives envelope is published on its futures channel");
    ok(accepted.payload.envelope.meta.sourceType === SOURCE_TYPE.DERIVATIVES, "the collector envelope travels untouched as the payload");
    ok(engine.counters.ingested === 1, "the engine, listening on the same bus, ingested it");
    /* One frame, the readings it answers: the open interest itself, and the
     * leverage view — which the same frame feeds, because open interest is one of
     * the four measurements that view is composed from. */
    ok(engine.counters.published === 2, "and turned it into the readings the frame answers");
    ok(engine.counters.skipped === 0 && engine.counters.errors === 0, "without a single skip or error");

    const reading = engine.publications()[0];
    ok(reading.topic === "analytics.crypto.btc.open_interest", "the reading lands on the open_interest topic");
    ok(reading.channel === "analytics:crypto:BTCUSDT:open_interest", "and on the analytics axis of the bus");
    ok(reading.entry.envelope.meta.sourceType === SOURCE_TYPE.ANALYTICS, "the outgoing frame names its own layer");
    ok(reading.entry.envelope.meta.marketType === MARKET_TYPE.FUTURES, "the frame keeps the collector market vocabulary");
    ok(reading.entry.envelope.meta.provenance.sourceType === SOURCE_TYPE.DERIVATIVES, "provenance remembers which layer fed it");
    ok(reading.entry.envelope.meta.provenance.sourceEvent === "open_interest", "provenance remembers the source event");

    const leverage = engine.publications()[1];
    ok(leverage.topic === "analytics.crypto.btc.market_leverage_risk",
        "the second reading is the leverage state, composed from what the frame moved");
    ok(leverage.entry.envelope.meta.provenance.sourceEvent === "open_interest",
        "and it remembers the same arrival as the reading it was made from");
    ok(engine.counters.ingested === 1, "the engine's own analytics traffic never comes back in as an input");

    at += 60_000;
    const okx = bridge(derivativesEnvelope({ exchange: "okx", symbol: "BTC-USDT-SWAP" }));
    const topics = engine.publications().map((item) => item.topic);

    ok(okx !== null && okx.channel === "futures:okx:BTC-USDT-SWAP:open_interest", "a second venue publishes on its own channel");
    ok(engine.counters.published === 4, "the second venue produces a second reading of each kind");
    ok(
        new Set(topics).size === 2
            && topics.includes("analytics.crypto.btc.open_interest")
            && topics.includes("analytics.crypto.btc.market_leverage_risk"),
        "yet both venues share ONE topic per question"
    );
    ok(engine.snapshot({ symbol: "BTC-USDT-SWAP" }).symbol === "BTCUSDT", "and one bucket inside the modules");

    return { engine, bus };
}

function realtimeAndDerivativesCoexist() {
    const { engine, bus } = collectorToEngine();

    bus.publish(
        { event: "trade", market: "spot", exchange: "binance", symbol: "BTCUSDT", payload: { side: "buy", qty: 1, price: 100 } },
        { market: "spot", exchange: "binance", symbol: "BTCUSDT" }
    );

    const topics = engine.publications().map((item) => item.topic);
    ok(engine.counters.published === 5, "a raw realtime bus entry is ingested next to the derivatives envelopes");
    ok(topics.includes("analytics.crypto.btc.cvd"), "and it produces its own reading");
    ok(new Set(topics).size === 3, "three kinds of question, three topics, one engine");
}

function brokenEnvelope() {
    let at = START;
    const bus = fakeBus(() => at);
    const engine = createEngine({ bus, now: () => at });
    const seen = [];
    const bridge = createBusBridge({ bus, onInvalid: (errors) => seen.push(errors) });

    const bad = createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: "not-a-layer",
        exchange: "binance",
        symbol: "BTCUSDT",
        eventType: "open_interest",
        data: { oiUsd: 1 },
        timestamp: START
    });

    ok(bridge(bad) === null, "an envelope the collector would not accept is not published");
    ok(seen.length === 1 && /sourceType/.test(seen[0][0]), "the bridge reports why instead of failing silently");
    ok(bus.state.history.length === 0, "the bus never saw it");
    ok(engine.counters.ingested === 0, "and the engine was never asked to consume it");
}

collectorToEngine();
realtimeAndDerivativesCoexist();
brokenEnvelope();

console.log(`A5 seam: ${checks} checks passed`);

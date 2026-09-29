/**
 * A4 — Orchestrator engine: ingest → route → module → egress
 * analytics-engine/engine.cjs
 * ============================================================
 * The engine is the only file that knows the whole path, so this test walks
 * it end to end with a fake clock and a fake bus:
 *   ingest / ingestPacket / ingestBusEntry / attach
 *   → publication throttle, force, subscription guard
 *   → analytics envelope on the bus, sinks and the publication buffer.
 *
 * Run: node analytics-engine/tests/engine.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const { createEnvelope, ASSET_CLASS, SOURCE_TYPE } = require(
    path.join(__dirname, "..", "..", "collector", "crypto", "common", "envelope.cjs")
);
const { createEngine } = require(path.join(__dirname, "..", "engine.cjs"));

const START = 1_700_000_000_000;
let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A4: ${msg}`);
    checks++;
};

/** An EventBus-shaped double: records publishes and fans out to subscribers. */
function fakeBus() {
    const state = { taps: [], published: [] };

    return {
        state,
        subscribe(fn) {
            state.taps.push(fn);
            return () => {
                const index = state.taps.indexOf(fn);
                if (index >= 0) state.taps.splice(index, 1);
            };
        },
        publish(entry, context) {
            state.published.push({ entry, context });
            for (const tap of [...state.taps]) tap(entry, context);
            return entry;
        }
    };
}

function harness(options = {}) {
    let clock = START;
    const bus = fakeBus();
    const engine = createEngine({ bus, now: () => clock, ...options });

    return {
        engine,
        bus,
        tick(ms = 0) {
            clock += ms;
            return clock;
        },
        now: () => clock
    };
}

function tradeEnvelope({
    symbol = "BTCUSDT",
    exchange = "binance",
    side = "buy",
    qty = 2,
    price = 100,
    marketType = "spot"
} = {}) {
    return createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.REALTIME,
        marketType,
        exchange,
        symbol,
        eventType: "trade",
        data: { side, qty, price },
        timestamp: START
    });
}

function unknownEnvelope() {
    return createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.REALTIME,
        exchange: "binance",
        symbol: "BTCUSDT",
        eventType: "totally_unknown",
        data: {},
        timestamp: START
    });
}

function ingestAndPublish() {
    const { engine, bus } = harness();
    const result = engine.ingest(tradeEnvelope());

    ok(result !== null && result.published.length === 1, "one trade → one publication");
    const entry = result.published[0];
    ok(entry.topic === "analytics.crypto.btc.cvd", "published on the cvd topic");
    ok(entry.channel === "analytics:crypto:BTCUSDT:cvd", "published on the cvd channel");
    ok(entry.envelope.meta.sourceType === SOURCE_TYPE.ANALYTICS, "the outgoing frame is an analytics envelope");
    ok(entry.envelope.meta.provenance.sourceEvent === "trade", "the outgoing frame remembers what fed it");
    ok(bus.state.published.length === 1, "the bus received it");
    ok(bus.state.published[0].context.market === "analytics", "the bus context marks the analytics axis");
    ok(engine.publications({ topic: "analytics.crypto.btc.cvd" }).length === 1, "the buffer recorded it");
    ok(engine.counters.published === 1 && engine.counters.ingested === 1, "the counters agree");
    ok(engine.counters.unrouted === 0 && engine.counters.errors === 0, "nothing unrouted, nothing broken");

    ok(engine.ingest(null) === null, "a non-envelope is refused");
    ok(engine.ingest({ meta: {} }) === null, "a partial frame is refused");
    ok(engine.counters.invalid === 2, "both refusals are counted");

    const unrouted = engine.ingest(unknownEnvelope());
    ok(unrouted !== null && unrouted.published.length === 0, "an unrouted envelope publishes nothing");
    ok(engine.counters.unrouted === 1, "and is counted as unrouted");
    ok(engine.counters.ingested === 2, "it was still counted as ingested (it reached the router)");
}

function throttling() {
    const { engine, tick } = harness();

    engine.ingest(tradeEnvelope());
    ok(engine.counters.published === 1, "the first trade publishes");

    tick(400);
    engine.ingest(tradeEnvelope());
    ok(engine.counters.published === 1 && engine.counters.throttled === 1, "a trade inside the window is throttled");

    tick(700);
    engine.ingest(tradeEnvelope());
    ok(engine.counters.published === 2, "after the window it publishes again");

    engine.ingest(tradeEnvelope(), { force: true });
    ok(engine.counters.published === 3, "force bypasses the throttle");

    const perSymbol = harness();
    perSymbol.engine.ingest(tradeEnvelope({ exchange: "binance" }));
    perSymbol.engine.ingest(tradeEnvelope({ exchange: "okx", symbol: "BTC-USDT-SWAP", marketType: "futures" }));
    ok(
        perSymbol.engine.counters.published === 1 && perSymbol.engine.counters.throttled === 1,
        "one market, one reading per window — whichever venue reports first"
    );
    perSymbol.tick(1500);
    perSymbol.engine.ingest(tradeEnvelope({ exchange: "okx", symbol: "BTC-USDT-SWAP", marketType: "futures" }));
    ok(perSymbol.engine.counters.published === 2, "the next window publishes the refreshed reading");

    const off = harness({ publishThrottleMs: { cvd: 0 } });
    off.engine.ingest(tradeEnvelope());
    off.tick(1);
    off.engine.ingest(tradeEnvelope());
    ok(off.engine.counters.published === 2 && off.engine.counters.throttled === 0, "a 0 override turns the throttle off");
}

function aggregation() {
    const { engine, tick } = harness();

    engine.ingest(tradeEnvelope({ exchange: "binance", symbol: "BTCUSDT" }));
    tick(1500);
    engine.ingest(tradeEnvelope({ exchange: "okx", symbol: "BTC-USDT-SWAP", marketType: "futures" }));

    const snapshot = engine.snapshot({ symbol: "BTC-USDT-SWAP" });
    ok(snapshot !== null, "an okx spelling resolves the same market");
    ok(snapshot.symbol === "BTCUSDT", "the snapshot is keyed canonically");
    ok(snapshot.asset === "BTC", "the asset is the base asset");
    ok(Object.keys(snapshot.flow.venues).length === 2, "both venues are aggregated into one view");
    ok("heatmap" in snapshot && "arbitrage" in snapshot && "derivatives" in snapshot && "liquidity" in snapshot, "every module slot is present");
    ok(snapshot.timestamp !== null, "the snapshot is stamped");
    ok(engine.snapshot({}) === null, "a snapshot without a symbol returns null");
    ok(engine.snapshot({ symbol: "   " }) === null, "a blank symbol returns null");
}

function feedbackGuard() {
    const { engine, bus, tick } = harness();
    const foreign = {
        channel: "spot:binance:BTCUSDT:trade",
        market: "spot",
        exchange: "binance",
        symbol: "BTCUSDT",
        event: "trade",
        at: START,
        payload: { side: "buy", qty: 1, price: 100 }
    };

    engine.attach(bus);
    ok(engine.stats().subscribers === 1, "the engine listens on the bus");

    engine.ingest(tradeEnvelope());
    ok(engine.counters.published === 1, "the trade published");
    ok(engine.counters.ingested === 1, "the engine's own analytics envelope was NOT fed back in");
    ok(bus.state.published.length === 1, "the bus carries exactly the analytics entry");

    tick(1500);
    bus.publish(foreign);
    ok(engine.counters.ingested === 2, "a foreign bus entry is ingested");
    ok(engine.counters.published === 2, "and it produced a reading");

    const replay = engine.ingestBusEntry({ market: "analytics", exchange: "crypto", symbol: "BTCUSDT", event: "cvd", envelope: bus.state.published[0].entry.envelope });
    ok(replay !== null && replay.published.length === 0, "an analytics reading has no route, so it can never be re-ingested as an input");

    engine.detach();
    ok(engine.stats().subscribers === 0, "detach removes the subscription");
    bus.publish(foreign);
    ok(engine.counters.ingested === 3, "after detach the engine is deaf to the bus");
}

function otherInputs() {
    const { engine, tick } = harness();
    const entries = engine.emit({ eventType: "cvd", symbol: "btc-usdt-swap", exchange: "okx", data: { aggregate: null } });

    ok(entries.length === 1, "emit publishes a reading no incoming event produced");
    ok(entries[0].symbol === "BTCUSDT", "emit canonicalises the symbol");
    ok(entries[0].topic === "analytics.crypto.btc.cvd" && entries[0].channel === "analytics:crypto:BTCUSDT:cvd", "emit builds topic and channel");
    ok(entries[0].envelope.meta.provenance.eventType === "cvd", "emit stamps the event type");
    ok(engine.emit({ eventType: "cvd", symbol: "BTCUSDT", data: null }).length === 0, "no reading → nothing published");

    tick(1500);
    const packet = engine.ingestPacket({
        market: "spot",
        exchange: "okx",
        symbol: "BTC-USDT-SWAP",
        eventType: "trade",
        payload: { side: "buy", qty: 1, price: 100 },
        timestamp: START
    });
    ok(packet !== null && packet.published.length === 1, "a realtime market packet is ingested");
    ok(packet.published[0].symbol === "BTCUSDT", "and canonicalised on the way out");
    ok(engine.ingestPacket(null) === null, "a missing packet is refused");

    tick(1500);
    const venueWord = engine.ingest(tradeEnvelope({ exchange: "okx", symbol: "BTC-USDT-SWAP", marketType: "swap" }));
    ok(venueWord !== null && venueWord.published.length === 1, "a venue market word (okx \"swap\") costs no reading");
    ok(venueWord.published[0].envelope.meta.marketType === null, "the frame keeps the collector vocabulary only");
    ok(
        venueWord.published[0].envelope.meta.provenance.sourceMarketType === "swap",
        "the venue wording survives as provenance"
    );

    tick(1500);
    const busEntry = engine.ingestBusEntry({
        channel: "futures:binance:BTCUSDT:trade",
        market: "futures",
        exchange: "binance",
        symbol: "BTCUSDT",
        event: "trade",
        at: START,
        payload: { side: "sell", qty: 1, price: 100 }
    });
    ok(busEntry !== null && busEntry.published.length === 1, "an event-bus entry is ingested");
    ok(engine.ingestBusEntry(null) === null, "a missing bus entry is refused");
    ok(engine.ingestBusEntry("trade") === null, "a scalar bus entry is refused");
}

function readsAndReset() {
    const { engine } = harness();

    engine.ingest(tradeEnvelope());
    engine.emit({ eventType: "positioning", symbol: "BTCUSDT", data: { ratio: 1.1 } });

    const stats = engine.stats();
    ok(stats.routes === engine.routes().length && stats.routes > 0, "stats reports the route count");
    ok(Array.isArray(stats.modules) && stats.modules.length === 9, "stats names the nine modules");
    ok(stats.publishedBuffer === 2, "stats counts the publication buffer");
    ok(
        Array.isArray(stats.recent) && stats.recent.length === 0,
        "a clean run logs nothing — the log is for trouble, not for traffic"
    );

    engine.ingest({ meta: {} });
    const logged = engine.stats().recent;
    ok(logged.length === 1 && logged[0].kind === "invalid", "the log records what went wrong");
    ok(typeof logged[0].at === "number" && logged[0].message.length > 0, "and stamps it with a reason");

    ok(engine.publications({ limit: 1 }).length === 1, "publications can be limited");
    ok(engine.publications({ topic: "analytics.crypto.eth.cvd" }).length === 0, "publications can be filtered by topic");

    engine.reset();
    ok(engine.publications().length === 0, "reset empties the publication buffer");
    const after = engine.snapshot({ symbol: "BTCUSDT" });
    ok(Object.keys(after.flow.venues).length === 0, "reset clears the module state");
    ok(engine.stats().throttleKeys === 0, "reset clears the throttle table");
}

ingestAndPublish();
throttling();
aggregation();
feedbackGuard();
otherInputs();
readsAndReset();

console.log(`A4 engine: ${checks} checks passed`);

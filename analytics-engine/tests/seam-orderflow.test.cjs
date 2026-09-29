/**
 * A11 — Seam: the realtime collector → the bus → the analytics engine
 * collector/crypto/realtime/core/runtime.cjs          (registry + bus + pipeline)
 * collector/crypto/realtime/core/event-bus.cjs        (the wire both halves share)
 * collector/crypto/realtime/ingest/spot-handler.cjs   (the spot publication points)
 * collector/crypto/realtime/ingest/futures-handler.cjs (the futures ones)
 * analytics-engine/engine.cjs + analytics-engine/core/router.cjs
 * ============================================================
 * The order-flow layer is the part of the engine the realtime collector already
 * feeds without knowing it: the trade flow event it publishes for a trade packet,
 * the books its depth groups maintain, and the forced orders its futures venues
 * forward. This test connects the real collector to a real EventBus and the
 * engine to that same bus — the real registry, the real pipeline, the real
 * handlers, the real routes — and reads what comes out, so it fails when either
 * side renames a word or drops a field the other one listens for.
 *
 * What it pins down:
 *   1. a book the collector publishes (spot depth_20/100/full, futures
 *      depth_100/medium/full) becomes ONE orderbook_imbalance reading carrying
 *      the module's measurement — not the book it was measured from, and never a
 *      skeleton reading for a frame with no levels in it;
 *   2. a trade print becomes CVD exactly once: the size-filtered echoes of the
 *      same print (micro_trades, big_trades) have no route, so one trade can
 *      never be counted three times, and a frame called `trade` with no print in
 *      it moves nothing;
 *   3. a forced order becomes a liquidation_heatmap entry on the side that was
 *      liquidated, whatever word the venue used (binance sends the liquidation
 *      ORDER side, bybit the liquidated POSITION side), while an unreadable word
 *      publishes nothing and leaves the refusal in the module's own counter;
 *   4. the bar layers stay honest about a realtime candle: it carries no
 *      interval, so both of them count `unknownInterval` and neither invents an
 *      indicator or a structure out of it;
 *   5. the engine's own readings travel the same bus and never come back in.
 *
 * Run: node analytics-engine/tests/seam-orderflow.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { EventBus } = require(path.join(ROOT, "collector", "crypto", "realtime", "core", "event-bus.cjs"));
const { buildRuntime, setRuntime } = require(path.join(ROOT, "collector", "crypto", "realtime", "core", "runtime.cjs"));
const spotHandler = require(path.join(ROOT, "collector", "crypto", "realtime", "ingest", "spot-handler.cjs"));
const futuresHandler = require(path.join(ROOT, "collector", "crypto", "realtime", "ingest", "futures-handler.cjs"));
const { createEngine } = require(path.join(ROOT, "analytics-engine", "engine.cjs"));

const START = 1_700_000_000_000;

/**
 * A running collector and a running engine on one bus.
 *
 * The collector is the real one: `buildRuntime()` loads the real registration
 * tables into the real registry, and packets go in through the real ingest
 * handlers — the same entry point the venue websockets use. The engine shares the
 * bus, exactly as `analytics-engine/server.cjs --bus` wires it in production.
 *
 * The engine's clock is the test's (throttling is the engine's own policy and has
 * to be drivable); the frames keep the collector's wall-clock stamps, which is
 * what a real bus entry carries.
 */
function harness() {
    let at = START;
    const bus = new EventBus();
    const frames = [];
    const readings = [];

    setRuntime(buildRuntime({ bus, emitHealth: () => {} }));

    const engine = createEngine({ bus, now: () => at });
    engine.attach(bus);

    bus.subscribe((entry) => {
        if (isReading(entry)) readings.push(entry);
        else frames.push(entry);
    });

    const api = {
        bus,
        engine,
        frames,
        readings,

        /** Collector frames since `mark`, optionally only those called `name`. */
        names(mark = 0, name = null) {
            return frames
                .slice(mark)
                .filter((entry) => name === null || entry.event === name)
                .map((entry) => entry.event);
        },
        mark() {
            return frames.length;
        },
        /** The newest reading published on one topic, as its envelope, or null. */
        reading(topic) {
            const items = engine.publications({ topic });
            return items.length ? items[items.length - 1].entry.envelope : null;
        },
        /** The data of the newest reading on one topic, or null. */
        data(topic) {
            const envelope = api.reading(topic);
            return envelope ? envelope.payload : null;
        },
        count(topic) {
            return engine.publications({ topic }).length;
        },
        /** Advance the engine's clock past a publication window. */
        step(ms = 60_000) {
            at += ms;
            return api;
        },
        /** A spot packet, straight into the real spot ingest path. */
        spot(symbol, data, exchange = "binance") {
            spotHandler({ symbol, data: { ...data, exchange, timestamp: at } });
            return api;
        },
        /** A futures packet, straight into the real futures ingest path. */
        futures(symbol, data, exchange = "binance") {
            futuresHandler({
                symbol,
                data: { market: "futures", exchange, timestamp: at, ...data, event: data.type }
            });
            return api;
        }
    };

    return api;
}

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A11: ${msg}`);
    checks++;
};

/** An analytics frame travelling back on the bus (the engine's own traffic). */
function isReading(entry) {
    const envelope = entry && entry.payload ? entry.payload.envelope : null;
    return !!(envelope && envelope.meta && envelope.meta.sourceType === "analytics");
}

/* ------------------------------------------------------------
 * 1. Books → orderbook_imbalance
 *
 * A bid is a bid: the spot handler publishes the packet's own book, and the spot
 * depth group publishes the books it maintains (depth_20, depth_100, depth_full).
 * They describe the same liquidity, so the module keeps one reading per venue and
 * symbol and the engine's throttle decides how often it goes out.
 * ---------------------------------------------------------- */
function booksBecomePressure() {
    const h = harness();
    const topic = "analytics.crypto.btc.orderbook_imbalance";
    const mark = h.mark();

    h.spot("BTCUSDT", { bids: [[99, 3], [98, 2]], asks: [[101, 1], [102, 5]], price: 100.5 });

    const names = h.names(mark);
    ok(names.includes("depth"), "the spot handler publishes the packet's own book frame");
    ok(names.includes("depth_20") && names.includes("depth_100") && names.includes("depth_full"),
        `the spot depth group publishes the books it maintains (${names.filter((n) => n.startsWith("depth_")).join(" · ")})`);

    const routed = names.filter((name) => h.engine.router.routeFor(name).length > 0).length;
    ok(h.engine.counters.ingested === names.length, `every frame reached the engine (${names.length})`);
    ok(h.engine.counters.unrouted === names.length - routed,
        "the frames nobody reads (depth_delta, depth_imbalance, liquidity_heatmap, …) are reported unrouted, never guessed at");
    ok(h.engine.counters.skipped === 0 && h.engine.counters.errors === 0,
        "and every frame that did reach a route was usable");

    const reading = h.data(topic);
    ok(reading !== null, "the book becomes an orderbook_imbalance reading");
    ok(reading.midPrice === 100 && reading.bestBid === 99 && reading.bestAsk === 101,
        "the reading carries the module's measurement of it (mid, touch)");
    ok(reading.bidNotional === 99 * 3 + 98 * 2 && reading.askNotional === 101 * 1 + 102 * 5,
        "…the notionals of both sides");
    ok(reading.imbalance === ((99 * 3 + 98 * 2) - (101 * 1 + 102 * 5)) / ((99 * 3 + 98 * 2) + (101 * 1 + 102 * 5)),
        "…and the imbalance itself, which is what the topic promises");
    ok(reading.bias === "ask" && reading.bidLevels === 2 && reading.askLevels === 2, "with the direction and the depth it read");
    ok(reading.bids === undefined && reading.asks === undefined,
        "the book is the input, not the reading: the raw levels never travel as the measurement");

    ok(h.count(topic) === 1, "one venue's book is one reading, however many frames described it");

    /* The words the collector publishes its books under, and the one route that
     * reads a book — the table and the modules must not drift apart. */
    for (const word of ["depth", "depth_20", "depth_100", "depth_medium", "depth_full"]) {
        const routes = h.engine.router.routeFor(word);
        ok(routes.length === 1 && routes[0].id === "delta-flow.depth", `${word} belongs to the one owner that reads a book`);
    }

    /* The futures path is the other vocabulary: its depth group emits
     * depth_100/depth_medium/depth_full for the book the synced feed maintains,
     * and the group's own health marker is a frame called `depth` with no book in
     * it — a beacon, not a book, and it must not become a reading. */
    const futures = harness();
    const futuresTopic = "analytics.crypto.eth.orderbook_imbalance";
    const futuresMark = futures.mark();

    futures.futures("ETHUSDT", {
        type: "depth_full",
        bids: [[1999, 2]],
        asks: [[2001, 4]],
        depthSource: "synced_book",
        depthKind: "synced_book"
    });

    const futuresNames = futures.names(futuresMark);
    ok(futuresNames.includes("depth_100") && futuresNames.includes("depth_medium") && futuresNames.includes("depth_full"),
        "the futures depth group publishes its own book words");
    ok(futuresNames.filter((name) => name === "depth").length === 1,
        "and a health marker called `depth` next to them (a frame with no book in it)");

    const eth = futures.data(futuresTopic);
    ok(eth !== null, "the synced book reaches the engine under those words");
    ok(eth.bidNotional === 1999 * 2 && eth.askNotional === 2001 * 4 && eth.bias === "ask",
        "and is answered with the imbalance of the book that was sent");
    ok(futures.count(futuresTopic) === 1,
        "the empty marker frame published nothing — a book the module could not use is not a reading");

    futures.step(60_000).futures("ETHUSDT", {
        type: "depth_full",
        bids: [[2000, 5]],
        asks: [[2002, 1]],
        depthSource: "synced_book",
        depthKind: "synced_book"
    });
    ok(futures.count(futuresTopic) === 2, "the next window refreshes it");
    ok(futures.data(futuresTopic).bias === "bid" && futures.data(futuresTopic).bidNotional === 2000 * 5,
        "with the book that arrived then");
}

/* ------------------------------------------------------------
 * 2. Prints → cvd
 *
 * One trade packet puts two things on the wire: the handler's flow frame (the
 * packet was accepted — price, and the book context around it) and the orderflow
 * module's echo of the print itself (price + qty + side). Only the second one is
 * a trade, and the size-filtered echoes of the same print (micro_trades,
 * big_trades) must never be read as more trades than there were. A print is the
 * frame's own side + size + price — on the frame or under its own `payload`, the
 * way the collector's module frames wrap their content — and nothing else: a
 * frame under a trade word with no print in it never becomes "the flow as it
 * stood".
 * ---------------------------------------------------------- */
function tradesBecomeCvd() {
    const h = harness();
    const topic = "analytics.crypto.btc.cvd";
    const mark = h.mark();

    h.spot("BTCUSDT", { price: 100, qty: 2, side: "buy" });      // 200 — neither micro nor big
    h.spot("BTCUSDT", { price: 100, qty: 600, side: "sell" });   // 60 000 — big
    h.spot("BTCUSDT", { price: 100, qty: 1, side: "buy" });      // 100 — micro

    const names = h.names(mark);
    ok(names.includes("trade"), "the accepted packet's own flow frame is on the wire");
    ok(names.includes("orderflow"), "next to the orderflow module's echo of the print");
    ok(names.filter((name) => name === "big_trades").length === 1
        && names.filter((name) => name === "micro_trades").length === 1,
        "and the size-filtered echoes of the two prints that crossed a size threshold");

    const flow = h.frames[mark];
    ok(flow.event === "trade" && flow.payload.price === undefined
        && flow.payload.qty === undefined && flow.payload.side === undefined,
        "the flow frame carries no print at all (the book context around it, nothing else)");
    ok(h.engine.counters.skipped === 3,
        "and each of the three was reported unusable by the route, instead of publishing a flow no trade moved");

    for (const word of ["trade", "orderflow"]) {
        const routes = h.engine.router.routeFor(word);
        ok(routes.length === 1 && routes[0].id === "delta-flow.trade", `${word} has the one owner that reads a print (delta-flow)`);
    }

    ok(h.engine.router.routeFor("big_trades").length === 0 && h.engine.router.routeFor("micro_trades").length === 0,
        "the size-filtered echoes have no route of their own: one print can never be counted three times");

    /* Where a print is looked for — the frame's own fields (the orderflow echo) or
     * the frame's own `payload` (the collector's module frames wrap their content
     * there: market_aggregate, depth_aggregated), and nowhere else. */
    const tradeRoute = h.engine.router.routeFor("trade")[0];
    const wrapped = tradeRoute.build(
        { event: "trade", payload: { side: "sell", qty: 3, price: 50 } },
        { symbol: "BTCUSDT", exchange: "binance" }
    );
    ok(wrapped !== null && wrapped.side === "sell" && wrapped.qty === 3 && wrapped.price === 50,
        "a frame that wraps its print under its own `payload` is read as the print it is");
    ok(tradeRoute.build({ event: "trade", payload: { price: 100 } }, { symbol: "BTCUSDT" }) === null,
        "while half a print — a price with no side and no size — is refused by the route itself");

    const flowState = h.engine.modules.deltaFlow.snapshot({ symbol: "BTCUSDT" });
    ok(flowState.aggregate.trades === 3, `three prints, three trades counted (${flowState.aggregate.trades})`);
    ok(flowState.aggregate.buyQty === 2 + 1 && flowState.aggregate.sellQty === 600, "in the base asset, split by side");
    ok(flowState.aggregate.cvd === (2 + 1) - 600, "…which is the CVD");
    ok(flowState.aggregate.cvdUsd === ((2 + 1) * 100) - (600 * 100), "…and the same in quote currency");
    ok(flowState.venues.binance.trades === 3 && flowState.aggregate.venues === 1,
        "one venue is one bucket, and the aggregate is built from the buckets");

    const first = h.data(topic);
    ok(h.count(topic) === 1, "all three prints arrived inside one publication window: one reading went out");
    ok(first.aggregate.cvd === 2, "…carrying the flow as it stood when it was published");
    ok(first.aggregate.trades === 1, "…which was the first print");

    h.step(1_000).spot("BTCUSDT", { price: 100, qty: 4, side: "sell" });
    const second = h.data(topic);
    ok(h.count(topic) === 2 && second.aggregate.trades === 4,
        "the next window publishes every print that arrived since — the throttle limits egress, not counting");
    ok(second.aggregate.cvd === ((2 + 1) - 600) - 4, "…so nothing the throttle swallowed was lost");

    /* Two venues, one market: the router canonicalises the pair, the module keeps
     * one bucket per venue, and the topic stays the symbol's flow — not a
     * venue's. */
    h.step(1_000).spot("BTCUSDT", { price: 100, qty: 5, side: "buy" }, "okx");
    const both = h.engine.modules.deltaFlow.snapshot({ symbol: "BTCUSDT" });
    ok(Object.keys(both.venues).sort().join(",") === "binance,okx", "a second venue is a second bucket");
    ok(both.aggregate.venues === 2 && both.aggregate.trades === 5, "and both are in the one aggregate");
    ok(h.count(topic) === 3 && h.reading(topic).meta.provenance.sourceEvent === "orderflow",
        "one topic, and the provenance names the frame it came from");
    ok(h.reading(topic).meta.provenance.sourceType === "realtime",
        "…and the layer, not the module that answered");
}

/* ------------------------------------------------------------
 * 3. Forced orders → liquidation_heatmap
 *
 * The venues disagree about what `side` means, and the collector has already read
 * each one's answer (collector/crypto/derivatives/venues/*.cjs): binance, okx and
 * bitget send the LIQUIDATION ORDER's side — a long is closed out by selling —
 * while bybit sends the liquidated POSITION's side. The engine has to reach the
 * same conclusion from the same word, or the map is mirrored around the mid.
 * ---------------------------------------------------------- */
function forcedOrdersBecomeAHeatmap() {
    const h = harness();
    const topic = "analytics.crypto.btc.liquidation_heatmap";

    h.futures("BTCUSDT", { type: "liquidation", price: 99, qty: 1.5, side: "sell" }, "binance");
    const binance = h.data(topic);
    ok(binance !== null, "a forced order becomes a heatmap reading");
    ok(binance.totals.longNotional === 99 * 1.5 && binance.totals.shortNotional === 0,
        "binance's order-side word (sell) is read as a LONG position being liquidated");
    ok(binance.totals.netNotional === 99 * 1.5, "…which is the bearish washout the map exists to show");
    ok(binance.totals.count === 1 && binance.totals.averageNotional === 99 * 1.5, "one print, one entry in the totals");
    ok(binance.clusters.length === 1 && binance.clusters[0].dominantSide === "long",
        "in the log price band it happened in, on the side it happened");
    ok(binance.exchanges.binance.notional === 99 * 1.5 && binance.exchanges.binance.count === 1,
        "and remembered per venue");

    /* The opposite word for the same event: bybit's allLiquidation.S is the
     * position side, so a "buy" there is the long one. */
    h.step(5_000).futures("BTCUSDT", { type: "liquidation", price: 98, qty: 2, side: "buy" }, "bybit");
    const both = h.data(topic);
    ok(both.totals.longNotional === 99 * 1.5 + 98 * 2 && both.totals.shortNotional === 0,
        "bybit's position-side word (buy) is read as a long liquidation too");
    ok(both.exchanges.bybit.count === 1 && both.exchanges.binance.count === 1, "one map, two venues");
    ok(h.count(topic) === 2, "each window refreshes the map");

    /* A word nobody means is not a side: it reaches the module as it arrived, the
     * module refuses it and counts the refusal, and nothing is published for it —
     * an empty map is not a measurement. The packet's own health marker, a
     * `liquidation` frame with no print in it at all, is refused the same way. */
    const before = h.count(topic);
    const rejected = h.engine.modules.liquidations.counters.rejected;
    h.step(5_000).futures("BTCUSDT", { type: "liquidation", price: 97, qty: 1, side: "sideways" }, "binance");

    ok(h.engine.modules.liquidations.counters.rejected === rejected + 2,
        "the unreadable print was refused and counted, next to the packet's own empty marker");
    ok(h.engine.modules.liquidations.counters.ingested === 2, "the two readable prints went in, one each");
    ok(h.count(topic) === before, "…and neither refusal left a reading behind");

    ok(h.count("analytics.crypto.btc.cross_exchange_spread") > 0,
        "the same frames also answer the spread question: a forced order carries a price, and one input may answer several");
}

/* ------------------------------------------------------------
 * 4. A realtime candle is not a bar
 *
 * A venue candle reaches the bus without the venue's own interval: the stream
 * knows it, the frame does not carry it (hence the CANDLE_EVENT_TYPES note in
 * core/router.cjs). Both bar layers read the frame anyway, count what was missing
 * and answer null — an indicator or a structure invented for a timeframe nobody
 * named would be a reading of a market that never existed.
 * ---------------------------------------------------------- */
function barLayersStayHonestAboutARealtimeCandle() {
    const h = harness();
    const mark = h.mark();

    h.futures("BTCUSDT", { type: "candle", open: 98, high: 101, low: 97, close: 100.5, volume: 10 });

    ok(h.names(mark).includes("candle"), "the venue's candle frame is on the wire");
    ok(h.names(mark).includes("candles_multi_tf"), "next to the aggregator's own per-timeframe frames");

    const frame = h.frames.slice(mark).find((entry) => entry.event === "candle");
    ok(frame.payload.interval === undefined && frame.payload.barInterval === undefined,
        "the frame carries the bar and no interval: the venue's word never reached the bus");

    const indicators = h.engine.modules.indicators.stats().counters;
    const priceAction = h.engine.modules.priceAction.stats().counters;

    ok(indicators.unknownInterval === 1,
        "the indicator module counts it as an unreadable interval instead of guessing one");
    ok(priceAction.unknownInterval === 1,
        "…and so does the price-action layer, judging the same frame the same way");
    ok(indicators.candles === 0 && indicators.sealed === 0
        && priceAction.candles === 0 && priceAction.sealed === 0,
        "no bar entered either module");
    ok(!h.engine.publications().some((item) => /indicators|price_action/.test(item.entry.topic)),
        "and neither invented a reading out of a timeframe nobody named");
    ok(h.engine.counters.skipped === 0,
        "the frame was no route skip: both bar modules were given it and both said why not");
}

/* ------------------------------------------------------------
 * 5. The engine's own traffic never comes back in
 *
 * The engine publishes onto the bus it listens to — that is how a subscriber
 * reaches a reading — so every reading it issues is handed straight back to its
 * own tap. The egress marks them `sourceType: "analytics"` and `attach()` skips
 * exactly those: the promise that lets both halves run in one process.
 * ---------------------------------------------------------- */
function theEngineKeepsItsOwnTrafficOut() {
    const h = harness();

    h.spot("BTCUSDT", { bids: [[99, 3]], asks: [[101, 1]], price: 100 });
    h.step(60_000).spot("BTCUSDT", { price: 100, qty: 2, side: "buy" });

    ok(h.readings.length > 0, "the engine published readings onto the bus");
    ok(h.readings.length === h.engine.counters.published,
        `every one of them travelled the wire (${h.readings.length})`);
    ok(h.engine.counters.ingested === h.frames.length,
        `and not one came back in as an input (${h.frames.length} collector frames, ${h.engine.counters.ingested} ingested)`);
    ok(h.frames.length > h.readings.length, "the collector's stream is the wider one");
    ok(h.readings.every((entry) => entry.payload.envelope.meta.provenance.sourceType === "realtime"),
        "each reading names the layer that fed it, not the layer that answered");
    ok(h.engine.counters.invalid === 0 && h.engine.counters.errors === 0,
        "nothing was invalid and nothing threw");
}

booksBecomePressure();
tradesBecomeCvd();
forcedOrdersBecomeAHeatmap();
barLayersStayHonestAboutARealtimeCandle();
theEngineKeepsItsOwnTrafficOut();

console.log(`A11 order-flow seam: ${checks} checks passed`);



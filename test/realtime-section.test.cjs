/* ============================================================
 * File: test/realtime-section.test.cjs
 *
 * Verifies the refactored Realtime section (collector/crypto/realtime) end to
 * end, without opening a single socket:
 *
 *   1. module registry: counts, order, guards, health markers
 *   2. spot ingest: bus signals + module output (previously dropped)
 *   3. futures ingest: health markers + cross-venue depth emit
 *   4. per-symbol isolation of module state
 *   5. event bus: snapshot / history / subscriptions
 *   6. venue plan + section public API
 *   7. dependency boundary: no orchestrator module gets loaded
 * ============================================================ */

const assert = require("node:assert/strict");
const realtime = require("../collector/crypto/realtime/index.cjs");

const SYMBOL = "BTCUSDT";

function captureHealthEvents() {
    const events = [];
    const previous = global.healthEmit;
    global.healthEmit = (event) => events.push(event);
    return {
        events,
        restore() { global.healthEmit = previous; }
    };
}

function names(events) {
    return events.map((event) => event.event).filter((value) => typeof value === "string");
}

(function main() {
    const runtime = realtime.core.getRuntime();

    /* ------------------------------------------------------------
     * 1. module registry
     * ---------------------------------------------------------- */
    const spotModules = runtime.registry.forMarket("spot");
    const futuresModules = runtime.registry.forMarket("futures");

    assert.equal(spotModules.length, 28, "spot registry should hold the 28 wired L2 modules");
    assert.equal(futuresModules.length, 45, "futures registry should hold 7 markers + 37 L2 modules + 1 depth-source selector");
    assert.equal(runtime.registry.size, 73, "registry total should be 73 descriptors");

    const markerIds = futuresModules.filter((entry) => entry.id.endsWith(".marker")).map((entry) => entry.id);
    assert.deepEqual(markerIds, [
        "futures.price.marker",
        "futures.depth.marker",
        "futures.candles.marker",
        "futures.funding.marker",
        "futures.liquidation.marker",
        "futures.mark_price.marker",
        "futures.oi.marker"
    ], "legacy emitHealth group markers must be preserved in legacy order");

    for (const market of ["spot", "futures"]) {
        const entries = runtime.registry.forMarket(market);
        for (let i = 1; i < entries.length; i += 1) {
            assert.ok(entries[i - 1].priority <= entries[i].priority, `${market} registry must stay priority-ordered`);
        }
    }

    assert.equal(spotModules.filter((entry) => !!entry.when).length, 28, "every spot module keeps a legacy guard");

    /* ------------------------------------------------------------
     * 2. spot ingest
     * ---------------------------------------------------------- */
    const spot = captureHealthEvents();
    delete global.orchestrator;

    const spotEmitted = realtime.spotHandler({
        symbol: SYMBOL,
        data: { exchange: "binance", price: 101.25, qty: 0.5, side: "buy", timestamp: Date.now() }
    });

    assert.ok(Array.isArray(spotEmitted), "spot handler must return the emitted event list");
    assert.ok(names(spotEmitted).includes("price"), "spot module output must be returned (previously dropped)");

    spot.restore();

    const spotSignals = realtime.signals({ symbol: SYMBOL });
    assert.ok(Object.keys(spotSignals).length > 0, "spot events must reach the event bus");
    assert.ok(spotSignals.trade, "trade packet must be published on the bus");
    assert.ok(spotSignals.market_aggregate, "market_aggregate must be published on the bus");

    const spotState = realtime.getState(SYMBOL);
    assert.equal(spotState.symbol, SYMBOL);
    assert.ok(spotState.aggregation.aggregate, "aggregation service must expose a per-symbol aggregate");
    assert.equal(spotState.requested, false, "getState must never mark a symbol as requested");

    /* ------------------------------------------------------------
     * 3. futures ingest: legacy health markers + cross-venue depth
     * ---------------------------------------------------------- */
    const futures = captureHealthEvents();

    const futuresPackets = [
        { exchange: "binance", market: "futures", symbol: SYMBOL, type: "price", price: 101.25 },
        { exchange: "binance", market: "futures", symbol: SYMBOL, type: "mark_price", price: 101 },
        {
            exchange: "binance",
            market: "futures",
            symbol: SYMBOL,
            type: "depth_full_snapshot",
            bids: [{ price: 101, qty: 2 }],
            asks: [{ price: 101.2, qty: 1 }]
        },
        { exchange: "binance", market: "futures", symbol: SYMBOL, type: "funding", rate: 0.0001 },
        { exchange: "binance", market: "futures", symbol: SYMBOL, type: "candle", open: 100, high: 102, low: 99, close: 101, volume: 10 },
        { exchange: "binance", market: "futures", symbol: SYMBOL, type: "liquidation", price: 100.5, qty: 1 },
        { exchange: "binance", market: "futures", symbol: SYMBOL, type: "oi", oi: 12345 }
    ];

    const futuresEmitted = [];
    for (const data of futuresPackets) {
        futuresEmitted.push(...realtime.futuresHandler({ symbol: SYMBOL, data }));
    }

    const futuresNames = names(futuresEmitted);
    assert.ok(futuresNames.includes("depth_cross_venue"), "full-depth packets must reach cross-venue aggregation");
    assert.ok(futuresNames.includes("price"), "L2 price modules must emit through the pipeline");
    assert.ok(futuresNames.includes("oi"), "L2 open-interest modules must emit through the pipeline");
    assert.ok(futuresNames.includes("liquidation"), "L2 liquidation modules must emit through the pipeline");

    const healthNames = names(futures.events);
    for (const marker of ["price", "depth", "funding", "liquidation", "markPrice", "oi"]) {
        assert.ok(healthNames.includes(marker), `health marker "${marker}" must be emitted for its group`);
    }
    assert.ok(
        futures.events.some((event) => event.event === "candles" && event.type === "candle"),
        "the candle marker keeps its legacy payload shape"
    );

    futures.restore();

    /* ------------------------------------------------------------
     * 4. per-symbol isolation of module state
     *    (the container — L2 modules still own module-scope state)
     * ---------------------------------------------------------- */
    const isolated = realtime.core.buildRuntime();
    isolated.state.set("probe", "AAAUSDT", 1);
    isolated.state.update("probe", "BBBUSDT", (previous) => (previous || 0) + 5);

    assert.equal(isolated.state.get("probe", "AAAUSDT"), 1, "symbol A keeps its own block");
    assert.equal(isolated.state.get("probe", "BBBUSDT"), 5, "symbol B keeps its own block");
    assert.equal(isolated.state.get("probe", "CCCUSDT"), null, "unknown blocks report null");
    assert.equal(isolated.state.get("probe", "CCCUSDT", () => 7), 7, "a factory seeds a missing block");
    assert.equal(isolated.state.size, 3, "each symbol gets a separate block");

    /* ------------------------------------------------------------
     * 5. event bus
     * ---------------------------------------------------------- */
    const bus = isolated.bus;
    const seen = [];
    const unsubscribe = bus.subscribe((entry) => seen.push(entry.channel));

    bus.publish({ event: "probe", market: "spot", exchange: "binance", symbol: "AAAUSDT", value: 1 });
    bus.publish({ event: "probe", market: "futures", exchange: "okx", symbol: "AAAUSDT", value: 2 });
    bus.publish("plain-string-event", { market: "spot", exchange: "bybit", symbol: "AAAUSDT" });

    assert.equal(seen.length, 3, "subscribers see every published event");
    assert.equal(bus.channels({ symbol: "AAAUSDT" }).length, 3, "channels are market:exchange:symbol:event");
    assert.equal(bus.historyFor("spot:binance:AAAUSDT:probe").length, 1);
    assert.ok(bus.latestFor("spot:bybit:AAAUSDT:plain-string-event"), "string events are supported");

    const busSnapshot = bus.snapshot({ symbol: "AAAUSDT" });
    assert.equal(busSnapshot.probe.binance.value, 1, "snapshot is keyed event → venue → payload");
    assert.equal(busSnapshot.probe.okx.value, 2);

    unsubscribe();
    bus.publish(null);
    assert.equal(bus.stats().rejected, 1, "malformed events are rejected and counted");

    /* ------------------------------------------------------------
     * 6. venue plan + public API
     * ---------------------------------------------------------- */
    const plan = realtime.buildVenuePlan(SYMBOL);
    assert.deepEqual(plan.map((stream) => stream.id), [
        "bybit:spot:ws",
        "binance:spot:ws",
        "bitget:spot:ws",
        "kucoin:spot:ws",
        "okx:spot:ws",
        "bybit:futures:ws",
        "binance:futures:ws",
        "binance:futures:open-interest",
        "binance:futures:market-poller",
        "bitget:futures:ws",
        "kucoin:futures:ws",
        "okx:futures:ws"
    ], "venue plan must keep the legacy stream order and count");

    assert.equal(realtime.buildVenuePlan(SYMBOL, { markets: ["futures"] }).length, 7);
    assert.equal(realtime.buildVenuePlan(SYMBOL, { exchanges: ["bybit"] }).length, 2);
    assert.equal(realtime.buildVenuePlan("DOGEUSDT").length, 12, "any configured symbol resolves the same matrix");

    assert.equal(realtime.normalizeSymbol(" btc/usdt "), "BTCUSDT");
    assert.equal(realtime.getEnabledMarkets("kucoin", SYMBOL).spot, true);
    assert.equal(realtime.getEnabledExchanges(SYMBOL).length, 5);

    const sectionStatus = realtime.status();
    assert.equal(sectionStatus.version, "2.0.0");
    assert.equal(sectionStatus.registry.size, 73);
    assert.equal(sectionStatus.connections.running, 0, "status must not start any stream");
    assert.ok(realtime.venues.catalog().binance.futures.some((stream) => stream.kind === "poller"));

    /* ------------------------------------------------------------
     * 7. dependency boundary
     * ---------------------------------------------------------- */
    const path = require("node:path");
    const orchestratorModules = Object.keys(require.cache)
        .filter((file) => file.includes(`${path.sep}orchestrator${path.sep}`));

    assert.deepEqual(orchestratorModules, [], "collector/crypto/realtime must not load any orchestrator module");

    assert.equal(realtime.release(SYMBOL), true, "release() must succeed for a tracked symbol");
    assert.deepEqual(realtime.signals({ symbol: SYMBOL }), {}, "release() must clear the symbol's signals");

    console.log("realtime section validation passed: 73 modules, 12 streams, 5 venues, 0 orchestrator requires");
})();

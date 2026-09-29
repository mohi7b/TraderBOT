/* ============================================================
 * File: test/collector-liquidity-bootstrap.test.cjs
 * Section: test
 *
 * Role:
 *   The piece that closes phase 2's inputs: collector/aanode/
 *   bootstrap.cjs must start the six-market liquidity collector, and
 *   what it reports must be what the section really did.
 *
 *   Offline by construction: the section's own catalog, registry and
 *   providers run for real — only its feed client is replaced — so a
 *   sweep here is two venues answering their real payload shape. No
 *   network, no keys, no wall clock.
 *
 *   The last case is the honest-bus rule: bus === null means "no bus"
 *   (which is *reported*, not hidden), bus omitted means "ask the
 *   section for the Realtime bus", exactly like its own server.cjs.
 *
 * Run:
 *   node --test test/collector-liquidity-bootstrap.test.cjs
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const collectorConfig = require(path.join(ROOT, "collector", "aanode", "config", "collector.cjs"));
const bootstrap = require(path.join(ROOT, "collector", "aanode", "bootstrap.cjs"));
const { resolveBus } = require(path.join(ROOT, "collector", "liquidity_6markets", "server.cjs"));
const { defaultCatalog, createProviderRegistry } = require(path.join(ROOT, "collector", "liquidity_6markets", "index.cjs"));
const { validateEnvelope } = require(path.join(ROOT, "collector", "crypto", "common", "envelope.cjs"));
const { createFakeClient } = require(path.join(ROOT, "collector", "crypto", "onchain", "tests", "fixtures.cjs"));

/** The clock these tests own: a sweep must never depend on wall time. */
const START = 1_700_000_000_000;

/**
 * Crypto only, no keys, frozen clock.
 * With no keys in `env`, which venues are usable is a fact of the code
 * (binance and okx are key-free), not of whoever ran the test.
 */
const CRYPTO_ONLY = {
    markets: ["crypto"],
    env: {},
    now: () => START,
    intervalMs: 1,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

/** What the two key-free crypto venues quote, per instrument. */
const BOOK = {
    BTCUSDT: { bid: 64_000, ask: 64_010 },
    ETHUSDT: { bid: 3_100, ask: 3_101 },
    SOLUSDT: { bid: 150, ask: 150.1 }
};

/** The instruments in the crypto market, straight off the real catalog. */
const CRYPTO_INSTRUMENTS = Object.keys(BOOK);

/**
 * The section's feed client, replaced.
 * It answers the URL the collector really built, in the venue's real
 * payload shape, and *only* for the two venues it knows — every other
 * venue stays an honest failure instead of a fake success.
 */
function stubClient() {
    const calls = [];
    const answered = [];

    return {
        calls,
        answered,

        async get(providerId, url) {
            calls.push({ providerId, url });
            const query = new URL(url).searchParams;
            /* The same instrument is spelled differently per venue
             * (BTCUSDT on Binance, BTC-USDT on OKX). */
            const symbol = (query.get("symbol") || query.get("instId") || "").replace(/-/g, "");
            const book = BOOK[symbol];

            if (!book || (providerId !== "binance" && providerId !== "okx")) {
                return { ok: false, status: null, data: null, reason: `stub: no answer for ${providerId}/${symbol}`, url };
            }

            answered.push({ providerId, symbol });

            if (providerId === "okx") {
                return {
                    ok: true, status: 200, reason: null, url,
                    data: {
                        code: "0",
                        msg: "",
                        data: [{
                            instId: symbol,
                            last: String((book.bid + book.ask) / 2),
                            lastSz: "1",
                            askPx: String(book.ask),
                            askSz: "1.5",
                            bidPx: String(book.bid),
                            bidSz: "2.5",
                            ts: String(START)
                        }]
                    }
                };
            }

            /* bookTicker: a top-of-book quote with sizes and no timestamp. */
            return {
                ok: true, status: 200, reason: null, url,
                data: { symbol, bidPrice: String(book.bid), bidQty: "2.5", askPrice: String(book.ask), askQty: "1.5" }
            };
        },

        stats: () => ({ calls: calls.length })
    };
}

/** A bus good enough to prove what travels on it, and on which channel. */
function stubBus() {
    const entries = [];
    return {
        entries,
        publish(entry, context) {
            entries.push({ entry, context, channel: `${context.market}:${context.exchange}:${context.symbol}:${entry.event}` });
            return entry;
        }
    };
}

/**
 * What the collector should plan for one market, counted off the real
 * registry: a pair the registry refuses is a refusal, never a request.
 */
function expectations(assetClass, env = {}) {
    const registry = createProviderRegistry();
    const out = { instruments: 0, planned: 0, refused: 0 };

    for (const instrument of defaultCatalog().instruments()) {
        if (instrument.assetClass !== assetClass) continue;
        out.instruments += 1;
        for (const venue of Object.keys(instrument.symbols)) {
            if (registry.request(venue, instrument, { env }).ok) out.planned += 1;
            else out.refused += 1;
        }
    }

    return out;
}

/* ============================================================
 * The start seam: the loop's first real answer is the readiness report
 * ============================================================ */

test("start: readiness is the loop's first real answer, and every reading reaches the bus", async () => {
    const bus = stubBus();
    const client = stubClient();
    const report = await bootstrap.startLiquidity({ bus, client, ...CRYPTO_ONLY });
    const sweep = await report.firstSweep;

    const expected = expectations("crypto");
    assert.equal(expected.instruments, CRYPTO_INSTRUMENTS.length, "the fixtures and the catalog agree on the crypto market");

    assert.equal(report.ready, true);
    assert.equal(report.first.kind, "venue", "readiness is the loop's first real answer, not a timer");
    assert.ok(report.first.venue, "…and it names the venue that answered");
    assert.equal(report.bus, true);
    assert.equal(report.instruments, defaultCatalog().size(), "the report counts the whole six-market catalog");
    assert.equal(report.markets.length, 6, "…covering six markets, whichever ones the filter polls");

    assert.equal(report.planned, expected.planned, "planned = every venue/instrument pair the registry allows with no keys");
    assert.equal(report.refused, expected.refused, "refused = every pair it does not (here: the keyed venues)");

    /* The stub answers for two venues only, so failure has to show up as
     * failure — and the venues that answered must not. */
    const askedVenues = [...new Set(client.calls.map((call) => call.providerId))].sort();
    const answeredVenues = new Set(client.answered.map((call) => call.providerId));
    const failedVenues = askedVenues.filter((venue) => !answeredVenues.has(venue));

    assert.equal(sweep.venues, askedVenues.length, "every venue with work was polled once");
    assert.deepEqual([...sweep.failed].map((report_) => report_.venue).sort(), failedVenues, "every venue the stub refused is reported as failed");
    assert.equal(sweep.refusals, failedVenues.length, "a failed venue is left alone for the rest of the sweep");
    assert.ok(failedVenues.length > 0, "the failure path is really exercised");

    assert.equal(sweep.readings, client.answered.length, "every answer became a reading");
    assert.equal(sweep.readings, CRYPTO_INSTRUMENTS.length * 2, "the two answering venues quote the whole crypto market");
    assert.equal(sweep.rejected, 0);

    assert.equal(bus.entries.length, sweep.readings, "one envelope per reading, and no more");

    for (const { entry, context, channel } of bus.entries) {
        assert.equal(entry.market, "liquidity", "the bus axis is liquidity, never spot/futures");
        assert.equal(entry.exchange, "crypto", "the market travels as the exchange axis");
        assert.equal(entry.source, "liquidity", "and the provenance travels with it");
        assert.match(channel, /^liquidity:crypto:[A-Z0-9]+:[a-z]+$/, `channel shape: ${channel}`);
        const validation = validateEnvelope(entry.envelope);
        assert.equal(validation.ok, true, `invalid envelope on ${channel}: ${validation.errors.join("; ")}`);
        assert.equal(context.symbol, entry.symbol);
    }

    report.stop();
    const summary = await report.loop;
    assert.equal(summary.stopped, "aborted", "stop() really ends the sweep loop");
    assert.equal(summary.readings, CRYPTO_INSTRUMENTS.length * 2, "…without dropping the readings it already published");
});

test("start: a market that is still answering is reported as answering, not as silence", async () => {
    /* Six markets over public endpoints take longer than one short window.
     * Binance answers at once here and every other venue is still thinking,
     * which is exactly that situation: the collector is working, so `ready`
     * has to be true — and the report must not have waited for the rest of
     * the market to read "nothing happened" instead. */
    const bus = stubBus();
    const base = stubClient();
    const asked = [];
    const client = {
        calls: asked,
        stats: () => ({ calls: asked.length }),
        get(providerId, url, options) {
            asked.push(providerId);
            if (providerId !== "binance") return new Promise(() => {}); /* still thinking */
            return base.get(providerId, url, options);
        }
    };

    /* Every due venue is asked at once, so the asking order cannot decide
     * whether Binance is reached before this test ends. */
    const report = await bootstrap.startLiquidity({ bus, client, readyTimeoutMs: 2_000, parallel: 32, ...CRYPTO_ONLY });

    assert.equal(report.first.kind, "venue", "the first venue answer is the answer");
    assert.equal(report.first.venue, "binance");
    assert.ok(report.first.readings > 0, "and it carries what that venue really delivered");
    assert.ok(asked.length > 1, "…while the other venues were asked and had not answered yet");

    assert.equal(report.ready, true, "a collector that is answering is ready");
    assert.equal(bus.entries.length, report.first.readings, "the readings are on the bus as they arrive");

    report.stop();
});

test("start: a caller-owned signal stops the loop too", async () => {
    const controller = new AbortController();
    const sweeps = [];
    const report = await bootstrap.startLiquidity({
        bus: null,
        client: stubClient(),
        signal: controller.signal,
        onSweep: (sweep) => { sweeps.push(sweep); if (sweeps.length === 1) controller.abort(); },
        ...CRYPTO_ONLY
    });

    assert.equal(report.ready, true);
    const summary = await report.loop;
    assert.equal(summary.stopped, "aborted");
    assert.equal(sweeps.length, 1, "the loop stopped on the caller's word, not on a timer");
});

/* ============================================================
 * Honesty: what could not happen is said, not implied
 * ============================================================ */

test("honesty: no bus is reported as no bus — and the readings still happen", async () => {
    const report = await bootstrap.startLiquidity({ bus: null, client: stubClient(), ...CRYPTO_ONLY });

    assert.equal(report.bus, false, "the report never pretends a bus is attached");
    const sweep = await report.firstSweep;
    assert.equal(sweep.readings, CRYPTO_INSTRUMENTS.length * 2, "a collector without a bus still collects");

    report.stop();
    await report.loop;
});

test("honesty: an aborted signal is not-ready, not a guess", async () => {
    const controller = new AbortController();
    controller.abort();

    const client = stubClient();
    const report = await bootstrap.startLiquidity({ bus: null, signal: controller.signal, client, ...CRYPTO_ONLY });

    assert.equal(report.ready, false, "nothing swept yet, so nothing is claimed");
    assert.equal(report.first, null, "there is no answer to report, and none is invented");
    assert.equal(await report.firstSweep, null, "…and no sweep to promise either");
    assert.equal(client.calls.length, 0, "an aborted start asks no venue");

    const summary = await report.loop;
    assert.equal(summary.sweeps, 0);
    assert.equal(summary.stopped, "aborted");
});

test("honesty: the bus is the section's own resolution, not a second copy of it", async () => {
    const resolved = resolveBus();
    const expected = Boolean(resolved && !resolved.error);

    const report = await bootstrap.startLiquidity({ client: stubClient(), ...CRYPTO_ONLY });
    assert.equal(report.bus, expected, "bootstrap repeats the section's answer about the Realtime bus");

    report.stop();
    await report.loop;
});


/* ============================================================
 * The configuration seam
 * ============================================================ */

test("config: the six markets are a source, but not a symbol-shaped one", () => {
    assert.equal(collectorConfig.sources.liquidity.enabled, true, "the remaining phase-2 input is on");
    assert.ok(collectorConfig.getEnabledSources().includes("liquidity"), "and it is reported as enabled");

    const plan = collectorConfig.buildCollectorPlan(["BTCUSDT"]);
    assert.equal(plan.filter((task) => task.source === "liquidity").length, 0, "liquidity is provider/instrument shaped: it contributes no per-symbol task");
    assert.equal(plan.length, 10, "so the realtime plan is still the 5 exchanges × 2 markets it has always been");
    assert.ok(plan.every((task) => task.symbol === "BTCUSDT"));

    assert.deepEqual(bootstrap.liquidityRequestOptions(), {}, "null in config means the section's own default, never an empty list");
    assert.deepEqual(bootstrap.liquidityRequestOptions({ markets: ["crypto"] }), { markets: ["crypto"] }, "the caller wins over config");
});

/* ============================================================
 * The process seam: six markets, however many symbols the caller boots
 * (must stay last — this is the one case that uses process-level state)
 * ============================================================ */

test("the six markets belong to the process, not to a symbol", async () => {
    /* The on-chain section is booted by this same call, so it is stubbed too:
     * its own fixtures, its own key-free mempool, no socket. */
    const onchainStub = { client: createFakeClient(), env: {}, now: () => START, intervalMs: 1, providerIds: ["mempool"] };
    const options = { symbols: [], liquidity: { client: stubClient(), ...CRYPTO_ONLY }, onchain: onchainStub };

    const first = await bootstrap(options);
    const second = await bootstrap(options);

    assert.equal(first.realtime, null, "no symbol: nothing for realtime to start");
    assert.equal(first.plan, 0);
    assert.equal(first.liquidityStarted, true, "the first boot starts the six markets");
    assert.equal(first.liquidity.ready, true);
    assert.equal(second.liquidityStarted, false, "the second boot finds them already running");
    assert.equal(second.liquidity, first.liquidity, "one collector, not one per symbol — the readings cannot be published twice");

    first.liquidity.stop();
    first.onchain.stop();
    const summary = await first.liquidity.loop;
    const onchainSummary = await first.onchain.loop;
    assert.equal(summary.stopped, "aborted");
    assert.equal(onchainSummary.stopped, "aborted", "and the loop started beside it ends too");
});

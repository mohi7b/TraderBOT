/* ============================================================
 * File: test/collector-onchain-bootstrap.test.cjs
 * Section: test
 *
 * Role:
 *   The last phase-2 input: collector/aanode/bootstrap.cjs must start the
 *   on-chain collector (collector/crypto/onchain), and what it reports must
 *   be what the section really did.
 *
 *   Offline by construction: the section's own catalog, subsystems and
 *   providers run for real — only its feed client is replaced, by the
 *   section's own fixtures, which answer every endpoint in the shape it
 *   really answers with. No network, no keys, no wall clock.
 *
 *   The honest-bus rule is the section's own: bus === null means "no bus"
 *   (which is *reported*, not hidden), bus omitted means "ask the section
 *   for the Realtime bus", exactly like its server.cjs.
 *
 * Run:
 *   node --test test/collector-onchain-bootstrap.test.cjs
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const collectorConfig = require(path.join(ROOT, "collector", "aanode", "config", "collector.cjs"));
const bootstrap = require(path.join(ROOT, "collector", "aanode", "bootstrap.cjs"));
const onchain = require(path.join(ROOT, "collector", "crypto", "onchain", "index.cjs"));
const { resolveBus } = require(path.join(ROOT, "collector", "crypto", "onchain", "server.cjs"));
const { AT, createFakeClient } = require(path.join(ROOT, "collector", "crypto", "onchain", "tests", "fixtures.cjs"));

/** The clock these tests own: a poll must never depend on wall time. */
const START = AT;

/**
 * The providers this test boots: the key-free mempool, nothing else. The
 * whole sheet is key-free, but a poll that asks one provider is a poll whose
 * every call this test can account for.
 */
const PROVIDER_IDS = ["mempool"];

/**
 * Key-free, frozen clock, a pause short enough to test.
 * With no keys in `env`, which providers are ready is a fact of the code,
 * not of whoever ran the test.
 */
function offline(overrides = {}) {
    return {
        client: createFakeClient(),
        env: {},
        now: () => START,
        intervalMs: 1,
        providerIds: PROVIDER_IDS,
        ...overrides
    };
}

/* ============================================================
 * Starting the loop
 * ============================================================ */

test("startOnchain: readiness is the first answer, the complete poll is a promise", async () => {
    const client = createFakeClient();
    const report = await bootstrap.startOnchain({ bus: null, ...offline({ client }) });

    assert.equal(report.ok, true, "the start was honoured");
    assert.equal(report.ready, true, "the loop answered");
    assert.equal(report.bus, false, "bus: null means no bus, and it is reported rather than hidden");
    assert.ok(report.subjects > 0, `the real subject catalog is behind this (${report.subjects} subjects)`);
    assert.ok(report.planned > 0, `and it planned something (${report.planned} tasks)`);
    assert.equal(report.refused, 0, "nothing was refused: the section's providers are key-free");
    assert.equal(report.providers.ready.length, onchain.PROVIDER_IDS.length, "every provider the section ships is ready");
    assert.equal(report.providers.missingKey.length, 0, "…and none is missing a key");
    assert.ok(client.calls.length > 0, "the loop really asked the provider");
    assert.ok(client.calls.every((call) => call.providerId === "mempool"), "and only the provider it was asked for");

    const first = report.first;
    assert.equal(first.kind, "task", "the first thing a poll produces is a task's report");
    assert.equal(first.providerId, "mempool");
    assert.ok(first.rows >= 1, "and it carries the numbers, not just a note");

    const poll = await report.firstPoll;
    assert.equal(poll.kind, "poll", "the complete first poll is a promise, not a maybe-null field");
    assert.ok(poll.tasks >= 1);
    assert.ok(poll.readings > 0, "the fixtures parse into real readings");
    assert.equal(poll.failed, 0, "nothing failed against an endpoint that answered what it really answers");

    report.stop();
    const summary = await report.loop;
    assert.equal(summary.stopped, "aborted", "stop() ends the loop it started");
    assert.ok(summary.polls >= 1);
});

test("honesty: an aborted signal is not-ready, not a guess", async () => {
    const controller = new AbortController();
    controller.abort();

    const client = createFakeClient();
    const report = await bootstrap.startOnchain({ bus: null, signal: controller.signal, ...offline({ client }) });

    assert.equal(report.ok, true, "the start itself was honoured");
    assert.equal(report.ready, false, "nothing polled yet, so nothing is claimed");
    assert.equal(report.first, null, "there is no answer to report, and none is invented");
    assert.equal(await report.firstPoll, null, "…and no poll to promise either");
    assert.equal(client.calls.length, 0, "an aborted start asks no provider");

    const summary = await report.loop;
    assert.equal(summary.polls, 0);
    assert.equal(summary.stopped, "aborted");
});

test("honesty: a start that cannot be honoured is a report, never an exception", async () => {
    const client = createFakeClient();
    const report = await bootstrap.startOnchain({ bus: null, groups: ["not-a-group"], ...offline({ client }) });

    assert.equal(report.ok, false, "the catalog refused the group, so the start did not happen");
    assert.match(report.error, /unknown group/, "the section's own complaint, repeated rather than replaced");
    assert.equal(report.ready, false);
    assert.equal(report.first, null);
    assert.equal(report.subjects, 0, "no catalog, no subjects — and no invented number");
    assert.deepEqual(report.providers.ready, []);
    assert.equal(client.calls.length, 0);
    assert.equal(await report.loop, null);
    report.stop(); /* a report with nothing behind it can still be stopped */
});

/* ============================================================
 * The bus
 * ============================================================ */

test("honesty: the bus is the section's own resolution, not a second copy of it", async () => {
    const resolved = resolveBus();
    const expected = Boolean(resolved && !resolved.error);

    const report = await bootstrap.startOnchain(offline());
    assert.equal(report.bus, expected, "bootstrap repeats the section's answer about the Realtime bus");

    report.stop();
    await report.loop;
});

/* ============================================================
 * The configuration seam
 * ============================================================ */

test("config: on-chain is a source, but not a symbol-shaped one", () => {
    assert.equal(collectorConfig.sources.onchain.enabled, true, "the phase-2 input is on");
    assert.ok(collectorConfig.getEnabledSources().includes("onchain"), "and it is reported as enabled");

    const plan = collectorConfig.buildCollectorPlan(["BTCUSDT"]);
    assert.equal(plan.filter((task) => task.source === "onchain").length, 0, "on-chain tasks are subject shaped: they contribute no per-symbol task");
    assert.equal(plan.length, 10, "so the realtime plan is still the 5 exchanges × 2 markets it has always been");

    assert.deepEqual(bootstrap.onchainRequestOptions(), {}, "null in config means the section's own default, never an empty list");
    assert.deepEqual(
        bootstrap.onchainRequestOptions({ groups: ["chain"], tasks: ["mempool.mempool"] }),
        { groups: ["chain"], taskIds: ["mempool.mempool"] },
        "the caller wins, in the config file's own words"
    );
    assert.deepEqual(
        bootstrap.onchainRequestOptions({ taskIds: ["x"], providers: ["mempool"] }),
        { taskIds: ["x"], providerIds: ["mempool"] },
        "and in the collector's words too"
    );
    assert.deepEqual(bootstrap.onchainRequestOptions({ tasks: [] }), {}, "an empty list is no narrowing, exactly like a null");
});

/* ============================================================
 * The process seam: one on-chain loop, however many symbols the caller boots
 * (must stay last — this is the one case that uses process-level state)
 * ============================================================ */

/**
 * The six markets are booted by this same call, so they are stubbed too: a
 * venue that answers nothing locally instead of a venue that is asked live.
 */
function offlineLiquidity() {
    const calls = [];
    return {
        calls,
        markets: ["crypto"],
        venues: ["binance"],
        env: {},
        now: () => START,
        intervalMs: 1,
        client: {
            get: async (providerId, url) => {
                calls.push({ providerId, url });
                return { ok: false, status: null, data: null, reason: `stub: no answer for ${providerId}`, url };
            },
            stats: () => ({ calls: calls.length })
        }
    };
}

test("the on-chain section belongs to the process, not to a symbol", async () => {
    const options = { symbols: [], liquidity: offlineLiquidity(), onchain: offline() };

    const first = await bootstrap(options);
    const second = await bootstrap(options);

    assert.equal(first.realtime, null, "no symbol: nothing for realtime to start");
    assert.equal(first.onchainStarted, true, "the first boot starts the on-chain loop");
    assert.equal(first.onchain.ready, true);
    assert.equal(second.onchainStarted, false, "the second boot finds it already running");
    assert.equal(second.onchain, first.onchain, "one loop, not one per symbol — the readings cannot be published twice");

    first.onchain.stop();
    first.liquidity.stop();
    const summary = await first.onchain.loop;
    const sweeps = await first.liquidity.loop;
    assert.equal(summary.stopped, "aborted");
    assert.equal(sweeps.stopped, "aborted");
});

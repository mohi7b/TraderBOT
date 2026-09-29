/* ============================================================
 * File: collector/crypto/onchain/tests/orchestrator.test.cjs
 * Section: collector/crypto/onchain/tests
 * Version: 1.0.0
 *
 * Role:
 *   The polling loop and the bridge: one poll over a full set of known
 *   answers must produce one envelope per fact, on the "onchain" axis, with
 *   the standard frame — and it must keep working while a provider is down,
 *   a task is on demand, or an answer is empty.
 *
 * Run:
 *   node --test collector/crypto/onchain/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const onchain = require(path.join(ROOT, "index.cjs"));
const { createOnchainBridge, ONCHAIN_MARKET, readingEnvelope } = require(path.join(ROOT, "core", "bus-bridge.cjs"));
const { createProviderRegistry, DEFAULT_PROVIDERS } = require(path.join(ROOT, "providers", "index.cjs"));
const { validateEnvelope, SOURCE_TYPE } = require(path.join(ROOT, "..", "common", "envelope.cjs"));
const { EVENT_TYPES } = require(path.join(ROOT, "core", "reading.cjs"));
const { MIN_FAILURE_BACKOFF_MS, FAILURE_BACKOFF_CAP_MS, MAX_FOLLOW_UPS_PER_POLL, DEFAULT_INTERVAL_MS } = require(path.join(ROOT, "core", "orchestrator.cjs"));
const fx = require("./fixtures.cjs");

/** A collector wired to fixture answers, a sink and a bus — nothing real. */
function createHarness(options = {}) {
    const entries = [];
    const rejected = [];
    const calls = [];
    const bus = {
        publish(entry, context) {
            calls.push({ entry, context });
            return { ok: true };
        }
    };
    const client = options.client || fx.createFakeClient();
    const collector = onchain.createCollector({
        client,
        bus,
        sink: (entry) => entries.push(entry),
        onInvalid: (errors, envelope) => rejected.push({ errors, envelope }),
        ...options
    });
    return { collector, client, bus, entries, rejected, calls };
}

test("the plan is every task once, and the on-demand scan is not in it", () => {
    const { collector } = createHarness();
    const plan = collector.plan();

    assert.equal(plan.tasks.length, 37);
    assert.deepEqual(plan.refused, []);
    assert.equal(new Set(plan.tasks.map((task) => task.taskId)).size, 37);
    for (const task of plan.tasks) {
        assert.equal(task.onDemand, false, `${task.taskId} is due on its own`);
        assert.ok(task.scheduleMs > 0);
        assert.ok(onchain.SUBSYSTEM_IDS.includes(task.capsule));
    }
    /* The plan is data: it exists before the first poll. */
    assert.equal(collector.status().planned, 37);
    assert.equal(collector.status().scheduledTasks, 37);
    assert.equal(collector.status().onDemandTasks, 0);
    assert.equal(onchain.DEFAULT_INTERVAL_MS, DEFAULT_INTERVAL_MS);
    assert.equal(typeof onchain.createFeedClient, "function");
});

test("one poll asks every task, publishes one envelope per fact, on the onchain axis", async () => {
    const { collector, entries, rejected, calls, client } = createHarness();
    const sweep = await collector.pollOnce();

    assert.equal(sweep.due, 37);
    assert.equal(sweep.tasks, 38, "37 tasks plus the block scan a new block revealed");
    assert.equal(sweep.followUps, 1);
    assert.equal(sweep.published, sweep.readings);
    assert.deepEqual(sweep.failed, []);
    assert.ok(client.calls.length >= 38);

    /* 3 holders + 4 network metrics + 1 whale scan + 3 stablecoins + 2 rates + 30 fund quotes. */
    assert.equal(sweep.readings, 43);
    assert.equal(entries.length, 43);
    assert.equal(calls.length, 43);
    assert.deepEqual(rejected, []);

    const byEvent = {};
    for (const entry of entries) byEvent[entry.event] = (byEvent[entry.event] || 0) + 1;
    assert.deepEqual(byEvent, {
        exchange_reserves: 3,
        network_metrics: 4,
        whale_transfer: 1,
        stablecoin_supply: 3,
        lending_rate: 2,
        etf_quote: 30
    });
    for (const eventType of Object.keys(byEvent)) assert.ok(EVENT_TYPES.includes(eventType));

    for (const entry of entries) {
        assert.equal(entry.market, ONCHAIN_MARKET);
        assert.equal(entry.exchange, "crypto", "the bus axis carries the asset class");
        assert.ok(entry.symbol);
        assert.ok(entry.envelope);
        assert.equal(validateEnvelope(entry.envelope).ok, true, entry.envelope.meta.id);
    }
    for (const call of calls) {
        assert.equal(call.context.market, ONCHAIN_MARKET);
        assert.equal(call.context.symbol, call.entry.symbol);
    }

    /* The envelope is the standard frame with an honest on-chain class. */
    const binance = entries.find((entry) => entry.symbol === "BINANCE");
    assert.equal(binance.envelope.meta.assetClass, "crypto");
    assert.equal(binance.envelope.meta.sourceType, SOURCE_TYPE.ONCHAIN);
    assert.equal(binance.envelope.meta.marketType, null, "an exchange reserve is not a trade");
    assert.equal(binance.envelope.meta.eventType, "exchange_reserves");
    assert.equal(binance.envelope.meta.exchange, "binance");
    assert.equal(binance.envelope.meta.provenance.origin, "onchain");
    assert.equal(binance.envelope.meta.provenance.subjectKind, "holder");
    assert.equal(binance.envelope.payload.reservesUsd, 128_500_000_000);
    assert.match(binance.envelope.meta.id, /^binance:BINANCE:exchange_reserves:/);

    const fund = entries.find((entry) => entry.symbol === "IBIT");
    assert.equal(fund.envelope.meta.provenance.underlying, "BTC");
    assert.equal(fund.envelope.meta.provenance.issuer, "blackrock");
    assert.equal(fund.envelope.payload.netFlowUsd, null);
    assert.equal(fund.envelope.payload.sharesOutstanding, null);

    const whale = entries.find((entry) => entry.event === "whale_transfer");
    assert.equal(whale.symbol, "BTC");
    assert.equal(whale.envelope.payload.sampledTransactions, 4);
    assert.equal(whale.envelope.payload.blockTransactions, 4_117);

    const stablecoin = entries.find((entry) => entry.symbol === "USDT");
    assert.equal(stablecoin.envelope.payload.circulatingUsd, 183_700_000_000);

    /* The scan became a task of its own, and it is not due on its own. */
    const status = collector.status();
    assert.equal(status.onDemandTasks, 1);
    assert.equal(status.scheduledTasks, 37);
    const scan = status.tasks[`mempool/block-transactions/${fx.BLOCK_C}`];
    assert.equal(scan.onDemand, true);
    assert.equal(scan.dueInMs, null);
    assert.equal(scan.readings, 1);
    assert.equal(scan.published, 1);
    assert.equal(MAX_FOLLOW_UPS_PER_POLL, 8, "one poll chases a bounded amount of discovered work");

    /* The second poll asks nothing: every schedule is longer than the poll. */
    const second = await collector.pollOnce();
    assert.equal(second.due, 0);
    assert.equal(second.tasks, 0);
    assert.equal(entries.length, 43, "a task is never asked twice in a row");
});

test("a dead provider is a report, never an exception, and it is asked later", async () => {
    const { collector } = createHarness({ client: fx.createFakeClient({ fail: (providerId) => (providerId === "mempool" ? "HTTP 502" : null) }) });

    const sweep = await collector.pollOnce();
    assert.equal(sweep.failed.length, 2, "both mempool tasks failed");
    assert.deepEqual(sweep.failed.map((failure) => failure.taskId).sort(), ["mempool/blocks", "mempool/mempool"]);
    assert.equal(sweep.readings, 40, "43 facts minus the two mempool readings and the scan they revealed");
    for (const failure of sweep.failed) assert.match(failure.reason, /HTTP 502/);

    const entry = collector.status().tasks["mempool/mempool"];
    assert.equal(entry.failures, 1);
    assert.equal(entry.runs, 0);
    assert.match(entry.lastReason, /HTTP 502/);
    assert.ok(entry.dueInMs > MIN_FAILURE_BACKOFF_MS - 2_000 && entry.dueInMs <= MIN_FAILURE_BACKOFF_MS, "asked again in 30 s");

    /* A second failure doubles the wait; the cap keeps it finite. */
    const report = await collector.pollTask("mempool/mempool");
    assert.match(report.failed, /HTTP 502/);
    const after = collector.status().tasks["mempool/mempool"];
    assert.equal(after.failures, 2);
    assert.ok(after.dueInMs > MIN_FAILURE_BACKOFF_MS && after.dueInMs <= 2 * MIN_FAILURE_BACKOFF_MS);
    assert.ok(FAILURE_BACKOFF_CAP_MS >= 2 * MIN_FAILURE_BACKOFF_MS);

    /* An unknown task id is nothing to run, not a crash. */
    assert.equal(await collector.pollTask("nope/nope"), null);
});

test("task and provider filters narrow the plan without breaking it", () => {
    const onlyMempool = createHarness({ providerIds: ["mempool"] });
    assert.equal(onlyMempool.collector.status().planned, 2);
    assert.deepEqual(onlyMempool.collector.plan().tasks.map((task) => task.taskId).sort(), ["mempool/blocks", "mempool/mempool"]);

    const oneTask = createHarness({ taskIds: ["defillama/cexs"] });
    const plan = oneTask.collector.plan();
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0].taskId, "defillama/cexs");
    assert.equal(oneTask.collector.status().planned, 1);
});

test("a provider that is not registered is refused, by name and by reason", () => {
    const registry = createProviderRegistry({ providers: DEFAULT_PROVIDERS.filter((provider) => provider.id !== "nasdaq") });
    const { collector } = createHarness({ registry });
    const plan = collector.plan();

    assert.equal(plan.refused.length, 15, "one refusal per Nasdaq fund task");
    for (const refusal of plan.refused) {
        assert.match(refusal.taskId, /^nasdaq\/info\//);
        assert.match(refusal.reason, /not registered/);
    }
    assert.equal(plan.tasks.length, 22, "37 tasks minus the 15 that cannot be asked");
    assert.equal(collector.status().refused.length, 15);
});

test("the loop stops on a count, on idle, and on an abort — always with a summary", async () => {
    const counted = createHarness({ sleep: async () => {} });
    const summary = await counted.collector.run({ polls: 2, interval: 1 });
    assert.equal(summary.polls, 2);
    assert.equal(summary.readings, 43, "the second poll has nothing due");
    assert.equal(summary.published, 43);
    assert.equal(summary.failedTasks, 0);
    assert.equal(summary.stopped, null);
    assert.ok(summary.finishedAt >= summary.startedAt);

    /* stopWhenIdle: a busy poll and then two idle ones is a spin, not a loop. */
    const idle = createHarness({ sleep: async () => {} });
    const idleSummary = await idle.collector.run({ polls: 10, sweeps: null, interval: 1, stopWhenIdle: true });
    assert.equal(idleSummary.stopped, "idle");
    assert.equal(idleSummary.polls, 3, "one poll with work, then two with nothing due");
    assert.equal(idleSummary.readings, 43);

    /* An aborted signal stops before the next poll, not in the middle of one. */
    const controller = new AbortController();
    const stopped = createHarness({ sleep: async () => { controller.abort(); } });
    const stoppedSummary = await stopped.collector.run({ interval: 1, signal: controller.signal });
    assert.equal(stoppedSummary.stopped, "aborted");
    assert.equal(stoppedSummary.polls, 1);
    assert.equal(stoppedSummary.readings, 43);

    /* onSweep is the same callback as onPoll, under the sibling modules' word. */
    const seen = [];
    await createHarness({ sleep: async () => {} }).collector.run({ polls: 1, onSweep: (sweep) => seen.push(sweep.due) });
    assert.deepEqual(seen, [37]);
});

test("reset clears the schedule, the memory stays with the capsule", async () => {
    const { collector } = createHarness();
    await collector.pollOnce();
    assert.equal(collector.status().planned, 38, "the scan is part of the schedule now");
    assert.equal(collector.capsule("whale_tracker").state().knownBlocks, 3);

    assert.equal(collector.reset(), 38);
    const after = collector.status();
    assert.equal(after.planned, 37, "the plan exists again, with no history");
    assert.equal(after.onDemandTasks, 0);
    assert.equal(after.tasks["defillama/cexs"].runs, 0);
    assert.equal(after.capsules.whale_tracker.knownBlocks, 3, "a reset does not erase what was measured");

    /* The capsules are reachable and named. */
    assert.equal(collector.capsules().length, 4);
    assert.equal(collector.capsule("nope"), null);
    assert.equal(collector.catalog.size(), 36);
    assert.equal(typeof collector.registry.request, "function");
    assert.equal(typeof collector.client.get, "function");
    assert.equal(typeof collector.publishEnvelope, "function");
});

test("the bridge refuses an invalid envelope and never throws", () => {
    const rejected = [];
    const bridge = createOnchainBridge({ onInvalid: (errors, envelope) => rejected.push({ errors, envelope }) });

    assert.equal(bridge(null), null);
    assert.equal(bridge({}), null);
    assert.equal(readingEnvelope(null), null, "a reading without a subject is not an envelope");

    /* An envelope that cannot be validated is not published, it is reported. */
    const invalid = {
        schemaVersion: 1,
        meta: { id: "x", assetClass: "equities", sourceType: SOURCE_TYPE.ONCHAIN, eventType: null, timestamp: fx.AT, processedAt: fx.AT },
        payload: {}
    };
    assert.equal(bridge(invalid), null);
    assert.equal(rejected.length, 1, "an envelope without a header is refused silently, an invalid one is reported");
    assert.ok(rejected[0].errors.some((error) => /assetClass/.test(error)));
    assert.ok(rejected[0].errors.some((error) => /eventType/.test(error)));

    /* Without a bus the entry is still produced for the sink. */
    const sunk = [];
    const offline = createOnchainBridge({ sink: (entry) => sunk.push(entry) });
    const envelope = readingEnvelope({
        subjectId: "USDT",
        eventType: "stablecoin_supply",
        exchange: "tether",
        assetClass: "crypto",
        data: { circulatingUsd: 1 },
        timestamp: fx.AT,
        receivedAt: fx.AT,
        provenance: { origin: "onchain" }
    });
    const entry = offline(envelope);
    assert.equal(entry.market, "onchain");
    assert.equal(sunk.length, 1);
    assert.equal(validateEnvelope(envelope).ok, true);

    /* A publisher that throws is the caller's bus, not our silent failure. */
    const noisy = createOnchainBridge({ bus: { publish: () => { throw new Error("bus is gone"); } } });
    assert.throws(() => noisy(envelope), /bus is gone/);
});

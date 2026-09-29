/**
 * A8 — Seam: on-chain collector → realtime bus → analytics engine → NDJSON
 * collector/crypto/onchain/* + analytics-engine/{engine,core/router,
 * core/egress,modules/onchain,server}
 * ============================================================
 * The two halves of the on-chain layer only meet on the Realtime event bus:
 * the collector publishes its envelopes there (axis `onchain`), the engine
 * subscribes and turns every arrival into analytics.crypto.<subject>.onchain_flow.
 * This test walks that path with the real collector (its own capsules,
 * subjects, arithmetic, bus bridge and orchestrator, over the fixtures' fake
 * feed client — no socket) and the real consumer
 * (analytics-engine/server.cjs: bus in, NDJSON out), through the real
 * EventBus class, offline.
 *
 * What it pins down:
 *   1. every arrival reaches the engine: nothing unrouted, invalid, skipped,
 *      in error or failed — and one NDJSON line per arrival
 *   2. the six event types land on the subject's own topic, including a fund
 *      ticker that pair arithmetic would mangle (TETH is not T/ETH)
 *   3. what the collector measured travels verbatim, next to the engine's own
 *      gauge: two measurements, one reference each, never blended
 *   4. a whale sample stays a sample — no direction, no net flow, no total
 *   5. two providers of one fund are compared (agreement), never averaged
 *   6. the next sighting turns the gauge into a flow, with the window it covers
 *   7. a subject's coverage is named (seen / missing), and an old signal is
 *      reported stale against its own cadence instead of being dropped
 *   8. the engine's own output never comes back in as an input
 *
 * Note on the subject segment of a topic: for a chain or a stablecoin the
 * subject *is* the asset (BTC, USDT); for a holder or a fund it is the
 * institution (BINANCE, IBIT), and the coin a fund holds travels inside the
 * reading. Either way the topic is one subject's own stream.
 *
 * Run: node analytics-engine/tests/seam-onchain.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { EventBus } = require(path.join(ROOT, "collector", "crypto", "realtime", "core", "event-bus.cjs"));
const { ASSET_CLASS, SOURCE_TYPE } = require(path.join(ROOT, "collector", "crypto", "common", "envelope.cjs"));
const onchain = require(path.join(ROOT, "collector", "crypto", "onchain", "index.cjs"));
const fx = require(path.join(ROOT, "collector", "crypto", "onchain", "tests", "fixtures.cjs"));
const { createEngine } = require(path.join(ROOT, "analytics-engine", "engine.cjs"));
const { createAnalyticsServer } = require(path.join(ROOT, "analytics-engine", "server.cjs"));
const { ONCHAIN_EVENT_TYPES } = require(path.join(ROOT, "analytics-engine", "core", "router.cjs"));

/** The window the second sweep is taken over (both the 600 s and 900 s tasks). */
const GAP_MS = 1_800_000;

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A8: ${msg}`);
    checks += 1;
};

/** The subjects of one fixture sweep, and the topic each one must reach. */
const EXPECTED_TOPICS = Object.freeze({
    BTC: "analytics.crypto.btc.onchain_flow",
    BINANCE: "analytics.crypto.binance.onchain_flow",
    COINBASE: "analytics.crypto.coinbase.onchain_flow",
    USDT: "analytics.crypto.usdt.onchain_flow",
    IBIT: "analytics.crypto.ibit.onchain_flow",
    TETH: "analytics.crypto.teth.onchain_flow"
});

/**
 * One real collector on one side, one real consumer on the other, on one
 * real bus — and a clock the test drives, so nothing depends on wall time.
 */
function harness({ data = {} } = {}) {
    let clock = fx.AT;
    const now = () => clock;
    const bus = new EventBus({ historyMs: 0 });
    const lines = [];
    const server = createAnalyticsServer({ bus, emit: (line) => lines.push(line), now });
    const client = fx.createFakeClient({ data });
    const collector = onchain.createCollector({ client, bus, now });

    return {
        bus,
        server,
        lines,
        client,
        collector,
        at: now,
        tick(ms) { clock += ms; return clock; },
        poll: () => collector.pollOnce(),
        /** Every reading published for one topic, oldest first. */
        payloadsOf(topic) {
            return lines.filter((line) => line.topic === topic).map((line) => line.envelope.payload);
        }
    };
}


/** The whole sweep, end to end, in one assertion block. */
async function theWholeOnchainSweepReachesTheEngine() {
    const { bus, server, lines, poll } = harness();
    const started = Date.now();
    const sweep = await poll();
    const elapsedMs = Date.now() - started;

    ok(sweep.readings > 0 && sweep.published === sweep.readings,
        `every reading the collector made reached the bus (${sweep.published}/${sweep.readings})`);
    ok(sweep.failed.length === 0, "no provider task failed against the fixtures");
    ok(bus.channels({ market: onchain.ONCHAIN_MARKET }).length > 0,
        "the collector published on its own onchain axis");

    const stats = server.stats();
    ok(stats.ingested === sweep.published, `the engine ingested every on-chain envelope (${stats.ingested})`);
    ok(stats.unrouted === 0, "no on-chain event type was unrouted");
    ok(stats.invalid === 0 && stats.skipped === 0 && stats.errors === 0,
        "no frame was invalid, skipped or in error");
    ok(stats.published === sweep.published, "one analytics reading per arrival");
    ok(server.status().modules.includes("onchain"), "the onchain module is part of the engine");
    ok(ONCHAIN_EVENT_TYPES.every((eventType) => server.status().routes.includes(eventType)),
        "and all six on-chain event types are routed");

    ok(lines.length === stats.published, `one NDJSON line per reading (${lines.length})`);
    const written = lines.map((line) => JSON.stringify(line));
    ok(written.every((text) => text.startsWith('{"kind":"reading"')), "every line says what it is");
    const read = written.map((text) => JSON.parse(text));
    ok(read.every((line) => line.topic && line.channel && line.envelope && line.event === "onchain_flow"),
        "and names its topic, channel, event and whole frame");
    ok(read.every((line) => line.market === "analytics" && line.exchange === "crypto"),
        "the readings travel on the analytics axis, next to the onchain traffic — not instead of it");

    const topics = new Set(read.map((line) => line.topic));
    for (const [subject, topic] of Object.entries(EXPECTED_TOPICS)) {
        ok(topics.has(topic), `${subject} reached its own topic (${topic})`);
    }
    ok([...topics].every((topic) => topic.startsWith("analytics.crypto.") && topic.endsWith(".onchain_flow")),
        "every topic is analytics.crypto.<subject>.onchain_flow");
    ok(!topics.has("analytics.crypto.t.onchain_flow"),
        'the fund TETH is filed as teth, not as pair arithmetic\'s "t"');
    ok(read.some((line) => line.channel === "analytics:crypto:BINANCE:onchain_flow"),
        "and the bus channel names the same subject");

    const frames = read.map((line) => line.envelope);
    ok(frames.every((frame) => frame.meta.sourceType === SOURCE_TYPE.ANALYTICS),
        "every frame is an analytics envelope");
    ok(frames.every((frame) => frame.meta.assetClass === ASSET_CLASS.CRYPTO),
        "and stays in the asset class the collector named");
    ok(frames.every((frame) => frame.meta.marketType === null),
        "an on-chain datum is neither spot nor futures, and no reading promotes it to one");
    ok(frames.every((frame) => frame.meta.provenance.sourceType === SOURCE_TYPE.ONCHAIN),
        "every reading remembers the layer it came from");
    ok(frames.every((frame) => ONCHAIN_EVENT_TYPES.includes(frame.meta.provenance.sourceEvent)),
        "and which of the six events fed it");

    ok(server.engine.counters.ingested === stats.ingested,
        "the engine's own output never came back in as an input");
    ok(elapsedMs < 2_000,
        `the whole sweep (${sweep.readings} readings through bus, engine and writer) took ${elapsedMs} ms`);

    /* Replaying one of the engine's own frames is not a new arrival. */
    const own = bus.latestFor("analytics:crypto:BTC:onchain_flow");
    const replayed = server.engine.ingestBusEntry(own);
    ok(own !== null && replayed !== null && replayed.published.length === 0,
        "an analytics frame has no route, so it can never be re-ingested");
    ok(server.engine.counters.unrouted === 1,
        "and the engine says so (one unrouted) instead of pretending it consumed it");
}


/** What the collector measured travels verbatim, next to the engine's gauge. */
async function theReadingCarriesWhatTheCollectorMeasured() {
    const { poll, payloadsOf } = harness();
    await poll();

    const binance = payloadsOf(EXPECTED_TOPICS.BINANCE)[0];
    ok(binance.subject.id === "BINANCE" && binance.subject.kind === "holder",
        "the subject is the holder itself, as the frame's provenance said");
    ok(binance.reported.reservesUsd === 128_500_000_000 && binance.reported.cleanAssetsUsd === 121_000_000_000,
        "the collector's own numbers are carried verbatim");
    ok(binance.reported.provider === "defillama" && binance.reported.scope === "holder-reserves",
        "with the provider and the scope the collector labelled them");
    ok(binance.gauge.basis === "reservesUsd" && binance.gauge.value === binance.reported.reservesUsd,
        "the gauge is that same headline number, read — never recomputed");
    ok(binance.gauge.previous === null && binance.gauge.previousAt === null
        && binance.gauge.change === null && binance.evidence.previousSighting === false,
        "the first sighting has nothing to compare against: null, not 0");
    ok(binance.reported.pollDeltaUsd === null && binance.reported.previousReservesUsd === null,
        "and the collector's own poll delta is null for the same reason");
    ok(binance.reported.netFlow24hUsd === 210_000_000,
        "the provider's own 24 h flow stays where the collector put it");
    ok(binance.reported.trackedHolders > 0 && binance.reported.listedHolders > binance.reported.trackedHolders,
        "and the reading still says how much of the listed set it covers");
    ok(binance.sources.exchange_reserves.provider === "defillama"
        && binance.sources.exchange_reserves.ageMs === 0,
        "the coverage names the provider and the age of this very datum");
    ok(binance.missing.length === ONCHAIN_EVENT_TYPES.length - 1 && binance.missing.includes("etf_quote"),
        "the five signals this holder has not sent are named, not faked");

    /* A holder that answered without a number has no gauge at all. */
    const okx = payloadsOf("analytics.crypto.okx.onchain_flow")[0];
    ok(okx.reported.reservesUsd === null && okx.gauge === null,
        "a holder whose TVL is missing has no gauge — null, never 0");
    ok(okx.sources.exchange_reserves.basis === null && okx.seen.join(",") === "exchange_reserves",
        "and its coverage says the signal arrived without a number");

    const ibit = payloadsOf(EXPECTED_TOPICS.IBIT)[0];
    ok(ibit.subject.id === "IBIT" && ibit.subject.kind === "fund" && ibit.subject.underlying === "BTC",
        "a fund keeps the coin it holds in the reading — the topic names the fund");
    ok(ibit.subject.listing === "nasdaq" && ibit.reported.price === 47.57,
        "a share price is a share price: 47.57, the number the venue served");
    ok(ibit.reported.sharesOutstanding === null && ibit.reported.netFlowUsd === null,
        "no shares outstanding, no creations, no redemptions: null, always");
    ok(typeof ibit.reported.flowReason === "string" && ibit.reported.flowReason.length > 0,
        "with the collector's own reason for the gap next to it");
    ok(ibit.gauge.basis === "price" && ibit.gauge.value === ibit.reported.price,
        "and the gauge of a fund is its price");

    const teth = payloadsOf(EXPECTED_TOPICS.TETH)[0];
    ok(teth.subject.id === "TETH" && teth.subject.underlying === "ETH",
        "the renamed fund TETH stays one subject, never a pair");
}

/** A sample stays a sample: no direction, no net flow, no invented total. */
async function aSampleIsNeverSummedIntoATotal() {
    const { poll, payloadsOf } = harness();
    await poll();

    const whales = payloadsOf(EXPECTED_TOPICS.BTC).filter((reading) => reading.event === "whale_transfer");
    ok(whales.length === 1, `one unseen block was scanned, so one whale reading (${whales.length})`);

    const block = whales[0];
    ok(block.reported.sampledTransactions > 0
        && block.reported.blockTransactions > block.reported.sampledTransactions,
        "the sample and the whole block are both named");
    ok(block.reported.coverage === block.reported.sampledTransactions / block.reported.blockTransactions
        && block.reported.coverage < 1,
        "coverage is the ratio of the two, and it is far below one");
    ok(block.reported.whaleValueBtc === block.reported.whaleValueSats / 100_000_000,
        "the whale value is the sample's own sats, converted once by the collector");
    ok(block.reported.whaleValueShare > 0 && block.reported.whaleValueShare <= 1,
        "and its share is over the sample, never over the block");
    ok(block.gauge.basis === "whaleValueBtc" && block.gauge.value === block.reported.whaleValueBtc,
        "the gauge is that block's own number, read from the payload");
    ok(block.gauge.previous === null && block.gauge.previousRef === null,
        "and there is no earlier scan to compare it with — null, not zero");
    ok(block.evidence.collector.direction === false,
        "no key-free source labels a direction, and the reading repeats that instead of guessing");
    ok(block.evidence.collector.blockComplete === false, "and the block is known to be incomplete");

    const serialized = JSON.stringify(block);
    ok(!/netflow|inflow|outflow|estimate|projected/i.test(serialized),
        "no net flow and no estimate the engine invented appears in the reading");
    ok(Object.keys(block).every((key) => !/total|cumulative|sum/i.test(key)),
        "and no key of the reading would sum the blocks it has seen");
    ok([fx.BLOCK_A, fx.BLOCK_B, fx.BLOCK_C].includes(block.reported.blockHash),
        "each reading is about exactly one block, named by its hash");
}

/** Two providers of one fund: compared, listed, never averaged. */
async function twoProvidersOfOneFundAreCompared() {
    const { poll, lines } = harness();
    await poll();

    const ibit = lines.filter((line) => line.topic === EXPECTED_TOPICS.IBIT);
    ok(ibit.length === 2, `yahoo and nasdaq both answered for IBIT (${ibit.length} arrivals)`);
    ok(new Set(ibit.map((line) => line.envelope.payload.reported.provider)).size === 2,
        "and each arrival names the provider that answered");

    const first = ibit[0].envelope.payload;
    ok(first.providers.length === 1 && first.agreement === null,
        "one provider alone is not an agreement: null, not a single-provider match");

    const second = ibit[ibit.length - 1].envelope.payload;
    ok(second.providers.length === 2 && second.providers.map((entry) => entry.provider).join(",") === "nasdaq,yahoo",
        "the later reading lists both providers of the same gauge, deterministically ordered");
    ok(second.agreement !== null && second.agreement.count === 2 && second.agreement.basis === "price",
        "and compares them on the field they both carry: the share price");
    ok(second.agreement.spread === 0 && second.agreement.spreadPct === 0 && second.agreement.agree === true,
        "the fixtures quote one price, so the two agree exactly");
    ok(second.agreement.thresholdPct > 0 && second.agreement.reference === second.gauge.value,
        "with the tolerance stated and the median as the reference — never an average of the two");
    ok(second.reported.provider === second.gauge.provider && second.reported.price === second.gauge.value,
        "the reading reports the arrival that triggered it, at its own reference");
    ok(second.providers.find((entry) => entry.provider === "yahoo").value === second.gauge.value,
        "while the other provider's own number stays next to it, untouched");
    ok(second.evidence.providerAgreement === true, "and the evidence block says the providers agreed");
}

/** The next sighting is what makes a flow: same provider, same field, own window. */
async function theNextSweepShowsTheFlow() {
    const override = {};
    const { client, poll, tick, payloadsOf } = harness({ data: override });
    await poll();

    tick(GAP_MS);
    const cexUrl = client.urlsOf("defillama").find((url) => url.includes("cexs"));
    ok(typeof cexUrl === "string", "the collector tells us which endpoint answers for the holders");
    override[cexUrl] = {
        cexs: fx.cexRows().map((row) => (row.name === "Binance" ? { ...row, currentTvl: 130_000_000_000 } : row))
    };

    const sweep = await poll();
    ok(sweep.published > 0 && sweep.failed.length === 0, "the second sweep published again, nothing failed");

    const binance = payloadsOf(EXPECTED_TOPICS.BINANCE).at(-1);
    ok(binance.gauge.previous === 128_500_000_000 && binance.gauge.value === 130_000_000_000,
        "the gauge compares two sightings of the same provider and the same field");
    ok(binance.gauge.change === 1_500_000_000, "the change is that difference");
    ok(Math.abs(binance.gauge.changePct - (1_500_000_000 / 128_500_000_000) * 100) < 1e-9,
        "and the percentage follows the change");
    ok(binance.gauge.previousAt === fx.AT && binance.gauge.sinceMs === GAP_MS,
        "with the earlier sighting's own time and the window between the two");
    ok(binance.gauge.previousRef === null, "a holder's number carries no identity of its own");
    ok(binance.evidence.previousSighting === true, "and the evidence block says a previous sighting exists");
    ok(binance.reported.pollDeltaUsd === 1_500_000_000
        && binance.reported.previousReservesUsd === 128_500_000_000,
        "the collector's own poll delta travelled next to it, with its own previous value");
    ok(binance.readings === 2, "the module has seen this subject twice");

    const usdt = payloadsOf(EXPECTED_TOPICS.USDT)
        .filter((reading) => reading.event === "stablecoin_supply").at(-1);
    ok(usdt.gauge.previous === 183_700_000_000 && usdt.gauge.change === 0 && usdt.gauge.sinceMs === GAP_MS,
        "a frozen upstream copy reads as a zero change over a known window, not as a fresh move");
    ok(usdt.reported.pollDeltaPct === 0, "and the collector's own delta says the same thing");

    /* The block scans are per block: the next scan is compared with the one
     * before it, named by that block's hash — never summed into a total. */
    const blocks = payloadsOf(EXPECTED_TOPICS.BTC).filter((reading) => reading.event === "whale_transfer");
    ok(blocks.length === 2, `the next poll scanned the next unseen block (${blocks.length} scans so far)`);
    const last = blocks[1];
    ok(last.gauge.previous !== null && last.gauge.previousRef === blocks[0].reported.blockHash,
        "each scan is compared with the scan before it, named by that block's hash");
    ok(last.reported.blockHash !== last.gauge.previousRef,
        "so the two blocks are visibly two, and nothing was summed across them");
}

/** One subject, several signals: what it has, how fresh, who sends it. */
async function eachSubjectKeepsItsOwnCoverage() {
    const { poll, payloadsOf } = harness();
    await poll();

    const usdt = payloadsOf(EXPECTED_TOPICS.USDT);
    const supply = usdt.find((reading) => reading.event === "stablecoin_supply");
    ok(supply !== undefined && supply.subject.kind === "stablecoin" && supply.subject.issuer === "tether",
        "a stablecoin subject keeps what it is and who issues it");
    ok(supply.reported.circulatingUsd === 183_700_000_000 && supply.reported.dayDeltaUsd === 200_000_000,
        "the supply and the provider's own 24 h delta travel verbatim");
    ok(supply.reported.shareOfTrackedSupply > 0 && supply.reported.shareOfTrackedSupply <= 1,
        "and the collector's share is the collector's number, untouched");
    ok(supply.sources.stablecoin_supply.provider === "defillama-stablecoins"
        && supply.sources.stablecoin_supply.scope === "stablecoin-supply",
        "the coverage names the provider and the collector's own scope");
    ok(supply.sources.stablecoin_supply.staleMs === 1_350_000 && supply.sources.stablecoin_supply.stale === false,
        "with the freshness window of that signal's cadence (900 s × 1.5), and it is fresh");
    ok(supply.missing.length === ONCHAIN_EVENT_TYPES.length - 1 && supply.missing.includes("lending_rate"),
        "the five signals this subject has not answered yet are named");

    const lending = usdt.find((reading) => reading.event === "lending_rate");
    ok(lending !== undefined, "and USDT also has lending pools");
    ok(lending.seen.join(",") === "stablecoin_supply,lending_rate",
        "the later reading sees both of the subject's signals, in a fixed order");
    ok(lending.sources.lending_rate.staleMs === 21_600_000,
        "a four-hour signal is judged by its own clock, never the mempool's");
    ok(lending.sources.stablecoin_supply.provider === "defillama-stablecoins"
        && lending.sources.stablecoin_supply.basis === "circulatingUsd",
        "and the other signal's entry is still there, with its own gauge field");
    ok(lending.reported.poolCount > 0 && lending.gauge.basis === "apyWeightedByTvl",
        "the lending gauge is the TVL-weighted rate the collector ranked from its pools");

    const btc = payloadsOf(EXPECTED_TOPICS.BTC);
    const last = btc.at(-1);
    ok(last.sources.network_metrics.metrics.length > 1
        && last.sources.network_metrics.metrics.includes("mempool"),
        "an event type that answers several questions lists every metric it has shown");
    ok(last.sources.network_metrics.metric === "tx-volume-usd" && last.sources.network_metrics.basis === null,
        "the entry is the most recent answer of that type, named by its metric");
    ok(last.seen.join(",") === "network_metrics,whale_transfer" && last.missing.length === 4,
        "the chain subject has two of the six signals, and the other four are named");
    ok(last.sources.network_metrics.staleMs === 1_350_000 && last.sources.whale_transfer.staleMs === 900_000,
        "each signal is measured against the cadence of the provider that serves it, not one shared clock");
}

/** An old signal is reported stale against its own cadence, never dropped. */
function anOldSignalIsReportedStale() {
    let clock = fx.AT;
    const engine = createEngine({ now: () => clock });
    const catalog = onchain.defaultCatalog();
    const frame = (reading) => onchain.readingEnvelope(reading);

    const first = engine.ingest(frame(onchain.createReading({
        subject: catalog.get("BTC"),
        eventType: "network_metrics",
        exchange: "bitcoin",
        provider: "mempool",
        data: { metric: "mempool", mempoolTx: 43_212, scope: "mempool-state" },
        timestamp: fx.AT,
        receivedAt: fx.AT
    })));
    ok(first !== null && first.published.length === 1, "an on-chain envelope is routed and published");
    ok(first.published[0].topic === "analytics.crypto.btc.onchain_flow",
        "onto the subject's own topic");

    const queue = first.published[0].envelope.payload;
    ok(queue.gauge.basis === "mempoolTx" && queue.gauge.value === 43_212,
        "with the gauge it read from the payload, named by its metric");
    ok(queue.sources.network_metrics.stale === false
        && queue.sources.network_metrics.staleMs === 1_350_000,
        "and the queue depth is fresh against the window of its own signal");

    /* An hour later a block's transfers arrive: the queue depth is now far
     * past its own cadence, and the reading says so instead of dropping it. */
    clock = fx.AT + 3_600_000;
    const second = engine.ingest(frame(onchain.createReading({
        subject: catalog.get("BTC"),
        eventType: "whale_transfer",
        exchange: "bitcoin",
        provider: "mempool",
        data: {
            blockHash: fx.BLOCK_C,
            blockTransactions: 4_117,
            sampledTransactions: 4,
            coverage: 4 / 4_117,
            whaleCount: 2,
            whaleValueSats: 370_000_000,
            whaleValueBtc: 3.7,
            evidence: { direction: false, blockComplete: false },
            scope: "sampled-block-transactions"
        },
        timestamp: clock,
        receivedAt: clock
    })));
    const reading = second.published[0].envelope.payload;

    ok(reading.event === "whale_transfer", "the new arrival is the trigger");
    ok(reading.stale.join(",") === "network_metrics",
        "the hour-old queue depth is stale — named, not dropped");
    ok(reading.sources.network_metrics.stale === true && reading.sources.whale_transfer.stale === false,
        "while the block that just arrived is fresh");
    ok(reading.sources.network_metrics.ageMs === 3_600_000, "with the age it actually has");
    ok(reading.gauge.previous === null && reading.providers.length === 1 && reading.agreement === null,
        "one provider for this signal: nothing to compare, and no agreement is claimed");
    ok(reading.seen.join(",") === "network_metrics,whale_transfer"
        && reading.missing.length === ONCHAIN_EVENT_TYPES.length - 2,
        "two of the six signals are present, four are named as absent");
    ok(engine.modules.onchain.counters.stale === 1, "the module counted the stale publication");
    ok(engine.modules.onchain.counters.refused === 0, "and refused nothing");
    ok(engine.reset({}).onchain === 1, "the engine can forget on-chain subjects like any other module");
    ok(engine.modules.onchain.tracked().length === 0, "so nothing is left behind");
}

async function main() {
    await theWholeOnchainSweepReachesTheEngine();
    await theReadingCarriesWhatTheCollectorMeasured();
    await aSampleIsNeverSummedIntoATotal();
    await twoProvidersOfOneFundAreCompared();
    await theNextSweepShowsTheFlow();
    await eachSubjectKeepsItsOwnCoverage();
    anOldSignalIsReportedStale();

    console.log(`A8 on-chain seam: ${checks} checks passed`);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
});






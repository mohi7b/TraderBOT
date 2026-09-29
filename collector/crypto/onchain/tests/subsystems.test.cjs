/* ============================================================
 * File: collector/crypto/onchain/tests/subsystems.test.cjs
 * Section: collector/crypto/onchain/tests
 * Version: 1.0.0
 *
 * Role:
 *   The four capsules against known upstream answers (tests/fixtures.cjs).
 *   What is asserted here is mostly *absence*: a bare reading for a number
 *   that is not there, a pool that is skipped, a fund that is listed but
 *   never published, a whale scan that is a sample and says so.
 *
 * Run:
 *   node --test collector/crypto/onchain/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { defaultCatalog } = require(path.join(ROOT, "subjects", "index.cjs"));
const { createProviderRegistry } = require(path.join(ROOT, "providers", "index.cjs"));
const { createWhaleTracker, DEFAULT_WHALE_THRESHOLD_BTC } = require(path.join(ROOT, "subsystems", "whale_tracker.cjs"));
const { createStablecoinFlow } = require(path.join(ROOT, "subsystems", "stablecoin_flow.cjs"));
const { createLendingRates } = require(path.join(ROOT, "subsystems", "lending_rates.cjs"));
const { createInstitutionalFlow, NO_FLOW_REASON } = require(path.join(ROOT, "subsystems", "institutional_flow.cjs"));
const { matchKey, medianOf, weightedMeanOf } = require(path.join(ROOT, "subsystems", "aggregate.cjs"));
const reading = require(path.join(ROOT, "core", "reading.cjs"));
const fx = require("./fixtures.cjs");

const { numberOrNull, usdOf, deltaOf, shareOf, round, satsToBtc, sumOf, topEntries } = reading;
const registry = createProviderRegistry();
const catalog = defaultCatalog();
const AT = fx.AT;
const MINUTE = 60_000;

/** Fixture payload → the rows the provider parser produces from it. */
function rowsFor(providerId, endpoint, data, params = {}) {
    const parsed = registry.parse(providerId, data, { endpoint, params });
    assert.equal(parsed.ok, true, `${providerId}/${endpoint}: ${parsed.reason}`);
    return parsed.rows;
}

const taskOf = (endpoint, extra = {}) => Object.freeze({ taskId: `${endpoint}/test`, endpoint, ...extra });

test("the shared arithmetic never turns a missing number into a number", () => {
    assert.equal(numberOrNull("12.5"), 12.5);
    assert.equal(numberOrNull("N/A"), null);
    assert.equal(numberOrNull(NaN), null);
    assert.equal(numberOrNull(undefined), null);
    assert.equal(numberOrNull(""), null);

    assert.equal(usdOf("$47.57"), 47.57);
    assert.equal(usdOf("-0.50%"), -0.5);
    assert.equal(usdOf("1,234.5"), 1234.5);
    assert.equal(usdOf("N/A"), null);
    assert.equal(usdOf(null), null);

    assert.deepEqual(deltaOf(10, 5), { delta: 5, pct: 100 });
    assert.deepEqual(deltaOf(10, 0), { delta: 10, pct: null }, "a percentage of nothing is null, not Infinity");
    assert.deepEqual(deltaOf(10, null), { delta: null, pct: null });
    assert.equal(shareOf(1, 0), null, "a share of nothing is null, not NaN");
    assert.equal(shareOf(2, 4), 0.5);
    assert.equal(round(null), null);
    assert.equal(satsToBtc(100_000_000), 1);
    assert.equal(satsToBtc(null), null);
    assert.equal(sumOf([{ v: 1 }, { v: null }, { v: 2 }], (row) => row.v), 3);
    assert.equal(sumOf([{ v: null }], (row) => row.v), null, "nothing present is null, not 0");
    assert.equal(sumOf([], (row) => row.v), null);

    const top = topEntries({ a: 100, b: 50, c: null, bad: "x" }, { count: 2 });
    assert.deepEqual(top.map((entry) => entry.name), ["a", "b"]);
    assert.equal(top[0].value, 100);
    assert.ok(Math.abs(top[0].share - 100 / 150) < 1e-12);

    assert.equal(matchKey("Crypto.com"), "CRYPTOCOM");
    assert.equal(matchKey("binance"), "BINANCE");
    assert.equal(matchKey(null), "");
    assert.equal(medianOf([1, 3, 2]), 2);
    assert.equal(medianOf([1, 2, 3, 4]), 2.5);
    assert.equal(medianOf([null, 5]), 5);
    assert.equal(medianOf([null]), null);
    assert.equal(medianOf([]), null);
    assert.equal(weightedMeanOf([{ v: 1, w: 0 }], (row) => row.v, (row) => row.w), null);
    assert.equal(weightedMeanOf([{ v: 1, w: 2 }, { v: 3, w: 2 }], (row) => row.v, (row) => row.w), 2);
});

test("exchange reserves: one reading per tracked holder, and our own delta", () => {
    const whale = createWhaleTracker();
    const task = taskOf("cexs");
    const rows = rowsFor("defillama", "cexs", { cexs: fx.cexRows() });

    const readings = whale.collect({ task, rows, catalog, at: AT, receivedAt: AT + 5 });
    assert.equal(readings.length, 3, "BitMart is listed, not tracked");

    const binance = readings.find((entry) => entry.subjectId === "BINANCE");
    assert.equal(binance.eventType, "exchange_reserves");
    assert.equal(binance.exchange, "binance");
    assert.equal(binance.provider, "defillama");
    assert.equal(binance.data.reservesUsd, 128_500_000_000);
    assert.equal(binance.data.netFlow24hUsd, 210_000_000);
    assert.equal(binance.data.leverage, 0.25);
    assert.equal(binance.data.trackedHolders, 3);
    assert.equal(binance.data.listedHolders, 4, "the untracked exchange is still counted");
    assert.equal(binance.data.trackedReservesUsd, 128_500_000_000 + 42_000_000_000, "a null reserve does not become 0");
    assert.equal(binance.data.listedReservesUsd, 128_500_000_000 + 42_000_000_000 + 4_000_000);
    assert.equal(binance.data.pollDeltaUsd, null, "nothing to compare with on the first poll");
    assert.equal(binance.timestamp, AT);
    assert.equal(binance.receivedAt, AT + 5);

    const okx = readings.find((entry) => entry.subjectId === "OKX");
    assert.equal(okx.data.reservesUsd, null, "a missing reserve stays null");
    assert.equal(okx.data.cleanAssetsUsd, 18_000_000_000);

    /* The second answer is compared with the first: our own memory, not upstream's. */
    const next = fx.cexRows();
    next[0].currentTvl = 130_000_000_000;
    const second = whale.collect({ task, rows: rowsFor("defillama", "cexs", { cexs: next }), catalog, at: AT + 10 * MINUTE });
    const grown = second.find((entry) => entry.subjectId === "BINANCE");
    assert.equal(grown.data.previousReservesUsd, 128_500_000_000);
    assert.equal(grown.data.previousAt, AT);
    assert.equal(grown.data.pollDeltaUsd, 1_500_000_000);
    assert.ok(Math.abs(grown.data.pollDeltaPct - (1_500_000_000 / 128_500_000_000) * 100) < 1e-9);

    assert.equal(whale.state().holdersRemembered, 3);
    assert.deepEqual(whale.collect({ task, rows: [], catalog, at: AT }), []);
    assert.deepEqual(whale.collect({ rows, catalog, at: AT }), [], "no task, no question");
    assert.deepEqual(whale.collect({ task, catalog, at: AT }), [], "no rows, no reading");
    assert.equal(whale.reset().holders, 3);
    assert.equal(whale.state().holdersRemembered, 0);
});

test("mempool and blocks: the queue and the chain's own timing", () => {
    const whale = createWhaleTracker();
    const mempoolRows = rowsFor("mempool", "mempool", fx.mempoolPayload());
    const [queue] = whale.collect({ task: taskOf("mempool"), rows: mempoolRows, catalog, at: AT });

    assert.equal(queue.subjectId, "BTC");
    assert.equal(queue.eventType, "network_metrics");
    assert.equal(queue.exchange, "bitcoin", "the network, not a venue");
    assert.equal(queue.data.metric, "mempool");
    assert.equal(queue.data.mempoolTx, 43_212);
    assert.equal(queue.data.mempoolTotalFeeBtc, satsToBtc(46_000_000));
    assert.equal(queue.data.feeFloorSatsPerVb, 1.05);
    assert.equal(queue.data.feeCeilingSatsPerVb, 12.4);
    assert.equal(queue.data.feeSpreadSatsPerVb, round(12.4 - 1.05, 6));

    const blockRows = rowsFor("mempool", "blocks", fx.blockRows());
    const [blocks] = whale.collect({ task: taskOf("blocks"), rows: blockRows, catalog, at: AT });
    assert.equal(blocks.data.metric, "blocks");
    assert.equal(blocks.data.blockHeight, 912_302, "the tip is the highest height, not the first row");
    assert.equal(blocks.data.blocksSampled, 3);
    assert.equal(blocks.data.spanBlocks, 3);
    assert.equal(blocks.data.staleBlocks, 1);
    assert.equal(blocks.data.averageTxPerBlock, round((4_117 + 2_874 + 3_002) / 3, 2));
    assert.equal(blocks.data.rewardBtc, 3.125);
    assert.equal(blocks.data.medianFeeAcrossBlocks, 3);
    assert.equal(blocks.timestamp, (Math.round(AT / 1000) - 180) * 1000, "the block's own time");

    /* A new block becomes one on-demand scan, bounded by followUpBlocks. */
    const followUps = whale.followUps({ task: taskOf("blocks"), rows: blockRows, readings: [blocks], at: AT });
    assert.equal(followUps.length, 1);
    assert.equal(followUps[0].taskId, `mempool/block-transactions/${fx.BLOCK_C}`);
    assert.equal(followUps[0].onDemand, true);
    assert.equal(followUps[0].scheduleMs, 0);
    assert.equal(followUps[0].providerId, "mempool");
    assert.equal(followUps[0].params.blockHash, fx.BLOCK_C, "the newest block is scanned first");
    assert.equal(whale.state().pendingBlockScans, 3);
});

test("a whale scan is a sample, and it is published once", () => {
    const whale = createWhaleTracker({ followUpBlocks: 2 });
    const blockRows = rowsFor("mempool", "blocks", fx.blockRows());
    whale.collect({ task: taskOf("blocks"), rows: blockRows, catalog, at: AT });

    const followUps = whale.followUps({ task: taskOf("blocks"), rows: blockRows, readings: [], at: AT });
    assert.equal(followUps.length, 2, "followUpBlocks bounds one poll");
    const scanTask = followUps[0];
    const txRows = rowsFor("mempool", "block-transactions", fx.transactionRows(), { blockHash: fx.BLOCK_C });

    const [scan] = whale.collect({ task: scanTask, rows: txRows, catalog, at: AT });
    assert.equal(scan.eventType, "whale_transfer");
    /* The endpoint answers with a sample: both numbers are explicit. */
    assert.equal(scan.data.sampledTransactions, 4);
    assert.equal(scan.data.blockTransactions, 4_117);
    assert.ok(Math.abs(scan.data.coverage - 4 / 4_117) < 1e-12);
    assert.equal(scan.data.thresholdBtc, DEFAULT_WHALE_THRESHOLD_BTC);
    assert.equal(scan.data.whaleCount, 2, "two transfers are above one bitcoin");
    assert.equal(scan.data.largestBtc, 2.5);
    assert.equal(scan.data.whaleValueBtc, 3.7);
    assert.ok(Math.abs(scan.data.whaleValueShare - 3.7 / 4.1) < 1e-12, "the share is of the sample, never of the block");
    assert.equal(scan.data.evidence.direction, false, "no address labels, so no side is claimed");
    assert.equal(scan.data.evidence.blockComplete, false);
    assert.equal(scan.timestamp, (Math.round(AT / 1000) - 180) * 1000);

    /* A block's transfers do not change: publishing them twice would count them twice. */
    assert.deepEqual(whale.collect({ task: scanTask, rows: txRows, catalog, at: AT + MINUTE }), []);
    assert.equal(whale.state().scannedBlocks, 1);
    assert.equal(whale.state().recentScans[0].whales, 2);
    assert.deepEqual(whale.followUps({ task: taskOf("blocks"), rows: blockRows, readings: [], at: AT + MINUTE }).map((task) => task.params.blockHash), [fx.BLOCK_B, fx.BLOCK_A], "the scanned block is not asked again");

    /* The same sample under a stricter threshold: a nil value stays nil. */
    const strict = createWhaleTracker({ whaleThresholdBtc: 100 });
    strict.collect({ task: taskOf("blocks"), rows: blockRows, catalog, at: AT });
    const [quiet] = strict.collect({ task: scanTask, rows: txRows, catalog, at: AT });
    assert.equal(quiet.data.whaleCount, 0);
    assert.equal(quiet.data.whaleValueBtc, null, "nothing measured is null, not 0");
    assert.equal(quiet.data.whaleValueShare, null);
    assert.equal(quiet.data.averageWhaleBtc, null);
    assert.equal(quiet.data.largestBtc, null);
    assert.throws(() => createWhaleTracker({ whaleThresholdBtc: 0 }), /must be positive/);
});

test("the daily series becomes an issuance and a change", () => {
    const whale = createWhaleTracker();
    const supplyRows = rowsFor("blockchain-info", "supply", fx.supplySeries());
    const [supply] = whale.collect({ task: taskOf("supply"), rows: supplyRows, catalog, at: AT });

    assert.equal(supply.data.metric, "supply");
    assert.equal(supply.data.supplyBtc, 19_900_112.5);
    assert.equal(supply.data.prevSupplyBtc, 19_899_800);
    assert.equal(supply.data.supplyDeltaBtc, 312.5);
    assert.equal(supply.data.dailyIssuanceBtc, 312.5, "the issuance is the series' own delta");
    assert.equal(supply.data.issuancePerHourBtc, round(312.5 / 24, 6));
    assert.equal(supply.timestamp, AT, "the provider's own point, not our clock");

    const volumeRows = rowsFor("blockchain-info", "tx-volume-usd", fx.txVolumeSeries());
    const [volume] = whale.collect({ task: taskOf("tx-volume-usd"), rows: volumeRows, catalog, at: AT });
    assert.equal(volume.data.metric, "tx-volume-usd");
    assert.equal(volume.data.txVolumeUsd, 3_600_000_000);
    assert.equal(volume.data.txVolumeDeltaUsd, -900_000_000);
    assert.equal(volume.data.txVolumeDeltaPct, -20);

    /* A series with one point cannot produce a delta — and does not invent one. */
    const single = registry.parse("blockchain-info", fx.chartSeries([{ x: Math.round(AT / 1000), y: 42 }]), { endpoint: "supply" }).rows;
    const [lone] = whale.collect({ task: taskOf("supply"), rows: single, catalog, at: AT });
    assert.equal(lone.data.prevSupplyBtc, null);
    assert.equal(lone.data.dailyIssuanceBtc, null);
    assert.equal(lone.data.issuancePerHourBtc, null);
});

test("stablecoin supply: three tracked of four listed, and the chains behind them", () => {
    const flow = createStablecoinFlow();
    const task = taskOf("stablecoins");
    const rows = rowsFor("defillama-stablecoins", "stablecoins", { peggedAssets: fx.stablecoinRows() });

    const readings = flow.collect({ task, rows, catalog, at: AT });
    assert.equal(readings.length, 3, "USDX is listed, never published");

    const usdt = readings.find((entry) => entry.subjectId === "USDT");
    assert.equal(usdt.eventType, "stablecoin_supply");
    assert.equal(usdt.exchange, "tether", "the issuer is where the datum belongs");
    assert.equal(usdt.data.circulatingUsd, 183_700_000_000);
    assert.equal(usdt.data.dayDeltaUsd, 200_000_000);
    assert.equal(usdt.data.weekDeltaUsd, 700_000_000);
    assert.equal(usdt.data.monthDeltaUsd, 2_200_000_000);
    assert.equal(usdt.data.trackedStablecoins, 3);
    assert.equal(usdt.data.listedAssets, 4);
    assert.equal(usdt.data.chainCount, 3, "the payload lists three chains");
    assert.equal(usdt.data.chainsReported, 2, "a chain without a number is not reported");
    assert.equal(usdt.data.topChains.length, 2, "but it is not a top chain");
    assert.equal(usdt.data.largestChain, "Ethereum");
    assert.equal(usdt.data.presentChainsUsd, 160_000_000_000);
    assert.equal(usdt.data.largestChainShare, shareOf(90_000_000_000, 160_000_000_000));
    assert.equal(usdt.data.trackedSupplyUsd, 183_700_000_000 + 74_000_000_000 + 5_300_000_000);
    assert.equal(usdt.data.listedSupplyUsd, 183_700_000_000 + 74_000_000_000 + 5_300_000_000 + 12_000_000);
    assert.equal(usdt.data.shareOfTrackedSupply, shareOf(183_700_000_000, 263_000_000_000));
    assert.equal(usdt.data.pollDeltaUsd, null);

    /* A flat supply is a zero delta, not a missing one. */
    const dai = readings.find((entry) => entry.subjectId === "DAI");
    assert.equal(dai.data.dayDeltaUsd, 0);
    assert.equal(dai.data.dayDeltaPct, 0);
    assert.equal(dai.data.topChains.length, 1);

    /* The frozen upstream copy shows up as a zero poll delta, not a fresh move. */
    const second = flow.collect({ task, rows, catalog, at: AT + 15 * MINUTE });
    const again = second.find((entry) => entry.subjectId === "USDT");
    assert.equal(again.data.previousSupplyUsd, 183_700_000_000);
    assert.equal(again.data.pollDeltaUsd, 0);
    assert.equal(again.data.pollDeltaPct, 0);

    assert.equal(flow.state().remembered, 3);
    assert.deepEqual(flow.collect({ task, rows: [], catalog, at: AT }), []);
    assert.deepEqual(flow.collect({ task: taskOf("stablecoins"), rows, at: AT }), [], "no catalog, no subjects");
    assert.equal(flow.reset(), 3);
});

test("lending rates: apyBase and apy are kept apart, and the average is weighted by tvl", () => {
    const lending = createLendingRates();
    const task = taskOf("pools");
    const rows = rowsFor("defillama-yields", "pools", { data: fx.poolRows() });
    assert.equal(rows.length, 7, "the memecoin pool and the pool without an id never reach a capsule");

    const readings = lending.collect({ task, rows, catalog, at: AT });
    assert.equal(readings.length, 2, "FRAX's pool matches no subject");
    assert.deepEqual(readings.map((entry) => entry.subjectId).sort(), ["USDC", "USDT"]);

    const usdt = readings.find((entry) => entry.subjectId === "USDT");
    assert.equal(usdt.eventType, "lending_rate");
    assert.equal(usdt.exchange, "tether");
    /* Four USDT pools, one of them with no rate at all. */
    assert.equal(usdt.data.poolCount, 4);
    assert.equal(usdt.data.projectCount, 4);
    assert.equal(usdt.data.chainCount, 2);
    assert.equal(usdt.data.apyMedian, 6.1, "median of 3.8 | 6.1 | 6.9, with the null skipped");
    assert.equal(usdt.data.apyBaseMedian, 4.2);
    assert.equal(usdt.data.apyWeightedByTvl, 5.458824, "weighted by the money actually behind it");
    assert.equal(usdt.data.apyRewardMedian, 0.4, "rewards of 1.9 | 0 | 0.4, with the null skipped");
    assert.equal(usdt.data.poolsWithReward, 2);
    assert.equal(usdt.data.rewardTvlUsd, 960_000_000);
    assert.equal(usdt.data.tvlUsd, 1_385_000_000);
    assert.equal(usdt.data.bestApyPool.project, "morpho-blue");
    assert.equal(usdt.data.bestApyPool.apy, 6.9);
    assert.equal(usdt.data.bestApyPool.apyBase, 6.5);
    assert.equal(usdt.data.largestPool.project, "aave-v3");
    assert.equal(usdt.data.topProjects[0].project, "aave-v3");
    assert.equal(usdt.data.shareOfMatchedTvl, shareOf(1_385_000_000, 1_385_000_000 + 740_000_000));
    assert.equal(usdt.data.shareOfUniverseTvl, shareOf(1_385_000_000, 2_135_000_000), "FRAX's pool is part of the universe, not of the match");

    /* The state reports how much of the answer was behind the number. */
    const state = lending.state().last;
    assert.equal(state.poolsSeen, 7);
    assert.equal(state.poolsMatched, 6);
    assert.equal(state.subjectsMatched, 2);
    assert.equal(state.subjectsInCatalog, 8);
    assert.equal(state.shareOfPoolsMatched, shareOf(6, 7));

    assert.deepEqual(lending.collect({ task, rows: [], catalog, at: AT }), []);
    assert.equal(lending.reset(), true);
    assert.equal(lending.state().last, null);
});

test("fund quotes: two providers, one share price, and no invented flow", () => {
    const institutional = createInstitutionalFlow({ catalog });
    const yahooTask = Object.freeze({ taskId: "yahoo/chart/IBIT", endpoint: "chart", subjectId: "IBIT", params: { symbol: "IBIT" } });
    const nasdaqTask = Object.freeze({ taskId: "nasdaq/info/IBIT", endpoint: "info", subjectId: "IBIT", params: { symbol: "IBIT", assetClass: "etf" } });
    const yahooRows = rowsFor("yahoo", "chart", fx.yahooChart("IBIT"), { symbol: "IBIT" });
    const nasdaqRows = rowsFor("nasdaq", "info", fx.nasdaqInfo("IBIT"));

    const [first] = institutional.collect({ task: yahooTask, rows: yahooRows, catalog, at: AT + MINUTE });
    assert.equal(first.subjectId, "IBIT");
    assert.equal(first.eventType, "etf_quote");
    assert.equal(first.provider, "yahoo");
    assert.equal(first.exchange, "nasdaq", "the catalog's listing venue");
    assert.equal(first.data.price, 47.57);
    assert.equal(first.data.prevClose, 47.81);
    assert.equal(first.data.dayChangeUsd, round(47.57 - 47.81, 6));
    assert.equal(first.data.dayChangePct, round(((47.57 - 47.81) / 47.81) * 100, 6));
    assert.equal(first.data.volume, 1_240_000);
    assert.equal(first.data.instrumentType, "ETF", "the provider's word, kept as a word");
    assert.equal(first.data.venue, "NasdaqGM");
    assert.equal(first.data.scope, "fund-daily-bar");
    /* The gap this module cannot fill without a key is said out loud. */
    assert.equal(first.data.sharesOutstanding, null);
    assert.equal(first.data.netFlowUsd, null);
    assert.equal(first.data.flowReason, NO_FLOW_REASON);
    assert.equal(first.data.crossCheck, null, "one quote is not a cross-check");
    assert.equal(first.data.underlying, "BTC");
    assert.equal(first.provenance.underlying, "BTC");
    assert.equal(first.provenance.issuer, "blackrock");
    assert.equal(first.provenance.origin, "onchain");
    assert.equal(first.timestamp, fx.AT, "the bar's own time, not ours");

    const [second] = institutional.collect({ task: nasdaqTask, rows: nasdaqRows, catalog, at: AT + 2 * MINUTE });
    assert.equal(second.provider, "nasdaq");
    assert.equal(second.exchange, "nasdaq");
    assert.equal(second.data.scope, "fund-last-sale");
    assert.equal(second.data.price, 47.57, "\"$47.57\" is a price, not a string");
    assert.equal(second.data.dayChangeUsd, -0.24, "Nasdaq states the change; we keep its number");
    assert.equal(second.data.dayChangePct, -0.5, "\"-0.50%\" is a percentage");
    assert.equal(second.data.volume, null, "Nasdaq's info endpoint carries no volume");
    assert.equal(second.data.fundName, "IBIT Trust ETF");
    assert.equal(second.data.instrumentType, null, "Nasdaq does not classify the fund");
    assert.equal(second.data.crossCheck.provider, "yahoo");
    assert.equal(second.data.crossCheck.price, 47.57);
    assert.equal(second.data.crossCheck.ageMs, MINUTE);
    assert.equal(second.data.crossCheck.withinWindow, true);
    assert.equal(second.data.crossCheck.diffUsd, 0);
    assert.equal(second.data.crossCheck.diffBps, 0);

    const state = institutional.state();
    assert.equal(state.fundsRemembered, 1);
    assert.equal(state.fundsWithTwoQuotes, 1);

    /* An answer with no price is unanswered, not a fund worth zero. */
    const empty = fx.nasdaqInfo("IBIT");
    empty.data.primaryData.lastSalePrice = "N/A";
    assert.deepEqual(institutional.collect({ task: nasdaqTask, rows: rowsFor("nasdaq", "info", empty), catalog, at: AT }), []);

    /* Nor is a fund nobody tracks published under someone else's name. */
    const unknown = rowsFor("yahoo", "chart", fx.yahooChart("ZZZZ"), { symbol: "ZZZZ" });
    assert.deepEqual(institutional.collect({ task: Object.freeze({ endpoint: "chart", params: {} }), rows: unknown, catalog, at: AT }), []);
    assert.deepEqual(institutional.collect({ task: Object.freeze({ endpoint: "quote", params: {} }), rows: yahooRows, catalog, at: AT }), [], "an endpoint that is not a quote is not a quote");

    assert.equal(institutional.reset(), 1);
    assert.equal(institutional.state().fundsRemembered, 0);
    assert.throws(() => createInstitutionalFlow({}), /needs the subject catalog/);
});

test("every fund in the catalog is planned twice, and the price is the same share", () => {
    const institutional = createInstitutionalFlow({ catalog });
    const tasks = institutional.tasks();
    assert.equal(tasks.length, 30, "15 funds x 2 providers");

    for (const fund of catalog.ofKind("fund")) {
        const mine = tasks.filter((task) => task.subjectId === fund.id).map((task) => task.providerId).sort();
        assert.deepEqual(mine, ["nasdaq", "yahoo"], `${fund.id} is not quoted twice`);
        for (const task of tasks.filter((entry) => entry.subjectId === fund.id)) {
            assert.equal(task.params.symbol, fund.symbols[task.providerId], `${task.taskId} asks for the wrong spelling`);
            assert.ok(task.scheduleMs > 0, `${task.taskId} has no schedule`);
        }
    }

    /* The two providers are asked at different rates, and both answers count. */
    const chart = tasks.find((task) => task.endpoint === "chart");
    const info = tasks.find((task) => task.endpoint === "info");
    assert.ok(chart.scheduleMs < info.scheduleMs, "the light endpoint is asked more often");
    assert.deepEqual(institutional.eventTypes, ["etf_quote"]);
    assert.deepEqual(institutional.followUps({ task: chart, rows: [], readings: [], at: AT }), []);
});

/* ============================================================
 * File: collector/crypto/onchain/tests/catalog.test.cjs
 * Section: collector/crypto/onchain/tests
 * Version: 1.0.0
 *
 * Role:
 *   The data contract of the on-chain collector: what the subject catalog
 *   claims, whether it survives contact with the frame vocabulary
 *   (assetClass / marketType / sourceType), and whether every planned task
 *   can actually be asked with an empty environment.
 *
 * Run:
 *   node --test collector/crypto/onchain/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { ASSET_CLASS, MARKET_TYPES, SOURCE_TYPE, ASSET_CLASSES } = require(path.join(ROOT, "..", "common", "envelope.cjs"));
const { createSubjectCatalog, defaultCatalog, SUBJECT_GROUPS, GROUP_IDS } = require(path.join(ROOT, "subjects", "index.cjs"));
const { canonicalSubjectId, SUBJECT_KINDS, createSubject, providersOf, symbolFor, provenanceOf } = require(path.join(ROOT, "core", "subject.cjs"));
const { EVENT_TYPES } = require(path.join(ROOT, "core", "reading.cjs"));
const { ONCHAIN_SECTION, PROVIDER_IDS, PROVIDER_CONFIG, providerConfig, providerReadiness, apiKeyFor } = require(path.join(ROOT, "config", "providers.cjs"));
const { createProviderRegistry } = require(path.join(ROOT, "providers", "index.cjs"));
const { SUBSYSTEM_IDS, createSubsystems, eventTypesOf, subsystemForTask } = require(path.join(ROOT, "subsystems", "index.cjs"));

test("four groups, unique subjects, one catalog", () => {
    const catalog = defaultCatalog();

    assert.deepEqual(catalog.groups(), [...GROUP_IDS]);
    assert.deepEqual([...GROUP_IDS], ["chains", "holders", "stablecoins", "funds"]);

    const coverage = catalog.coverage();
    assert.equal(coverage.length, 4);
    assert.deepEqual(coverage.map((group) => group.subjects), [1, 12, 8, 15]);
    assert.equal(coverage.reduce((sum, group) => sum + group.subjects, 0), catalog.size());
    assert.equal(catalog.size(), 36);

    const ids = catalog.ids();
    assert.equal(new Set(ids).size, ids.length, "subject ids must be unique across the four groups");
    for (const id of ids) assert.equal(id, canonicalSubjectId(id), `${id} is not canonical`);

    for (const group of coverage) {
        assert.ok(group.providers >= 1, `${group.group} names no provider`);
        assert.ok(group.subjects > 0, `${group.group} is empty`);
    }
});

/** The subject count carried by the coverage report (0-safe read). */
function status(index, coverage) {
    void index;
    return coverage.reduce((sum, group) => sum + group.subjects, 0);
}

test("every subject speaks the frame vocabulary and nothing else", () => {
    const catalog = defaultCatalog();

    for (const subject of catalog.subjects()) {
        assert.ok(SUBJECT_KINDS.includes(subject.kind), `${subject.id} has kind ${subject.kind}`);
        assert.ok(ASSET_CLASSES.includes(subject.assetClass), `${subject.id} has assetClass ${subject.assetClass}`);
        assert.equal(subject.assetClass, ASSET_CLASS.CRYPTO);
        /* An on-chain subject is not a market: the frame word is never on it. */
        assert.ok(!("marketType" in subject), `${subject.id} carries a marketType`);
        for (const word of [subject.network, subject.issuer, subject.listing, subject.underlying]) {
            if (word === null) continue;
            assert.ok(!MARKET_TYPES.includes(word), `${subject.id}: "${word}" is a frame word, not a venue word`);
        }
        /* The group a subject belongs to is where its kind says it is. */
        assert.ok(catalog.ofGroup(subject.kind).some((entry) => entry.id === subject.id), `${subject.id} sits in the wrong group`);
    }

    for (const holder of catalog.ofGroup("holders")) {
        assert.equal(holder.kind, "holder");
        assert.equal(holder.listing, null);
        assert.equal(holder.underlying, null);
    }
    for (const stablecoin of catalog.ofGroup("stablecoins")) {
        assert.ok(stablecoin.issuer, `${stablecoin.id} has no issuer`);
        assert.equal(stablecoin.listing, null);
    }
    for (const fund of catalog.ofGroup("funds")) {
        assert.ok(fund.listing, `${fund.id} has no listing venue`);
        assert.ok(["BTC", "ETH"].includes(fund.underlying), `${fund.id} holds ${fund.underlying}`);
        assert.equal(provenanceOf(fund).underlying, fund.underlying);
    }
    assert.equal(catalog.ofGroup("chains").length, 1, "one chain is measured today: BTC");
    assert.equal(catalog.get("BTC").network, "bitcoin");
});

test("every provider spelling names a real provider", () => {
    for (const subject of defaultCatalog().subjects()) {
        const providers = providersOf(subject);
        assert.ok(providers.length >= 1, `${subject.id} names no provider`);
        for (const providerId of providers) {
            assert.ok(PROVIDER_IDS.includes(providerId), `${subject.id} names an unknown provider ${providerId}`);
            const spelling = symbolFor(subject, providerId);
            assert.equal(typeof spelling, "string");
            assert.ok(spelling.trim() !== "", `${subject.id}/${providerId} has an empty spelling`);
        }
        /* A provider that cannot speak of a subject says so with null. */
        assert.equal(symbolFor(subject, "nope"), null);
    }
});

test("the providers are key-free today and declare a cadence and a budget", () => {
    const readiness = providerReadiness({});
    assert.equal(readiness.length, PROVIDER_IDS.length);
    assert.equal(Object.keys(PROVIDER_CONFIG).length, PROVIDER_IDS.length);
    const cadence = {};
    for (const entry of readiness) {
        assert.equal(entry.ready, true, `${entry.id} is not usable without a key`);
        assert.equal(entry.keyFree, true);
        assert.equal(entry.missingEnv, null);
        assert.equal(apiKeyFor(entry.id, {}), null);
        assert.ok(Number.isFinite(entry.cadenceMs) && entry.cadenceMs > 0, `${entry.id} has no cadenceMs`);
        assert.ok(entry.measures.length >= 1, `${entry.id} measures nothing`);
        for (const eventType of entry.measures) assert.ok(EVENT_TYPES.includes(eventType), `${entry.id} claims ${eventType}`);
        cadence[entry.id] = entry.cadenceMs;
    }

    /* The declared cadence is what the orchestrator falls back on. */
    assert.equal(cadence.mempool, 60_000, "a queue changes every second");
    assert.equal(cadence.defillama, 600_000);
    assert.equal(cadence["defillama-yields"], 4 * 60 * 60_000, "11.8 MB per answer");
    assert.ok(cadence["blockchain-info"] >= 24 * 60 * 60_000, "a daily series cannot be fresher");

    for (const providerId of PROVIDER_IDS) {
        const config = providerConfig(providerId);
        assert.equal(config.id, providerId);
        assert.ok(config.baseUrl.startsWith("https://"), `${providerId} is not https`);
        assert.ok(config.maxRps > 0, `${providerId} has no rate budget`);
        assert.ok(config.timeoutMs > 0, `${providerId} has no timeout`);
        assert.equal(config.section, ONCHAIN_SECTION);
        assert.equal(config.apiKeyEnv, null, `${providerId} claims a key env`);
    }
    assert.throws(() => providerConfig("nope"), /unknown provider/);
});

test("every planned task can be asked with an empty environment", () => {
    const catalog = defaultCatalog();
    const registry = createProviderRegistry();
    const subsystems = createSubsystems({ catalog });

    let planned = 0;
    for (const subsystem of subsystems) {
        for (const task of subsystem.tasks()) {
            planned += 1;
            assert.equal(typeof task.taskId, "string");
            assert.equal(typeof task.providerId, "string");
            assert.equal(typeof task.endpoint, "string");
            assert.ok(registry.has(task.providerId), `${task.taskId}: provider ${task.providerId} is not registered`);
            assert.equal(subsystemForTask(subsystems, task.taskId).id, subsystem.id, `${task.taskId} has no single owner`);

            const request = registry.request(task.providerId, { endpoint: task.endpoint, params: task.params || {}, subject: catalog.find(task.subjectId) || null }, { env: {} });
            assert.equal(request.ok, true, `${task.taskId}: ${request.reason}`);
            assert.ok(request.url.startsWith("https://"), `${task.taskId} is not https`);
            assert.ok(!request.url.includes("undefined"), `${task.taskId} has an undefined parameter`);

            /* An answer that is not the expected shape yields nothing but
             * nulls, never a fabrication: the mempool endpoint always answers
             * one row (the queue), the list endpoints answer none. */
            const parsed = registry.parse(task.providerId, {}, { endpoint: task.endpoint, params: task.params || {} });
            assert.ok(Array.isArray(parsed.rows));
            if (task.endpoint === "mempool") {
                assert.equal(parsed.rows.length, 1);
                assert.equal(parsed.rows[0].mempoolTx, null);
                assert.equal(parsed.rows[0].feeCeilingSatsPerVb, null);
            } else {
                assert.deepEqual(parsed.rows, [], `${task.taskId} invented rows out of an empty answer`);
            }
        }
    }

    assert.equal(planned, 37, "1 cexs + 1 yields + 1 stablecoins + 5 network + 15x2 fund quotes");
    assert.equal(new Set(subsystems.flatMap((subsystem) => subsystem.tasks().map((task) => task.taskId))).size, planned);
});

test("a catalog can be built for one group, and a bad subject is refused", () => {
    const one = createSubjectCatalog({ groups: SUBJECT_GROUPS.filter((group) => group.GROUP_ID === "chains") });
    assert.deepEqual(one.groups(), ["chains"]);
    assert.equal(one.size(), 1);
    assert.equal(one.ofGroup("stablecoins").length, 0, "a group that is not in the catalog is empty, not an error");
    assert.equal(one.find("NOPE"), null);
    assert.throws(() => one.get("NOPE"), /unknown subject/);

    assert.throws(() => createSubject({ id: "X", kind: "not-a-kind" }), /unknown kind/);
    assert.throws(() => createSubject({ id: "X", kind: "holder", assetClass: "equities" }), /unknown assetClass/);
    assert.throws(() => createSubject({ id: "X", kind: "holder", symbols: { defillama: "  " } }), /non-empty string/);
    assert.throws(() => createSubject({ kind: "holder" }), /subject.id is required/);
    assert.equal(createSubject({ id: "crypto.com", kind: "holder" }).id, "CRYPTOCOM");
});

test("the six event types are the whole vocabulary of the four capsules", () => {
    assert.deepEqual([...EVENT_TYPES], ["exchange_reserves", "whale_transfer", "network_metrics", "stablecoin_supply", "lending_rate", "etf_quote"]);
    assert.equal(EVENT_TYPES.length, 6);

    const subsystems = createSubsystems({ catalog: defaultCatalog() });
    assert.deepEqual(subsystems.map((subsystem) => subsystem.id), [...SUBSYSTEM_IDS]);
    assert.deepEqual(eventTypesOf(subsystems).sort(), [...EVENT_TYPES].sort());
    for (const subsystem of subsystems) {
        assert.ok(subsystem.eventTypes.length >= 1);
        assert.equal(typeof subsystem.collect, "function");
        assert.equal(typeof subsystem.state, "function");
        assert.equal(typeof subsystem.reset, "function");
    }
    /* eventTypesOf keeps one word once, even when two capsules share a word. */
    assert.deepEqual(eventTypesOf([{ eventTypes: ["a", "b"] }, { eventTypes: ["b", "c"] }]), ["a", "b", "c"]);
    assert.equal(SOURCE_TYPE.ONCHAIN, "onchain");
    assert.equal(ASSET_CLASS.CRYPTO, "crypto");
});

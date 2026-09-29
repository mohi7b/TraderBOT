/* ============================================================
 * File: analytics-engine/modules/onchain/index.cjs
 * Section: analytics-engine/modules/onchain
 * Version: 1.0.0
 *
 * Role:
 *   Module 6 of the analytics engine: the on-chain and institutional view
 *   (collector/crypto/onchain, sub-phase 2.3).
 *
 *   The collector answers six questions about one *subject* — a chain, a
 *   holder, a stablecoin or a fund — and publishes one envelope per answer.
 *   Some answers arrive every minute (the mempool), one every four hours (a
 *   lending pool), and one exactly once (a block's transfers, scanned when
 *   the block is first seen). This module is the layer above them: it keeps
 *   the last answer of every subject and publishes ONE reading per arrival —
 *
 *     analytics.<assetClass>.<subject>.onchain_flow
 *
 *   which answers, for that subject:
 *     coverage   which of the six signals exist, how fresh each is, who sent it
 *     gauge      the headline number of the arrival that triggered this
 *                reading, and how it moved since the sighting before it — the
 *                engine's own memory, with the window it covers and the
 *                identity of what it was measured against (`previousRef`: the
 *                block hash of the earlier scan, the metric of the earlier
 *                reading — so a per-block number is never read as a series of
 *                one unchanging quantity)
 *     agreement  two providers of one gauge (yahoo and nasdaq on one fund) are
 *                compared, never averaged into a third number
 *     reported   what the collector measured, carried verbatim next to it
 *
 *   Honesty rules (the ones the collector and the other five modules follow):
 *     - nothing is summed across subjects and nothing across sightings: a
 *       total needs one timestamp, and the only honest totals (a holder's
 *       reserves, a stablecoin's circulating supply) are the ones the
 *       collector already put in `reported`
 *     - a sample stays a sample: a whale reading travels with the collector's
 *       own flags (`direction: false`, `sampledTransactions`, `coverage`); the
 *       engine adds no direction, no net flow and no estimate
 *     - a missing number is null: no gauge, no previous sighting or no second
 *       provider means null — never 0 and never a guess
 *     - the subject segment of the topic is the subject the reading is about.
 *       For a chain or a stablecoin that is the asset (BTC, USDT); for a
 *       holder or a fund it is the institution (BINANCE, IBIT) — a fund's
 *       underlying coin travels in the reading, never in the topic
 *     - `stale` is measured against the collector's own documented cadence
 *       (×1.5: one missed round), so a 60-second mempool signal and a
 *       four-hour lending rate are never judged by one clock
 *     - whatever the frame's provenance says (subjectKind, underlying, issuer,
 *       listing, network, provider) is kept as it arrived; the engine invents
 *       none of it and requires none of it
 * ============================================================ */

const math = require("../../core/math.cjs");

/** The six on-chain event types (collector/crypto/onchain/core/reading.cjs). */
const ONCHAIN_EVENT_TYPES = Object.freeze([
    "exchange_reserves",
    "network_metrics",
    "whale_transfer",
    "stablecoin_supply",
    "lending_rate",
    "etf_quote"
]);

/**
 * The gauge of an event type: the one number that says how much, and the
 * field of the collector's own reading data it is read from. A gauge is
 * always *read*, never computed — comparing it across sightings and across
 * providers is the only thing this module does with it.
 */
const GAUGE_FIELDS = Object.freeze({
    exchange_reserves: (data) => ["reservesUsd", data.reservesUsd],
    stablecoin_supply: (data) => ["circulatingUsd", data.circulatingUsd],
    lending_rate: (data) => (data.apyWeightedByTvl === undefined || data.apyWeightedByTvl === null
        ? ["apyMedian", data.apyMedian]
        : ["apyWeightedByTvl", data.apyWeightedByTvl]),
    etf_quote: (data) => ["price", data.price],
    whale_transfer: (data) => ["whaleValueBtc", data.whaleValueBtc],
    /* One event type, three different questions — so the gauge follows the
     * metric: a block height is never compared with a queue depth. */
    network_metrics: (data) => (data.metric === "blocks"
        ? ["blockHeight", data.blockHeight]
        : data.metric === "supply"
            ? ["supplyBtc", data.supplyBtc]
            : ["mempoolTx", data.mempoolTx])
});

/**
 * How long a signal stays meaningful: the cadence of the slowest provider
 * that serves it (collector README § 2), ×1.5 so one missed round is not
 * yet staleness.
 */
const COLLECTOR_CADENCE_MS = Object.freeze({
    exchange_reserves: 600_000,        /* defillama /cexs              */
    network_metrics: 900_000,          /* blockchain-info daily series */
    whale_transfer: 600_000,           /* one block is scanned once    */
    stablecoin_supply: 900_000,        /* defillama /stablecoins       */
    lending_rate: 14_400_000,          /* defillama /pools (4 h)       */
    etf_quote: 900_000                 /* nasdaq /info (yahoo: 5 min)  */
});

/** One missed round is not yet staleness. */
const STALE_FACTOR = 1.5;

const DEFAULT_STALE_MS = Object.freeze(Object.fromEntries(
    Object.entries(COLLECTOR_CADENCE_MS).map(([eventType, cadenceMs]) => [eventType, cadenceMs * STALE_FACTOR])
));

/** One subject's state is small; the cap only stops a runaway producer. */
const DEFAULT_MAX_SUBJECTS = 256;

/** Above this relative distance two providers of one gauge disagree (percent). */
const DEFAULT_AGREEMENT_PCT = 1;

/** The provider name used when a frame's provenance named none. */
const UNKNOWN_PROVIDER = "unknown";

/** One subject: the reading of every event type last seen, plus the memory
 *  the gauge needs (the sighting before it, per provider and per field). */
function createSubjectState(id) {
    return {
        id,
        kind: null,
        underlying: null,
        issuer: null,
        listing: null,
        network: null,
        assetClass: null,
        /* eventType → the last reading of it */
        events: new Map(),
        /* `${eventType}|${provider}` → the last gauge that provider sent */
        providers: new Map(),
        /* `${eventType}|${provider}|${basis}` → the gauge before that one */
        gauges: new Map(),
        readings: 0,
        firstAt: null,
        lastAt: null,
        event: null
    };
}

/** Canonical subject id: upper case, alphanumeric (the collector's own rule). */
function normalizeSubjectId(id) {
    return String(id === null || id === undefined ? "" : id)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

/** A finite number, else null. Never NaN, never a fabricated 0. */
function numberOrNull(value) {
    return math.finite(value);
}

/** The relative distance between two numbers, in percent (null when undefined). */
function pctBetween(a, b) {
    const left = numberOrNull(a);
    const right = numberOrNull(b);
    if (left === null || right === null || right === 0) return null;
    return ((left - right) / Math.abs(right)) * 100;
}

/** A non-empty string field of a bag, else null. */
function stringOrNull(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/* ------------------------------------------------------------
 * The module
 * ---------------------------------------------------------- */

class OnchainAnalytics {
    /**
     * @param {object} [options]
     * @param {Function} [options.now]           clock (tests inject a fake)
     * @param {object} [options.staleMs]         per event type freshness window
     * @param {number} [options.maxSubjects]     cap on tracked subjects
     * @param {number} [options.agreementPct]    disagreement threshold (percent)
     */
    constructor({
        now = Date.now,
        staleMs = {},
        maxSubjects = DEFAULT_MAX_SUBJECTS,
        agreementPct = DEFAULT_AGREEMENT_PCT
    } = {}) {
        this.now = now;
        this.staleMs = { ...DEFAULT_STALE_MS, ...(staleMs || {}) };
        this.maxSubjects = Math.max(1, Number(maxSubjects) || DEFAULT_MAX_SUBJECTS);
        this.agreementPct = math.positive(agreementPct) || DEFAULT_AGREEMENT_PCT;
        this.subjects = new Map();
        this.counters = { readings: 0, refused: 0, dropped: 0, subjects: 0, stale: 0 };
    }

    /* ------------------------------------------------------------
     * Ingestion
     * ---------------------------------------------------------- */

    /**
     * One on-chain envelope's payload → the stored last-answer of its subject.
     *
     * @param {object} sample
     * @param {string} sample.eventType   one of the six event types
     * @param {string} sample.subjectId   the subject the reading is about
     * @param {object} sample.data        the reading's data bag (the frame payload)
     * @param {object} [sample.provenance] the frame's provenance (subjectKind, provider, …)
     * @param {string} [sample.assetClass]
     * @param {string} [sample.exchange]  where the datum belongs (binance, tether, nasdaq)
     * @param {number} [sample.timestamp] the provider's time of the datum
     * @param {number} [sample.receivedAt]
     * @returns {object|null} the frozen sighting, or null when unusable
     */
    ingestReading(sample = {}) {
        const eventType = stringOrNull(sample.eventType);
        const data = sample.data && typeof sample.data === "object" ? sample.data : null;
        const id = normalizeSubjectId(sample.subjectId);

        if (!eventType || !ONCHAIN_EVENT_TYPES.includes(eventType) || !data || !id) {
            this.counters.refused += 1;
            return null;
        }

        let subject = this.subjects.get(id) || null;
        if (!subject && this.subjects.size >= this.maxSubjects) {
            this.counters.dropped += 1;
            return null;
        }
        if (!subject) {
            subject = createSubjectState(id);
            this.subjects.set(id, subject);
        }

        const provenance = sample.provenance && typeof sample.provenance === "object" ? sample.provenance : {};
        const [basis, rawGauge] = GAUGE_FIELDS[eventType](data);
        const value = numberOrNull(rawGauge);
        const at = numberOrNull(sample.timestamp);
        const received = numberOrNull(sample.receivedAt) === null ? at : numberOrNull(sample.receivedAt);
        const provider = stringOrNull(provenance.provider) || UNKNOWN_PROVIDER;
        const metric = stringOrNull(data.metric);
        /* One event type can answer several questions (the network capsule
         * reports a queue depth, a block height, a supply and a daily volume
         * under `network_metrics`), so which metrics a subject has shown is
         * remembered next to the last one. */
        const known = subject.events.get(eventType) || null;
        const metrics = Object.freeze([...new Set([
            ...(known === null ? [] : known.metrics),
            ...(metric === null ? [] : [metric])
        ])]);
        /* The sighting before this one is what a flow is measured against:
         * same event, same provider, same field — never a mix of two. */
        const gaugeKey = `${eventType}|${provider}|${value === null ? "none" : basis}`;
        const before = value === null ? null : (subject.gauges.get(gaugeKey) || null);
        /* What the earlier sighting was about, when its datum carries an
         * identity (a block hash, a metric) — so a per-block number is never
         * read as a series of one unchanging thing. */
        const ref = stringOrNull(data.blockHash) || stringOrNull(data.metric);
        if (value !== null) subject.gauges.set(gaugeKey, { value, at, ref });

        const entry = Object.freeze({
            eventType,
            provider,
            exchange: stringOrNull(sample.exchange),
            assetClass: stringOrNull(sample.assetClass),
            metric,
            metrics,
            scope: stringOrNull(data.scope),
            basis: value === null ? null : basis,
            value,
            previous: before === null ? null : Object.freeze({ ...before }),
            at,
            receivedAt: received,
            data: Object.freeze({ ...data })
        });

        subject.events.set(eventType, entry);
        subject.providers.set(gaugeKey, Object.freeze({ eventType, provider, basis: entry.basis, value, at }));
        subject.readings += 1;
        if (at !== null) {
            if (subject.firstAt === null || at < subject.firstAt) subject.firstAt = at;
            if (subject.lastAt === null || at > subject.lastAt) subject.lastAt = at;
        }
        subject.event = eventType;
        subject.assetClass = entry.assetClass || subject.assetClass;
        subject.kind = subject.kind || stringOrNull(provenance.subjectKind);
        subject.network = subject.network || stringOrNull(provenance.network);
        subject.issuer = subject.issuer || stringOrNull(provenance.issuer);
        subject.listing = subject.listing || stringOrNull(data.listing) || stringOrNull(provenance.listing);
        subject.underlying = subject.underlying || stringOrNull(data.underlying) || stringOrNull(provenance.underlying);

        this.counters.readings += 1;
        this.counters.subjects = this.subjects.size;
        return entry;
    }

    /* ------------------------------------------------------------
     * Reads
     * ---------------------------------------------------------- */

    /** The stored state of one subject, or null. */
    subjectFor(subjectId) {
        return this.subjects.get(normalizeSubjectId(subjectId)) || null;
    }

    /**
     * Which of the six signals this subject has, how fresh each is and who
     * sent it — the coverage view every reading carries. The event order is
     * fixed, so two readings of one subject are comparable.
     */
    sourcesOf(subject, at) {
        const sources = {};
        const seen = [];
        const stale = [];
        const missing = [];

        for (const eventType of ONCHAIN_EVENT_TYPES) {
            const entry = subject.events.get(eventType);
            if (!entry) {
                missing.push(eventType);
                continue;
            }

            seen.push(eventType);
            const window = this.staleMs[eventType];
            const ageMs = entry.at === null ? null : Math.max(0, at - entry.at);
            const isStale = ageMs !== null && ageMs > window;
            if (isStale) stale.push(eventType);

            sources[eventType] = Object.freeze({
                provider: entry.provider,
                exchange: entry.exchange,
                metric: entry.metric,
                metrics: entry.metrics,
                scope: entry.scope,
                basis: entry.basis,
                value: entry.value,
                at: entry.at,
                ageMs,
                staleMs: window,
                stale: isStale
            });
        }

        return { sources, seen, stale, missing };
    }

    /**
     * The reading of one subject: what arrived, what moved, who else agreed,
     * and what is missing. A pure read — nothing is aggregated, nothing is
     * interpolated, and a subject never seen returns null.
     *
     * @param {string} subjectId
     * @param {object} [options]
     * @param {string} [options.event] the arrival that triggered this reading
     * @param {number} [options.at]    the moment the reading is taken
     * @returns {object|null}
     */
    flow(subjectId, { event = null, at = this.now() } = {}) {
        const subject = this.subjectFor(subjectId);
        if (!subject) return null;

        /* The arrival that triggered this publication; a caller naming an
         * event this subject never sent falls back to the last arrival. */
        const trigger = ONCHAIN_EVENT_TYPES.includes(event) && subject.events.has(event) ? event : subject.event;
        const last = subject.events.get(trigger);
        if (!last) return null;

        const coverage = this.sourcesOf(subject, at);
        /* A stale signal is counted once per reading produced (this is the
         * accessor the router publishes from), never on a later re-read. */
        if (coverage.stale.length) this.counters.stale += 1;

        /* The flow: the subject's own headline number, against the sighting
         * of the same provider and the same field before it. Null when this
         * event type carries no number, or when nothing came before. */
        const gauge = last.value === null ? null : Object.freeze({
            basis: last.basis,
            value: last.value,
            provider: last.provider,
            previous: last.previous === null ? null : last.previous.value,
            previousAt: last.previous === null ? null : last.previous.at,
            /* What the earlier sighting was about (a block hash, a metric) —
             * null when its datum carries no identity of its own. */
            previousRef: last.previous === null || last.previous.ref === undefined ? null : last.previous.ref,
            change: last.previous === null ? null : last.value - last.previous.value,
            changePct: last.previous === null ? null : pctBetween(last.value, last.previous.value),
            sinceMs: last.previous === null || last.previous.at === null || last.at === null
                ? null
                : Math.max(0, last.at - last.previous.at)
        });

        /* Every provider that spoke about this event type with the same gauge
         * field, at its own time — listed, never merged into one number. */
        const providers = [];
        for (const stamp of subject.providers.values()) {
            if (stamp.eventType !== trigger || stamp.value === null || stamp.basis !== last.basis) continue;
            providers.push(Object.freeze({
                provider: stamp.provider,
                basis: stamp.basis,
                value: stamp.value,
                at: stamp.at,
                ageMs: stamp.at === null ? null : Math.max(0, at - stamp.at)
            }));
        }
        providers.sort((left, right) => left.provider.localeCompare(right.provider));

        const values = providers.map((entry) => entry.value);
        const spread = values.length < 2 ? null : Math.max(...values) - Math.min(...values);
        const reference = spread === null ? null : math.median(values);
        const spreadPct = reference === null || reference === 0 ? null : (spread / Math.abs(reference)) * 100;
        const stamps = providers.map((entry) => entry.at).filter((value) => value !== null);
        const agreement = providers.length < 2 ? null : Object.freeze({
            basis: last.basis,
            providers: Object.freeze(providers.map((entry) => entry.provider)),
            count: providers.length,
            reference,
            spread,
            spreadPct,
            /* How far apart in time the providers answered — a window, not a claim. */
            windowMs: stamps.length < 2 ? null : Math.max(...stamps) - Math.min(...stamps),
            thresholdPct: this.agreementPct,
            /* The threshold is a label, never a correction: nothing is averaged. */
            agree: spreadPct === null ? null : spreadPct <= this.agreementPct
        });

        const evidence = Object.freeze({
            previousSighting: last.previous !== null,
            providerAgreement: agreement === null ? null : agreement.agree,
            /* What the collector itself flagged — a sampled block, an
             * unlabelled direction — travels untouched. */
            collector: Object.freeze(last.data.evidence && typeof last.data.evidence === "object" ? { ...last.data.evidence } : {})
        });

        return Object.freeze({
            subject: Object.freeze({
                id: subject.id,
                kind: subject.kind,
                underlying: subject.underlying,
                issuer: subject.issuer,
                listing: subject.listing,
                network: subject.network,
                assetClass: subject.assetClass
            }),
            event: trigger,
            at,
            readings: subject.readings,
            firstAt: subject.firstAt,
            lastAt: subject.lastAt,
            gauge,
            providers: Object.freeze(providers),
            agreement,
            sources: Object.freeze(coverage.sources),
            seen: Object.freeze(coverage.seen),
            stale: Object.freeze(coverage.stale),
            missing: Object.freeze(coverage.missing),
            /* The collector's own numbers, verbatim, next to the engine's. */
            reported: Object.freeze({
                ...last.data,
                provider: last.provider,
                exchange: last.exchange,
                scope: last.scope,
                metric: last.metric,
                at: last.at,
                ageMs: last.at === null ? null : Math.max(0, at - last.at),
                receivedAt: last.receivedAt
            }),
            evidence,
            timestamp: last.at === null ? at : last.at
        });
    }

    /** Everything this module knows about one subject, or null. */
    snapshot(subjectId, options = {}) {
        const subject = this.subjectFor(subjectId);
        if (!subject) return null;

        const at = options.at === undefined ? this.now() : options.at;
        return {
            subject: Object.freeze({
                id: subject.id,
                kind: subject.kind,
                underlying: subject.underlying,
                issuer: subject.issuer,
                listing: subject.listing,
                network: subject.network,
                assetClass: subject.assetClass
            }),
            readings: subject.readings,
            event: subject.event,
            flow: this.flow(subject.id, {
                at,
                event: options.event === undefined ? null : options.event
            })
        };
    }

    /** The subjects this module holds — listed, never summed. */
    tracked() {
        return [...this.subjects.values()].map((subject) => Object.freeze({
            id: subject.id,
            kind: subject.kind,
            event: subject.event,
            readings: subject.readings,
            firstAt: subject.firstAt,
            lastAt: subject.lastAt
        }));
    }

    /**
     * Forget one subject (or everything). The argument is called `symbol`
     * because that is the frame field the subject travelled in — the engine
     * resets every module the same way.
     */
    reset({ symbol = null } = {}) {
        const target = normalizeSubjectId(symbol);
        let removed = 0;

        for (const key of [...this.subjects.keys()]) {
            if (!target || key === target) {
                this.subjects.delete(key);
                removed += 1;
            }
        }

        this.counters.subjects = this.subjects.size;
        return removed;
    }
}

module.exports = {
    OnchainAnalytics,
    ONCHAIN_EVENT_TYPES,
    GAUGE_FIELDS,
    COLLECTOR_CADENCE_MS,
    STALE_FACTOR,
    DEFAULT_STALE_MS,
    DEFAULT_MAX_SUBJECTS,
    DEFAULT_AGREEMENT_PCT,
    normalizeSubjectId
};

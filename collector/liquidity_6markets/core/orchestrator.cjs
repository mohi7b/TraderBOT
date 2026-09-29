/* ============================================================
 * File: collector/liquidity_6markets/core/orchestrator.cjs
 * Section: collector/liquidity_6markets/core
 * Version: 1.0.0
 *
 * Role:
 *   The sweep loop that turns the six-market plan into readings.
 *
 *   One sweep = "ask every venue that is due, for every instrument it
 *   can quote". A venue is due when its own publishing cadence has
 *   elapsed (binance every few seconds, yahoo every couple of minutes,
 *   stooq/fred daily), so an end-of-day endpoint is never hammered and a
 *   live venue is never judged by the freshness of a daily series.
 *
 *   Failure is contained per venue: an unhappy venue is skipped for the
 *   rest of the sweep and then backed off exponentially, while the other
 *   five markets keep reporting. A sweep returns a report; it never
 *   rejects.
 *
 *   Venues run in parallel (bounded); instruments *inside* one venue run
 *   sequentially, because the rate budget belongs to the venue.
 * ============================================================ */

const { defaultCatalog } = require("../instruments/index.cjs");
const { createProviderRegistry } = require("../providers/index.cjs");
const { providerConfig, cadenceMap } = require("../config/providers.cjs");
const { createFeedClient, sleepWith } = require("./feed-client.cjs");
const { LiquidFlowEngine } = require("./flow-engine.cjs");
const { createLiquidityBridge, createReadingPublisher } = require("./bus-bridge.cjs");
const { normalizeQuote } = require("./quote-normalizer.cjs");

/** A sweep is never faster than this, however chatty the venues are. */
const DEFAULT_INTERVAL_MS = 15_000;
/** Lower bound of a failed venue's retry delay. */
const MIN_FAILURE_BACKOFF_MS = 30_000;
/** Upper bound — a venue that has been wrong for a while is asked rarely. */
const FAILURE_BACKOFF_CAP_MS = 15 * 60_000;

/**
 * @param {object} [options]
 * @param {object} [options.catalog]  instrument catalog (default: six markets)
 * @param {object} [options.registry] provider registry
 * @param {object} [options.client]   feed client (injectable for tests)
 * @param {object} [options.engine]   flow engine (default: one with venue cadences)
 * @param {object} [options.bus]      EventBus to publish on (optional)
 * @param {Function} [options.sink]   extra receiver of every bus entry
 * @param {string[]} [options.markets]  asset-class filter
 * @param {string[]} [options.venues]   provider-id filter
 * @param {string[]} [options.instruments] instrument-id filter
 * @param {number} [options.parallel] how many venues run at once
 * @param {Function} [options.onEvent] ({kind:"venue"|"sweep", ...}) => void
 */
function createOrchestrator({
    catalog = defaultCatalog(),
    registry = createProviderRegistry(),
    client = createFeedClient(),
    engine = null,
    bus = null,
    bridge = null,
    sink = null,
    markets = null,
    venues = null,
    instruments = null,
    intervalMs = DEFAULT_INTERVAL_MS,
    parallel = 4,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    env = process.env,
    onEvent = null
} = {}) {
    const flow = engine || new LiquidFlowEngine({ now, cadenceMs: cadenceMap(registry.ids()) });
    const publishEnvelope = bridge || createLiquidityBridge({ bus, sink });
    const publishReading = createReadingPublisher({ bridge: publishEnvelope, engine: flow, now });

    const schedule = new Map(); /* providerId → {lastAt, nextAt, failures, ...} */
    const plan = buildPlan();

    function cadenceOf(providerId) {
        const value = Number(providerConfig(providerId).cadenceMs);
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
    }

    function stateOf(providerId) {
        if (!schedule.has(providerId)) {
            schedule.set(providerId, { lastAt: 0, nextAt: 0, failures: 0, failuresTotal: 0, sweeps: 0, readings: 0 });
        }
        return schedule.get(providerId);
    }

    /** Instruments × venues → {work: Map<venue, items>, refused: [...]}. */
    function buildPlan() {
        const work = new Map();
        const refused = [];

        for (const instrument of catalog.instruments()) {
            if (markets && !markets.includes(instrument.assetClass)) continue;
            if (instruments && !instruments.includes(instrument.id)) continue;

            for (const providerId of Object.keys(instrument.symbols)) {
                if (venues && !venues.includes(providerId)) continue;
                if (!registry.has(providerId)) {
                    refused.push({ venue: providerId, instrument: instrument.id, reason: `"${providerId}" is not registered` });
                    continue;
                }
                const request = registry.request(providerId, instrument, { env });
                if (!request.ok) {
                    refused.push({ venue: providerId, instrument: instrument.id, reason: request.reason });
                    continue;
                }
                if (!work.has(providerId)) work.set(providerId, []);
                work.get(providerId).push({ instrument, request });
            }
        }

        return { work, refused };
    }

    /** Venues whose cadence has elapsed (the first sweep is due for all). */
    function dueVenues(at) {
        const due = [];
        for (const [providerId, items] of plan.work) {
            if (items.length === 0) continue;
            if (at >= stateOf(providerId).nextAt) due.push(providerId);
        }
        return due;
    }

    /**
     * One venue, its instruments in order.
     * @param {string} providerId
     * @param {number} at the sweep's timestamp
     * @param {object} [options]
     * @param {AbortSignal} [options.signal] the caller's stop signal: it ends
     *   this venue's list and cancels the request in flight
     * @returns {Promise<object>} a report — never a rejection
     */
    async function pollVenue(providerId, at, { signal = null } = {}) {
        const state = stateOf(providerId);
        const provider = registry.get(providerId);
        const report = { venue: providerId, requested: 0, readings: 0, rejected: 0, published: 0, failed: null, cancelled: false, refusals: [] };

        for (const item of plan.work.get(providerId) || []) {
            const answer = await client.get(providerId, item.request.url, { parse: item.request.parse, signal });
            report.requested += 1;

            if (answer.reason === "cancelled") {
                /* The caller stopped us. That is not the venue being wrong,
                 * so it is reported as its own thing: no failure, no backoff. */
                report.cancelled = true;
                break;
            }

            if (!answer.ok) {
                report.failed = answer.reason;
                report.refusals.push({ instrument: item.instrument.id, reason: answer.reason });
                break; /* the venue is unhappy — stop asking it during this sweep */
            }

            let parsed = null;
            try {
                parsed = provider.parse(answer.data, { providerSymbol: item.request.providerSymbol });
            } catch (err) {
                report.rejected += 1;
                report.refusals.push({ instrument: item.instrument.id, reason: `parse failed: ${err.message}` });
                continue;
            }

            const { reading, reason } = normalizeQuote(parsed, { instrument: item.instrument, venue: providerId, now: at });
            if (!reading) {
                report.rejected += 1;
                report.refusals.push({ instrument: item.instrument.id, reason });
                continue;
            }

            flow.ingest(reading);
            report.readings += 1;
            if (publishReading(reading)) report.published += 1;
        }

        state.sweeps += 1;
        state.lastAt = at;
        state.readings += report.readings;

        if (report.cancelled) {
            /* Stopped by the caller, not by the venue: nothing failed, so
             * nothing is backed off — the venue asked nothing wrong. */
            state.nextAt = at + cadenceOf(providerId);
        } else if (report.failed) {
            state.failures += 1;
            state.failuresTotal += 1;
            const base = Math.max(cadenceOf(providerId), MIN_FAILURE_BACKOFF_MS);
            state.nextAt = at + Math.min(FAILURE_BACKOFF_CAP_MS, base * 2 ** Math.min(state.failures, 4));
        } else {
            state.failures = 0;
            state.nextAt = at + cadenceOf(providerId);
        }

        if (onEvent) onEvent({ kind: "venue", ...report });
        return Object.freeze(report);
    }

    /**
     * Every due venue once, in parallel, and one honest report.
     * @param {object} [options]
     * @param {boolean} [options.force] ask every venue, not only the due ones
     * @param {AbortSignal} [options.signal] stop the sweep: no new venue is
     *   started and the ones in flight are cancelled
     */
    async function pollOnce({ force = false, signal = null } = {}) {
        const at = now();
        const due = force ? [...plan.work.keys()] : dueVenues(at);
        const reports = [];
        let cursor = 0;

        async function worker() {
            while (cursor < due.length && !(signal && signal.aborted)) {
                const providerId = due[cursor];
                cursor += 1;
                reports.push(await pollVenue(providerId, at, { signal }));
            }
        }

        const width = Math.max(1, Math.min(parallel, due.length || 1));
        await Promise.all(Array.from({ length: width }, worker));

        const sweep = Object.freeze({
            at,
            venues: reports.length,
            requested: reports.reduce((sum, report) => sum + report.requested, 0),
            readings: reports.reduce((sum, report) => sum + report.readings, 0),
            rejected: reports.reduce((sum, report) => sum + report.rejected, 0),
            published: reports.reduce((sum, report) => sum + report.published, 0),
            cancelled: reports.some((report) => report.cancelled),
            failedVenues: Object.freeze(reports.filter((report) => report.failed).map((report) => ({ venue: report.venue, reason: report.failed }))),
            refusals: Object.freeze(reports.flatMap((report) => report.refusals.map((entry) => ({ venue: report.venue, ...entry })))),
            reports: Object.freeze(reports)
        });

        if (onEvent) onEvent({ kind: "sweep", ...sweep });
        return sweep;
    }

    /**
     * Sweep until stopped.
     * @param {object} [options]
     * @param {number|null} [options.sweeps]   stop after N sweeps (null: forever)
     * @param {number} [options.interval]      pause between sweeps (ms)
     * @param {AbortSignal} [options.signal]   stop once aborted: the pause is
     *   cut short and the sweep in flight is cancelled, so a stop() does not
     *   have to wait for the longest cadence or the slowest venue
     * @param {Function} [options.onSweep]     (sweep) => void
     * @param {boolean} [options.stopWhenIdle] stop when nothing is due twice in a row
     */
    async function run({ sweeps = null, interval = intervalMs, signal = null, onSweep = null, stopWhenIdle = false } = {}) {
        const summary = { startedAt: now(), finishedAt: null, sweeps: 0, readings: 0, rejected: 0, failedVenues: 0, stopped: null };
        let done = 0;
        let idle = 0;

        while (sweeps === null || done < sweeps) {
            if (signal && signal.aborted) { summary.stopped = "aborted"; break; }

            const sweep = await pollOnce({ signal });
            done += 1;
            summary.sweeps += 1;
            summary.readings += sweep.readings;
            summary.rejected += sweep.rejected;
            summary.failedVenues += sweep.failedVenues.length;
            if (onSweep) onSweep(sweep);

            idle = sweep.venues === 0 ? idle + 1 : 0;
            if (stopWhenIdle && idle >= 2) { summary.stopped = "idle"; break; }
            if (sweeps !== null && done >= sweeps) break;

            const waited = await sleepWith(sleep, interval, signal);
            if (!waited) { summary.stopped = "aborted"; break; }
        }

        summary.finishedAt = now();
        return Object.freeze(summary);
    }

    /** Where every venue stands (due time, failures, cadence) and what is known. */
    function status() {
        const venuesOut = {};
        for (const [providerId, state] of schedule) {
            venuesOut[providerId] = Object.freeze({
                instruments: (plan.work.get(providerId) || []).length,
                cadenceMs: cadenceOf(providerId),
                sweeps: state.sweeps,
                readings: state.readings,
                failures: state.failuresTotal,
                consecutiveFailures: state.failures,
                dueInMs: Math.max(0, state.nextAt - now())
            });
        }

        return Object.freeze({
            markets: catalog.coverage(),
            instruments: catalog.size(),
            planned: [...plan.work.values()].reduce((sum, items) => sum + items.length, 0),
            refused: Object.freeze([...plan.refused]),
            venues: Object.freeze(venuesOut),
            engine: flow.stats(),
            client: client.stats()
        });
    }

    function snapshot(instrumentId) {
        return flow.snapshot(instrumentId, { at: now() });
    }

    /** Cross-venue view of every instrument that has been seen at least once. */
    function snapshots() {
        const out = {};
        for (const instrument of catalog.instruments()) {
            const view = flow.snapshot(instrument.id, { at: now() });
            if (view) out[instrument.id] = view;
        }
        return Object.freeze(out);
    }

    return {
        pollOnce,
        pollVenue,
        run,
        status,
        snapshot,
        snapshots,
        plan: () => ({ work: plan.work, refused: [...plan.refused] }),
        engine: flow,
        catalog,
        publishEnvelope
    };
}

module.exports = {
    DEFAULT_INTERVAL_MS,
    MIN_FAILURE_BACKOFF_MS,
    FAILURE_BACKOFF_CAP_MS,
    createOrchestrator
};

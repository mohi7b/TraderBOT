/* ============================================================
 * File: collector/aanode/bootstrap.cjs
 * Section: collector/aanode
 *
 * Role:
 *   Collector bootstrap (worker-based).
 *
 *   Realtime is started through the standalone section API
 *   (collector/crypto/realtime/index.cjs) instead of the legacy fan-out shim
 *   (collector/crypto/realtime/aanode/bootstrap.cjs):
 *
 *       await realtime.request(symbol, { markets, exchanges })
 *
 *   Why:
 *     - streams are created on demand, for the requested symbol(s) only
 *     - markets/exchanges come from collector.cjs (sources.realtime.*),
 *       so the collection plan and the started streams cannot drift
 *     - the call resolves with a per-symbol report, so a caller can
 *       await readiness instead of guessing a delay
 *
 *   The section entry point is required lazily: collector/crypto/realtime pulls
 *   in every L2 module and nothing should load until a symbol is asked
 *   for.
 *
 *   The six-market liquidity collector (collector/liquidity_6markets) is
 *   started the same way. Its plan is provider/instrument shaped rather
 *   than symbol shaped, so it is not folded into the per-symbol plan: it
 *   is asked for its own report (markets, planned requests, which venues
 *   have a key) and leaves its sweep loop running behind `stop()`.
 *   It is started once per process, however many symbols are booted —
 *   six markets per symbol would be the same reading six times.
 *
 *   On-chain and institutional data (collector/crypto/onchain) is the third
 *   source started here. Its tasks are about *subjects* — a chain, a holder,
 *   a stablecoin, a fund — and their cadences run from a minute (the
 *   mempool) to a day (a fund), so its readiness is the first thing the
 *   loop reports, never a timer guess. It too is started once per process
 *   and its `firstPoll` promise carries the complete first poll whenever it
 *   finishes.
 * ============================================================ */

const log = require("../../orchestrator/utils/log-manager.cjs");
const CONFIG = require("./config/collector.cjs");

/** markets/exchanges to request, taken from the collector realtime source. */
function realtimeRequestOptions(override = {}) {
    const source = CONFIG.sources.realtime || {};
    const options = {};

    if (Array.isArray(source.types) && source.types.length) options.markets = source.types;
    if (Array.isArray(source.exchanges) && source.exchanges.length) options.exchanges = source.exchanges;

    return { ...options, ...override };
}

async function startRealtime(symbols, options) {
    const realtime = require("../crypto/realtime/index.cjs");

    return Promise.all(symbols.map(async (symbol) => {
        try {
            const response = await realtime.request(symbol, options);
            const running = response.streams.filter((stream) => stream.status === "running").length;

            log.info(`Collector Realtime → ${symbol}: ${running}/${response.streams.length} stream(s) running (${response.venues.join(", ") || "no venue"})`);

            return { symbol, ok: true, streams: response.streams.length, running, venues: response.venues };
        } catch (err) {
            log.error(`Collector Realtime → ${symbol} failed: ${err.message}`);
            return { symbol, ok: false, error: err.message };
        }
    }));
}

/* ------------------------------------------------------------
 * Six-market liquidity (collector/liquidity_6markets)
 *
 * The one source that is started here but not planned per symbol: the
 * section owns its catalog, its venue cadences and its own plan, so this
 * bootstrap asks it what it will do and starts its sweep loop.
 *
 * Order matters: realtime is started first, and the bus resolved below is
 * the one realtime just started — asked for through the section's own
 * resolver, so the bootstrap and its server.cjs cannot drift apart.
 * ---------------------------------------------------------- */

/**
 * How long the loop may take to produce its first answer before the report
 * says, honestly, that nothing has happened yet.
 */
const LIQUIDITY_READY_TIMEOUT_MS = 30_000;

/**
 * The six markets are one axis, not one per symbol, so they are started
 * once per process: this holds the *promise* rather than the report, so
 * two boots that overlap cannot start two sweep loops.
 */
let liquidityRun = null;

/** A pause that never keeps an otherwise finished process alive. */
function delay(ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        if (typeof timer.unref === "function") timer.unref();
    });
}

/**
 * Filters to start the six-market collector with, taken from
 * collector.cjs (a null field there means "the section's own default").
 * @param {object} [override] caller wins over config, field by field
 */
function liquidityRequestOptions(override = {}) {
    const source = CONFIG.sources.liquidity || {};
    const options = {};

    if (Array.isArray(source.markets) && source.markets.length) options.markets = source.markets;
    if (Array.isArray(source.venues) && source.venues.length) options.venues = source.venues;
    if (Array.isArray(source.instruments) && source.instruments.length) options.instruments = source.instruments;
    if (Number.isFinite(source.intervalMs)) options.intervalMs = source.intervalMs;

    return { ...options, ...override };
}

/**
 * Start the six-market collector and wait only for its first answer.
 *
 * The loop keeps running until the caller aborts `signal` or calls
 * `stop()`, because a collector that stops after one sweep is not a
 * collector. Readiness is the first real answer of the loop — a venue
 * report, or a whole sweep if one lands first — never a timer guess.
 * Six markets over public endpoints do take longer than one short window,
 * so readiness is answered by the first venue rather than by the whole
 * sweep: `firstSweep` is the promise of the complete sweep, if it comes.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] caller-owned stop signal
 * @param {Function} [options.onSweep] (sweep) => void, every sweep
 * @param {object|null} [options.bus] undefined: resolve the Realtime bus;
 *   null: deliberately no bus
 * @param {number} [options.readyTimeoutMs] how long to wait for the loop's
 *   first answer before reporting that none has arrived yet
 * @param {object} [options...] any orchestrator option (client, catalog,
 *   venues, markets, instruments, intervalMs, now, sleep) passes through;
 *   `onEvent` is reserved by the bootstrap, it is how readiness is learned
 * @returns {Promise<object>} a frozen report: ready, bus, markets,
 *   instruments, planned, refused, venues, the first answer, firstSweep
 *   (a promise of the first complete sweep, null if none completes),
 *   loop, stop()
 */
async function startLiquidity({ signal = null, onSweep = null, bus, readyTimeoutMs = LIQUIDITY_READY_TIMEOUT_MS, ...overrides } = {}) {
    const liquidity = require("../liquidity_6markets/index.cjs");
    const { resolveBus } = require("../liquidity_6markets/server.cjs");

    let resolvedBus = bus;
    if (resolvedBus === undefined) {
        const resolved = resolveBus();
        resolvedBus = resolved && !resolved.error ? resolved : null;
        if (!resolvedBus) {
            log.info(`Collector Liquidity → no bus (${(resolved && resolved.error) || "the Realtime service is not running"}) — readings stay local`);
        }
    }

    const controller = new AbortController();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    /* Readiness is the first real answer from the loop: the first venue
     * report, or a whole sweep if one lands first. Six markets over public
     * endpoints do not fit in a short window, and a working collector must
     * not be reported as "nothing happened" because of that — the loop
     * keeps working either way. */
    let answered = false;
    let announce = () => {};
    const firstAnswer = new Promise((resolve) => { announce = resolve; });
    let completeSweep = null;
    let announceSweep = () => {};
    const firstSweep = new Promise((resolve) => { announceSweep = resolve; });

    const readiness = liquidity.providerReadiness();
    const venuesReady = readiness.filter((entry) => entry.ready).map((entry) => entry.id);
    const venuesMissingKey = readiness.filter((entry) => !entry.ready).map((entry) => `${entry.id}:${entry.missingEnv}`);

    let collector = null;
    try {
        collector = liquidity.createCollector({
            ...liquidityRequestOptions(),
            ...overrides,
            bus: resolvedBus || null,
            /* The bootstrap owns onEvent: this is how readiness is learned,
             * and it is called before a sweep is complete. */
            onEvent: (event) => {
                if (event.kind === "sweep" && !completeSweep) {
                    /* the same shape as `first`, so a caller never has to
                     * know which of the two arrived to read the numbers;
                     * the raw sweep (with its per-venue reports) stays
                     * available through onSweep */
                    completeSweep = Object.freeze(answerOf(event));
                    announceSweep(completeSweep);
                }
                if (!answered) { answered = true; announce(event); }
            }
        });
    } catch (err) {
        /* A start that cannot be honoured is a report, never an exception:
         * a caller booting sources should not have to guard each one. */
        log.error(`Collector Liquidity → could not start: ${err && err.message ? err.message : err}`);
        return Object.freeze({
            ok: false,
            ready: false,
            bus: Boolean(resolvedBus),
            error: err && err.message ? err.message : String(err),
            markets: Object.freeze([]),
            instruments: 0,
            planned: 0,
            refused: 0,
            venues: Object.freeze({ ready: Object.freeze(venuesReady), missingKey: Object.freeze(venuesMissingKey) }),
            first: null,
            firstSweep: Promise.resolve(null),
            loop: Promise.resolve(null),
            stop: () => {}
        });
    }

    const status = collector.status();

    log.info(`Collector Liquidity → ${status.markets.map((market) => `${market.market}(${market.instruments})`).join(" ")} | requests per sweep: ${status.planned} | refusals: ${status.refused.length}`);
    log.info(`Collector Liquidity → venues ready: ${venuesReady.join(", ") || "none"} | missing a key: ${venuesMissingKey.join(", ") || "none"} | bus: ${resolvedBus ? "attached" : "none"}`);

    const loop = collector.run({
        signal: controller.signal,
        onSweep: (sweep) => { if (onSweep) onSweep(sweep); }
    }).then((summary) => {
        if (!completeSweep) announceSweep(null); /* ended before any sweep completed */
        announce(null); /* …and before it ever answered, or after answering */
        return summary;
    }).catch((err) => {
        if (!completeSweep) announceSweep(null);
        announce(null);
        log.error(`Collector Liquidity → sweep loop failed: ${err && err.message ? err.message : err}`);
        return null;
    });

    const answer = await Promise.race([firstAnswer, delay(readyTimeoutMs)]);

    return Object.freeze({
        ok: true,
        ready: Boolean(answer),
        bus: Boolean(resolvedBus),
        markets: status.markets,
        instruments: status.instruments,
        planned: status.planned,
        refused: status.refused.length,
        venues: Object.freeze({ ready: Object.freeze(venuesReady), missingKey: Object.freeze(venuesMissingKey) }),
        first: answer ? Object.freeze(answerOf(answer)) : null,
        /* Readiness is the first answer, so a six-market sweep is usually
         * still running when this report is written: the whole sweep is a
         * promise, never a maybe-null field to read the numbers from. */
        firstSweep,
        loop,
        stop: () => controller.abort()
    });
}

/**
 * One answer of the loop, narrowed to what a caller can act on. A venue
 * answer and a whole sweep are the same shape here, so a caller never has
 * to know which one arrived first to read the numbers.
 * @param {object} event the orchestrator's venue or sweep event
 */
function answerOf(event) {
    const failed = event.failedVenues
        ? [...event.failedVenues]
        : (event.failed ? [{ venue: event.venue, reason: event.failed }] : []);

    return {
        kind: event.kind,
        at: event.at || null,
        venue: event.venue || null,
        venues: event.venues || null,
        requested: event.requested,
        readings: event.readings,
        rejected: event.rejected,
        published: event.published,
        failed,
        refusals: (event.refusals || []).length
    };
}

/* ------------------------------------------------------------
 * On-chain and institutional (collector/crypto/onchain)
 *
 * The other source that is started here but not planned per symbol: its
 * tasks are provider endpoints about *subjects* (a chain, a holder, a
 * stablecoin, a fund), which no symbol column can describe. Like the six
 * markets it is started once per process and left running behind `stop()`,
 * and its bus is the one realtime started.
 * ---------------------------------------------------------- */

/** How long the loop may take to produce its first answer before the report
 *  says, honestly, that nothing has happened yet. */
const ONCHAIN_READY_TIMEOUT_MS = 30_000;

/** One on-chain loop per process, held as a promise so overlapping boots
 *  cannot start two pollers writing the same subjects twice. */
let onchainRun = null;

/**
 * What to start the on-chain collector with, taken from collector.cjs
 * (a null field there means "the section's own default").
 *
 * `groups` narrows the subject catalog and is turned into a catalog by the
 * caller — it is not an orchestrator option; the rest are.
 *
 * The caller speaks both vocabularies: the config file's own words
 * (`groups`, `tasks`, `providers`) and the collector's (`taskIds`,
 * `providerIds`), and wins field by field. An empty list is "no narrowing",
 * exactly like a null in the config file.
 * @param {object} [override] caller wins over config, field by field
 */
function onchainRequestOptions(override = {}) {
    const source = CONFIG.sources.onchain || {};
    const options = {};

    if (Array.isArray(source.groups) && source.groups.length) options.groups = source.groups;
    if (Array.isArray(source.tasks) && source.tasks.length) options.taskIds = source.tasks;
    if (Array.isArray(source.providers) && source.providers.length) options.providerIds = source.providers;
    if (Number.isFinite(source.intervalMs)) options.intervalMs = source.intervalMs;

    const { tasks, providers, ...rest } = override;
    const merged = { ...options, ...rest };
    if (Array.isArray(tasks) && tasks.length) merged.taskIds = tasks;
    if (Array.isArray(providers) && providers.length) merged.providerIds = providers;

    return merged;
}

/**
 * One answer of the on-chain loop, narrowed to what a caller can act on.
 * A task report, a whole poll and a stated failure are the same shape here,
 * so a caller never has to know which one arrived first to read the numbers.
 * @param {object} event the orchestrator's task/poll/failure event
 */
function onchainAnswerOf(event) {
    return {
        kind: event.kind,
        at: event.at || null,
        taskId: event.taskId || null,
        providerId: event.providerId || null,
        endpoint: event.endpoint || null,
        tasks: event.tasks === undefined ? null : event.tasks,
        rows: event.rows === undefined ? null : event.rows,
        readings: event.readings === undefined ? null : event.readings,
        published: event.published === undefined ? null : event.published,
        failed: event.failed === undefined ? (event.reason || null) : event.failed,
        followUps: event.followUps === undefined ? null : event.followUps
    };
}

/**
 * Start the on-chain collector and wait only for its first answer.
 *
 * The loop keeps running until the caller aborts `signal` or calls `stop()`.
 * Readiness is the first thing the loop produced — a task's report, a whole
 * poll, or a failure it stated — never a timer guess: on-chain providers
 * answer on cadences from one minute (the mempool) to one day (a fund), so a
 * poll is usually still running when this report is written. `firstPoll` is
 * the promise of the complete first poll, if one comes.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] caller-owned stop signal
 * @param {Function} [options.onPoll] (poll) => void, every poll
 * @param {object|null} [options.bus] undefined: resolve the Realtime bus;
 *   null: deliberately no bus
 * @param {number} [options.readyTimeoutMs] how long to wait for the loop's
 *   first answer before reporting that none has arrived yet
 * @param {object} [options...] any orchestrator option (client, catalog,
 *   env, taskIds, providerIds, intervalMs, now, sleep) passes through;
 *   `onEvent` is reserved by the bootstrap, it is how readiness is learned
 * @returns {Promise<object>} a frozen report: ok, ready, bus, subjects,
 *   eventTypes, planned, refused, providers, the first answer, firstPoll
 *   (a promise of the first complete poll, null if none completes),
 *   loop, stop()
 */
async function startOnchain({ signal = null, onPoll = null, bus, readyTimeoutMs = ONCHAIN_READY_TIMEOUT_MS, ...overrides } = {}) {
    const onchain = require("../crypto/onchain/index.cjs");
    const { resolveBus, catalogFor } = require("../crypto/onchain/server.cjs");

    /* Config first, caller second: the caller wins field by field, and
     * `groups` never reaches the collector (it is a catalog filter). */
    const { groups, ...filters } = onchainRequestOptions(overrides);

    let resolvedBus = bus;
    if (resolvedBus === undefined) {
        const resolved = resolveBus();
        resolvedBus = resolved && !resolved.error ? resolved : null;
        if (!resolvedBus) {
            log.info(`Collector Onchain → no bus (${(resolved && resolved.error) || "the Realtime service is not running"}) — readings stay local`);
        }
    }

    const controller = new AbortController();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    let answered = false;
    let announce = () => {};
    const firstAnswer = new Promise((resolve) => { announce = resolve; });
    let completePoll = null;
    let announcePoll = () => {};
    const firstPoll = new Promise((resolve) => { announcePoll = resolve; });

    const readiness = onchain.providerReadiness();
    const providersReady = readiness.filter((entry) => entry.ready).map((entry) => entry.id);
    const providersMissingKey = readiness.filter((entry) => !entry.ready).map((entry) => `${entry.id}:${entry.missingEnv}`);

    let collector = null;
    try {
        collector = onchain.createCollector({
            ...filters,
            ...(groups ? { catalog: catalogFor(groups) } : {}),
            bus: resolvedBus || null,
            /* The bootstrap owns onEvent: this is how readiness is learned,
             * and it is called before a poll is complete. */
            onEvent: (event) => {
                if (event.kind === "poll" && !completePoll) {
                    completePoll = Object.freeze(onchainAnswerOf(event));
                    announcePoll(completePoll);
                }
                if (!answered) { answered = true; announce(event); }
            }
        });
    } catch (err) {
        /* A start that cannot be honoured is a report, never an exception:
         * a caller booting sources should not have to guard each one. */
        log.error(`Collector Onchain → could not start: ${err && err.message ? err.message : err}`);
        announce(null);
        announcePoll(null);
        return Object.freeze({
            ok: false,
            ready: false,
            bus: false,
            error: err && err.message ? err.message : String(err),
            subjects: 0,
            eventTypes: Object.freeze([]),
            planned: 0,
            refused: 0,
            providers: Object.freeze({ ready: Object.freeze([]), missingKey: Object.freeze([]) }),
            first: null,
            firstPoll: Promise.resolve(null),
            loop: Promise.resolve(null),
            stop: () => {}
        });
    }

    const status = collector.status();
    log.info(`Collector Onchain → subjects: ${status.subjectCount} (${status.eventTypes.join(", ") || "no event type"}) | tasks: ${status.planned} | refused: ${status.refused.length}`);
    log.info(`Collector Onchain → providers ready: ${providersReady.join(", ") || "none"} | missing a key: ${providersMissingKey.join(", ") || "none"} | bus: ${resolvedBus ? "attached" : "none"}`);

    const loop = collector.run({
        signal: controller.signal,
        onPoll: (poll) => { if (onPoll) onPoll(poll); }
    }).then((summary) => {
        if (!completePoll) announcePoll(null); /* ended before any poll completed */
        announce(null); /* …and before it ever answered, or after answering */
        return summary;
    }).catch((err) => {
        if (!completePoll) announcePoll(null);
        announce(null);
        log.error(`Collector Onchain → poll loop failed: ${err && err.message ? err.message : err}`);
        return null;
    });

    const answer = await Promise.race([firstAnswer, delay(readyTimeoutMs)]);

    return Object.freeze({
        ok: true,
        ready: Boolean(answer),
        bus: Boolean(resolvedBus),
        subjects: status.subjectCount,
        eventTypes: status.eventTypes,
        planned: status.planned,
        refused: status.refused.length,
        providers: Object.freeze({ ready: Object.freeze(providersReady), missingKey: Object.freeze(providersMissingKey) }),
        first: answer ? Object.freeze(onchainAnswerOf(answer)) : null,
        /* Readiness is the first answer, so the first poll is usually still
         * running when this report is written: the whole poll is a promise,
         * never a maybe-null field to read the numbers from. */
        firstPoll,
        loop,
        stop: () => controller.abort()
    });
}

/**
 * @param {{symbol?: string, symbols?: string[], realtime?: object, liquidity?: object, onchain?: object}} [options]
 * @returns {Promise<{symbols: string[], plan: number, realtime: object[]|null, liquidity: object|null, liquidityStarted: boolean, onchain: object|null, onchainStarted: boolean}>}
 */
async function collectorBootstrap({ symbol, symbols, realtime: realtimeOptions = {}, liquidity: liquidityOptions = {}, onchain: onchainOptions = {} } = {}) {
    const targets = Array.isArray(symbols) && symbols.length ? symbols : (symbol ? [symbol] : []);
    const label = targets.join(", ") || "no symbol";

    log.info(`Collector Bootstrap → Starting Collector for ${label} ...`);

    const plan = CONFIG.buildCollectorPlan(targets);
    const result = { symbols: targets, plan: plan.length, realtime: null, liquidity: null, liquidityStarted: false, onchain: null, onchainStarted: false };

    if (CONFIG.realtime && targets.length) {
        result.realtime = await startRealtime(targets, realtimeRequestOptions(realtimeOptions));
    }

    /* After realtime on purpose: the bus this attaches to is the one
     * realtime has just started.
     *
     * Once per process, not once per symbol: this function is called for
     * every symbol, and six markets repeated per symbol would publish
     * every reading as many times as there are symbols. */
    const liquiditySource = CONFIG.sources.liquidity || {};
    if (liquiditySource.enabled) {
        const startedHere = !liquidityRun;
        if (startedHere) {
            liquidityRun = startLiquidity(liquidityOptions).then((report) => {
                if (!report.ok) liquidityRun = null; /* nothing is running: do not pretend otherwise */
                return report;
            });
        }
        result.liquidity = await liquidityRun;
        result.liquidityStarted = startedHere;
    }

    /* On-chain and institutional data, after realtime for the same reason
     * (the bus it attaches to is the one just started) and once per process
     * for the same reason again: a chain's block height is one fact, not one
     * per symbol.
     *
     * It is not awaited for a whole poll — the providers' cadences run from a
     * minute to a day — only for the loop's first answer, so this boot stays
     * as short as the other sources'. The complete first poll is kept as a
     * promise for whoever wants the full figures. */
    const onchainSource = CONFIG.sources.onchain || {};
    if (onchainSource.enabled) {
        const startedHere = !onchainRun;
        if (startedHere) {
            onchainRun = startOnchain(onchainOptions).then((report) => {
                if (!report.ok) onchainRun = null; /* nothing is running: do not pretend otherwise */
                return report;
            });
        }
        result.onchain = await onchainRun;
        result.onchainStarted = startedHere;
    }

    if (CONFIG.historical) {
        const historicalBootstrap = require("../crypto/historical/aanode/bootstrap.cjs");
        historicalBootstrap({ symbol: targets[0] });
    }

    if (CONFIG.macro) {
        const macroBootstrap = require("../macro/aanode/bootstrap.cjs");
        macroBootstrap({ symbol: targets[0] });
    }

    if (CONFIG.sentiment) {
        const sentimentBootstrap = require("../sentiment/aanode/bootstrap.cjs");
        sentimentBootstrap({ symbol: targets[0] });
    }

    const liquidityNote = result.liquidity
        ? ` | six markets: ${result.liquidity.instruments} instruments, ${result.liquidity.planned} requests/sweep, ${result.liquidity.refused} refused${result.liquidityStarted ? "" : " (already running)"}`
        : "";
    const onchainNote = result.onchain
        ? ` | on-chain: ${result.onchain.subjects} subjects, ${result.onchain.planned} tasks, ${result.onchain.refused} refused, ${result.onchain.providers.ready.length} provider(s) ready${result.onchainStarted ? "" : " (already running)"}`
        : "";
    log.info(`Collector Bootstrap → Collector for ${label} is running. Tasks: ${plan.length}${liquidityNote}${onchainNote}`);

    return result;
}

module.exports = collectorBootstrap;
module.exports.realtimeRequestOptions = realtimeRequestOptions;
module.exports.liquidityRequestOptions = liquidityRequestOptions;
module.exports.startLiquidity = startLiquidity;
module.exports.onchainRequestOptions = onchainRequestOptions;
module.exports.startOnchain = startOnchain;

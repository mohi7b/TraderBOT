/* ============================================================
 * File: collector/crypto/onchain/core/orchestrator.cjs
 * Section: collector/crypto/onchain/core
 * Version: 1.0.0
 *
 * Role:
 *   The polling loop that turns four capsules' questions into readings.
 *
 *   One poll = "ask every task whose own schedule has elapsed". The unit is
 *   the *task*, not the provider, because this module's sources disagree
 *   about time in a way the six-market collector's sources do not:
 *
 *     mempool/mempool             60 s      a queue changes every second
 *     mempool/blocks              60 s      a block arrives every ~10 min
 *     defillama/cexs             600 s      exchange reserves move slowly
 *     mempool/block-transactions  on demand one whale scan per new block
 *     blockchain-info/supply      15 min    a daily series cannot be fresher
 *     defillama-yields/pools       4 h      11.8 MB for a slowly moving rate
 *     yahoo/chart/<FUND>           5 min    a share price during a session
 *     nasdaq/info/<FUND>          15 min    the same share, slower source
 *
 *   A task never runs more often than its own schedule, however short the
 *   poll interval is; and one provider is never asked twice at once, because
 *   its rate budget (config/providers.cjs maxRps) belongs to the provider.
 *
 *   On-demand work is discovered, not guessed: after a task's rows are turned
 *   into readings, the owning capsule may return follow-up tasks (a new block
 *   becomes a whale scan). Those run in the same poll, bounded per poll, and
 *   are never due on their own — their scheduleMs is 0.
 *
 *   Failure is contained per task: a failed task is backed off exponentially
 *   (30 s → 15 min) while every other task keeps reporting, and a poll always
 *   returns a report rather than rejecting.
 * ============================================================ */

const { defaultCatalog } = require("../subjects/index.cjs");
const { createProviderRegistry } = require("../providers/index.cjs");
const { providerConfig, providerReadiness } = require("../config/providers.cjs");
const { createFeedClient, sleepWith } = require("./feed-client.cjs");
const { createOnchainBridge, createReadingPublisher } = require("./bus-bridge.cjs");
const { createSubsystems, eventTypesOf } = require("../subsystems/index.cjs");

/** A poll is never faster than this, however chatty the tasks are. */
const DEFAULT_INTERVAL_MS = 15_000;
/** Lower bound of a failed task's retry delay. */
const MIN_FAILURE_BACKOFF_MS = 30_000;
/** Upper bound — a task that has been wrong for a while is asked rarely. */
const FAILURE_BACKOFF_CAP_MS = 15 * 60_000;
/**
 * How many on-demand tasks one poll may chase (a new block is a whale scan;
 * a poll must still end, however many blocks arrived while we were away).
 */
const MAX_FOLLOW_UPS_PER_POLL = 8;
/**
 * @param {object} [options]
 * @param {object} [options.catalog]      subject catalog (default: all four groups)
 * @param {object} [options.registry]     provider registry
 * @param {object} [options.client]       feed client (injectable for tests)
 * @param {Array}  [options.subsystems]   capsules (default: all four, built on the catalog)
 * @param {object} [options.bus]          EventBus to publish on (optional)
 * @param {Function} [options.sink]       extra receiver of every bus entry
 * @param {Function} [options.onInvalid]  (errors, envelope) => void for rejected envelopes
 * @param {string[]} [options.taskIds]    task-id filter
 * @param {string[]} [options.providerIds] provider-id filter
 * @param {number} [options.intervalMs]   pause between polls
 * @param {number} [options.parallel]     how many providers run at once
 * @param {number} [options.maxFollowUps] on-demand tasks one poll may chase
 * @param {Function} [options.onEvent]    ({kind:"task"|"poll"|"failure", ...}) => void
 */
function createOrchestrator({
    catalog = defaultCatalog(),
    registry = createProviderRegistry(),
    client = createFeedClient(),
    subsystems = null,
    bus = null,
    sink = null,
    onInvalid = null,
    taskIds = null,
    providerIds = null,
    intervalMs = DEFAULT_INTERVAL_MS,
    parallel = 4,
    maxFollowUps = MAX_FOLLOW_UPS_PER_POLL,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    env = process.env,
    onEvent = null
} = {}) {
    const capsules = Array.isArray(subsystems) && subsystems.length > 0 ? subsystems : createSubsystems({ catalog });
    const publishEnvelope = createOnchainBridge({ bus, sink, onInvalid });
    const publishReading = createReadingPublisher({ bridge: publishEnvelope });

    /** taskId → the capsule that owns the task (one answer, one owner). */
    const ownerOf = new Map();
    /** taskId → schedule entry: when it runs, what it has done, what failed. */
    const schedule = new Map();
    /** Refusals of the current plan: a task that cannot be asked is a value. */
    const refused = [];

    /** How long a provider's answer stays meaningful (config, not a wish). */
    function cadenceOf(providerId) {
        const value = Number(providerConfig(providerId).cadenceMs);
        return Number.isFinite(value) && value > 0 ? value : intervalMs;
    }

    /** The subject a task is about, when it names one (fund tasks do). */
    function subjectFor(task) {
        if (!task || typeof task.subjectId !== "string") return null;
        return catalog.find(task.subjectId);
    }

    function scheduled(taskId) {
        return schedule.get(taskId) || null;
    }

    /** Add a task to the schedule once; a known task keeps its history. */
    function register(task, capsule) {
        if (!task || typeof task.taskId !== "string" || task.taskId === "") return null;
        ownerOf.set(task.taskId, capsule);
        const known = scheduled(task.taskId);
        if (known) return known;

        const declared = Number(task.scheduleMs);
        const entry = {
            taskId: task.taskId,
            task,
            capsuleId: capsule.id,
            providerId: task.providerId,
            endpoint: task.endpoint,
            /* scheduleMs 0 (or absent) means on demand: only a follow-up runs it. */
            onDemand: task.onDemand === true || !(Number.isFinite(declared) && declared > 0),
            scheduleMs: Number.isFinite(declared) && declared > 0 ? declared : cadenceOf(task.providerId),
            lastAt: 0,
            nextAt: 0,
            runs: 0,
            rows: 0,
            readings: 0,
            published: 0,
            failures: 0,
            consecutiveFailures: 0,
            lastReason: null
        };
        schedule.set(task.taskId, entry);
        return entry;
    }

    /** The plan: every schedulable task of every capsule, plus what was refused. */
    function buildPlan() {
        refused.length = 0;
        for (const capsule of capsules) {
            for (const task of capsule.tasks()) {
                if (taskIds && !taskIds.includes(task.taskId)) continue;
                if (providerIds && !providerIds.includes(task.providerId)) continue;
                if (!registry.has(task.providerId)) {
                    refused.push(Object.freeze({ taskId: task.taskId, reason: `provider "${task.providerId}" is not registered` }));
                    continue;
                }
                const request = registry.request(task.providerId, { endpoint: task.endpoint, params: task.params || {}, subject: subjectFor(task) }, { env });
                if (!request.ok) {
                    refused.push(Object.freeze({ taskId: task.taskId, reason: request.reason }));
                    continue;
                }
                register(task, capsule);
            }
        }
        return [...schedule.values()];
    }

    /** Schedulable tasks whose own schedule has elapsed (the first poll: all). */
    function dueEntries(at) {
        const due = [];
        for (const entry of schedule.values()) {
            if (entry.onDemand) continue;
            if (at >= entry.nextAt) due.push(entry);
        }
        return due;
    }

    /** Exponential backoff after a failure: 30 s, 60 s, … capped at 15 min. */
    function backoffFor(consecutiveFailures) {
        const step = MIN_FAILURE_BACKOFF_MS * 2 ** Math.max(0, consecutiveFailures - 1);
        return Math.min(FAILURE_BACKOFF_CAP_MS, step);
    }

    /** A failed task is a report, not an exception, and it is asked later. */
    function noteFailure(entry, at, reason) {
        entry.failures += 1;
        entry.consecutiveFailures += 1;
        entry.lastAt = at;
        entry.lastReason = reason;
        entry.nextAt = at + backoffFor(entry.consecutiveFailures);
        if (onEvent) onEvent({ kind: "failure", taskId: entry.taskId, providerId: entry.providerId, endpoint: entry.endpoint, reason });
        return Object.freeze({
            taskId: entry.taskId,
            providerId: entry.providerId,
            endpoint: entry.endpoint,
            rows: 0,
            readings: 0,
            published: 0,
            failed: reason,
            followUps: Object.freeze([])
        });
    }

    /** One task: request → answer → rows → readings → envelopes. Never throws. */
    async function pollTask(entry, { at = now(), signal = null } = {}) {
        const task = entry.task;
        const subject = subjectFor(task);
        const request = registry.request(entry.providerId, { endpoint: entry.endpoint, params: task.params || {}, subject }, { env });
        if (!request.ok) return noteFailure(entry, at, request.reason);

        const answer = await client.get(entry.providerId, request.url, { parse: request.parse, signal });
        if (!answer.ok) return noteFailure(entry, at, answer.reason);
        const receivedAt = now();

        const parsed = registry.parse(entry.providerId, answer.data, { endpoint: entry.endpoint, params: task.params || {}, subject });
        if (!parsed.ok) return noteFailure(entry, at, parsed.reason);

        const capsule = ownerOf.get(entry.taskId);
        const readings = capsule.collect({ task, rows: parsed.rows, catalog, at, receivedAt });
        let published = 0;
        for (const reading of readings) {
            if (publishReading(reading)) published += 1;
        }

        entry.lastAt = at;
        entry.lastReason = null;
        entry.runs += 1;
        entry.rows += parsed.rows.length;
        entry.readings += readings.length;
        entry.published += published;
        entry.consecutiveFailures = 0;
        /* An on-demand task is due only when a follow-up asks for it again. */
        entry.nextAt = entry.onDemand ? Infinity : at + entry.scheduleMs;

        /* What this answer made possible: a new block is a whale scan. */
        const discovered = typeof capsule.followUps === "function" ? capsule.followUps({ task, rows: parsed.rows, readings, at }) : [];
        const followUps = [];
        for (const next of discovered) {
            const registered = register(next, capsule);
            if (registered && !followUps.includes(registered)) followUps.push(registered);
        }

        if (onEvent) {
            onEvent({
                kind: "task",
                taskId: entry.taskId,
                providerId: entry.providerId,
                endpoint: entry.endpoint,
                rows: parsed.rows.length,
                readings: readings.length,
                published,
                followUps: followUps.length
            });
        }

        return Object.freeze({
            taskId: entry.taskId,
            providerId: entry.providerId,
            endpoint: entry.endpoint,
            rows: parsed.rows.length,
            readings: readings.length,
            published,
            failed: null,
            followUps: Object.freeze(followUps)
        });
    }

    /**
     * One poll: every due task, then the on-demand work their answers revealed.
     * @returns {Promise<object>} a report — never a rejection
     */
    async function pollOnce({ signal = null } = {}) {
        const startedAt = now();
        buildPlan();
        const due = dueEntries(startedAt);

        const reports = [];
        const queue = [];
        let followUpsRun = 0;

        /* Providers in bounded parallel, tasks of one provider in order: the
         * rate budget in config/providers.cjs belongs to the provider. */
        const byProvider = new Map();
        for (const entry of due) {
            if (!byProvider.has(entry.providerId)) byProvider.set(entry.providerId, []);
            byProvider.get(entry.providerId).push(entry);
        }
        const groups = [...byProvider.values()];
        let cursor = 0;

        async function drainFollowUps() {
            while (queue.length > 0 && followUpsRun < maxFollowUps) {
                if (signal && signal.aborted) return;
                const entry = queue.shift();
                followUpsRun += 1;
                const report = await pollTask(entry, { at: now(), signal });
                reports.push(report);
                queue.push(...(report.followUps || []));
            }
        }

        async function worker() {
            while (cursor < groups.length) {
                if (signal && signal.aborted) return;
                const group = groups[cursor];
                cursor += 1;
                for (const entry of group) {
                    if (signal && signal.aborted) return;
                    const report = await pollTask(entry, { at: now(), signal });
                    reports.push(report);
                    queue.push(...(report.followUps || []));
                    await drainFollowUps();
                }
            }
            await drainFollowUps();
        }

        const width = Math.max(1, Math.min(parallel, groups.length || 1));
        await Promise.all(Array.from({ length: width }, worker));

        const sweep = Object.freeze({
            at: startedAt,
            due: due.length,
            tasks: reports.length,
            rows: reports.reduce((sum, report) => sum + report.rows, 0),
            readings: reports.reduce((sum, report) => sum + report.readings, 0),
            published: reports.reduce((sum, report) => sum + report.published, 0),
            followUps: followUpsRun,
            failed: Object.freeze(reports.filter((report) => report.failed)
                .map((report) => Object.freeze({ taskId: report.taskId, reason: report.failed }))),
            reports: Object.freeze(reports.map((report) => Object.freeze({
                taskId: report.taskId,
                providerId: report.providerId,
                endpoint: report.endpoint,
                rows: report.rows,
                readings: report.readings,
                published: report.published,
                failed: report.failed,
                followUps: report.followUps.length
            })))
        });

        if (onEvent) onEvent({ kind: "poll", at: sweep.at, tasks: sweep.tasks, readings: sweep.readings, published: sweep.published, failed: sweep.failed.length });
        return sweep;
    }

    /**
     * Poll until stopped.
     * @param {object} [options]
     * @param {number|null} [options.polls]    stop after N polls (null: forever)
     * @param {number|null} [options.sweeps]   alias of polls (sibling modules say "sweeps")
     * @param {number} [options.interval]      pause between polls (ms)
     * @param {AbortSignal} [options.signal]   stop once aborted: the pause
     *   between two polls is cut short and the poll in flight is cancelled
     * @param {Function} [options.onPoll]      (sweep) => void
     * @param {Function} [options.onSweep]     alias of onPoll (the sibling modules' word)
     * @param {boolean} [options.stopWhenIdle] stop when nothing was due twice in a row
     */
    async function run({ polls = null, sweeps = null, interval = intervalMs, signal = null, onPoll = null, onSweep = null, stopWhenIdle = false } = {}) {
        const target = Number.isFinite(polls) ? polls : (Number.isFinite(sweeps) ? sweeps : null);
        const notify = typeof onPoll === "function" ? onPoll : (typeof onSweep === "function" ? onSweep : null);
        const summary = { startedAt: now(), finishedAt: null, polls: 0, tasks: 0, readings: 0, published: 0, failedTasks: 0, stopped: null };
        let done = 0;
        let idle = 0;

        while (target === null || done < target) {
            if (signal && signal.aborted) { summary.stopped = "aborted"; break; }

            const sweep = await pollOnce({ signal });
            done += 1;
            summary.polls += 1;
            summary.tasks += sweep.tasks;
            summary.readings += sweep.readings;
            summary.published += sweep.published;
            summary.failedTasks += sweep.failed.length;
            if (notify) notify(sweep);

            /* Nothing due twice in a row means every schedule is longer than
             * the poll interval — the loop would only spin. */
            idle = sweep.due === 0 ? idle + 1 : 0;
            if (stopWhenIdle && idle >= 2) { summary.stopped = "idle"; break; }
            if (target !== null && done >= target) break;
            /* A stop must not have to wait out the cadence: the pause ends on
             * the caller's word, exactly like a request in flight. */
            const waited = await sleepWith(sleep, interval, signal);
            if (!waited) { summary.stopped = "aborted"; break; }
        }

        summary.finishedAt = now();
        return Object.freeze(summary);
    }

    /** Where every task stands, what the capsules remember, and what can be asked. */
    function status() {
        const tasksOut = {};
        for (const entry of schedule.values()) {
            tasksOut[entry.taskId] = Object.freeze({
                capsule: entry.capsuleId,
                providerId: entry.providerId,
                endpoint: entry.endpoint,
                onDemand: entry.onDemand,
                scheduleMs: entry.scheduleMs,
                runs: entry.runs,
                rows: entry.rows,
                readings: entry.readings,
                published: entry.published,
                failures: entry.failures,
                consecutiveFailures: entry.consecutiveFailures,
                lastReason: entry.lastReason,
                dueInMs: entry.onDemand || !Number.isFinite(entry.nextAt) ? null : Math.max(0, entry.nextAt - now())
            });
        }

        const capsulesOut = {};
        for (const capsule of capsules) capsulesOut[capsule.id] = capsule.state();

        return Object.freeze({
            subjects: catalog.coverage(),
            subjectCount: catalog.size(),
            eventTypes: Object.freeze(eventTypesOf(capsules)),
            capsules: Object.freeze(capsulesOut),
            tasks: Object.freeze(tasksOut),
            planned: schedule.size,
            scheduledTasks: [...schedule.values()].filter((entry) => !entry.onDemand).length,
            onDemandTasks: [...schedule.values()].filter((entry) => entry.onDemand).length,
            refused: Object.freeze([...refused]),
            readiness: Object.freeze(providerReadiness(env)),
            client: Object.freeze(client.stats())
        });
    }

    /** The plan as data: the tasks that will be asked, and those that cannot be. */
    function plan() {
        return Object.freeze({
            tasks: Object.freeze([...schedule.values()].map((entry) => Object.freeze({
                taskId: entry.taskId,
                capsule: entry.capsuleId,
                providerId: entry.providerId,
                endpoint: entry.endpoint,
                scheduleMs: entry.scheduleMs,
                onDemand: entry.onDemand
            }))),
            refused: Object.freeze([...refused])
        });
    }

    /** Forget the schedule (due times, failures) — the capsules keep their memory. */
    function reset() {
        const cleared = schedule.size;
        schedule.clear();
        ownerOf.clear();
        refused.length = 0;
        /* Rebuilding immediately keeps status() honest: the plan exists again,
         * with no history, rather than the collector looking like it has none. */
        buildPlan();
        return cleared;
    }

    /* The plan exists as soon as the orchestrator does: status() is honest
     * before the first poll, not only after it. */
    buildPlan();

    return {
        pollOnce,
        /** Run one already-known task now (manual checks, tests, a CLI flag). */
        pollTask: (taskId, options) => {
            const entry = scheduled(taskId);
            return entry ? pollTask(entry, options) : Promise.resolve(null);
        },
        run,
        status,
        plan,
        reset,
        capsule: (capsuleId) => capsules.find((entry) => entry.id === capsuleId) || null,
        capsules: () => [...capsules],
        catalog,
        registry,
        client,
        publishEnvelope
    };
}

module.exports = {
    DEFAULT_INTERVAL_MS,
    MIN_FAILURE_BACKOFF_MS,
    FAILURE_BACKOFF_CAP_MS,
    MAX_FOLLOW_UPS_PER_POLL,
    createOrchestrator
};

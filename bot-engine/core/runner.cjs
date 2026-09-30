/* ============================================================
 * File: bot-engine/core/runner.cjs
 * Section: bot-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   The orchestrator of the execution layer — the file that knows how the
 *   pieces of the bot engine are wired together, exactly the way
 *   analytics-engine/engine.cjs is the one file that knows how the nine
 *   analytics modules are:
 *
 *     bus tap ──► topic index ──► evaluator.observe ──► cooldown / once
 *                                                    └► signal ──► egress ──► bus
 *
 *   Nothing else subscribes, dispatches or publishes. The evaluator never
 *   knows a bus exists (it is handed one reading at a time); core/egress.cjs
 *   never knows a bot exists (it is handed one envelope).
 *
 *   Lifecycle — four states, each one a different promise:
 *     idle     added, not listening; a trigger frame is ignored
 *     running  every trigger frame is evaluated, and a passing tree fires
 *     paused   frames are still remembered, nothing is decided — a bot whose
 *              decisions wait, not one whose eyes closed, so resuming has no
 *              blind spot in its count window
 *     stopped  nothing is remembered; starting again begins from now
 *
 *   A signal is only sent when it can be routed (a decision about nothing
 *   cannot leave: see the guard in core/egress.cjs). An unroutable bot — one
 *   bound to no symbol — therefore does not act and does not consume its
 *   cooldown, instead of moving state nobody will ever hear about.
 *
 *   The runner never eats its own output: an execution entry caught on the bus
 *   is counted and dropped, and a bot only sees readings whose topic it feeds
 *   on, so a decision can never trigger a decision.
 * ============================================================ */

const { compileStrategy, bindFeeds } = require("./dsl-schema.cjs");
const { createEvaluator, topicOf } = require("./evaluator.cjs");
const { executionEnvelope, createExecutionBridge } = require("./egress.cjs");
const { EXECUTION_EVENTS, isExecutionEntry, normalizeBotId } = require("../topics.cjs");

/** What a bot is doing. */
const BOT_STATE = Object.freeze({
    IDLE: "idle",
    RUNNING: "running",
    PAUSED: "paused",
    STOPPED: "stopped"
});

/** Why nothing happened, when nothing happened. */
const REASONS = Object.freeze({
    NOT_A_DOCUMENT: "not-a-document",
    COMPILE: "compile",
    BIND: "bind",
    NO_ID: "no-id",
    DUPLICATE: "duplicate-bot",
    UNKNOWN_BOT: "unknown-bot",
    DISABLED: "disabled",
    ALREADY: "already",
    NOT_LISTENING: "not-listening",
    COOLDOWN: "cooldown",
    ONCE: "once",
    UNROUTABLE: "unroutable"
});

const MAX_EVENTS = 500;
const MAX_LOG = 50;

/**
 * A compiled plan, recognised by what only the compiler puts there.
 *
 * core/dsl-schema.cjs compiles a tree, so every node of a plan carries
 * `operator`; a document writes the operator as the node's *key* (`{ all: […] }`),
 * which the schema would refuse as a field. A raw document can therefore never
 * be mistaken for a plan by this test, and a plan can never be pushed back
 * through the compiler, which would refuse it as a document.
 */
function isPlan(document) {
    const when = document.when;
    if (!when || typeof when !== "object" || typeof when.operator !== "string") return false;
    if (!document.feeds || typeof document.feeds !== "object") return false;
    if (!document.metrics || typeof document.metrics !== "object") return false;
    if (!document.universe || !Array.isArray(document.universe.symbols)) return false;

    const firstMetric = Object.values(document.metrics)[0];
    return Boolean(firstMetric && typeof firstMetric.kind === "string");
}

/** A compiled plan, a compile result, or a document — one of the three. */
function toPlan(document) {
    if (!document || typeof document !== "object") {
        return { ok: false, errors: [{ where: "$", message: "a strategy document is an object" }] };
    }

    /* { ok, plan } — already compiled by dsl-schema.cjs. */
    if (document.ok === true && document.plan) return { ok: true, plan: document.plan };

    /* A compiled plan itself — never re-compiled. */
    if (isPlan(document)) return { ok: true, plan: document };

    return compileStrategy(document);
}

/* ------------------------------------------------------------
 * The runner
 * ---------------------------------------------------------- */

class Runner {
    /**
     * @param {object}    [options]
     * @param {object}    [options.bus]        EventBus-compatible sink ({publish})
     * @param {Function}  [options.sink]       extra receiver of published entries
     * @param {Function[]} [options.sinks]     extra receivers
     * @param {Function}  [options.onInvalid]  (errors, envelope) => void
     * @param {Function}  [options.onSignal]   (entry, { bot, evaluation, applied }) => void
     * @param {Function}  [options.now]        clock (tests inject a fake)
     */
    constructor({ bus = null, sink = null, sinks = [], onInvalid = null, now = Date.now, onSignal = null } = {}) {
        this.now = now;
        this.onSignal = typeof onSignal === "function" ? onSignal : null;

        this.bridge = createExecutionBridge({
            bus,
            sink,
            sinks,
            onInvalid: (errors, envelope) => {
                this.counters.invalid += 1;
                this.record("invalid", errors.length ? errors[0] : "an execution envelope was refused");
                if (typeof onInvalid === "function") onInvalid(errors, envelope);
            }
        });

        this.bots = new Map();      // bot id → the bot this runner holds
        this.byTopic = new Map();   // analytics topic → Set<bot id>
        this.events = [];           // what left this layer, newest last
        this.log = [];
        this.unsubscribers = [];

        this.counters = {
            entries: 0,
            foreign: 0,
            execution: 0,
            routed: 0,
            evaluations: 0,
            signals: 0,
            suppressed: 0,
            refused: 0,
            statuses: 0,
            invalid: 0
        };
    }

    /* ------------------------------------------------------------
     * Registry
     * ---------------------------------------------------------- */

    /**
     * Register a bot: a document (or a compiled plan) plus one instance of it.
     * One plan serves every symbol its universe names — each symbol is a bot of
     * its own, with its own memory, its own counters and its own id.
     *
     * The topic index is a fast pre-filter, never the truth: the evaluator still
     * checks venue, asset and symbol for itself, so a bot that shares a topic
     * with another bot of the same plan in the same runner can never decide on a
     * reading that is not its own.
     *
     * @param {object}   document          a strategy document, a compiled plan, or { ok, plan }
     * @param {object}   [instance]        { symbol, exchange } — the one symbol this bot is for
     * @param {string}   [options.id]      bot id (default: the plan's own bot id)
     * @param {boolean}  [options.running] start it right away
     * @returns {{ok:boolean, id?:string, bot?:object, reason?:string, errors?:object[], message?:string}}
     */
    add(document, instance = {}, { id = null, running = false } = {}) {
        const compiled = toPlan(document);
        if (!compiled.ok) return { ok: false, reason: REASONS.COMPILE, errors: compiled.errors || [] };

        const plan = compiled.plan;
        const botId = normalizeBotId(id === null || id === undefined ? plan.bot : id);
        if (!botId) return { ok: false, reason: REASONS.NO_ID };
        if (this.bots.has(botId)) return { ok: false, id: botId, reason: REASONS.DUPLICATE };

        let binding = null;
        try {
            binding = bindFeeds(plan, instance || {});
        } catch (err) {
            return { ok: false, id: botId, reason: REASONS.BIND, message: err.message };
        }

        const bot = {
            id: botId,
            plan,
            binding,
            evaluator: createEvaluator({ plan, binding, now: this.now }),
            state: BOT_STATE.IDLE,
            enabled: plan.enabled !== false,
            addedAt: this.now(),
            startedAt: null,
            lastSignalAt: null,
            signals: 0,
            suppressed: { [REASONS.COOLDOWN]: 0, [REASONS.ONCE]: 0 }
        };

        this.bots.set(botId, bot);
        for (const key of Object.keys(binding.feeds)) this.index(binding.feeds[key].topic, botId);
        this.record("add", `${botId} · ${binding.symbol || "(unbound)"} · ${binding.topics.length} feeds`);

        if (running) this.start(botId);

        return { ok: true, id: botId, bot };
    }

    /** The bot with this id, or null. */
    bot(id) {
        return this.bots.get(normalizeBotId(id)) || null;
    }

    /** Every bot, in the order they were added. */
    list() {
        return [...this.bots.values()];
    }

    /** Stop listening on every topic this bot fed on, and forget it. */
    remove(id) {
        const bot = this.bot(id);
        if (!bot) return { ok: false, reason: REASONS.UNKNOWN_BOT };

        this.unindex(bot);
        this.bots.delete(bot.id);
        bot.state = BOT_STATE.STOPPED;
        this.record("remove", bot.id);

        return { ok: true, id: bot.id, bot };
    }

    /** One topic → the bots that feed on it. */
    index(topic, id) {
        if (!this.byTopic.has(topic)) this.byTopic.set(topic, new Set());
        this.byTopic.get(topic).add(id);
    }

    unindex(bot) {
        for (const key of Object.keys(bot.binding.feeds)) {
            const topic = bot.binding.feeds[key].topic;
            const ids = this.byTopic.get(topic);
            if (!ids) continue;
            ids.delete(bot.id);
            if (!ids.size) this.byTopic.delete(topic);
        }
    }

    /** The bot ids that feed on an analytics topic. */
    route(topic) {
        const ids = this.byTopic.get(topic);
        return ids ? [...ids] : [];
    }

    /* ------------------------------------------------------------
     * Lifecycle
     * ---------------------------------------------------------- */

    /**
     * Move one bot to another state.
     *
     * Every change announces itself as a bot_status on the bus, exactly as a
     * signal does: a bot that changed its mind about listening says so, and
     * whoever watches the execution namespace sees the whole story. A bot bound
     * to no symbol cannot be routed, so its announcement is impossible — the
     * change is still real, and is counted instead of thrown.
     */
    transition(bot, to, reason = null) {
        const from = bot.state;
        if (from === to) return { ok: false, id: bot.id, status: to, reason: REASONS.ALREADY };
        if (to === BOT_STATE.RUNNING && !bot.enabled) {
            return { ok: false, id: bot.id, status: from, reason: REASONS.DISABLED };
        }

        /* Stopped means forgotten, and so does starting again after a stop: a
         * count window full of frames from a session that ended is not a memory
         * a bot should act on. A pause keeps it — a pause is a wait, not a
         * death. */
        if (to === BOT_STATE.STOPPED || (to === BOT_STATE.RUNNING && from === BOT_STATE.STOPPED)) this.forget(bot);

        bot.state = to;
        if (to === BOT_STATE.RUNNING) bot.startedAt = this.now();

        const entry = this.publishStatus(bot, from, to, reason);
        return { ok: true, id: bot.id, from, to, status: to, entry };
    }

    /** A fresh evaluator: no readings, no window, no state — a bot that has just started. */
    forget(bot) {
        bot.evaluator = createEvaluator({ plan: bot.plan, binding: bot.binding, now: this.now });
        bot.startedAt = null;
        bot.lastSignalAt = null;
        bot.signals = 0;
        bot.suppressed = { [REASONS.COOLDOWN]: 0, [REASONS.ONCE]: 0 };
        return bot;
    }

    /** Listen, and decide. */
    start(id, { reason = null } = {}) {
        const bot = this.bot(id);
        if (!bot) return { ok: false, id: normalizeBotId(id), reason: REASONS.UNKNOWN_BOT };
        return this.transition(bot, BOT_STATE.RUNNING, reason);
    }

    /** Keep remembering, stop deciding. */
    pause(id, { reason = null } = {}) {
        const bot = this.bot(id);
        if (!bot) return { ok: false, id: normalizeBotId(id), reason: REASONS.UNKNOWN_BOT };
        return this.transition(bot, BOT_STATE.PAUSED, reason);
    }

    /** Stop listening, and forget what was heard. */
    stop(id, { reason = null } = {}) {
        const bot = this.bot(id);
        if (!bot) return { ok: false, id: normalizeBotId(id), reason: REASONS.UNKNOWN_BOT };
        return this.transition(bot, BOT_STATE.STOPPED, reason);
    }

    startAll() {
        return this.list().map((bot) => this.start(bot.id));
    }

    pauseAll() {
        return this.list().map((bot) => this.pause(bot.id));
    }

    stopAll() {
        return this.list().map((bot) => this.stop(bot.id));
    }

    /**
     * Why a passing tree does not fire — null when it does.
     *
     * The cooldown and the once flag are promises about *signals*, so they live
     * here, where the signal is sent, and not in the evaluator, which only ever
     * answers what the market said.
     */
    gate(bot, at) {
        if (bot.plan.once === true && bot.signals > 0) return REASONS.ONCE;
        const cooldownMs = Number.isFinite(bot.plan.cooldownMs) ? bot.plan.cooldownMs : 0;
        if (cooldownMs > 0 && bot.lastSignalAt !== null && at - bot.lastSignalAt < cooldownMs) return REASONS.COOLDOWN;
        return null;
    }

    /* ------------------------------------------------------------
     * The bus
     * ---------------------------------------------------------- */

    /**
     * One bus entry → every bot that feeds on it. The whole dispatch, and the
     * only place in this layer where a bus entry is looked at.
     *
     * @returns {object[]} one result per bot that was reached, in index order
     */
    onEntry(entry) {
        if (!entry || typeof entry !== "object") return [];
        this.counters.entries += 1;

        /* A decision is not an input: this layer never eats its own output, and
         * no other layer's decides either. */
        if (isExecutionEntry(entry)) {
            this.counters.execution += 1;
            return [];
        }

        /* The topic index is the pre-filter; the evaluator is the judge. */
        const topic = topicOf(entry);
        const ids = topic === null ? null : this.byTopic.get(topic);
        if (!ids || !ids.size) {
            this.counters.foreign += 1;
            return [];
        }

        const at = Number.isFinite(entry.at) ? entry.at : this.now();
        const results = [];

        for (const id of [...ids]) {
            const bot = this.bots.get(id);
            if (!bot) continue;

            if (bot.state !== BOT_STATE.RUNNING && bot.state !== BOT_STATE.PAUSED) {
                results.push({ bot: id, feed: null, trigger: false, evaluation: null, action: { kind: "ignored", reason: REASONS.NOT_LISTENING } });
                continue;
            }

            this.counters.routed += 1;
            const observed = bot.evaluator.observe(entry, { at });

            if (!observed) {
                /* It wears the right topic but is not this bot's venue, asset or
                 * symbol — the index is a set, not a promise. */
                results.push({ bot: id, feed: null, trigger: false, evaluation: null, action: { kind: "not-for-this-bot" } });
            } else if (!observed.trigger) {
                /* Remembered, and nothing else: only the trigger feed moves the
                 * tree, so a bot waiting on the 5m close does not re-decide on
                 * every tick. */
                results.push({ bot: id, feed: observed.feed, topic: observed.topic, trigger: false, evaluation: null, action: { kind: "remembered" } });
            } else {
                results.push(this.settle(bot, observed, at));
            }
        }

        return results;
    }

    /**
     * A trigger frame that moved the tree — decide what to do about it.
     *
     * A paused bot was handed the frame by observe() already, so the pause is a
     * wait rather than a blind spot; it simply decides nothing.
     */
    settle(bot, observed, at) {
        const evaluation = observed.evaluation;
        const result = { bot: bot.id, feed: observed.feed, topic: observed.topic, trigger: true, at, evaluation, action: null };

        if (bot.state !== BOT_STATE.RUNNING) {
            result.action = { kind: "held", reason: BOT_STATE.PAUSED };
            return result;
        }

        this.counters.evaluations += 1;

        if (!evaluation.fired) {
            this.counters.refused += 1;
            result.action = { kind: "refused", reason: evaluation.refusal.reason, refusal: evaluation.refusal };
            return result;
        }

        const blocked = this.gate(bot, at);
        if (blocked) {
            bot.suppressed[blocked] += 1;
            this.counters.suppressed += 1;
            result.action = { kind: "suppressed", reason: blocked };
            return result;
        }

        /* A decision nobody can be told about is not a decision: it stays a
         * calculation, and it moves neither the state nor the cooldown. */
        if (!bot.binding.symbol) {
            result.action = { kind: "unroutable", reason: REASONS.UNROUTABLE };
            return result;
        }

        const applied = bot.evaluator.applySignal({ at, action: bot.plan.action });
        const entry = this.bridge(this.signalEnvelope(bot, evaluation, observed, applied, at));

        if (!entry) {
            /* core/egress.cjs refuses an envelope with no bot, no symbol or no
             * event — all three are true above, so this is a validator bug being
             * reported rather than a decision being lost. */
            result.action = { kind: "unroutable", reason: "egress" };
            return result;
        }

        bot.lastSignalAt = at;
        bot.signals += 1;
        this.counters.signals += 1;
        this.pushEvent(entry);
        this.record("signal", `${bot.id} · ${bot.plan.action.type}${bot.plan.action.side ? ` ${bot.plan.action.side}` : ""}`);
        if (this.onSignal) this.onSignal(entry, { bot, evaluation, applied });

        result.action = { kind: "signalled", entry, applied };
        return result;
    }

    /* ------------------------------------------------------------
     * Publishing
     * ---------------------------------------------------------- */

    /** One decision, as an execution envelope core/egress.cjs knows how to send. */
    signalEnvelope(bot, evaluation, observed, applied, at) {
        return executionEnvelope({
            bot: bot.id,
            eventType: EXECUTION_EVENTS.SIGNAL,
            name: bot.binding.name || bot.plan.name,
            symbol: bot.binding.symbol,
            exchange: bot.binding.exchange,
            timestamp: at,
            receiveTimestamp: this.now(),
            data: {
                action: bot.plan.action,
                outcome: evaluation.outcome,
                at,
                symbol: bot.binding.symbol,
                exchange: bot.binding.exchange,
                trigger: {
                    feed: observed.feed,
                    topic: observed.topic,
                    at: observed.at,
                    ageMs: evaluation.trigger ? evaluation.trigger.ageMs : null
                },
                /* Every value it was decided on with its age, the tree with what
                 * each branch decided, and the state the decision leaves behind:
                 * the evidence travels with the decision, so nobody has to
                 * reconstruct why this fired. */
                metrics: evaluation.metrics,
                conditions: evaluation.conditions,
                applied: applied.applied,
                state: applied.state,
                resets: applied.resets,
                strategy: { name: bot.plan.name, version: bot.plan.version, bot: bot.plan.bot }
            }
        });
    }

    /**
     * The lifecycle report of one change of mind.
     *
     * It is about the bot, not the market: no evaluation, no action, no numbers
     * the market gave — a signal and a status are never mixed into one entry.
     */
    publishStatus(bot, from, to, reason = null) {
        const at = this.now();
        this.record("status", `${bot.id} ${from} → ${to}${reason ? ` (${reason})` : ""}`);

        /* A status is about the bot, and an unroutable bot has no topic to be
         * announced on: the change is real, the announcement is impossible, and
         * no envelope is built to be refused. */
        if (!bot.binding.symbol) return null;

        const entry = this.bridge(executionEnvelope({
            bot: bot.id,
            eventType: EXECUTION_EVENTS.BOT_STATUS,
            name: bot.binding.name || bot.plan.name,
            symbol: bot.binding.symbol,
            exchange: bot.binding.exchange,
            timestamp: at,
            receiveTimestamp: at,
            data: {
                status: to,
                from,
                at,
                reason,
                strategy: { name: bot.plan.name, version: bot.plan.version, bot: bot.plan.bot },
                symbol: bot.binding.symbol,
                exchange: bot.binding.exchange,
                feeds: bot.binding.topics,
                triggerTopic: bot.binding.triggerTopic,
                signals: bot.signals,
                uptimeMs: bot.startedAt === null ? 0 : Math.max(0, at - bot.startedAt)
            }
        }));

        if (entry) {
            this.counters.statuses += 1;
            this.pushEvent(entry);
        }
        return entry;
    }

    /* ------------------------------------------------------------
     * Reads
     * ---------------------------------------------------------- */

    /** One thing that left this layer, and the last few, kept for inspection. */
    pushEvent(entry) {
        this.events.push({ at: this.now(), event: entry.event, topic: entry.topic, bot: entry.bot, symbol: entry.symbol, entry });
        if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
        return entry;
    }

    /** What this layer did, in the words of whoever reads the log. */
    record(kind, detail) {
        this.log.push({ at: this.now(), kind, detail });
        if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
    }

    /* ------------------------------------------------------------
     * The wire
     * ---------------------------------------------------------- */

    /**
     * Subscribe to a bus. Every entry goes through onEntry, and a listener that
     * throws is this layer's problem, never the bus's: a broken bot does not
     * stop the market from being read.
     */
    attach(bus) {
        if (!bus || typeof bus.subscribe !== "function") return () => {};

        const unsubscribe = bus.subscribe((entry) => {
            try {
                this.onEntry(entry);
            } catch (err) {
                this.record("error", `entry: ${err.message}`);
            }
        });

        this.unsubscribers.push(unsubscribe);
        return unsubscribe;
    }

    /** Let go of every bus this runner is attached to. */
    detach() {
        for (const unsubscribe of this.unsubscribers.splice(0)) {
            try {
                unsubscribe();
            } catch (err) {
                /* Already closed is closed. */
            }
        }
    }

    /* ------------------------------------------------------------
     * Everything a caller may want to know
     * ---------------------------------------------------------- */

    /** What a bot is holding now: its lifecycle plus everything the evaluator knows. */
    view(bot) {
        return {
            id: bot.id,
            status: bot.state,
            enabled: bot.enabled,
            addedAt: bot.addedAt,
            startedAt: bot.startedAt,
            lastSignalAt: bot.lastSignalAt,
            signals: bot.signals,
            suppressed: { ...bot.suppressed },
            plan: { name: bot.plan.name, version: bot.plan.version, trigger: bot.plan.trigger, cooldownMs: bot.plan.cooldownMs, once: bot.plan.once, action: bot.plan.action },
            ...bot.evaluator.snapshot()
        };
    }

    /** @returns {object|null} one bot's whole view, or every bot's. */
    snapshot(id = null) {
        if (id !== null && id !== undefined) {
            const bot = this.bot(id);
            return bot ? this.view(bot) : null;
        }

        return {
            at: this.now(),
            counters: { ...this.counters },
            bots: this.list().map((bot) => this.view(bot)),
            events: this.events.map((record) => ({ at: record.at, event: record.event, topic: record.topic, bot: record.bot, symbol: record.symbol }))
        };
    }

    /** The counters, and how the bots are spread over the four states. */
    stats() {
        const byState = { [BOT_STATE.IDLE]: 0, [BOT_STATE.RUNNING]: 0, [BOT_STATE.PAUSED]: 0, [BOT_STATE.STOPPED]: 0 };
        for (const bot of this.bots.values()) byState[bot.state] += 1;

        return {
            bots: this.bots.size,
            topics: this.byTopic.size,
            subscriptions: this.unsubscribers.length,
            byState,
            events: this.events.length,
            log: this.log.length,
            ...this.counters
        };
    }
}

/* ------------------------------------------------------------
 * The layer
 * ---------------------------------------------------------- */

/**
 * A runner over a bus.
 *
 * new Runner({ bus }) publishes to the bus but listens to nobody — the wiring
 * stays explicit. createRunner({ bus }) does both, which is what an application
 * wants and what the tests use.
 *
 * @param {object} [options] as Runner's, plus the bus to attach to
 * @returns {Runner}
 */
function createRunner(options = {}) {
    const runner = new Runner(options);
    if (options && options.bus) runner.attach(options.bus);
    return runner;
}

module.exports = {
    BOT_STATE,
    REASONS,
    Runner,
    createRunner,
    toPlan
};

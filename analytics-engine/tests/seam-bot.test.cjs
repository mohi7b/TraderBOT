/**
 * B1 — Seam: analytics readings on the bus → the bot engine → execution.signal
 * collector/crypto/realtime/core/runtime.cjs + event-bus.cjs  (what makes frames)
 * analytics-engine/engine.cjs                                (frames → readings)
 * bot-engine/core/runner.cjs                                 (readings → decisions)
 * bot-engine/core/evaluator.cjs + egress.cjs + dsl-schema.cjs
 * ============================================================
 * The two halves of the system already meet on one bus (A5…A12): the collector
 * publishes frames, the engine answers with readings on `analytics.*` topics.
 * This test walks the rest of the way — the reading the engine publishes until
 * the decision the bot engine publishes on `execution.*` — and pins down what
 * each side promises the other:
 *
 *   1. a real spot trade frame becomes a real cvd reading, and that reading
 *      becomes an execution.signal whose evidence names the analytics path the
 *      value was read from (`aggregate.cvd`), the frame it fired on and its age,
 *      the whole tree it walked, and the state the decision left behind;
 *   2. one document becomes one bot per symbol, each bound to its own topic, and
 *      a bot decides only on the readings of the symbol it was bound to;
 *   3. a cooldown and a `once` are promises about signals, not about the market:
 *      the tree still passes, and what did not go out is counted in its own word;
 *   4. paused remembers and decides nothing, stopped forgets, and starting again
 *      begins from now instead of from a session that ended;
 *   5. a bot that cannot be routed (no symbol to put in the topic) does not act,
 *      and does not consume the quiet period it never earned;
 *   6. the runner never eats its own output: every execution entry on the bus —
 *      its own or another layer's — is counted and dropped, and none is evaluated.
 *
 * Run: node analytics-engine/tests/seam-bot.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { EventBus } = require(path.join(ROOT, "collector", "crypto", "realtime", "core", "event-bus.cjs"));
const { buildRuntime, setRuntime } = require(path.join(ROOT, "collector", "crypto", "realtime", "core", "runtime.cjs"));
const { createEngine } = require(path.join(ROOT, "analytics-engine", "engine.cjs"));
const { createRunner, BOT_STATE, REASONS } = require(path.join(ROOT, "bot-engine", "core", "runner.cjs"));

const START = 1_700_000_000_000;

/**
 * analytics-engine/core/router.cjs publishes a symbol's cvd at most once a
 * second (its default throttle, which the engine documents as overridable). On
 * the fake clock the test's frame cadence is exactly one window, so every frame
 * is published; on the real clock the test has to wait the window out.
 */
const CVD_THROTTLE_MS = 1_100;

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `B1: ${msg}`);
    checks++;
};

/**
 * Sleep without an event loop — these tests are synchronous on purpose.
 *
 * The engine identifies a reading by the instant it was measured at, so two
 * frames published in the same millisecond are one reading, not two. On the
 * test's own clock the cadence below moves time; on the real bus the clock is
 * the wall clock, which needs a millisecond that is not the previous one.
 */
function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}


/* ------------------------------------------------------------
 * A bus double, shaped exactly like the real one
 *
 * collector/crypto/realtime/core/event-bus.cjs wraps every publication as
 * { channel, event, market, exchange, symbol, at, payload } and hands that to
 * its taps. The double keeps that shape and takes the clock from the test, so a
 * cooldown can be driven instead of waited for; section 1 runs on the real
 * EventBus, which is what makes this file a seam.
 * ---------------------------------------------------------- */
function busDouble(clock) {
    const state = { taps: new Set(), entries: [], latest: new Map() };

    return {
        state,
        subscribe(fn) {
            state.taps.add(fn);
            return () => state.taps.delete(fn);
        },
        publish(entry, context = {}) {
            const wrapped = {
                channel: [context.market, context.exchange, context.symbol, entry.event].join(":"),
                event: entry.event,
                market: context.market || null,
                exchange: context.exchange || null,
                symbol: context.symbol || null,
                at: clock(),
                payload: entry
            };

            state.entries.push(wrapped);
            state.latest.set(wrapped.channel, wrapped);
            for (const tap of [...state.taps]) tap(wrapped);
            return wrapped;
        }
    };
}

/** A reading travelling back on the bus (the engine's own traffic). */
function isReading(entry) {
    const envelope = entry && entry.payload ? entry.payload.envelope : null;
    return !!(envelope && envelope.meta && envelope.meta.sourceType === "analytics");
}

/* ------------------------------------------------------------
 * A collector, an engine and a runner on one bus
 *
 * `real: true` uses the real EventBus (the wire the collector, the engine and
 * the bot engine share in production); otherwise the bus double with the test's
 * clock is used, which lets the runner's cooldowns be driven by step().
 * ---------------------------------------------------------- */
function harness({ real = false } = {}) {
    let at = START;

    /* On the real bus every frame is stamped with the wall clock, so the engine
     * (which stamps its readings) and the runner must use it too — otherwise a
     * reading would arrive with the test's fake timestamp and look ancient. The
     * bus double takes the test's clock instead, which is what makes a cooldown
     * drivable by step(). */
    const clock = real ? () => Date.now() : () => at;
    const bus = real ? new EventBus() : busDouble(clock);
    const seen = [];

    /* One frame, one instant: see sleepMs above. */
    const FRAME_MS = 1_000;
    const tick = () => {
        if (real) sleepMs(2);
        else at += FRAME_MS;
    };

    setRuntime(buildRuntime({ bus, emitHealth: () => {} }));
    const engine = createEngine({ bus, now: clock });
    engine.attach(bus);

    const runner = createRunner({ bus, now: clock });
    bus.subscribe((entry) => seen.push(entry));

    const api = {
        bus,
        engine,
        runner,
        seen,

        /** Let the clock the runner decides by move — the test's clock, or the wall clock. */
        step(ms = 60_000) {
            if (real) sleepMs(ms);
            else at += ms;
            return api;
        },

        /** A spot trade frame, exactly as the collector publishes one. */
        trade({ side = "buy", qty = 2, price = 100, symbol = "BTCUSDT", exchange = "binance" } = {}) {
            tick();
            bus.publish(
                { event: "trade", market: "spot", exchange, symbol, payload: { side, qty, price } },
                { market: "spot", exchange, symbol }
            );
            return api;
        },

        /** The analytics readings that travelled the bus. */
        readings(topic = null) {
            return seen.filter((entry) => isReading(entry) && (topic === null || entry.payload.topic === topic));
        },

        /** The last reading the bus carried, for handing to a runner by hand. */
        lastReading() {
            const list = api.readings();
            return list.length ? list[list.length - 1] : null;
        },

        /** What the runner let out, newest last. */
        out(event = null) {
            return runner.events.filter((item) => event === null || item.event === event);
        },

        signals() {
            return api.out("signal");
        },

        statuses() {
            return api.out("bot_status");
        }
    };

    return api;
}

/* ------------------------------------------------------------
 * The documents
 * ---------------------------------------------------------- */

/**
 * A strategy on the merged tape: two of its last three frames bought, the
 * aggressors are buyers, and a variable that counts the signals of a day.
 */
function tapeDocument(patch = {}) {
    return Object.assign({
        version: "bot-engine/1",
        name: "cvd tape",
        bot: "cvd-tape",
        description: "the tape is buying and the aggressors agree",
        universe: { symbols: ["BTCUSDT", "ETHUSDT"], exchange: "binance" },
        trigger: "flow",
        feeds: { flow: { topic: "analytics.crypto.${asset}.cvd", maxAgeMs: 600_000, history: 10 } },
        metrics: {
            cvd: { feed: "flow", path: "aggregate.cvd", label: "merged cumulative volume delta" },
            taker: { feed: "flow", path: "aggregate.takerBuyRatio", label: "taker buy ratio" }
        },
        state: { alerts: { init: 0, onSignal: { add: 1 }, resetAfterMs: 86_400_000 } },
        when: {
            all: [
                {
                    count: {
                        feed: "flow", window: 3, atLeast: 2, when: { gt: ["$cvd", 0] },
                        label: "two of the last three frames bought"
                    }
                },
                { gt: ["$taker", 0.5], label: "the aggressors are buyers" },
                { lt: ["$state.alerts", 5], label: "at most five alerts a day" }
            ]
        },
        action: { type: "enter", side: "long", size: "risk_pct", sizeValue: 1, note: "an intent, not an order" },
        cooldownMs: 0
    }, patch);
}

/** The same conditions, pinned to one asset: no universe, and no symbol to route on. */
function pinnedDocument(patch = {}) {
    return tapeDocument(Object.assign({
        name: "pinned tape",
        bot: "pinned-tape",
        universe: undefined,
        feeds: { flow: { topic: "analytics.crypto.btc.cvd", maxAgeMs: 600_000, history: 10 } }
    }, patch));
}

/** Two feeds at two cadences: one of them can only be remembered, never fires alone. */
function twoFeedDocument() {
    const document = tapeDocument({ name: "two feeds", bot: "two-feeds" });

    document.feeds.book = { topic: "analytics.crypto.${asset}.orderbook_imbalance", maxAgeMs: 600_000, history: 5 };
    document.metrics.book = { feed: "book", path: "weightedImbalance", label: "weighted book imbalance" };
    document.when = {
        all: [
            { gt: ["$taker", 0.5], label: "the aggressors are buyers" },
            { gt: ["$book", 0], label: "the book leans bid" }
        ]
    };

    return document;
}

/**
 * An analytics entry by hand, in the shape analytics-engine/core/egress.cjs
 * publishes one — for the questions a hand-built entry can ask more precisely
 * than a real collector packet can.
 */
function readingEntry({
    topic = "analytics.crypto.btc.cvd",
    eventType = "cvd",
    symbol = "BTCUSDT",
    exchange = "binance",
    at = START,
    data = null
} = {}) {
    return {
        event: eventType,
        market: "analytics",
        exchange: "crypto",
        symbol,
        asset: String(symbol).replace(/USDT$/, ""),
        topic,
        source: "analytics",
        envelope: {
            meta: {
                assetClass: "crypto",
                sourceType: "analytics",
                exchange,
                symbol,
                eventType,
                timestamp: at
            },
            payload: data || { symbol, timestamp: at, aggregate: { cvd: 5, takerBuyRatio: 1 } }
        }
    };
}

/* ------------------------------------------------------------
 * 1. A trade packet on the bus becomes a decision on the bus
 *
 * The real EventBus, the real collector runtime, the real analytics engine and
 * the real runner, all on one wire with the wall clock: a spot trade frame goes
 * in at one end, and an execution.signal comes out of the other. Everything
 * asserted here is what the two layers actually hand each other — no shape is
 * invented by the test.
 * ---------------------------------------------------------- */
function aTradeBecomesADecision() {
    const h = harness({ real: true });
    const added = h.runner.add(tapeDocument(), { symbol: "BTCUSDT" }, { running: true });

    ok(added.ok && added.id === "cvd-tape", "a strategy document becomes a bot, one symbol at a time");
    ok(added.bot.binding.topics.length === 1 && added.bot.binding.topics[0] === "analytics.crypto.btc.cvd",
        "its ${asset} feed is bound to the symbol's asset, not left as a placeholder");
    ok(added.bot.binding.asset === "btc" && added.bot.binding.symbol === "BTCUSDT",
        "the binding keeps the asset the topic needs and the symbol the decision is about");
    ok(h.runner.route("analytics.crypto.btc.cvd").join(",") === "cvd-tape",
        "and the bot is reachable through the topic that carries the reading it needs");
    ok(h.statuses().length === 1 && h.statuses()[0].topic === "execution.cvd-tape.btc.bot_status",
        "starting it announced itself on the bus, before any market arrived");
    ok(h.statuses()[0].entry.envelope.payload.status === "running"
        && h.statuses()[0].entry.envelope.meta.sourceType === "bot",
        "as a bot frame about the bot, in the layer's own vocabulary");

    h.trade();

    ok(h.readings().length === 1, "a real spot trade frame on the bus became a real cvd reading");
    const reading = h.readings()[0].payload;
    ok(reading.topic === "analytics.crypto.btc.cvd" && reading.envelope.meta.symbol === "BTCUSDT",
        "the reading is about the symbol the trade was about");
    ok(reading.envelope.payload.aggregate.cvd === 2 && reading.envelope.payload.aggregate.takerBuyRatio === 1,
        "carrying the module's own measurement of the tape, not the trade it was measured from");

    ok(h.signals().length === 0, "one frame of the tape is not yet 'two of the last three': nothing was decided");
    const first = h.runner.bot("cvd-tape").evaluator.snapshot();
    ok(first.counters.readings === 1 && first.counters.triggers === 1 && first.counters.evaluations === 1,
        "the reading reached the bot's memory and moved its tree exactly once");
    ok(first.lastEvaluation.refusal.reason === "unknown-values" && first.counters.passed === 0,
        "the tree did not pass, and the refusal says 'not yet' rather than 'no'");
    ok(first.lastEvaluation.refusal.undecidedConditions.includes(0)
        && first.lastEvaluation.refusal.falseConditions.length === 0
        && first.lastEvaluation.refusal.missing.length === 0,
        "naming the count that is still open, and no value as missing: the market was read, it was just not enough");

    /* The second frame falls inside the engine's publication window for this
     * symbol, so the tape moves and the reading is held back; waiting the window
     * out is what lets the next frame be measured at all. */
    h.trade();
    ok(h.readings().length === 1 && h.engine.counters.throttled === 1,
        "a frame inside the symbol's publication window is measured but not published");

    h.step(CVD_THROTTLE_MS).trade();
    ok(h.readings().length === 2, "the next frame, a window later, became a reading of its own");
    h.step(CVD_THROTTLE_MS).trade();

    ok(h.readings().length === 3, "every trade frame became its own reading");
    ok(h.engine.counters.published === 3 && h.engine.counters.errors === 0 && h.engine.counters.invalid === 0,
        "and none of the bot's traffic made the engine publish or throw");
    ok(h.engine.counters.unrouted === h.runner.counters.execution,
        "the engine heard the bot's decisions on the bus and had no route for them: two namespaces, one wire");

    const signals = h.signals();
    ok(signals.length === 2, `two of the last three frames bought: the bot decided twice (${signals.length})`);
    ok(h.runner.bot("cvd-tape").evaluator.snapshot().counters.passed === 2,
        "and the bot's own counters agree with what went out");
}

/* ------------------------------------------------------------
 * 2. What the decision carries
 *
 * A signal is the whole evidence, not a verdict: the action, the frame it fired
 * on and its age, every value it was decided on with the path it was read from,
 * the tree with what each branch decided, and the state the decision left.
 * ---------------------------------------------------------- */
function theDecisionCarriesItsEvidence() {
    const h = harness();
    h.runner.add(tapeDocument(), { symbol: "BTCUSDT" }, { running: true });
    h.trade().trade().trade();

    const signals = h.signals();
    const entry = signals[0].entry;
    const envelope = entry.envelope;

    ok(signals[0].event === "signal" && signals[0].topic === "execution.cvd-tape.btc.signal"
        && signals[0].bot === "cvd-tape" && signals[0].symbol === "BTCUSDT",
        "the decision left as an execution entry on the bot's own topic");
    ok(entry.market === "execution" && entry.exchange === "cvd-tape" && entry.asset === "BTC"
        && entry.channel === "execution:cvd-tape:BTCUSDT:signal" && entry.source === "bot",
        "on the bus axis made for bots: market 'execution', a bot id where a venue name would be, and the symbol it decided about");
    ok(envelope.meta.sourceType === "bot" && envelope.meta.eventType === "signal"
        && envelope.meta.exchange === "binance" && envelope.meta.baseAsset === "BTC",
        "the envelope names the layer that made it, the event, the venue and the asset");
    ok(envelope.meta.provenance.origin === "bot-engine" && envelope.meta.provenance.stage === "bot-engine"
        && envelope.meta.provenance.bot === "cvd-tape" && envelope.meta.provenance.strategy === "cvd tape",
        "and provenance remembers which bot, and which strategy, decided");
    ok(envelope.meta.id === `binance:BTCUSDT:signal:${envelope.meta.timestamp}`,
        "with the id a consumer can dedupe on");

    const data = envelope.payload;
    ok(data.outcome === "true" && data.action.type === "enter" && data.action.side === "long"
        && data.action.sizeValue === 1,
        "the payload carries the action the document asked for, as an intent");
    ok(data.symbol === "BTCUSDT" && data.exchange === "binance" && data.at === envelope.meta.timestamp,
        "about the symbol the reading was about, stamped when it was decided");
    ok(data.trigger.feed === "flow" && data.trigger.topic === "analytics.crypto.btc.cvd"
        && Number.isFinite(data.trigger.ageMs) && data.trigger.ageMs >= 0,
        "with the frame it fired on, how old that frame already was, and on which topic");
    ok(data.strategy.name === "cvd tape" && data.strategy.bot === "cvd-tape",
        "the strategy travels as data, not as a pointer to a file");
}


/* ------------------------------------------------------------
 * 3. The evidence names the paths it was decided on
 *
 * A signal is not "the tree passed": it is the tree. Every value it was decided
 * on travels with the path it was read from, the frame it came from and how old
 * that frame already was; every branch says what it decided; and the state the
 * decision leaves behind is part of the decision. Reading a signal here is
 * reading something that could be replayed by hand.
 * ---------------------------------------------------------- */
function theEvidenceNamesThePathsItWasDecidedOn() {
    const h = harness();
    h.runner.add(tapeDocument(), { symbol: "BTCUSDT" }, { running: true });
    h.trade().trade().trade();

    const payload = h.signals()[1].entry.envelope.payload;

    /* The metric the last frame was read for: which feed, which topic, which
     * path into the reading, how old, and whether that left it usable. */
    ok(payload.metrics.length === 1, `only the values the decision still needed are carried (${payload.metrics.length})`);
    const taker = payload.metrics[0];
    ok(taker.alias === "taker" && taker.label === "taker buy ratio" && taker.path === "aggregate.takerBuyRatio"
        && taker.kind === "scalar" && taker.feed === "flow" && taker.topic === "analytics.crypto.btc.cvd",
        "each one names the alias the document used, its label, the path into the reading, and the feed it came from");
    ok(taker.value === 1 && taker.at === START + 3_000 && taker.ageMs === 0 && taker.maxAgeMs === 600_000
        && taker.fresh === true && taker.stale === false && taker.available === true && taker.reason === null,
        "with the value, the instant it was measured at, its age against the feed's own promise, and no refusal");

    const tree = payload.conditions;
    ok(tree.operator === "all" && tree.outcome === "true" && tree.conditions.length === 3,
        "the whole tree travels with the decision, and the root says what it decided");
    ok(tree.matched.length === 3 && tree.refused.length === 0 && tree.undecided.length === 0,
        "with the branches that held, the ones that refused, and the ones that could not be decided");

    const count = tree.conditions[0];
    ok(count.operator === "count" && count.label === "two of the last three frames bought"
        && count.feed === "flow" && count.topic === "analytics.crypto.btc.cvd",
        "the count keeps the label the document wrote and the feed it counted");
    ok(count.window === 3 && count.taken === 3 && count.matched === 3 && count.undecided === 0
        && count.test.field === "atLeast" && count.test.count === 2 && count.outcome === "true",
        "the window, how many slots it looked at, how many matched, and the bar it was asked for");
    ok(count.slots.map((slot) => slot.at).join(",") === [START + 1_000, START + 2_000, START + 3_000].join(","),
        "each slot is the frame it counted, at the instant that frame was measured");
    ok(count.slots.every((slot) => slot.condition.operator === "gt" && slot.outcome === "true")
        && count.slots.map((slot) => slot.condition.operands[0].path).join(",")
            === "aggregate.cvd,aggregate.cvd,aggregate.cvd"
        && count.slots.map((slot) => slot.condition.operands[0].value).join(",") === "2,4,6",
        "and inside a slot the value is that slot's own frame, read through the path the document named");
    ok(count.slots[0].condition.written.join(" ") === "$cvd 0"
        && count.slots[0].condition.operands[0].alias === "cvd" && count.slots[0].condition.operands[0].fresh === true
        && count.slots[0].condition.operands[0].ageMs === 2_000,
        "the comparison remembers how it was written, which alias it resolved, and how old the slot was at the decision");

    const aggressors = tree.conditions[1];
    ok(aggressors.operator === "gt" && aggressors.label === "the aggressors are buyers" && aggressors.outcome === "true"
        && aggressors.operands[0].alias === "taker" && aggressors.operands[0].path === "aggregate.takerBuyRatio"
        && aggressors.operands[0].value === 1 && aggressors.operands[0].fresh === true
        && aggressors.operands[1].as === "literal" && aggressors.operands[1].value === 0.5,
        "a comparison carries its operands as data: the metric with its path, the literal with its value");
    const limit = tree.conditions[2];
    ok(limit.operator === "lt" && limit.label === "at most five alerts a day" && limit.outcome === "true"
        && limit.operands[0].as === "state" && limit.operands[0].name === "alerts"
        && limit.operands[0].value === 1 && limit.operands[0].label === "$state.alerts",
        "and a state variable resolves like any other operand, so the tree can say where its number came from");

    ok(payload.applied.length === 1 && payload.applied[0].name === "alerts" && payload.applied[0].field === "add"
        && payload.applied[0].from === 1 && payload.applied[0].to === 2,
        "the state this signal wrote is a list of changes, each with the value before and after");
    ok(payload.state.alerts === 2 && payload.resets.alerts === START + 3_000 + 86_400_000,
        "the state it leaves is the state the next decision starts from, and the instant its day ends");

    /* A variable the document bounded is a promise the tree keeps: the frame
     * after the fifth alert meets the bar the document wrote (`lt 5`), and the
     * tree stops passing. */
    h.trade().trade().trade().trade();
    const full = h.runner.bot("cvd-tape").evaluator.snapshot();
    ok(full.state.alerts === 5 && full.counters.signals === 5,
        `the alert counter walked up to the limit the document wrote (${full.state.alerts})`);
    ok(full.counters.failed === 1 && full.lastEvaluation.outcome === "false"
        && full.lastEvaluation.refusal.reason === "conditions-false"
        && full.lastEvaluation.refusal.falseConditions.join(",") === "2",
        "the next frame is refused by the branch written for it, and the refusal names which branch");
    ok(full.lastEvaluation.refusal.missing.length === 0 && full.lastEvaluation.refusal.stale.length === 0,
        "nothing was missing and nothing was stale: the market was read, the day was simply full");

    /* And the day the document promised ends on its own, not when a frame says so. */
    h.step(86_400_000).trade();
    const next = h.runner.bot("cvd-tape").evaluator.snapshot();
    ok(next.state.alerts === 0, "the counter is back to its init once its day is over");
    ok(next.counters.signals === 5 && next.counters.undecided === 2,
        "with nothing new going out: the frames of the old day are too old to decide on");
    ok(next.lastEvaluation.outcome === "unknown" && next.lastEvaluation.refusal.reason === "unknown-values",
        "and the tree says 'not yet' rather than 'no', because an empty window is a wait, not a refusal");
}


/* ------------------------------------------------------------
 * 4. One document, one bot per symbol
 *
 * A document is a strategy, not a bot: a bot is that strategy bound to one
 * symbol, with a topic and an id of its own, so the readings of one market never
 * move the bot of another. The id is the identity (the document's `bot` name is
 * only the default), and the topic index is what makes keeping that promise
 * cheap: a reading is routed to exactly the bots that bound that topic.
 * ---------------------------------------------------------- */
function oneDocumentBecomesOneBotPerSymbol() {
    const h = harness();
    const document = tapeDocument();

    const btc = h.runner.add(document, { symbol: "BTCUSDT" }, { running: true });
    ok(btc.ok && btc.id === "cvd-tape", "a document and a symbol make a bot, named by the document");
    ok(btc.bot.binding.asset === "btc" && btc.bot.binding.symbol === "BTCUSDT"
        && btc.bot.binding.topics.join(",") === "analytics.crypto.btc.cvd",
        "its ${asset} feed is bound to the asset of that symbol, so no placeholder is left to be read");

    const again = h.runner.add(document, { symbol: "ETHUSDT" }, { running: true });
    ok(!again.ok && again.reason === REASONS.DUPLICATE,
        "the same document wants the same id: one id is one bot, so the second symbol must be named apart");
    const eth = h.runner.add(document, { symbol: "ETHUSDT" }, { id: "cvd-tape-eth", running: true });
    ok(eth.ok && eth.id === "cvd-tape-eth" && eth.bot.binding.asset === "eth"
        && eth.bot.binding.topics.join(",") === "analytics.crypto.eth.cvd",
        "and then the second symbol gets a bot of its own, bound to its own topic");

    ok(h.runner.route("analytics.crypto.btc.cvd").join(",") === "cvd-tape"
        && h.runner.route("analytics.crypto.eth.cvd").join(",") === "cvd-tape-eth",
        "each reading has exactly one bot waiting for it");
    ok(h.runner.list().length === 2, "two symbols, one document, two bots");
    ok(h.statuses().map((item) => item.entry.envelope.payload.symbol).join(",") === "BTCUSDT,ETHUSDT",
        "and each of them announced itself about its own symbol");

    h.trade({ symbol: "BTCUSDT" }).trade({ symbol: "ETHUSDT" }).trade({ symbol: "BTCUSDT" });

    const btcNow = h.runner.bot("cvd-tape").evaluator.snapshot();
    const ethNow = h.runner.bot("cvd-tape-eth").evaluator.snapshot();
    ok(btcNow.symbol === "BTCUSDT" && ethNow.symbol === "ETHUSDT", "each bot knows which market it is about");
    ok(btcNow.counters.readings === 2 && btcNow.counters.triggers === 2 && btcNow.counters.passed === 1,
        `the btc bot counted the btc readings and moved its tree (${btcNow.counters.readings})`);
    ok(ethNow.counters.readings === 1 && ethNow.counters.triggers === 1
        && ethNow.counters.passed === 0 && ethNow.counters.undecided === 1,
        "the eth bot counted only its own, and one frame is not a window");
    ok(h.signals().length === 1 && h.signals()[0].symbol === "BTCUSDT" && h.signals()[0].bot === "cvd-tape",
        "the one decision of those three readings belongs to the market it was made about");
    ok(h.signals()[0].topic === "execution.cvd-tape.btc.signal",
        "and it left on the btc bot's own topic, not on the strategy's");
    ok(h.readings("analytics.crypto.eth.cvd").length === 1
        && h.readings("analytics.crypto.btc.cvd").length === 2,
        "the engine answered both markets on their own topics");
}


/* ------------------------------------------------------------
 * 5. A quiet period is a promise about signals
 *
 * The cooldown lives where the signal is sent, not where the market is read. The
 * tree passes again, the runner counts the frame it held back in its own word,
 * and neither the state nor the quiet period moves for a signal that never left.
 * ---------------------------------------------------------- */
function aQuietPeriodIsAPromiseAboutSignals() {
    const h = harness();
    h.runner.add(tapeDocument({ cooldownMs: 300_000 }), { symbol: "BTCUSDT" }, { running: true });

    h.trade().trade();
    const bot = h.runner.bot("cvd-tape");
    ok(h.signals().length === 1 && bot.lastSignalAt === START + 2_000,
        "the first passing tree speaks, and the bot remembers when it spoke");

    h.step(10_000).trade();
    ok(bot.evaluator.snapshot().counters.passed === 2,
        "the next frame makes the very same tree pass again: the market said the same thing");
    ok(h.signals().length === 1,
        "and nothing left: the quiet period is a promise about signals, not about the market");
    ok(bot.suppressed[REASONS.COOLDOWN] === 1 && h.runner.counters.suppressed === 1,
        "what did not go out is counted in its own word, on the bot and on the runner");
    ok(h.runner.counters.evaluations === 3 && h.runner.counters.refused === 1,
        "the runner still evaluated the frame it refused to act on, and still counted the one refusal of the warm-up");
    ok(bot.signals === 1 && bot.lastSignalAt === START + 2_000,
        "the frame it held back did not restart the quiet period");
    ok(bot.evaluator.snapshot().state.alerts === 1,
        "and it did not move the state either: no signal, no consequence");

    h.step(300_000).trade();
    ok(h.signals().length === 2 && bot.lastSignalAt === START + 314_000,
        "when the quiet period has passed, the same tape is allowed to speak again");
    ok(bot.suppressed[REASONS.COOLDOWN] === 1, "and what was held back stays counted as held back");
}


/* ------------------------------------------------------------
 * 6. A `once` is spent when it is said
 *
 * The other promise about signals. The tree may pass a hundred times, and the
 * bot has one word to say; only starting again after a stop is a new life in
 * which it has not said it yet.
 * ---------------------------------------------------------- */
function aOnceIsSpentWhenItIsSaid() {
    const h = harness();
    h.runner.add(tapeDocument({ once: true }), { symbol: "BTCUSDT" }, { running: true });

    h.trade().trade();
    const bot = h.runner.bot("cvd-tape");
    ok(h.signals().length === 1 && bot.lastSignalAt === START + 2_000, "the bot says its one word");

    h.trade();
    ok(bot.evaluator.snapshot().counters.passed === 2 && bot.evaluator.snapshot().counters.signals === 1,
        "the third frame makes the tree pass again, and the bot's memory is asked for no second action");
    ok(h.signals().length === 1 && bot.suppressed[REASONS.ONCE] === 1 && h.runner.counters.suppressed === 1,
        "but the once is already spent, and what was held back is counted in its own word");

    h.trade().trade();
    ok(bot.suppressed[REASONS.ONCE] === 3 && h.signals().length === 1,
        "and it stays spent, frame after frame, however many times the tree passes");
    ok(bot.lastSignalAt === START + 2_000 && bot.evaluator.snapshot().state.alerts === 1,
        "the held-back frames moved neither the quiet period nor the state");

    const stopped = h.runner.stop("cvd-tape");
    const started = h.runner.start("cvd-tape");
    ok(stopped.ok && started.ok && started.from === BOT_STATE.STOPPED,
        "a stop, and then a start, is a new life rather than a pause");
    h.trade().trade();
    ok(h.signals().length === 2 && bot.signals === 1,
        "in which the once has not been said yet, and the window begins from its first fresh frame");
}


/* ------------------------------------------------------------
 * 7. A pause waits, a stop forgets, starting again begins from now
 *
 * The three states are three different promises. A pause is a wait: frames keep
 * arriving, the tree keeps running, the bot only stops deciding. A stop is a
 * death: the window, the state and the signal count are gone. Starting after a
 * stop is a new session, not a window full of frames from a session that ended.
 * ---------------------------------------------------------- */
function aPauseWaitsAndAStopForgets() {
    const h = harness();
    h.runner.add(tapeDocument(), { symbol: "BTCUSDT" }, { running: true });
    h.trade().trade();

    const bot = h.runner.bot("cvd-tape");
    ok(h.signals().length === 1 && bot.signals === 1, "a started bot decides: one signal so far");

    const paused = h.runner.pause("cvd-tape");
    ok(paused.ok && paused.from === BOT_STATE.RUNNING && paused.to === BOT_STATE.PAUSED
        && paused.entry.envelope.payload.status === "paused" && paused.entry.envelope.payload.from === "running",
        "a pause changes the state and says so on the bus, in the bot's own words");

    h.step(1_000).trade();
    ok(bot.evaluator.snapshot().counters.readings === 3 && bot.evaluator.snapshot().counters.passed === 2,
        "a paused bot still remembers the frame and still walks its tree: a pause is a wait, not a blind spot");
    ok(h.runner.counters.evaluations === 2 && h.signals().length === 1 && bot.signals === 1,
        "but the runner decides nothing for it, and nothing leaves");
    ok(bot.evaluator.snapshot().state.alerts === 1, "and the state stands still, because no signal was sent");

    const resumed = h.runner.start("cvd-tape");
    ok(resumed.ok && resumed.from === BOT_STATE.PAUSED
        && resumed.entry.envelope.payload.status === "running" && resumed.entry.envelope.payload.uptimeMs === 0,
        "starting again after a pause is a resume, and the bus hears about it");
    ok(bot.evaluator.snapshot().counters.readings === 3, "with the memory it kept: a resume is not a new window");

    const stopped = h.runner.stop("cvd-tape");
    ok(stopped.ok && stopped.from === BOT_STATE.RUNNING && stopped.to === BOT_STATE.STOPPED
        && stopped.entry.envelope.payload.status === "stopped",
        "a stop says so as well");
    ok(bot.evaluator.snapshot().counters.readings === 0 && bot.evaluator.snapshot().state.alerts === 0
        && bot.signals === 0 && bot.lastSignalAt === null,
        "and it forgets everything: the frames, the state, the signals and the quiet period");

    h.step(1_000).trade();
    ok(bot.evaluator.snapshot().counters.readings === 0 && h.runner.counters.routed === 3,
        "a frame that arrives while stopped is not even routed to it: the index still names it, the state keeps it out");

    const restarted = h.runner.start("cvd-tape");
    ok(restarted.ok && restarted.from === BOT_STATE.STOPPED
        && restarted.entry.envelope.payload.uptimeMs === 0
        && bot.evaluator.snapshot().counters.readings === 0,
        "and starting after a stop is a new session that begins with nothing");
    ok(h.runner.counters.statuses === 5 && h.runner.counters.evaluations === 2
        && h.runner.counters.refused === 1 && h.runner.counters.suppressed === 0,
        "five announcements on the bus, and of the four frames only the two of the running session were decided at all");

    h.trade().trade();
    ok(h.signals().length === 2 && bot.signals === 1,
        "two fresh frames are a window again, and the first decision of the new session goes out");
    ok(h.statuses().map((item) => item.entry.envelope.payload.status).join(",")
        === "running,paused,running,stopped,running",
        "and every change of mind was announced on the bus, in order");
}


/* ------------------------------------------------------------
 * 8. A bot that cannot be told does not act
 *
 * A decision nobody can be told about is not a decision. A plan pinned to an
 * asset has a topic to read (the plan named it) but no symbol to put in an
 * execution entry, so nothing is built, nothing is thrown, and — because no
 * signal is ever sent — the quiet period it never earned is not consumed.
 * ---------------------------------------------------------- */
function aBotThatCannotBeToldDoesNotAct() {
    const h = harness();
    const pinned = h.runner.add(pinnedDocument({ once: true, cooldownMs: 300_000 }), {}, { running: true });

    ok(pinned.ok && pinned.id === "pinned-tape" && pinned.bot.binding.symbol === null
        && pinned.bot.binding.asset === null && pinned.bot.binding.exchange === null
        && pinned.bot.binding.feeds.flow.pinned === true,
        "a pinned plan binds to its topic without a symbol, an asset or a venue to name");
    ok(h.runner.route("analytics.crypto.btc.cvd").join(",") === "pinned-tape",
        "so the readings of that topic do reach it");
    ok(pinned.bot.state === BOT_STATE.RUNNING && h.runner.counters.statuses === 0 && h.statuses().length === 0,
        "the change of state is real, but it cannot be announced: a status with no symbol has no entry to leave on");

    h.trade().trade().trade();
    const bot = h.runner.bot("pinned-tape");
    ok(bot.evaluator.snapshot().counters.passed === 2 && bot.evaluator.snapshot().counters.undecided === 1,
        "the tree passes exactly as it does for a bot that can be told: one frame is a warm-up, the next two pass");
    ok(bot.signals === 0 && bot.lastSignalAt === null && h.signals().length === 0,
        "and nothing is sent: the decision stays a calculation");

    const handed = h.runner.onEntry(h.lastReading());
    ok(handed.length === 1 && handed[0].trigger === true
        && handed[0].action.kind === "unroutable" && handed[0].action.reason === REASONS.UNROUTABLE,
        "handed a passing frame again, it answers with why, not with a signal");

    h.trade();
    ok(bot.suppressed[REASONS.COOLDOWN] === 0 && bot.suppressed[REASONS.ONCE] === 0
        && h.runner.counters.suppressed === 0,
        "and the quiet period it never earned is not consumed: no promise was made, so none was kept");
    ok(h.runner.counters.statuses === 0 && h.runner.events.length === 0,
        "nothing this bot ever thought reached the bus, and nothing was thrown");

    /* The same question with values the test chose, so the tape is not the
     * collector's: cvd 9 never travelled from a venue. The answer is the same —
     * where the frame came from is not what makes a decision routable. */
    h.step(1_000);
    h.bus.publish(
        readingEntry({ at: START + 5_000, data: { symbol: "BTCUSDT", timestamp: START + 5_000, aggregate: { cvd: 9, takerBuyRatio: 1 } } }),
        { market: "analytics", exchange: "crypto", symbol: "BTCUSDT" }
    );
    const handBuilt = h.runner.onEntry(h.lastReading());
    ok(handBuilt.length === 1 && handBuilt[0].action.kind === "unroutable"
        && handBuilt[0].evaluation.outcome === "true" && bot.signals === 0,
        "a frame the test built, passing the tree, is answered the same way: a calculation, not a signal");
}


/* ------------------------------------------------------------
 * 9. The runner never eats its own output
 *
 * The bus is shared, so the layer hears its own decisions come back. They are
 * answers, not inputs: any entry on the execution namespace — this runner's or
 * another layer's — is counted as execution traffic and dropped before the topic
 * index, so a decision can never make a bot decide.
 * ---------------------------------------------------------- */
function theRunnerNeverEatsItsOwnOutput() {
    const h = harness();
    h.runner.add(tapeDocument(), { symbol: "BTCUSDT" }, { running: true });
    h.trade().trade();

    const signal = h.signals()[0];
    const status = h.statuses()[0];
    ok(h.runner.counters.execution === 2 && h.runner.counters.entries === 6,
        `the runner heard its own two entries come back on the wire (${h.runner.counters.entries} entries seen)`);

    /* The same entry the bus carried, rebuilt from what left the layer. */
    const asBusEntry = (record, event) => ({
        channel: record.entry.channel,
        event,
        market: record.entry.market,
        exchange: record.entry.exchange,
        symbol: record.entry.symbol,
        at: record.at,
        payload: record.entry
    });

    const before = { ...h.runner.counters };
    const results = h.runner.onEntry(asBusEntry(signal, "signal"));
    ok(results.length === 0 && h.runner.counters.execution === before.execution + 1
        && h.runner.counters.routed === before.routed && h.runner.counters.evaluations === before.evaluations
        && h.runner.counters.refused === before.refused && h.runner.counters.signals === before.signals,
        "handed its own decision back, it drops it before the index: no bot is reached and no tree is walked");
    ok(h.runner.route("execution.cvd-tape.btc.signal").length === 0
        && h.runner.route("execution.cvd-tape.btc.bot_status").length === 0,
        "and no topic index holds a decision topic, so there would be nothing to route it to");

    const statusResults = h.runner.onEntry(asBusEntry(status, "bot_status"));
    ok(statusResults.length === 0 && h.runner.counters.execution === before.execution + 2,
        "a status is execution traffic too: a bot's report about itself is not a reason for any bot to decide");

    const foreign = h.runner.onEntry({
        channel: "execution:some-other-bot:BTCUSDT:signal",
        event: "signal",
        market: "execution",
        exchange: "some-other-bot",
        symbol: "BTCUSDT",
        at: START + 5_000,
        payload: {
            market: "execution",
            bot: "some-other-bot",
            symbol: "BTCUSDT",
            event: "signal",
            topic: "execution.some-other-bot.btc.signal",
            envelope: {
                meta: { sourceType: "bot", symbol: "BTCUSDT", exchange: "binance", eventType: "signal", timestamp: START + 5_000 }
            }
        }
    });
    ok(foreign.length === 0 && h.runner.counters.execution === before.execution + 3
        && h.runner.counters.foreign === before.foreign,
        "and neither is another layer's decision: every entry of the execution namespace is an answer, never an input");
}

aTradeBecomesADecision();
theDecisionCarriesItsEvidence();
theEvidenceNamesThePathsItWasDecidedOn();
oneDocumentBecomesOneBotPerSymbol();
aQuietPeriodIsAPromiseAboutSignals();
aOnceIsSpentWhenItIsSaid();
aPauseWaitsAndAStopForgets();
aBotThatCannotBeToldDoesNotAct();
theRunnerNeverEatsItsOwnOutput();

console.log(`B1 bot-engine seam: ${checks} checks passed`);

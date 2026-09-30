/* ============================================================
 * File: bot-engine/core/evaluator.cjs
 * Section: bot-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   Walk a compiled plan (core/dsl-schema.cjs) over the readings a bus
 *   delivered, and answer with a decision: did the conditions hold, which
 *   metric values did they hold on, and — when they did not — which condition
 *   and which missing value refused.
 *
 *   Two rules shape this file:
 *
 *   1. TRIGGER-DRIVEN. A strategy is evaluated when its trigger feed speaks;
 *      every other feed is read from the last value it published. That is the
 *      answer to the cadence problem: a 1m flow reading, a 10s book and an 8h
 *      funding rate cannot be waited for together, and none of them may be
 *      assumed fresh — each carries its own ageMs in the evidence, and a
 *      maxAgeMs turns "old" into "not a value" (unknown), never into "false".
 *
 *   2. THREE-VALUED. A condition is true, false or unknown. Unknown is the
 *      honest answer when a value is missing, stale or null: a comparison that
 *      could not be made must not be reported as a comparison that failed.
 *      The tree keeps that distinction — all of (true, unknown) is unknown, any
 *      of (false, unknown) is unknown, not unknown is unknown — so the trace can
 *      say "this bot did not fire because the funding feed was two hours old"
 *      instead of pretending the book disagreed.
 *
 *   History: every accepted reading of a feed is appended to that feed's ring
 *   (feed.history frames), because `count` looks backwards over exactly those
 *   frames; a count whose window is longer than the frames the feed keeps is
 *   refused by the schema, so the ring is never asked for more than it holds.
 *
 *   One reading is one frame whatever the venue sent: the topic is
 *   analytics.<assetClass>.<asset>.<event>, the venue travels on
 *   envelope.meta.exchange (the bus axis carries the asset class, exactly as
 *   analytics-engine/core/egress.cjs builds it), and the value a metric names
 *   is read from envelope.payload — the reading, never the book it was measured
 *   from.
 *
 *   Not this file's business: the bus, the lifecycle, cooldown, publishing.
 *   It never publishes and never subscribes; the runner feeds it entries and
 *   asks it what it decided.
 * ============================================================ */

const { baseAssetOf, canonicalSymbol } = require("../../collector/crypto/common/envelope.cjs");

/** A condition that could not be decided is not a condition that failed. */
const OUTCOME = Object.freeze({
    TRUE: "true",
    FALSE: "false",
    UNKNOWN: "unknown"
});

/* ------------------------------------------------------------
 * Values
 * ---------------------------------------------------------- */

/** A value that is not there: absence, never zero and never false. */
function isMissing(value) {
    return value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value));
}

/** `aggregate.cvd` → payload.aggregate.cvd; a segment that is not there → undefined. */
function readPath(source, path) {
    if (source === null || source === undefined) return undefined;

    let cursor = source;
    for (const segment of String(path).split(".")) {
        if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
        cursor = cursor[segment];
    }

    return cursor;
}

/** The message of a comparison the evaluator cannot make, or null when it can. */
function comparisonRefusal(operator, left, right) {
    if (left.missing) return "left-missing";
    if (right.missing) return "right-missing";
    if (left.stale) return "left-stale";
    if (right.stale) return "right-stale";
    if (["gt", "gte", "lt", "lte"].includes(operator)) {
        if (typeof left.value !== "number" || typeof right.value !== "number") return "not-a-number";
    }

    return null;
}

/* ------------------------------------------------------------
 * What arrives on the bus
 *
 * The analytics engine publishes an *entry* (analytics-engine/core/egress.cjs):
 * { event, topic, envelope, ... } on channel analytics:<assetClass>:<symbol>:<event>.
 * This layer reads the entry if there is one and the bare envelope otherwise,
 * and it takes the venue from envelope.meta.exchange — the bus axis carries the
 * asset class, so `entry.exchange === "crypto"` is not a venue.
 * ---------------------------------------------------------- */

/** The analytics topic a bus entry carries, or null when it carries none. */
function topicOf(entry) {
    if (!entry || typeof entry !== "object") return null;
    const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : null;
    if (payload && typeof payload.topic === "string") return payload.topic;
    if (typeof entry.topic === "string") return entry.topic;
    return null;
}

/**
 * The reading inside a bus entry, or null when the entry is not one.
 * @returns {object|null} frozen reading { topic, event, envelope, data, assetClass,
 *                        exchange, symbol, marketType, sourceType, at }
 */
function readingFrom(entry) {
    if (!entry || typeof entry !== "object") return null;

    const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : null;
    const nested = payload && payload.envelope && typeof payload.envelope === "object" ? payload.envelope : null;

    let envelope = null;
    if (nested) envelope = nested;
    else if (payload && payload.meta && typeof payload.meta === "object") envelope = payload;
    else if (entry.envelope && entry.envelope.meta) envelope = entry.envelope;
    else if (entry.meta && typeof entry.meta === "object") envelope = entry;
    if (!envelope) return null;

    const meta = envelope.meta || {};

    return Object.freeze({
        topic: (payload && payload.topic) || entry.topic || null,
        event: (payload && payload.event) || entry.event || meta.eventType || null,
        envelope,
        data: envelope.payload,
        assetClass: meta.assetClass || null,
        exchange: meta.exchange || null,
        symbol: meta.symbol || entry.symbol || null,
        marketType: meta.marketType || null,
        sourceType: meta.sourceType || null,
        /* The collector's own clock: when the measurement was taken, which is
         * what an age is measured from. A reading without one is never assumed
         * fresh (see resolveMetric). */
        at: meta.timestamp ?? meta.receiveTimestamp ?? entry.at ?? null
    });
}

/**
 * Why this reading is not for this feed, or null when it is.
 *
 * A feed addresses one topic; a pinned feed (an explicit symbol in the plan)
 * names one venue and one contract, an unpinned one takes the symbol's own
 * venue-agnostic reading — the venue that answered is on the reading, and a
 * plan that pins a venue must not decide on another venue's number.
 */
function whyNotReading(reading, feed, binding) {
    if (!reading.topic || reading.topic !== feed.topic) return "topic";
    if (feed.pinned) {
        if (feed.exchange && reading.exchange !== feed.exchange) return "venue";
        /* The plan's assets are lower case (dsl-schema.cjs keeps them so) and the
         * reading's base asset comes from the collector's ticker table: the case
         * is not the difference, the asset is. */
        if (String(baseAssetOf(reading.symbol) || "").toLowerCase() !== feed.asset) return "asset";
        return null;
    }
    if (binding.symbol && canonicalSymbol(reading.symbol) !== binding.symbol) return "symbol";
    return null;
}

/* ------------------------------------------------------------
 * Resolving an operand
 *
 * Every operand resolves to one shape — { as, value, label, missing, stale,
 * fresh, reason } — so a trace can be read without knowing which kind it was,
 * and so "there is no value" and "the value is too old" stay distinguishable
 * all the way into the signal's evidence.
 * ---------------------------------------------------------- */

/** What the evidence says about one metric value: what was read, from where, how old. */
function metricEvidence(resolved) {
    return {
        alias: resolved.alias,
        label: resolved.label,
        path: resolved.path,
        kind: resolved.kind,
        feed: resolved.feed,
        topic: resolved.topic,
        value: resolved.value === undefined ? null : resolved.value,
        at: resolved.at,
        ageMs: resolved.ageMs,
        maxAgeMs: resolved.maxAgeMs,
        fresh: resolved.fresh,
        stale: resolved.stale,
        available: !resolved.missing && !resolved.stale,
        reason: resolved.reason
    };
}

/**
 * Remember a resolution that came from the cache (not from a count slot — a
 * slot's own trace carries its own values) so the signal can say what the
 * decision was made on.
 */
function noteResolution(ctx, resolved, frame) {
    if (frame) return resolved;

    ctx.metrics.set(resolved.alias, metricEvidence(resolved));
    if (resolved.missing) ctx.missing.push(metricEvidence(resolved));
    else if (resolved.stale) ctx.stale.push(metricEvidence(resolved));
    return resolved;
}

/** The value of $alias, from the frame in hand or from the feed's last reading. */
function resolveMetric(ctx, alias, frame) {
    const resolved = {
        as: "metric",
        alias,
        label: `$${alias}`,
        path: null,
        pattern: null,
        kind: null,
        feed: null,
        topic: null,
        value: null,
        at: null,
        ageMs: null,
        maxAgeMs: null,
        fresh: false,
        stale: false,
        missing: true,
        reason: "unknown-alias"
    };

    const metric = ctx.plan.metrics[alias];
    if (!metric) return noteResolution(ctx, resolved, frame);

    const feed = ctx.binding.feeds[metric.feed] || null;
    resolved.label = metric.label;
    resolved.path = metric.path;
    resolved.pattern = metric.pattern;
    resolved.kind = metric.kind;
    resolved.feed = metric.feed;
    resolved.topic = feed ? feed.topic : null;
    resolved.maxAgeMs = feed && Number.isFinite(feed.maxAgeMs) ? feed.maxAgeMs : null;

    /* The frame in hand counts only for the feed it belongs to: a count slot
     * walks the counted feed's history, and a metric of another feed inside it
     * (the schema refuses those, but the evaluator does not rely on that) still
     * reads the feed's own last value. */
    const held = frame && frame.feed === metric.feed ? frame : (ctx.readings.get(metric.feed) || null);
    if (!held) {
        resolved.reason = "no-reading";
        return noteResolution(ctx, resolved, frame);
    }

    resolved.at = held.at === null || held.at === undefined ? null : held.at;
    resolved.value = readPath(held.data, metric.path);
    resolved.missing = isMissing(resolved.value);

    if (resolved.at === null) {
        /* A frame with no clock cannot be called fresh: an age that cannot be
         * measured is not an age of zero. */
        resolved.reason = "no-timestamp";
        resolved.stale = true;
        return noteResolution(ctx, resolved, frame);
    }

    resolved.ageMs = Math.max(0, ctx.at - resolved.at);
    resolved.stale = resolved.maxAgeMs !== null && resolved.ageMs > resolved.maxAgeMs;

    if (resolved.stale) resolved.reason = "stale";
    else if (resolved.missing) resolved.reason = "no-value";
    else {
        resolved.fresh = true;
        /* Nothing left to explain: the value is here, and it is new enough. */
        resolved.reason = null;
    }

    return noteResolution(ctx, resolved, frame);
}

/** A literal, a state variable, or a metric — one shape out of all three. */
function resolveOperand(ctx, operand, frame = null) {
    if (!operand || typeof operand !== "object") {
        return { as: "literal", value: null, label: "null", missing: true, stale: false, fresh: false, reason: "no-operand" };
    }

    if (operand.as === "literal") {
        const value = operand.value;
        return {
            as: "literal",
            value,
            label: typeof value === "string" ? `"${value}"` : String(value),
            missing: isMissing(value),
            stale: false,
            fresh: true,
            reason: null
        };
    }

    if (operand.as === "state") {
        const value = ctx.state[operand.name];
        return {
            as: "state",
            name: operand.name,
            value,
            label: `$state.${operand.name}`,
            missing: isMissing(value),
            stale: false,
            fresh: true,
            reason: isMissing(value) ? "no-value" : null
        };
    }

    return resolveMetric(ctx, operand.alias, frame);
}

/* ------------------------------------------------------------
 * Walking the tree
 *
 * One trace per condition: what it was, what it decided, and on what. A trace
 * is part of the signal's evidence, so it is written for a human (the label the
 * plan gave the condition) as much as for a test.
 * ---------------------------------------------------------- */

/** The first operand that cannot be compared (missing/stale/NaN), or null. */
function operandRefusal(operands) {
    for (let index = 0; index < operands.length; index += 1) {
        const operand = operands[index];
        if (!operand) return { index, reason: "no-operand" };
        if (operand.missing) return { index, reason: operand.reason || "missing" };
        if (operand.stale) return { index, reason: operand.reason || "stale" };
    }
    return null;
}

/** A refusal the evaluator makes for the value's type, not its presence. */
function numericRefusal(operands) {
    const index = operands.findIndex((operand) => typeof operand.value !== "number");
    return index === -1 ? null : { index, reason: "not-a-number" };
}

/** The plain comparison, once both sides are known to be comparable. */
function decide(operator, left, right) {
    switch (operator) {
        case "gt": return left > right ? OUTCOME.TRUE : OUTCOME.FALSE;
        case "gte": return left >= right ? OUTCOME.TRUE : OUTCOME.FALSE;
        case "lt": return left < right ? OUTCOME.TRUE : OUTCOME.FALSE;
        case "lte": return left <= right ? OUTCOME.TRUE : OUTCOME.FALSE;
        case "eq": return left === right ? OUTCOME.TRUE : OUTCOME.FALSE;
        case "neq": return left !== right ? OUTCOME.TRUE : OUTCOME.FALSE;
        default: return OUTCOME.UNKNOWN;
    }
}

/** The outcome of a list of conditions joined by all/any. */
function join(conditions, mode) {
    const matched = [];
    const refused = [];
    const undecided = [];

    conditions.forEach((condition, index) => {
        if (condition.outcome === OUTCOME.TRUE) matched.push(index);
        else if (condition.outcome === OUTCOME.FALSE) refused.push(index);
        else undecided.push(index);
    });

    let outcome;
    if (mode === "all") outcome = refused.length ? OUTCOME.FALSE : (undecided.length ? OUTCOME.UNKNOWN : OUTCOME.TRUE);
    else outcome = matched.length ? OUTCOME.TRUE : (undecided.length ? OUTCOME.UNKNOWN : OUTCOME.FALSE);

    return { conditions, matched, refused, undecided, outcome };
}

function walkComparison(ctx, node, frame) {
    const operands = (node.operands || []).map((operand) => resolveOperand(ctx, operand, frame));
    const refusal = operandRefusal(operands) || (["gt", "gte", "lt", "lte"].includes(node.operator) ? numericRefusal(operands) : null);

    return {
        operator: node.operator,
        label: node.label || null,
        outcome: refusal ? OUTCOME.UNKNOWN : decide(node.operator, operands[0].value, operands[1].value),
        written: node.written || null,
        operands,
        refusal
    };
}

function walkBetween(ctx, node, frame) {
    const operands = (node.operands || []).map((operand) => resolveOperand(ctx, operand, frame));
    const refusal = operandRefusal(operands) || numericRefusal(operands);
    const [value, low, high] = operands;

    return {
        operator: "between",
        label: node.label || null,
        outcome: refusal ? OUTCOME.UNKNOWN : (value.value >= low.value && value.value <= high.value ? OUTCOME.TRUE : OUTCOME.FALSE),
        written: node.written || null,
        operands,
        refusal
    };
}

function walkMembership(ctx, node, frame) {
    const operands = (node.operands || []).map((operand) => resolveOperand(ctx, operand, frame));
    const refusal = operandRefusal(operands);
    const list = Array.isArray(node.list) ? node.list : [];

    return {
        operator: "in",
        label: node.label || null,
        outcome: refusal ? OUTCOME.UNKNOWN : (list.some((candidate) => candidate === operands[0].value) ? OUTCOME.TRUE : OUTCOME.FALSE),
        written: node.written || null,
        list,
        operands,
        refusal
    };
}

function walkExistence(ctx, node, frame) {
    const operands = (node.operands || []).map((operand) => resolveOperand(ctx, operand, frame));
    const target = operands[0] || null;

    let outcome;
    if (!target || target.missing) outcome = OUTCOME.FALSE;          // there is no value: that is a fact
    else if (target.stale) outcome = OUTCOME.UNKNOWN;                // there was one, long ago — not this market's now
    else outcome = OUTCOME.TRUE;

    return {
        operator: "exists",
        label: node.label || null,
        outcome,
        written: node.written || null,
        operands,
        refusal: target && target.stale ? { index: 0, reason: target.reason || "stale" } : null
    };
}

/* ------------------------------------------------------------
 * Crossings
 *
 * A crossing is a fact about a sequence, so it is read from the feed's own ring
 * (oldest → newest, the newest frame included) and never from two cached
 * values: "crossed above 100" is not "is above 100".
 * ---------------------------------------------------------- */

/** The (at, value) series of a metric over its feed's ring, oldest first. */
function seriesFor(ctx, metric, withinMs) {
    const frames = ctx.history.get(metric.feed) || [];
    const series = [];

    for (const frame of frames) {
        if (withinMs !== null && frame.at !== null && ctx.at - frame.at > withinMs) continue;
        const value = readPath(frame.data, metric.path);
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        series.push({ at: frame.at, value });
    }

    return series;
}

function walkCross(ctx, node, frame) {
    const operands = (node.operands || []).map((operand) => resolveOperand(ctx, operand, frame));
    const above = node.operator === "crossesAbove";
    const withinMs = Number.isFinite(node.withinMs) ? node.withinMs : null;
    const series = seriesFor(ctx, operands[0] || {}, withinMs);

    let refusal = operandRefusal(operands) || numericRefusal(operands);
    let crossing = null;

    if (!refusal) {
        const level = operands[1].value;
        for (let index = 1; index < series.length; index += 1) {
            const previous = series[index - 1];
            const current = series[index];
            const crossed = above
                ? previous.value <= level && current.value > level
                : previous.value >= level && current.value < level;
            if (crossed) {
                crossing = { from: previous.value, to: current.value, at: current.at };
                break;
            }
        }

        /* One frame cannot cross anything: the feed has not been heard from
         * twice inside the window the condition asked about. */
        if (!crossing && series.length < 2) refusal = { index: 0, reason: "not-enough-frames" };
    }

    const outcome = refusal ? OUTCOME.UNKNOWN : (crossing ? OUTCOME.TRUE : OUTCOME.FALSE);

    return {
        operator: node.operator,
        label: node.label || null,
        outcome,
        written: node.written || null,
        withinMs,
        operands,
        series,
        crossing,
        refusal
    };
}

/* ------------------------------------------------------------
 * Counts
 * ---------------------------------------------------------- */

/**
 * Whether a remembered window satisfies the count's test.
 *
 * The arithmetic is monotone, so an incomplete window is not automatically
 * undecided: `atLeast 3` over five frames is already true on three matches
 * (more frames can only add matches), and already false when the frames that
 * are still missing could not reach three. Only windows that could still go
 * either way are unknown.
 */
function countOutcome(test, matched, undecided) {
    const count = Number.isFinite(test.count) ? test.count : 0;

    if (test.field === "atMost") {
        if (matched > count) return OUTCOME.FALSE;
        return matched + undecided <= count ? OUTCOME.TRUE : OUTCOME.UNKNOWN;
    }

    if (test.field === "exactly") {
        if (matched > count || matched + undecided < count) return OUTCOME.FALSE;
        return matched === count && undecided === 0 ? OUTCOME.TRUE : OUTCOME.UNKNOWN;
    }

    /* atLeast */
    if (matched >= count) return OUTCOME.TRUE;
    return matched + undecided < count ? OUTCOME.FALSE : OUTCOME.UNKNOWN;
}

function walkCount(ctx, node, frame) {
    const feed = ctx.binding.feeds[node.feed] || null;
    const window = Number.isFinite(node.window) ? node.window : 0;
    const frames = ctx.history.get(node.feed) || [];
    const taken = frames.slice(-window);

    const slots = taken.map((slot) => {
        /* The slot's own frame: inside a count, a metric of the counted feed
         * resolves against the frame of that slot, not against the last value. */
        const condition = walkCondition(ctx, node.when, { feed: node.feed, data: slot.data, at: slot.at });
        return { at: slot.at, outcome: condition.outcome, condition };
    });

    let matched = 0;
    let undecided = Math.max(0, window - taken.length);

    for (const slot of slots) {
        if (slot.outcome === OUTCOME.TRUE) matched += 1;
        else if (slot.outcome === OUTCOME.UNKNOWN) undecided += 1;
    }

    const outcome = countOutcome(node.test, matched, undecided);

    return {
        operator: "count",
        label: node.label || null,
        feed: node.feed,
        topic: feed ? feed.topic : null,
        window,
        taken: taken.length,
        matched,
        undecided,
        test: node.test,
        slots,
        outcome,
        refusal: outcome === OUTCOME.UNKNOWN
            ? { reason: "not-enough-frames", matched, undecided, window, test: node.test }
            : null
    };
}

/* ------------------------------------------------------------
 * Groups, negation, and the one entry point
 * ---------------------------------------------------------- */

function walkAll(ctx, node, frame) {
    const joined = join((node.nodes || []).map((child) => walkCondition(ctx, child, frame)), "all");
    return { operator: "all", label: node.label || null, ...joined };
}

function walkAny(ctx, node, frame) {
    const joined = join((node.nodes || []).map((child) => walkCondition(ctx, child, frame)), "any");
    return { operator: "any", label: node.label || null, ...joined };
}

function walkNegation(ctx, node, frame) {
    const condition = node.node ? walkCondition(ctx, node.node, frame) : null;
    const outcome = !condition || condition.outcome === OUTCOME.UNKNOWN
        ? OUTCOME.UNKNOWN
        : (condition.outcome === OUTCOME.TRUE ? OUTCOME.FALSE : OUTCOME.TRUE);

    return { operator: "not", label: node.label || null, outcome, condition };
}

/** One condition, whichever shape it has. */
function walkCondition(ctx, node, frame = null) {
    if (!node || typeof node !== "object") {
        return { operator: "unknown", label: null, outcome: OUTCOME.UNKNOWN, refusal: { reason: "no-condition" } };
    }

    switch (node.operator) {
        case "all": return walkAll(ctx, node, frame);
        case "any": return walkAny(ctx, node, frame);
        case "not": return walkNegation(ctx, node, frame);
        case "count": return walkCount(ctx, node, frame);
        case "exists": return walkExistence(ctx, node, frame);
        case "between": return walkBetween(ctx, node, frame);
        case "in": return walkMembership(ctx, node, frame);
        case "crossesAbove":
        case "crossesBelow": return walkCross(ctx, node, frame);
        default: return walkComparison(ctx, node, frame);
    }
}

/* ------------------------------------------------------------
 * The evaluator
 * ---------------------------------------------------------- */

/** A ring bounded by what the plan promised a count may look back over. */
function pushHistory(ring, frame, limit) {
    ring.push(frame);
    while (ring.length > limit) ring.shift();
    return ring;
}

/**
 * One bot, one symbol, one bound plan — the runner owns the lifecycle, this
 * owns the memory of what the feeds said.
 *
 * @param {object}   options
 * @param {object}   options.plan     a compiled plan (dsl-schema.cjs compile)
 * @param {object}   options.binding  bindFeeds(plan, instance)
 * @param {Function} [options.now]    () => ms, the clock every age is measured against
 */
function createEvaluator({ plan, binding, now = () => Date.now() } = {}) {
    if (!plan || !plan.when) throw new Error("evaluator: a compiled plan is required");
    if (!binding || !binding.feeds || !binding.triggerTopic) throw new Error("evaluator: a bound instance is required");

    const vars = (plan.state && plan.state.vars) || {};
    const names = Array.isArray(plan.state && plan.state.names) ? plan.state.names : Object.keys(vars);

    const readings = new Map();   // feed → the frame last heard on it
    const history = new Map();    // feed → the frames the feed kept
    for (const key of Object.keys(binding.feeds)) history.set(key, []);

    const state = {};
    const resets = {};            // name → the time the quiet period expires
    for (const name of names) state[name] = vars[name].init;

    const counters = {
        readings: 0, foreign: 0, triggers: 0,
        evaluations: 0, passed: 0, failed: 0, undecided: 0, signals: 0,
        refusals: {}
    };
    let lastEvaluation = null;

    const clock = (at) => (Number.isFinite(at) ? at : now());

    /** Which feed this bus entry is for, or null when it is not for this bot. */
    function match(entry) {
        const reading = readingFrom(entry);
        if (!reading) return null;

        for (const key of Object.keys(binding.feeds)) {
            const feed = binding.feeds[key];
            if (whyNotReading(reading, feed, binding)) continue;
            return { key, feed, reading };
        }

        return null;
    }

    /** A reading is the feed's value now, and one more frame of its history. */
    function record(key, feed, reading) {
        const frame = {
            at: reading.at,
            data: reading.data,
            topic: reading.topic,
            symbol: reading.symbol,
            exchange: reading.exchange,
            marketType: reading.marketType
        };

        readings.set(key, frame);
        pushHistory(history.get(key), frame, feed.history);
        counters.readings += 1;
        return frame;
    }

    /** A variable whose quiet period has passed is back at its init value. */
    function resetExpired(at) {
        for (const name of Object.keys(resets)) {
            if (at < resets[name]) continue;
            state[name] = vars[name].init;
            delete resets[name];
        }
    }

    /** Why the tree did not fire, in the words a human needs. */
    function refusalFor(trace, ctx) {
        return {
            reason: trace.outcome === OUTCOME.FALSE ? "conditions-false" : "unknown-values",
            falseConditions: trace.refused || [],
            undecidedConditions: trace.undecided || [],
            stale: ctx.stale.map((metric) => metric.alias),
            missing: ctx.missing.map((metric) => metric.alias)
        };
    }

    /** Walk the tree over what the feeds last said. */
    function evaluate({ at = null, trigger = null } = {}) {
        const when = clock(at);
        resetExpired(when);

        const ctx = {
            at: when, plan, binding, state, readings, history,
            metrics: new Map(), stale: [], missing: []
        };
        const trace = walkCondition(ctx, plan.when);

        const evaluation = {
            bot: binding.bot || plan.bot,
            name: binding.name || plan.name,
            symbol: binding.symbol || null,
            asset: binding.asset || null,
            exchange: binding.exchange || null,
            at: when,
            outcome: trace.outcome,
            fired: trace.outcome === OUTCOME.TRUE,
            trigger,
            metrics: [...ctx.metrics.values()],
            stale: ctx.stale,
            missing: ctx.missing,
            state: { ...state },
            conditions: trace
        };

        counters.evaluations += 1;
        if (trace.outcome === OUTCOME.TRUE) counters.passed += 1;
        else if (trace.outcome === OUTCOME.FALSE) counters.failed += 1;
        else counters.undecided += 1;

        if (!evaluation.fired) {
            evaluation.refusal = refusalFor(trace, ctx);
            const reason = evaluation.refusal.reason;
            counters.refusals[reason] = (counters.refusals[reason] || 0) + 1;
        }

        lastEvaluation = evaluation;
        return evaluation;
    }

    /* ------------------------------------------------------------
     * The doors the runner knocks on
     * ---------------------------------------------------------- */

    /**
     * Feed one bus entry to this bot.
     *
     * A non-trigger reading is remembered and stops there: only the trigger feed
     * moves the tree, so a bot waiting on the 5m close does not re-decide on
     * every tick.
     *
     * @returns {object|null} { feed, topic, at, trigger, evaluation }, or null when the
     *                        entry is not a reading this bot feeds on
     */
    function observe(entry, options = {}) {
        const matched = match(entry);
        if (!matched) {
            counters.foreign += 1;
            return null;
        }

        const frame = record(matched.key, matched.feed, matched.reading);
        const at = clock(options.at);
        resetExpired(at);

        if (matched.key !== plan.trigger) {
            return { feed: matched.key, topic: matched.reading.topic, at: frame.at, trigger: false, evaluation: null };
        }

        counters.triggers += 1;
        const evaluation = evaluate({
            at,
            trigger: {
                feed: matched.key,
                topic: matched.reading.topic,
                at: frame.at,
                ageMs: frame.at === null ? null : Math.max(0, at - frame.at)
            }
        });

        return { feed: matched.key, topic: matched.reading.topic, at: frame.at, trigger: true, evaluation };
    }

    /**
     * The signal went out: move the state the plan told us to move.
     *
     * The quiet period starts now, and a bot that keeps firing keeps its counters
     * up until it has been silent for resetAfterMs — so `add 1` together with
     * `resetAfterMs: 1d` reads as "count today's alerts, forget them tomorrow".
     */
    function applySignal({ at = null, action = null } = {}) {
        const when = clock(at);
        const applied = [];

        for (const name of names) {
            const mutation = vars[name].mutation;
            if (!mutation || !mutation.field) continue;

            const from = state[name];
            let to = from;

            if (mutation.field === "set") to = mutation.value;
            else if (mutation.field === "add") to = typeof from === "number" ? from + mutation.value : vars[name].init;
            else if (mutation.field === "toggle") to = !from;

            state[name] = to;
            applied.push({ name, field: mutation.field, from, to });
        }

        for (const name of names) {
            if (Number.isFinite(vars[name].resetAfterMs)) resets[name] = when + vars[name].resetAfterMs;
        }

        counters.signals += 1;
        return { at: when, action, applied, state: { ...state }, resets: { ...resets } };
    }

    /** Everything this bot is holding, as data. */
    function snapshot() {
        const at = now();
        const feeds = {};

        for (const key of Object.keys(binding.feeds)) {
            const frame = readings.get(key) || null;
            feeds[key] = {
                topic: binding.feeds[key].topic,
                at: frame ? frame.at : null,
                ageMs: frame && frame.at !== null ? Math.max(0, at - frame.at) : null,
                history: history.get(key).length,
                symbol: frame ? frame.symbol : null,
                exchange: frame ? frame.exchange : null,
                data: frame ? frame.data : null
            };
        }

        return {
            bot: binding.bot || plan.bot,
            name: binding.name || plan.name,
            symbol: binding.symbol || null,
            asset: binding.asset || null,
            exchange: binding.exchange || null,
            at,
            trigger: plan.trigger,
            triggerTopic: binding.triggerTopic,
            topics: binding.topics,
            state: { ...state },
            resets: { ...resets },
            feeds,
            counters: { ...counters, refusals: { ...counters.refusals } },
            lastEvaluation
        };
    }

    return { plan, binding, observe, evaluate, applySignal, snapshot };
}

module.exports = {
    OUTCOME,
    topicOf,
    readingFrom,
    whyNotReading,
    readPath,
    isMissing,
    createEvaluator
};


/* ============================================================
 * File: bot-engine/core/dsl-schema.cjs
 * Section: bot-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   The strategy document: what it is allowed to say, and what it is refused
 *   for saying. Nothing here evaluates a condition — this file only turns a
 *   document into a plan, or into a list of reasons why it is not one.
 *
 *   Two rules shape every check in this file:
 *
 *   1. A metric is named, never spelled out inline. Every value a condition
 *      compares comes from the `metrics` block — an alias bound to one feed
 *      and one path — and that path is checked against core/catalog.cjs at
 *      load time. A strategy cannot reference a field the analytical layer
 *      does not publish, and a phase-3 canvas can offer a picker built from
 *      the same catalog the validator uses, so the two can never disagree.
 *
 *   2. A document that is refused does not start partially. compileStrategy()
 *      answers either ok:true with a frozen plan or ok:false with every error
 *      found, and the runner has no third state.
 *
 *   Not this file's business: venues, orders, position sizes. `action.size`
 *   and `action.sizeValue` are validated and carried in the signal as an
 *   *intent* — what to do with it is phase 4.
 * ============================================================ */

const {
    ASSET_CLASSES,
    baseAssetOf,
    canonicalSymbol
} = require("../../collector/crypto/common/envelope.cjs");
const { resolvePath, familyOfEvent, isComparable, EVENTS } = require("./catalog.cjs");
const { normalizeBotId } = require("../topics.cjs");

/** The document version. A schema change is a new string, not a new meaning. */
const DSL_VERSION = "bot-engine/1";

const LIMITS = Object.freeze({
    feeds: 24,
    metrics: 64,
    stateVars: 32,
    universe: 32,
    depth: 12,
    nodes: 400,
    history: 500,
    defaultHistory: 20,
    cooldownMs: 86_400_000,
    maxAgeMs: 7 * 86_400_000,
    nameLength: 80,
    keyLength: 40,
    labelLength: 120
});

const LOGIC_OPERATORS = Object.freeze(["all", "any", "not"]);
const COMPARISONS = Object.freeze(["gt", "gte", "lt", "lte", "eq", "neq", "between", "in", "exists"]);
const CROSSES = Object.freeze(["crossesAbove", "crossesBelow"]);
const OPERATORS = Object.freeze([...LOGIC_OPERATORS, ...COMPARISONS, ...CROSSES, "count"]);

const ACTIONS = Object.freeze(["enter", "exit", "close", "alert"]);
const SIDES = Object.freeze(["long", "short", "both", "flat"]);
const SIZES = Object.freeze(["none", "risk_pct", "units"]);
const STATE_TRIGGERS = Object.freeze(["signal"]);

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const FEED_PATTERN = /^[a-z][a-z0-9_]*$/;
const PLACEHOLDER = /^\$\{(asset|symbol)\}$/;

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInt(value, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    return Number.isInteger(value) && value >= min && value <= max;
}

/** A report: every reason a document was refused, in the order they were found. */
function createReport() {
    const errors = [];

    return {
        errors,
        add(code, where, message) {
            errors.push(Object.freeze({ code, where, message }));
            return null;
        },
        ok() {
            return errors.length === 0;
        }
    };
}

/* ------------------------------------------------------------
 * Topics
 * ---------------------------------------------------------- */

/**
 * One feed's topic, read the way analytics-engine/topics.cjs builds it:
 *   analytics.<assetClass>.<asset>.<event>
 * The asset may be a placeholder (`${asset}` / `${symbol}`) — it is resolved
 * per instance at bind time, because one strategy document serves a universe.
 * Returns null for anything that is not a topic of that shape.
 */
function parseFeedTopic(topic) {
    if (typeof topic !== "string" || !topic.trim()) return null;
    if (/\s/.test(topic)) return null;

    const segments = topic.trim().toLowerCase().split(".");
    if (segments.length !== 4) return null;

    const [root, assetClass, asset, eventType] = segments;
    if (root !== "analytics") return null;
    if (!ASSET_CLASSES.includes(assetClass)) return null;
    if (!PLACEHOLDER.test(asset) && !/^[a-z0-9]+$/.test(asset)) return null;

    const family = familyOfEvent(eventType);
    if (!family) return null;

    return Object.freeze({
        topic: segments.join("."),
        root,
        assetClass,
        asset,
        placeholder: PLACEHOLDER.test(asset) ? asset.slice(2, -1) : null,
        eventType,
        family: family.key,
        timeframe: family.timeframe
    });
}

/* ------------------------------------------------------------
 * Feeds
 * ---------------------------------------------------------- */

function validateFeeds(document, report) {
    const raw = document.feeds;
    if (!isPlainObject(raw)) {
        return report.add("missing-feeds", "$.feeds", "a strategy needs a feeds block: no feed, no reading");
    }

    const keys = Object.keys(raw);
    if (!keys.length) return report.add("missing-feeds", "$.feeds", "the feeds block is empty");
    if (keys.length > LIMITS.feeds) {
        return report.add("too-many-feeds", "$.feeds", `${keys.length} feeds is more than the ${LIMITS.feeds} allowed`);
    }

    const feeds = {};

    for (const key of keys) {
        const where = `$.feeds.${key}`;
        if (!FEED_PATTERN.test(key) || key.length > LIMITS.keyLength) {
            report.add("bad-feed-name", where, "a feed name is lower case letters, digits and underscores");
            continue;
        }

        const entry = raw[key];
        if (!isPlainObject(entry)) {
            report.add("bad-feed", where, "a feed is an object: { topic, exchange?, maxAgeMs?, history? }");
            continue;
        }

        for (const field of Object.keys(entry)) {
            if (!["topic", "exchange", "maxAgeMs", "history", "note"].includes(field)) {
                report.add("unknown-field", `${where}.${field}`, `a feed has no field "${field}"`);
            }
        }

        const topic = parseFeedTopic(entry.topic);
        if (!topic) {
            report.add(
                "unknown-topic",
                `${where}.topic`,
                `"${entry.topic}" is not a topic this layer knows: analytics.<assetClass>.<asset>.<event>, with <event> one of the catalog's ${EVENTS.length} events`
            );
            continue;
        }

        if (entry.exchange !== undefined && (typeof entry.exchange !== "string" || !entry.exchange.trim())) {
            report.add("bad-exchange", `${where}.exchange`, "exchange is a venue name, or absent");
            continue;
        }

        const maxAgeMs = entry.maxAgeMs === undefined ? null : entry.maxAgeMs;
        if (maxAgeMs !== null && !isPositiveInt(maxAgeMs, { max: LIMITS.maxAgeMs })) {
            report.add("bad-max-age", `${where}.maxAgeMs`, `maxAgeMs is a positive whole number of milliseconds, at most ${LIMITS.maxAgeMs}`);
            continue;
        }

        const history = entry.history === undefined ? LIMITS.defaultHistory : entry.history;
        if (!isPositiveInt(history, { max: LIMITS.history })) {
            report.add("bad-history", `${where}.history`, `history is a whole number of frames between 1 and ${LIMITS.history}`);
            continue;
        }

        feeds[key] = Object.freeze({
            key,
            topic: topic.topic,
            assetClass: topic.assetClass,
            asset: topic.asset,
            placeholder: topic.placeholder,
            eventType: topic.eventType,
            family: topic.family,
            timeframe: topic.timeframe,
            exchange: entry.exchange === undefined ? null : entry.exchange.trim(),
            maxAgeMs,
            history
        });
    }

    /* Two feeds reading one topic is a copy-paste, not a strategy. */
    const byTopic = new Map();
    for (const feed of Object.values(feeds)) {
        const first = byTopic.get(feed.topic);
        if (first) report.add("duplicate-feed", `$.feeds.${feed.key}`, `"${feed.key}" reads the same topic as "${first}" (${feed.topic})`);
        else byTopic.set(feed.topic, feed.key);
    }

    return Object.keys(feeds).length ? Object.freeze(feeds) : null;
}

/* ------------------------------------------------------------
 * binding — one document, one symbol
 * ---------------------------------------------------------- */

/**
 * A plan is written for a universe; an instance is one symbol on one venue.
 * This resolves a feed's `${asset}` / `${symbol}` placeholder into the topic
 * that instance subscribes to, and keeps the venue per feed (a binance price
 * beside a bybit funding rate is a strategy, not a mistake).
 *
 * A pinned feed — one that names its asset outright — keeps its asset and is
 * marked `pinned: true`, so a consumer can tell a reading of *this* symbol from
 * a reference reading of another.
 */
function bindFeeds(plan, instance = {}) {
    if (!plan || !plan.feeds || !plan.universe) throw new Error("bindFeeds: a compiled plan is required");

    const wanted = instance.symbol === undefined || instance.symbol === null ? null : instance.symbol;
    const symbol = wanted === null ? null : canonicalSymbol(wanted);
    if (wanted !== null && !symbol) throw new Error(`bindFeeds: "${wanted}" is not a symbol`);

    const asset = symbol === null ? null : String(baseAssetOf(symbol)).toLowerCase();
    const venue = instance.exchange || plan.universe.exchange || null;

    const feeds = {};
    for (const [key, feed] of Object.entries(plan.feeds)) {
        if (feed.placeholder && asset === null) {
            throw new Error(`bindFeeds: feed "${key}" is written for \${${feed.placeholder}} — it needs a symbol to become a topic`);
        }

        const segments = feed.topic.split(".");
        if (feed.placeholder) segments[2] = asset;
        const topic = segments.join(".");

        feeds[key] = Object.freeze({
            key,
            topic,
            asset: segments[2],
            assetClass: feed.assetClass,
            eventType: feed.eventType,
            family: feed.family,
            timeframe: feed.timeframe,
            exchange: feed.exchange || venue,
            maxAgeMs: feed.maxAgeMs,
            history: feed.history,
            pinned: !feed.placeholder
        });
    }

    return Object.freeze({
        bot: plan.bot,
        name: plan.name,
        symbol,
        asset,
        exchange: venue,
        feeds: Object.freeze(feeds),
        topics: Object.freeze(Object.values(feeds).map((feed) => feed.topic)),
        triggerTopic: feeds[plan.trigger].topic
    });
}

/* ------------------------------------------------------------
 * Metrics — the aliases a condition is allowed to name
 * ---------------------------------------------------------- */

function validateMetrics(document, feeds, report) {
    const raw = document.metrics;
    if (!isPlainObject(raw)) {
        return report.add(
            "missing-metrics",
            "$.metrics",
            "a strategy names its values: every condition reads a metric, and every metric is { feed, path }"
        );
    }

    const keys = Object.keys(raw);
    if (!keys.length) return report.add("missing-metrics", "$.metrics", "the metrics block is empty");
    if (keys.length > LIMITS.metrics) {
        return report.add("too-many-metrics", "$.metrics", `${keys.length} metrics is more than the ${LIMITS.metrics} allowed`);
    }

    const metrics = {};

    for (const alias of keys) {
        const where = `$.metrics.${alias}`;
        if (!KEY_PATTERN.test(alias) || alias.length > LIMITS.keyLength) {
            report.add("bad-metric-name", where, "a metric name starts with a letter and holds letters, digits and underscores");
            continue;
        }

        const entry = raw[alias];
        if (!isPlainObject(entry)) {
            report.add("bad-metric", where, "a metric is an object: { feed, path, label? }");
            continue;
        }

        for (const field of Object.keys(entry)) {
            if (!["feed", "path", "label"].includes(field)) {
                report.add("unknown-field", `${where}.${field}`, `a metric has no field "${field}"`);
            }
        }

        const feed = feeds[entry.feed];
        if (!feed) {
            report.add("unknown-feed", `${where}.feed`, `"${entry.feed}" is not a feed of this strategy`);
            continue;
        }

        const resolved = resolvePath(feed.family, entry.path);
        if (!resolved) {
            report.add(
                "unknown-path",
                `${where}.path`,
                `the ${feed.eventType} reading has no "${entry.path}" — see core/catalog.cjs (family ${feed.family})`
            );
            continue;
        }

        if (!isComparable(resolved.kind)) {
            report.add(
                "path-not-comparable",
                `${where}.path`,
                `"${entry.path}" is a ${resolved.kind}, not a value a condition may compare (exists is the way to ask)`
            );
            continue;
        }

        metrics[alias] = Object.freeze({
            alias,
            feed: feed.key,
            path: resolved.path,
            pattern: resolved.pattern,
            kind: resolved.kind,
            values: resolved.values,
            label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : alias
        });
    }

    return Object.keys(metrics).length ? metrics : null;
}

/* ------------------------------------------------------------
 * Operands
 * ---------------------------------------------------------- */

/** A metric named by alias, a state variable, or a literal. Never null. */
function validateOperand(operand, context) {
    const { report, where, metrics, stateVars, allowFeeds = null } = context;

    if (operand === null || operand === undefined) {
        return report.add(
            "null-operand",
            where,
            "null is the absence of a value, not a value — ask with exists when the question is whether it is there"
        );
    }

    if (typeof operand === "string") {
        if (operand.startsWith("$state.")) {
            const name = operand.slice("$state.".length);
            if (!stateVars.includes(name)) {
                return report.add("unknown-state", where, `"${name}" is not a variable this strategy declares in state`);
            }
            return Object.freeze({ as: "state", name });
        }

        if (operand.startsWith("$")) {
            const alias = operand.slice(1);
            const metric = metrics[alias];
            if (!metric) {
                return report.add("unknown-metric", where, `"${operand}" is not a metric of this strategy`);
            }
            if (allowFeeds !== null && !allowFeeds.includes(metric.feed)) {
                return report.add(
                    "count-cross-feed",
                    where,
                    `"${operand}" belongs to feed "${metric.feed}", which the counted frames do not carry: a count reads one feed's history`
                );
            }
            return Object.freeze({ as: "metric", alias });
        }

        return Object.freeze({ as: "literal", value: operand });
    }

    if (typeof operand === "number") {
        if (!Number.isFinite(operand)) return report.add("bad-number", where, "a number operand must be finite");
        return Object.freeze({ as: "literal", value: operand });
    }

    if (typeof operand === "boolean") return Object.freeze({ as: "literal", value: operand });

    return report.add("bad-operand", where, "an operand is a metric ($alias), a state variable ($state.x), or a literal");
}

/** A list literal for `in`: literals only, no null, never empty. */
function validateList(list, context) {
    const { report, where } = context;

    if (!Array.isArray(list) || !list.length) {
        return report.add("bad-list", where, "in takes a non-empty list of literals");
    }
    if (list.length > 64) return report.add("bad-list", where, "a list of 64 values is a rule set, not a condition");

    const values = [];
    for (const item of list) {
        if (typeof item !== "number" && typeof item !== "string" && typeof item !== "boolean") {
            report.add("bad-list-item", where, `${JSON.stringify(item)} is not a literal (numbers, strings and booleans only)`);
            continue;
        }
        if (typeof item === "number" && !Number.isFinite(item)) {
            report.add("bad-list-item", where, `${item} is not a finite number`);
            continue;
        }
        values.push(item);
    }

    return values.length === list.length ? Object.freeze(values) : null;
}

/** Both sides of a comparison, as they were written (for the evidence trail). */
function writtenOperand(operand) {
    if (operand && operand.as === "metric") return `$${operand.alias}`;
    if (operand && operand.as === "state") return `$state.${operand.name}`;
    return operand && operand.value;
}

/* ------------------------------------------------------------
 * Conditions
 * ---------------------------------------------------------- */

const NODE_FIELDS = Object.freeze([...OPERATORS, "label", "withinMs"]);

/**
 * One condition, as a tree the evaluator can walk without asking questions.
 * Every refusal here is a document that would otherwise be read as "false"
 * forever: an operator nobody means, a metric nobody declared, a comparison of
 * two constants, a count that would need two feeds at once.
 */
function validateNode(node, context) {
    const { report, where, budget, depth } = context;

    if (depth > LIMITS.depth) {
        return report.add("depth-exceeded", where, `a condition nested ${LIMITS.depth} deep is a rule nobody can read`);
    }
    if (!isPlainObject(node)) {
        return report.add("bad-node", where, "a condition is an object naming one operator");
    }

    budget.nodes += 1;
    if (budget.nodes > LIMITS.nodes) return report.add("too-many-nodes", where, `${LIMITS.nodes} conditions is the limit`);

    const keys = Object.keys(node);
    const named = keys.filter((key) => OPERATORS.includes(key));
    if (named.length !== 1) {
        return report.add("bad-operator", where, `one operator per condition, one of: ${OPERATORS.join(", ")}`);
    }
    for (const key of keys) {
        if (!NODE_FIELDS.includes(key)) report.add("unknown-field", `${where}.${key}`, `a condition has no field "${key}"`);
    }

    const operator = named[0];
    const value = node[operator];
    const at = `${where}.${operator}`;
    const label = typeof node.label === "string" ? node.label.trim() : null;
    if (node.label !== undefined && (label === null || !label || label.length > LIMITS.labelLength)) {
        return report.add("bad-label", `${where}.label`, `label is a string of 1 to ${LIMITS.labelLength} characters`);
    }
    const inner = { ...context, depth: depth + 1 };

    if (operator === "all" || operator === "any") {
        if (!Array.isArray(value) || !value.length) {
            return report.add("bad-arity", at, `${operator} takes a non-empty list of conditions`);
        }
        const nodes = [];
        for (let index = 0; index < value.length; index += 1) {
            const child = validateNode(value[index], { ...inner, where: `${at}[${index}]` });
            if (child) nodes.push(child);
        }
        return nodes.length === value.length
            ? Object.freeze({ operator, label, nodes: Object.freeze(nodes) })
            : null;
    }

    if (operator === "not") {
        const child = validateNode(value, { ...inner, where: at });
        return child ? Object.freeze({ operator, label, node: child }) : null;
    }

    if (operator === "count") {
        if (context.noCount) {
            return report.add("nested-count", at, "a count inside a count: ask that question of a stored frame instead");
        }
        return validateCount(value, { ...inner, where: at, label });
    }

    return validateComparison(operator, value, node, { ...context, where: at, label });
}

/**
 * The leaf conditions: everything that puts a value beside something else.
 * @returns {object|null} the frozen node, or null when it was refused
 */
function validateComparison(operator, value, node, context) {
    const { report, where: at, label, metrics, stateVars, depth, budget, allowFeeds = null } = context;
    const at0 = (operand, where) => validateOperand(operand, { report, where, metrics, stateVars, depth, budget, allowFeeds });

    if (operator === "exists") {
        if (Array.isArray(value)) return report.add("bad-arity", at, "exists takes one metric");
        const operand = at0(value, at);
        if (!operand) return null;
        if (operand.as !== "metric") return report.add("exists-metric", at, 'exists asks about a metric: { "exists": "$alias" }');
        return Object.freeze({ operator, label, operands: Object.freeze([operand]) });
    }

    if (operator === "between") {
        if (!Array.isArray(value) || value.length !== 3) {
            return report.add("bad-arity", at, "between takes [value, low, high]");
        }
        const operands = [0, 1, 2].map((index) => at0(value[index], `${at}[${index}]`));
        if (operands.some((operand) => operand === null)) return null;
        if (operands[0].as !== "metric") return report.add("between-metric", at, "the first value of between is the metric");

        return Object.freeze({
            operator,
            label,
            operands: Object.freeze(operands),
            written: Object.freeze(operands.map(writtenOperand))
        });
    }

    if (operator === "in") {
        if (!Array.isArray(value) || value.length !== 2) {
            return report.add("bad-arity", at, "in takes [value, [list of literals]]");
        }
        const operand = at0(value[0], `${at}[0]`);
        if (!operand) return null;
        if (operand.as !== "metric") return report.add("in-metric", at, "the value of in is a metric");

        const list = validateList(value[1], { report, where: `${at}[1]` });
        return list
            ? Object.freeze({
                operator,
                label,
                operands: Object.freeze([operand]),
                list,
                written: Object.freeze([writtenOperand(operand)])
            })
            : null;
    }

    if (CROSSES.includes(operator)) {
        if (!Array.isArray(value) || value.length !== 2) {
            return report.add("bad-arity", at, `${operator} takes [metric, level]`);
        }
        const first = at0(value[0], `${at}[0]`);
        const second = at0(value[1], `${at}[1]`);
        if (!first || !second) return null;
        if (first.as !== "metric") return report.add("cross-metric", at, `the first side of ${operator} is the metric that crossed`);

        const withinMs = node.withinMs === undefined ? null : node.withinMs;
        if (withinMs !== null && !isPositiveInt(withinMs, { max: LIMITS.maxAgeMs })) {
            return report.add("bad-within", `${at}.withinMs`, "withinMs is a positive whole number of milliseconds");
        }

        return Object.freeze({
            operator,
            label,
            withinMs,
            operands: Object.freeze([first, second]),
            written: Object.freeze([writtenOperand(first), writtenOperand(second)])
        });
    }

    /* gt, gte, lt, lte, eq, neq — two operands, at least one of them a metric. */
    if (!Array.isArray(value) || value.length !== 2) {
        return report.add("bad-arity", at, `${operator} takes [left, right]`);
    }
    const left = at0(value[0], `${at}[0]`);
    const right = at0(value[1], `${at}[1]`);
    if (!left || !right) return null;

    if (left.as === "literal" && right.as === "literal") {
        return report.add(
            "constant-condition",
            at,
            "both sides are literals: that is a constant, not a condition about the market"
        );
    }

    return Object.freeze({
        operator,
        label,
        operands: Object.freeze([left, right]),
        written: Object.freeze([writtenOperand(left), writtenOperand(right)])
    });
}

/* ------------------------------------------------------------
 * count — how often, over the frames a feed kept
 * ---------------------------------------------------------- */

const COUNT_FIELDS = Object.freeze(["feed", "window", "when", "atLeast", "atMost", "exactly", "label"]);

/**
 * count is the one operator that looks backwards, and it looks at ONE feed's
 * stored frames: its sub-condition may only name metrics of the counted feed,
 * because a frame of feed A holds no value of feed B — a count that read
 * today's imbalance while walking yesterday's candles would be a fiction that
 * reads like a fact.
 */
function validateCount(value, context) {
    const { report, where: at, label, feeds, trigger, depth, budget } = context;

    if (!isPlainObject(value)) {
        return report.add("bad-count", at, "count is an object: { feed?, window, when, atLeast? }");
    }
    for (const field of Object.keys(value)) {
        if (!COUNT_FIELDS.includes(field)) report.add("unknown-field", `${at}.${field}`, `count has no field "${field}"`);
    }

    const feedKey = value.feed === undefined ? trigger : value.feed;
    const feed = feeds[feedKey];
    if (!feed) return report.add("unknown-feed", `${at}.feed`, `"${feedKey}" is not a feed of this strategy`);

    if (!isPositiveInt(value.window, { max: LIMITS.history })) {
        return report.add("bad-window", `${at}.window`, `window is a whole number of frames between 1 and ${LIMITS.history}`);
    }
    if (value.window > feed.history) {
        return report.add(
            "window-over-history",
            `${at}.window`,
            `feed "${feedKey}" keeps ${feed.history} frames: ask for ${value.window} or raise its history`
        );
    }

    const node = validateNode(value.when, {
        ...context,
        where: `${at}.when`,
        depth: depth + 1,
        budget,
        allowFeeds: [feedKey],
        noCount: true
    });
    if (!node) return null;

    /* A count may name itself where its window is written, or beside it like any
     * other condition — once, so a list of children cannot show two names for
     * one rule. */
    const nested = typeof value.label === "string" ? value.label.trim() : null;
    if (value.label !== undefined && (nested === null || !nested || nested.length > LIMITS.labelLength)) {
        return report.add("bad-label", `${at}.label`, `label is a string of 1 to ${LIMITS.labelLength} characters`);
    }
    if (nested && label && nested !== label) {
        return report.add("double-label", at, "a count carries its label inside the count block or beside it, not both");
    }
    const selfLabel = nested || label;

    const thresholds = ["atLeast", "atMost", "exactly"].filter((field) => value[field] !== undefined);
    if (thresholds.length > 1) {
        return report.add("count-thresholds", at, "one threshold: atLeast, atMost or exactly");
    }
    const field = thresholds[0] || "atLeast";
    const count = thresholds.length ? value[field] : 1;
    if (!isPositiveInt(count, { max: value.window })) {
        return report.add("bad-threshold", `${at}.${field}`, `${field} is a whole number between 1 and the window (${value.window})`);
    }

    return Object.freeze({
        operator: "count",
        label: selfLabel,
        feed: feedKey,
        window: value.window,
        when: node,
        test: Object.freeze({ field, count })
    });
}

/* ------------------------------------------------------------
 * State — the few things that must be remembered between signals
 * ---------------------------------------------------------- */

const STATE_FIELDS = Object.freeze(["init", "onSignal", "resetAfterMs"]);
const MUTATIONS = Object.freeze(["set", "add", "toggle"]);

/**
 * A state variable is a value the strategy carries, not a value the market
 * published. It only ever changes when a signal fires, and only in one of three
 * named ways — so "how many times did it already fire today" is answered by
 * counting signals, never by guessing.
 */
function validateState(document, report) {
    const empty = Object.freeze({ names: Object.freeze([]), vars: Object.freeze({}) });
    const raw = document.state;
    if (raw === undefined) return empty;
    if (!isPlainObject(raw)) {
        report.add("bad-state", "$.state", "state is an object of variables, or absent");
        return null;
    }

    const names = Object.keys(raw);
    if (names.length > LIMITS.stateVars) {
        report.add("too-many-state", "$.state", `${names.length} variables is more than the ${LIMITS.stateVars} allowed`);
        return null;
    }

    const vars = {};
    for (const name of names) {
        const where = `$.state.${name}`;
        if (!KEY_PATTERN.test(name) || name.length > LIMITS.keyLength) {
            report.add("bad-state-name", where, "a variable name starts with a letter and holds letters, digits and underscores");
            continue;
        }

        const entry = raw[name];
        if (!isPlainObject(entry)) {
            report.add("bad-state-var", where, "a variable is { init, onSignal?, resetAfterMs? }");
            continue;
        }
        for (const field of Object.keys(entry)) {
            if (!STATE_FIELDS.includes(field)) report.add("unknown-field", `${where}.${field}`, `a variable has no field "${field}"`);
        }

        const init = entry.init;
        const initType = typeof init;
        if (!["number", "string", "boolean"].includes(initType) || (initType === "number" && !Number.isFinite(init))) {
            report.add("bad-state-init", `${where}.init`, "init is a finite number, a string or a boolean — null is not a value");
            continue;
        }

        const resetAfterMs = entry.resetAfterMs === undefined ? null : entry.resetAfterMs;
        if (resetAfterMs !== null && !isPositiveInt(resetAfterMs, { max: LIMITS.maxAgeMs })) {
            report.add("bad-reset", `${where}.resetAfterMs`, "resetAfterMs is a positive whole number of milliseconds");
            continue;
        }

        const mutation = validateMutation(entry.onSignal, { report, where: `${where}.onSignal`, initType });
        if (mutation === null) continue;

        vars[name] = Object.freeze({ name, init, type: initType, mutation, resetAfterMs });
    }

    const settled = Object.keys(vars);
    return settled.length === names.length
        ? Object.freeze({ names: Object.freeze(settled), vars: Object.freeze(vars) })
        : null;
}

/** What a signal does to a variable: nothing, set, add, or toggle. */
function validateMutation(raw, { report, where, initType }) {
    const none = Object.freeze({ field: null, value: null });
    if (raw === undefined) return none;
    if (!isPlainObject(raw)) {
        report.add("bad-mutation", where, "onSignal is { set: v } | { add: n } | { toggle: true }");
        return null;
    }

    const fields = Object.keys(raw).filter((field) => MUTATIONS.includes(field));
    if (fields.length !== 1) {
        report.add("bad-mutation", where, "one of set, add or toggle");
        return null;
    }

    const field = fields[0];
    const value = raw[field];

    if (field === "toggle") {
        if (value !== true) report.add("bad-mutation", `${where}.toggle`, "toggle is true");
        else if (initType !== "boolean") report.add("state-type", where, `it starts as a ${initType}: it cannot toggle`);
        else return Object.freeze({ field, value: true });
        return null;
    }

    if (field === "add") {
        if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
            report.add("bad-mutation", `${where}.add`, "add is a non-zero finite number");
            return null;
        }
        if (initType !== "number") {
            report.add("state-type", where, `it starts as a ${initType}: it cannot be added to`);
            return null;
        }
        return Object.freeze({ field, value });
    }

    if (!["number", "string", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) {
        report.add("bad-mutation", `${where}.set`, "set is a finite number, a string or a boolean");
        return null;
    }
    if (typeof value !== initType) {
        report.add("state-type", where, `it starts as a ${initType}: set must be a ${initType}`);
        return null;
    }

    return Object.freeze({ field, value });
}

/* ------------------------------------------------------------
 * Walking a condition tree
 * ---------------------------------------------------------- */

/**
 * Every metric a condition names, counts included (a count's sub-condition
 * names metrics too). `throughCounts: false` is the narrower question the
 * compiler asks when it wants to know which feeds a condition reads a *live*
 * value from — a count reads stored frames of its own feed instead.
 */
function collectMetricRefs(node, out = new Set(), { throughCounts = true } = {}) {
    if (!node || typeof node !== "object") return out;

    if (node.operator === "all" || node.operator === "any") {
        for (const child of node.nodes) collectMetricRefs(child, out, { throughCounts });
        return out;
    }
    if (node.operator === "not") return collectMetricRefs(node.node, out, { throughCounts });
    if (node.operator === "count") {
        return throughCounts ? collectMetricRefs(node.when, out, { throughCounts }) : out;
    }

    for (const operand of node.operands || []) {
        if (operand.as === "metric") out.add(operand.alias);
    }
    return out;
}

/** Every state variable a condition reads (counts included: a frame test may consult one). */
function collectStateRefs(node, out = new Set()) {
    if (!node || typeof node !== "object") return out;

    if (node.operator === "all" || node.operator === "any") {
        for (const child of node.nodes) collectStateRefs(child, out);
        return out;
    }
    if (node.operator === "not") return collectStateRefs(node.node, out);
    if (node.operator === "count") return collectStateRefs(node.when, out);

    for (const operand of node.operands || []) {
        if (operand.as === "state") out.add(operand.name);
    }
    return out;
}

/** The feeds a condition reads a live value from (a count's frames are not live reads). */
function collectFeedRefs(node, metrics, out = new Set()) {
    for (const alias of collectMetricRefs(node, new Set(), { throughCounts: false })) {
        if (metrics[alias]) out.add(metrics[alias].feed);
    }
    return out;
}

/* ------------------------------------------------------------
 * Universe — which symbols one document becomes
 * ---------------------------------------------------------- */

const UNIVERSE_FIELDS = Object.freeze(["symbols", "exchange"]);

/**
 * One document, many instances. A feed whose asset is written `${asset}` or
 * `${symbol}` is resolved per instance; a feed that names an asset outright
 * keeps it (a reference reading is a real thing to want: ETH's book under a
 * BTC strategy). An empty universe is allowed — the runner may start instances
 * explicitly, one symbol at a time.
 */
function validateUniverse(document, report) {
    const raw = document.universe;
    if (raw === undefined) return Object.freeze({ symbols: Object.freeze([]), exchange: null });

    if (!isPlainObject(raw)) {
        report.add("bad-universe", "$.universe", "universe is { symbols, exchange? }, or absent");
        return null;
    }
    for (const field of Object.keys(raw)) {
        if (!UNIVERSE_FIELDS.includes(field)) report.add("unknown-field", `$.universe.${field}`, `universe has no field "${field}"`);
    }

    if (!Array.isArray(raw.symbols) || !raw.symbols.length) {
        report.add("bad-universe", "$.universe.symbols", "a non-empty list of symbols");
        return null;
    }
    if (raw.symbols.length > LIMITS.universe) {
        report.add("too-many-symbols", "$.universe.symbols", `${raw.symbols.length} symbols is more than the ${LIMITS.universe} allowed`);
        return null;
    }

    if (raw.exchange !== undefined && (typeof raw.exchange !== "string" || !raw.exchange.trim())) {
        report.add("bad-exchange", "$.universe.exchange", "exchange is a venue name, or absent");
        return null;
    }

    const symbols = [];
    const seen = new Set();
    for (const entry of raw.symbols) {
        const symbol = canonicalSymbol(typeof entry === "string" ? entry : null);
        if (!symbol) {
            report.add("bad-symbol", "$.universe.symbols", `"${entry}" is not a symbol — neither a venue ticker nor a base asset`);
            continue;
        }
        if (seen.has(symbol)) {
            report.add("duplicate-symbol", "$.universe.symbols", `"${symbol}" is listed twice`);
            continue;
        }
        seen.add(symbol);
        symbols.push(Object.freeze({ symbol, asset: String(baseAssetOf(symbol)).toLowerCase() }));
    }

    if (symbols.length !== raw.symbols.length) return null;
    return Object.freeze({
        symbols: Object.freeze(symbols),
        exchange: raw.exchange === undefined ? null : raw.exchange.trim()
    });
}

/* ------------------------------------------------------------
 * Action — what a signal says to do, not how
 * ---------------------------------------------------------- */

const ACTION_FIELDS = Object.freeze(["type", "side", "size", "sizeValue", "severity", "note"]);
const ENTER_SIDES = Object.freeze(["long", "short"]);
const EXIT_SIDES = Object.freeze(["long", "short", "both"]);
const SEVERITIES = Object.freeze(["info", "warning", "critical"]);

/**
 * `size` and `sizeValue` are an intent, carried in the signal and executed by
 * nobody here: this layer has no venue, no keypad and no key. The point of
 * validating them is that a phase-4 executor receives one shape and never has
 * to guess what "1" meant.
 */
function validateAction(document, report) {
    const raw = document.action;
    if (!isPlainObject(raw)) {
        return report.add("missing-action", "$.action", "a strategy says what a signal means: enter, exit, close or alert");
    }
    for (const field of Object.keys(raw)) {
        if (!ACTION_FIELDS.includes(field)) report.add("unknown-field", `$.action.${field}`, `an action has no field "${field}"`);
    }

    const type = raw.type;
    if (!ACTIONS.includes(type)) {
        return report.add("bad-action", "$.action.type", `type is one of: ${ACTIONS.join(", ")}`);
    }
    if (raw.note !== undefined && (typeof raw.note !== "string" || raw.note.length > 200)) {
        report.add("bad-note", "$.action.note", "note is a string of at most 200 characters");
    }

    const side = raw.side === undefined ? null : raw.side;
    if (type === "enter" && !ENTER_SIDES.includes(side)) {
        report.add("bad-side", "$.action.side", 'enter needs a side: "long" or "short"');
    }
    if (type === "exit" && !EXIT_SIDES.includes(side)) {
        report.add("bad-side", "$.action.side", 'exit needs a side: "long", "short" or "both"');
    }
    if ((type === "close" || type === "alert") && side !== null) {
        report.add("side-not-allowed", "$.action.side", `${type} is not about one side`);
    }

    const size = raw.size === undefined ? "none" : raw.size;
    if (!SIZES.includes(size)) {
        report.add("bad-size", "$.action.size", `size is one of: ${SIZES.join(", ")}`);
    } else if ((type === "close" || type === "alert") && size !== "none") {
        report.add("size-not-allowed", "$.action.size", `${type} takes no size`);
    }

    const sizeValue = raw.sizeValue === undefined ? null : raw.sizeValue;
    if (sizeValue !== null && (typeof sizeValue !== "number" || !Number.isFinite(sizeValue) || sizeValue <= 0)) {
        report.add("bad-size-value", "$.action.sizeValue", "sizeValue is a positive finite number");
    } else if (sizeValue !== null && size === "none") {
        report.add("bad-size-value", "$.action.sizeValue", "sizeValue says nothing when size is none");
    } else if (sizeValue !== null && size === "risk_pct" && sizeValue > 100) {
        report.add("bad-size-value", "$.action.sizeValue", "a risk of more than 100% of the account is not a size, it is a hope");
    } else if (size !== "none" && sizeValue === null && SIZES.includes(size)) {
        report.add("missing-size-value", "$.action.sizeValue", `size "${size}" needs a sizeValue`);
    }

    const severity = raw.severity === undefined ? (type === "alert" ? "info" : null) : raw.severity;
    if (type === "alert" && !SEVERITIES.includes(severity)) {
        report.add("bad-severity", "$.action.severity", `severity is one of: ${SEVERITIES.join(", ")}`);
    }
    if (type !== "alert" && raw.severity !== undefined) {
        report.add("severity-not-allowed", "$.action.severity", "severity belongs to an alert");
    }

    return Object.freeze({
        type,
        side,
        size,
        sizeValue,
        severity: type === "alert" ? severity : null,
        note: typeof raw.note === "string" ? raw.note : null
    });
}

/* ------------------------------------------------------------
 * The document
 * ---------------------------------------------------------- */

const ROOT_FIELDS = Object.freeze([
    "version",
    "name",
    "bot",
    "description",
    "enabled",
    "universe",
    "trigger",
    "feeds",
    "metrics",
    "state",
    "when",
    "action",
    "cooldownMs",
    "once"
]);

function validateHeader(document, report) {
    const before = report.errors.length;
    for (const field of Object.keys(document)) {
        if (!ROOT_FIELDS.includes(field)) report.add("unknown-field", `$.${field}`, `a strategy has no field "${field}"`);
    }

    if (document.version !== DSL_VERSION) {
        report.add(
            "version-mismatch",
            "$.version",
            `this layer reads "${DSL_VERSION}" documents; "${
                document.version === undefined ? "(missing)" : document.version
            }" is not one`
        );
    }

    const name = document.name;
    if (typeof name !== "string" || !name.trim() || name.trim().length > LIMITS.nameLength) {
        report.add("bad-name", "$.name", `name is a string of 1 to ${LIMITS.nameLength} characters`);
    }

    const rawBot = document.bot === undefined ? name : document.bot;
    const bot = normalizeBotId(rawBot);
    if (!bot) report.add("bad-bot", "$.bot", "a bot id comes from the name; if you write one, it must have a letter or digit in it");

    if (document.description !== undefined && (typeof document.description !== "string" || document.description.length > 500)) {
        report.add("bad-description", "$.description", "description is a string of at most 500 characters");
    }
    if (document.enabled !== undefined && typeof document.enabled !== "boolean") {
        report.add("bad-enabled", "$.enabled", "enabled is true or false");
    }

    const cooldownMs = document.cooldownMs === undefined ? 0 : document.cooldownMs;
    if (!isPositiveInt(cooldownMs, { min: 0, max: LIMITS.cooldownMs })) {
        report.add("bad-cooldown", "$.cooldownMs", `cooldownMs is a whole number of milliseconds from 0 to ${LIMITS.cooldownMs}`);
    }

    if (document.once !== undefined && typeof document.once !== "boolean") {
        report.add("bad-once", "$.once", "once is true or false");
    }

    if (report.errors.length !== before) return null;

    return Object.freeze({
        version: DSL_VERSION,
        name: name.trim(),
        bot,
        description: document.description === undefined ? null : document.description,
        enabled: document.enabled === undefined ? true : document.enabled,
        cooldownMs,
        once: document.once === undefined ? false : document.once
    });
}

/**
 * Which feed starts an evaluation. This is the answer to the cadence problem:
 * a strategy is evaluated when its trigger speaks, and every other feed is
 * read from the last value it published — never waited for, never assumed
 * fresh, always carrying its ageMs in the evidence.
 */
function resolveTrigger(raw, feeds, report) {
    const keys = Object.keys(feeds);

    if (raw === undefined) {
        if (keys.length === 1) return keys[0];
        return report.add(
            "missing-trigger",
            "$.trigger",
            `with ${keys.length} feeds, say which one starts an evaluation — one of: ${keys.join(", ")}`
        );
    }
    if (typeof raw !== "string" || !feeds[raw]) {
        return report.add("unknown-trigger", "$.trigger", `"${raw}" is not a feed of this strategy (${keys.join(", ")})`);
    }
    return raw;
}

/* ------------------------------------------------------------
 * compileStrategy — the whole document, or the reasons it is not one
 * ---------------------------------------------------------- */

/**
 * Turn a strategy document into a plan the evaluator can walk, or into every
 * refusal found on the way.
 *
 *   { ok: true,  version, plan, errors: [] }
 *   { ok: false, version, errors: [{ code, where, message }, …] }
 *
 * There is no third answer and no partial plan: the runner either has a frozen
 * plan or it has a list of sentences explaining why it does not.
 */
function compileStrategy(document) {
    const report = createReport();
    const fail = () => {
        /* A section that refuses without saying why leaves the caller holding an
         * empty list, and an empty list of reasons looks like a document with no
         * problems. That can only mean a validator returned nothing without
         * adding an error, so say that instead of nothing. */
        if (!report.errors.length) {
            report.add(
                "silent-refusal",
                "$",
                "this document was refused without a reason: a validator in core/dsl-schema.cjs returned nothing without reporting an error"
            );
        }
        return Object.freeze({ ok: false, version: DSL_VERSION, errors: Object.freeze(report.errors.slice()) });
    };

    if (!isPlainObject(document)) {
        report.add("bad-document", "$", "a strategy document is an object");
        return fail();
    }

    const header = validateHeader(document, report);
    const feeds = validateFeeds(document, report);
    const metrics = feeds ? validateMetrics(document, feeds, report) : null;
    const state = validateState(document, report);
    const universe = validateUniverse(document, report);
    const action = validateAction(document, report);
    if (!header || !feeds || !metrics || !state || !universe || !action) return fail();

    const trigger = resolveTrigger(document.trigger, feeds, report);
    if (trigger === null) return fail();

    const when = validateNode(document.when, {
        report,
        where: "$.when",
        budget: { nodes: 0 },
        depth: 1,
        feeds,
        metrics,
        stateVars: state.names,
        trigger,
        allowFeeds: null,
        noCount: false
    });
    if (!when) return fail();

    /* A feed a condition reads live must say how old a value may be: this is
     * what stops a disconnected 15m feed from feeding a 1m decision forever. */
    for (const feedKey of collectFeedRefs(when, metrics)) {
        if (feedKey === trigger) continue;
        if (feeds[feedKey].maxAgeMs === null) {
            report.add(
                "no-staleness-bound",
                `$.feeds.${feedKey}`,
                `"${feedKey}" is read by a condition without being the trigger: give it a maxAgeMs, so a value from an hour ago cannot pass for a live one`
            );
        }
    }

    /* A metric nobody reads is almost always a typo in the condition — and a
     * typo in a condition is a bot that looks healthy and never fires. */
    const used = collectMetricRefs(when);
    for (const alias of Object.keys(metrics)) {
        if (!used.has(alias)) report.add("unused-metric", `$.metrics.${alias}`, `"${alias}" is declared but no condition reads it`);
    }

    if (!report.ok()) return fail();

    const plan = Object.freeze({
        version: header.version,
        name: header.name,
        bot: header.bot,
        description: header.description,
        enabled: header.enabled,
        universe,
        trigger,
        feeds,
        metrics: Object.freeze(metrics),
        state,
        when,
        action,
        cooldownMs: header.cooldownMs,
        once: header.once,
        metricsUsed: Object.freeze(Array.from(used).sort()),
        feedsUsed: Object.freeze(Array.from(collectFeedRefs(when, metrics)).sort())
    });

    return Object.freeze({ ok: true, version: DSL_VERSION, plan, errors: Object.freeze([]) });
}

/** The errors of a refused document as lines, for a CLI or a panel. */
function formatErrors(errors) {
    return (errors || []).map((error) => `${error.where}: ${error.message}`).join("\n");
}

/* ------------------------------------------------------------
 * EXAMPLE — a document that compiles, kept compiling by the tests
 * ---------------------------------------------------------- */

function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

/**
 * The shape of a real strategy: aggressive buyers on the merged tape, a book
 * leaning bid, funding that is not yet crowded — three readings that arrive at
 * three different rates, which is exactly why `trigger` has to exist. The
 * count asks the tape for 3 of its last 5 frames; the state variable stops the
 * bot after three alerts a day.
 *
 * The tests compile this document, so it cannot drift away from the schema.
 */
const EXAMPLE = deepFreeze({
    version: DSL_VERSION,
    name: "squeeze confluence",
    bot: "squeeze-confluence",
    description: "1m aggressive buying, a bid-leaning book, and funding that has not priced it in yet.",
    universe: { symbols: ["BTCUSDT", "ETHUSDT"], exchange: "binance" },
    trigger: "flow",
    feeds: {
        flow: { topic: "analytics.crypto.${asset}.cvd", maxAgeMs: 60_000, history: 30 },
        book: { topic: "analytics.crypto.${asset}.orderbook_imbalance", maxAgeMs: 120_000 },
        funding: { topic: "analytics.crypto.${asset}.oi_weighted_funding", maxAgeMs: 3_600_000 }
    },
    metrics: {
        cvd: { feed: "flow", path: "aggregate.cvd", label: "merged cumulative volume delta" },
        takerRatio: { feed: "flow", path: "aggregate.takerBuyRatio", label: "taker buy ratio" },
        imbalance: { feed: "book", path: "weightedImbalance", label: "weighted book imbalance" },
        bookBias: { feed: "book", path: "bias" },
        fundingAnnualized: { feed: "funding", path: "weightedAnnualized", label: "OI-weighted funding, annualised" }
    },
    state: {
        signals: { init: 0, onSignal: { add: 1 }, resetAfterMs: 86_400_000 }
    },
    when: {
        all: [
            { count: { feed: "flow", window: 5, atLeast: 3, when: { gt: ["$cvd", 0] }, label: "three of the last five frames bought" } },
            { gt: ["$takerRatio", 1.1], label: "the aggressors are buyers" },
            { gt: ["$imbalance", 0.05], label: "the book leans bid" },
            { in: ["$bookBias", ["bid", "flat"]] },
            { lt: ["$fundingAnnualized", 0.5], label: "funding has not priced it in" },
            { lt: ["$state.signals", 3], label: "at most three alerts a day" }
        ]
    },
    action: { type: "alert", severity: "warning", note: "long bias — an alert, not an order" },
    cooldownMs: 900_000
});

module.exports = {
    DSL_VERSION,
    LIMITS,
    OPERATORS,
    LOGIC_OPERATORS,
    COMPARISONS,
    CROSSES,
    ACTIONS,
    SIDES,
    SIZES,
    SEVERITIES,
    ENTER_SIDES,
    EXIT_SIDES,
    parseFeedTopic,
    compileStrategy,
    formatErrors,
    bindFeeds,
    collectMetricRefs,
    collectStateRefs,
    collectFeedRefs,
    EXAMPLE
};

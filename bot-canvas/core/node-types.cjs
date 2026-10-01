/* ============================================================
 * File: bot-canvas/core/node-types.cjs
 * Section: bot-canvas/core
 * Version: 1.0.0
 *
 * Role:
 *   The palette: what a canvas node may be, which ports it has, and what it
 *   may be told. Every entry here is derived from the two files that already
 *   know the answer — core/catalog.cjs for the paths a reading publishes and
 *   core/dsl-schema.cjs for the operators, actions and limits — so the canvas
 *   can never offer a value the evaluator would refuse to read, and can never
 *   grow a second list of paths that drifts from the first.
 *
 *   Two rules shape this file:
 *
 *   1. A PORT HAS A KIND AND A KIND HAS A MEANING. `feed` carries readings,
 *      `scalar`/`string`/`boolean` carry the three kinds a condition may
 *      compare, and `any` is the honest answer when the kind is not known yet
 *      (a metric with no path chosen, a constant nobody typed). `any` connects
 *      to anything: a mismatch is reported when it is known, never guessed.
 *
 *   2. AN OPERATOR NODE WRITES ONE DSL OPERATOR. The type of a condition node
 *      IS the operator it compiles to (`gt` is `{ gt: [...] }`), so a reader
 *      can go from the canvas to core/dsl-schema.cjs without a translation
 *      table, and OPERATORS is imported rather than restated.
 * ============================================================ */

const {
    KIND,
    COMPARABLE,
    EVENTS,
    FAMILIES,
    EXAMPLES,
    familyOfEvent,
    pathsOf,
    resolvePath,
    isEnum,
    enumValues,
    isComparable
} = require("../../bot-engine/core/catalog.cjs");
const { ASSET_CLASSES } = require("../../collector/crypto/common/envelope.cjs");
const {
    LIMITS,
    OPERATORS,
    LOGIC_OPERATORS,
    COMPARISONS,
    CROSSES,
    ACTIONS,
    SIDES,
    SIZES,
    SEVERITIES,
    KEY_PATTERN,
    FEED_PATTERN,
    MUTATIONS
} = require("../../bot-engine/core/dsl-schema.cjs");

/* A port's kind. The three value kinds are the catalog's own comparable kinds
 * (core/catalog.cjs KIND), so "what may a condition compare" is asked once. */
const PORT_KIND = Object.freeze({
    FEED: "feed",
    SCALAR: KIND.SCALAR,
    STRING: KIND.STRING,
    BOOLEAN: KIND.BOOLEAN,
    ANY: "any"
});

/** Which shelf of the palette a node sits on. */
const ROLE = Object.freeze({
    STRATEGY: "strategy",
    SOURCE: "source",
    VALUE: "value",
    LOGIC: "logic",
    COMPARE: "compare",
    ACTION: "action"
});

/** What a setting is, so a form can be drawn and a value checked. */
const SETTING = Object.freeze({
    TEXT: "text",
    TEXTAREA: "textarea",
    INT: "int",
    NUMBER: "number",
    BOOL: "bool",
    ENUM: "enum",
    LIST: "list",
    VALUE: "value",
    SYMBOLS: "symbols",
    PATH: "path",
    MUTATION: "mutation"
});

const ROLE_ORDER = Object.freeze([ROLE.STRATEGY, ROLE.SOURCE, ROLE.VALUE, ROLE.LOGIC, ROLE.COMPARE, ROLE.ACTION]);

function freezePort(spec) {
    return Object.freeze({
        required: false,
        variadic: false,
        inline: false,
        metricOnly: false,
        title: spec.name,
        hint: null,
        ...spec
    });
}

function freezeSetting(spec) {
    return Object.freeze({
        required: false,
        values: null,
        min: null,
        max: null,
        maxLength: null,
        inline: false,
        /* A setting the canvas needs and the document does not have: what a
         * compiler reads a strategy from can be told more than a document can
         * hold — which blocks were written empty, whether a trigger was
         * implied — and a compiler that wrote those into bot.json would be
         * writing a field the DSL refuses. Marked here so it is written down
         * once, in the file that owns the palette. */
        canvasOnly: false,
        hint: null,
        title: spec.key,
        ...spec
    });
}

/** A node type: a role, ports, settings, and the DSL shape it stands for. */
function freezeType(spec) {
    return Object.freeze({
        role: null,
        operator: null,
        writes: null,
        inputs: Object.freeze([]),
        outputs: Object.freeze([]),
        settings: Object.freeze([]),
        ...spec,
        inputs: Object.freeze((spec.inputs || []).map(freezePort)),
        outputs: Object.freeze((spec.outputs || []).map(freezePort)),
        settings: Object.freeze((spec.settings || []).map(freezeSetting))
    });
}

/* ------------------------------------------------------------
 * The palette
 * ---------------------------------------------------------- */

/** How a value port is described: its kind is derived, not declared. */
const DERIVED = Object.freeze({
    derived: true,
    hint: "the kind is read from what the node was told: scalar, string or boolean"
});

const STRATEGY_TYPE = freezeType({
    role: ROLE.STRATEGY,
    title: "Strategy",
    hint: "the document itself: what it is called, which symbols it becomes, and how often it may fire",
    writes: "the root of bot.json",
    inputs: [{
        name: "trigger",
        kind: PORT_KIND.FEED,
        title: "trigger",
        hint: "the feed whose reading starts an evaluation; with one feed it is that feed, with several the strategy must say"
    }],
    settings: [
        { key: "name", kind: SETTING.TEXT, required: true, maxLength: LIMITS.nameLength, hint: "what this bot is called" },
        { key: "bot", kind: SETTING.TEXT, maxLength: LIMITS.keyLength, hint: "the id its signals carry; taken from the name when absent" },
        { key: "description", kind: SETTING.TEXTAREA, maxLength: 500 },
        { key: "enabled", kind: SETTING.BOOL, hint: "absent means true" },
        {
            key: "symbols",
            kind: SETTING.SYMBOLS,
            max: LIMITS.universe,
            title: "symbols",
            hint: "one instance per symbol; an empty list is a universe the runner starts by hand"
        },
        { key: "exchange", kind: SETTING.TEXT, hint: "the venue for every feed that does not name one" },
        { key: "cooldownMs", kind: SETTING.INT, min: 0, max: LIMITS.cooldownMs, hint: "the least time between two signals" },
        { key: "once", kind: SETTING.BOOL, hint: "fire once per instance, ever" },
        {
            key: "implicitTrigger",
            kind: SETTING.BOOL,
            canvasOnly: true,
            title: "trigger was implied",
            hint: "the document wrote no trigger key: with one feed the DSL reads that feed as the one that starts an evaluation"
        },
        {
            key: "emptyBlocks",
            kind: SETTING.LIST,
            values: ["feeds", "metrics", "state", "universe"],
            canvasOnly: true,
            title: "blocks written empty",
            hint: "canvas bookkeeping: a block the document wrote with nothing in it, which no node can draw"
        }
    ]
});

const FEED_TYPE = freezeType({
    role: ROLE.SOURCE,
    title: "Feed",
    hint: "one topic the bot subscribes to: analytics.<assetClass>.<asset>.<event>",
    writes: "$.feeds.<key>",
    outputs: [{ name: "out", kind: PORT_KIND.FEED, title: "readings", hint: "the frames this feed keeps, oldest first" }],
    settings: [
        { key: "key", kind: SETTING.TEXT, required: true, maxLength: LIMITS.keyLength, title: "name", hint: "lower case letters, digits and underscores — the key a metric points at" },
        { key: "assetClass", kind: SETTING.ENUM, required: true, values: ASSET_CLASSES },
        { key: "asset", kind: SETTING.TEXT, required: true, hint: "${asset} for the universe's symbol, or one asset to pin the reading to it" },
        { key: "eventType", kind: SETTING.ENUM, required: true, values: EVENTS, title: "event", hint: "a family of the catalog, with its timeframe when it has one" },
        { key: "exchange", kind: SETTING.TEXT },
        {
            key: "maxAgeMs",
            kind: SETTING.INT,
            min: 1,
            max: LIMITS.maxAgeMs,
            title: "max age",
            hint: "how old a reading may be before it stops counting; required unless this feed is the trigger"
        },
        { key: "history", kind: SETTING.INT, min: 1, max: LIMITS.history, hint: "how many frames to keep, for count" },
        { key: "note", kind: SETTING.TEXTAREA, maxLength: 200, canvasOnly: true, hint: "a comment for whoever reads the canvas: the DSL's feed has no note field" }
    ]
});

const METRIC_TYPE = freezeType({
    role: ROLE.VALUE,
    title: "Metric",
    hint: "an alias bound to one path inside one feed's reading — the only thing a condition may name",
    writes: "$.metrics.<alias>",
    inputs: [{ name: "feed", kind: PORT_KIND.FEED, required: true, title: "feed", hint: "which feed publishes this value" }],
    outputs: [{ name: "out", kind: PORT_KIND.ANY, ...DERIVED, title: "value" }],
    settings: [
        { key: "alias", kind: SETTING.TEXT, required: true, maxLength: LIMITS.keyLength, title: "alias", hint: "the name a condition writes as $alias" },
        { key: "path", kind: SETTING.PATH, required: true, title: "path", hint: "a path the feed's event publishes, from core/catalog.cjs" },
        { key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength, hint: "what this value means, in words" }
    ]
});

const STATE_TYPE = freezeType({
    role: ROLE.VALUE,
    title: "State variable",
    hint: "a value the strategy remembers between signals; it changes when a signal fires, in one of three named ways",
    writes: "$.state.<name>",
    outputs: [{ name: "out", kind: PORT_KIND.ANY, ...DERIVED, title: "value" }],
    settings: [
        { key: "name", kind: SETTING.TEXT, required: true, maxLength: LIMITS.keyLength },
        { key: "init", kind: SETTING.VALUE, required: true, hint: "a finite number, a string or a boolean — null is not a value" },
        { key: "onSignal", kind: SETTING.MUTATION, title: "on signal", hint: `one of: ${MUTATIONS.join(", ")}, or absent to leave it alone` },
        { key: "resetAfterMs", kind: SETTING.INT, min: 1, max: LIMITS.maxAgeMs, hint: "how long it keeps its value before it goes back to init" }
    ]
});

const CONSTANT_TYPE = freezeType({
    role: ROLE.VALUE,
    title: "Constant",
    hint: "a number, a word or a flag written into a comparison; two constants compared with each other are refused",
    writes: "an operand, inlined into the condition",
    outputs: [{ name: "out", kind: PORT_KIND.ANY, ...DERIVED, title: "value" }],
    settings: [{ key: "value", kind: SETTING.VALUE, required: true }]
});

/** all and any: one list of conditions, and what the list means. */
function logicType(operator, title, hint) {
    return freezeType({
        role: ROLE.LOGIC,
        operator,
        title,
        hint,
        writes: `{ ${operator}: [ …conditions ] }`,
        inputs: [{
            name: "in",
            kind: PORT_KIND.BOOLEAN,
            required: true,
            variadic: true,
            title: "conditions",
            hint: "every wire into this port is one child, in the order the ports are numbered"
        }],
        outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition", hint: "true when the list does" }],
        settings: [{ key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength, hint: "the words this rule is read as" }]
    });
}

const NOT_TYPE = freezeType({
    role: ROLE.LOGIC,
    operator: "not",
    title: "not",
    hint: "the opposite of one condition — the only place a shortage of buying is said directly",
    writes: "{ not: <condition> }",
    inputs: [{ name: "in", kind: PORT_KIND.BOOLEAN, required: true, title: "condition", hint: "the condition to invert" }],
    outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition" }],
    settings: [{ key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength }]
});

const COUNT_TYPE = freezeType({
    role: ROLE.LOGIC,
    operator: "count",
    title: "count",
    hint: "how often a condition held, over the frames ONE feed kept — it looks backwards, so it reads one feed's history",
    writes: "{ count: { feed?, window, atLeast, when } }",
    inputs: [
        { name: "when", kind: PORT_KIND.BOOLEAN, required: true, title: "the frame test", hint: "asked of each kept frame; the metrics in it must belong to the counted feed" },
        { name: "frame", kind: PORT_KIND.FEED, title: "counted feed", hint: "which feed's stored frames to walk; absent means the trigger" }
    ],
    outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition" }],
    settings: [
        { key: "window", kind: SETTING.INT, required: true, min: 1, max: LIMITS.history, hint: "how many of the feed's most recent frames to look at" },
        { key: "test", kind: SETTING.ENUM, values: ["atLeast", "atMost", "exactly"], hint: "atLeast when absent" },
        { key: "count", kind: SETTING.INT, min: 1, max: LIMITS.history, hint: "how many of those frames must match; 1 when absent" },
        { key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength },
        {
            key: "labelWhere",
            kind: SETTING.ENUM,
            values: ["count", "node"],
            canvasOnly: true,
            title: "label sits",
            hint: "the document allows a count's label inside the count block or beside it, not both"
        },
        {
            key: "feedNamed",
            kind: SETTING.BOOL,
            canvasOnly: true,
            title: "feed named",
            hint: "the block wrote the feed it walks, instead of leaving it to the trigger"
        }
    ]
});

/**
 * The six plain comparisons: a value, a threshold, and nothing else — either
 * side may be a wire or a literal written into the port.
 */
function comparisonType(operator, spec) {
    return freezeType({
        role: ROLE.COMPARE,
        operator,
        title: spec.title,
        symbol: spec.symbol,
        hint: spec.hint,
        writes: `{ ${operator}: [left, right] }`,
        inputs: [
            { name: "left", kind: PORT_KIND.ANY, required: true, inline: true, title: spec.left, hint: "a metric, a state variable, or a constant" },
            { name: "right", kind: PORT_KIND.ANY, required: true, inline: true, title: spec.right, hint: "what the left side is put beside" }
        ],
        outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition" }],
        settings: [
            { key: "left", kind: SETTING.VALUE, inline: true, title: spec.left, hint: "used when no wire arrives at the left input" },
            { key: "right", kind: SETTING.VALUE, inline: true, title: spec.right, hint: "used when no wire arrives at the right input" },
            { key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength }
        ]
    });
}

const COMPARISON_SPECS = Object.freeze({
    gt: { title: "is greater than", symbol: ">", hint: "left is above right" },
    gte: { title: "is at least", symbol: "≥", hint: "left is above right, or equal to it" },
    lt: { title: "is less than", symbol: "<", hint: "left is below right" },
    lte: { title: "is at most", symbol: "≤", hint: "left is below right, or equal to it" },
    eq: { title: "is equal to", symbol: "=", hint: "left and right are the same value" },
    neq: { title: "is not equal to", symbol: "≠", hint: "left and right are different values" }
});

/** The six plain comparisons, one node each. */
const COMPARISON_TYPES = Object.freeze(Object.fromEntries(
    Object.entries(COMPARISON_SPECS).map(([operator, spec]) => [
        operator,
        comparisonType(operator, { ...spec, left: "value", right: "threshold" })
    ])
));

const BETWEEN_TYPE = freezeType({
    role: ROLE.COMPARE,
    operator: "between",
    title: "is between",
    symbol: "∈",
    hint: "a metric sits inside a band, low end included and high end excluded — the first value is the metric, always",
    writes: "{ between: [metric, low, high] }",
    inputs: [
        { name: "value", kind: PORT_KIND.ANY, required: true, metricOnly: true, title: "value", hint: "the metric that must fall inside the band" },
        { name: "low", kind: PORT_KIND.ANY, required: true, inline: true, title: "low", hint: "the bottom of the band" },
        { name: "high", kind: PORT_KIND.ANY, required: true, inline: true, title: "high", hint: "the top of the band" }
    ],
    outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition" }],
    settings: [
        { key: "low", kind: SETTING.VALUE, inline: true, hint: "used when no wire arrives at the low input" },
        { key: "high", kind: SETTING.VALUE, inline: true, hint: "used when no wire arrives at the high input" },
        { key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength }
    ]
});

const IN_TYPE = freezeType({
    role: ROLE.COMPARE,
    operator: "in",
    title: "is one of",
    symbol: "∈",
    hint: "a metric is one of a written list of values — the shape of an enumeration like \"bid|ask|flat\"",
    writes: "{ in: [metric, [literals]] }",
    inputs: [{ name: "value", kind: PORT_KIND.ANY, required: true, metricOnly: true, title: "value", hint: "the metric tested against the list" }],
    outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition" }],
    settings: [
        { key: "list", kind: SETTING.LIST, required: true, title: "values", hint: "numbers, words and flags; up to 64 of them" },
        { key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength }
    ]
});

const EXISTS_TYPE = freezeType({
    role: ROLE.COMPARE,
    operator: "exists",
    title: "exists",
    hint: "the metric has been measured at all — the way to ask about a value that may be null, since null is not a value",
    writes: "{ exists: \"$metric\" }",
    inputs: [{ name: "value", kind: PORT_KIND.ANY, required: true, metricOnly: true, title: "metric", hint: "exists asks about a metric, not a literal" }],
    outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition" }],
    settings: [{ key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength }]
});

/** crossesAbove / crossesBelow: a metric crossing a level, optionally born of a fresh pair. */
function crossesType(operator, title, hint) {
    return freezeType({
        role: ROLE.COMPARE,
        operator,
        title,
        hint,
        writes: `{ ${operator}: [metric, level], withinMs? }`,
        inputs: [
            { name: "value", kind: PORT_KIND.ANY, required: true, metricOnly: true, title: "metric", hint: "the metric that crossed" },
            { name: "level", kind: PORT_KIND.ANY, required: true, inline: true, title: "level", hint: "the value it crossed" }
        ],
        outputs: [{ name: "out", kind: PORT_KIND.BOOLEAN, title: "condition" }],
        settings: [
            { key: "level", kind: SETTING.VALUE, inline: true, hint: "used when no wire arrives at the level input" },
            {
                key: "withinMs",
                kind: SETTING.INT,
                min: 1,
                max: LIMITS.maxAgeMs,
                hint: "only true when the crossing happened within this many milliseconds; absent means the last frame"
            },
            { key: "label", kind: SETTING.TEXT, maxLength: LIMITS.labelLength }
        ]
    });
}

const ACTION_TYPE = freezeType({
    role: ROLE.ACTION,
    title: "Action",
    hint: "what a signal means — enter, exit, close or alert; how it is executed is somebody else's layer",
    writes: "$.action",
    inputs: [{ name: "when", kind: PORT_KIND.BOOLEAN, required: true, title: "when", hint: "the one condition that starts an evaluation; nothing else reaches the runner" }],
    settings: [
        { key: "type", kind: SETTING.ENUM, required: true, values: ACTIONS, hint: "enter and exit need a side; close and alert take neither a side nor a size" },
        { key: "side", kind: SETTING.ENUM, values: SIDES },
        { key: "size", kind: SETTING.ENUM, values: SIZES, hint: "an intent carried in the signal; nobody here executes it" },
        { key: "sizeValue", kind: SETTING.NUMBER, hint: "required when size is risk_pct or units" },
        { key: "severity", kind: SETTING.ENUM, values: SEVERITIES, hint: "belongs to an alert" },
        { key: "note", kind: SETTING.TEXTAREA, maxLength: 200, hint: "what the signal says in words" }
    ]
});

/* ------------------------------------------------------------
 * The registry
 * ---------------------------------------------------------- */

/** Every node type, by the type string a graph stores. */
const NODE_TYPES = Object.freeze({
    strategy: STRATEGY_TYPE,
    feed: FEED_TYPE,
    metric: METRIC_TYPE,
    state: STATE_TYPE,
    constant: CONSTANT_TYPE,
    all: logicType("all", "all", "every condition wired into it holds — the ordinary way two readings are asked at once"),
    any: logicType("any", "any", "at least one condition wired into it holds"),
    not: NOT_TYPE,
    count: COUNT_TYPE,
    ...COMPARISON_TYPES,
    between: BETWEEN_TYPE,
    in: IN_TYPE,
    exists: EXISTS_TYPE,
    crossesAbove: crossesType("crossesAbove", "crosses above", "the metric was at or below the level on the previous frame and above it on this one"),
    crossesBelow: crossesType("crossesBelow", "crosses below", "the metric was at or above the level on the previous frame and below it on this one"),
    action: ACTION_TYPE
});

/* A canvas that could draw half a language would be a canvas that lies about
 * what a strategy is. Every operator core/dsl-schema.cjs knows must have a
 * node here, checked once at load: a mistake in this table then costs a start,
 * not a strategy that silently says something else. */
for (const operator of OPERATORS) {
    if (!NODE_TYPES[operator]) {
        throw new Error(`bot-canvas/core/node-types.cjs: no node draws the operator "${operator}"`);
    }
}

const CONDITION_TYPES = OPERATORS;
const VALUE_TYPES = Object.freeze(["metric", "state", "constant"]);

/* ------------------------------------------------------------
 * Reading the table
 * ---------------------------------------------------------- */

function nodeType(type) {
    return NODE_TYPES[type] || null;
}

/** Whether this type is a condition — one of the operators the DSL walks. */
function isConditionType(type) {
    return OPERATORS.includes(type);
}

function inputPort(type, port) {
    const spec = NODE_TYPES[type];
    if (!spec) return null;
    return spec.inputs.find((entry) => entry.name === port) || null;
}

function settingSpec(type, key) {
    const spec = NODE_TYPES[type];
    if (!spec) return null;
    return spec.settings.find((entry) => entry.key === key) || null;
}

/** A port that may also be written as a literal in the node's own settings. */
function isInlinePort(type, port) {
    const setting = settingSpec(type, port);
    return Boolean(setting && setting.inline);
}

function requiredSettings(type) {
    const spec = NODE_TYPES[type];
    return spec ? spec.settings.filter((entry) => entry.required) : [];
}

/** The port a node type publishes through, or null for an action or a strategy. */
function outputPort(type) {
    const spec = NODE_TYPES[type];
    return spec && spec.outputs.length ? spec.outputs[0] : null;
}

/** Whether a value of one kind may arrive at a port expecting another. */
function compatible(fromKind, toKind) {
    if (!toKind || toKind === PORT_KIND.ANY) return true;
    if (!fromKind || fromKind === PORT_KIND.ANY) return true;
    return fromKind === toKind;
}

/** The kind of a literal, the way the evaluator will meet it. */
function kindOfValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? PORT_KIND.SCALAR : PORT_KIND.ANY;
    if (typeof value === "string") return PORT_KIND.STRING;
    if (typeof value === "boolean") return PORT_KIND.BOOLEAN;
    return PORT_KIND.ANY;
}

/** Which catalog family publishes this feed node's event. */
function metricFamily(feedNode) {
    const eventType = feedNode && feedNode.settings ? feedNode.settings.eventType : null;
    return typeof eventType === "string" && eventType ? familyOfEvent(eventType) : null;
}

/** core/catalog.cjs's answer for one path inside one feed node's reading. */
function metricPath(feedNode, path) {
    const family = metricFamily(feedNode);
    if (!family || typeof path !== "string" || !path.trim()) return null;
    return resolvePath(family.key, path);
}

/** The paths a metric wired to this feed may name, in catalog order. */
function metricPaths(feedNode) {
    const family = metricFamily(feedNode);
    return family ? pathsOf(family.key) : null;
}

/** The values an enumeration path may hold, for a picker beside `in`. */
function metricValues(feedNode, path) {
    const resolved = metricPath(feedNode, path);
    return resolved ? resolved.values : null;
}

/** The topic a feed node stands for. core/dsl-schema.cjs parses this back. */
function topicOf(settings) {
    const raw = settings || {};
    const parts = [raw.assetClass, raw.asset, raw.eventType];
    if (parts.some((part) => part === null || part === undefined || part === "")) return null;
    return ["analytics", ...parts].join(".");
}

/**
 * What a node publishes: the one fact a wire's legality depends on, and the
 * one fact a port badge shows. `feed` is the node a metric reads from, since
 * a metric's kind lives in the catalog, not in its own settings.
 */
function outputKind(node, { feed = null } = {}) {
    if (!node) return null;
    const spec = NODE_TYPES[node.type];
    if (!spec || !spec.outputs.length) return null;

    switch (node.type) {
        case "feed":
            return PORT_KIND.FEED;
        case "metric": {
            const resolved = metricPath(feed, node.settings ? node.settings.path : null);
            return resolved ? resolved.kind : PORT_KIND.ANY;
        }
        case "state":
        case "constant": {
            const value = node.settings ? node.settings[node.type === "state" ? "init" : "value"] : undefined;
            return kindOfValue(value);
        }
        default:
            return spec.outputs[0].kind;
    }
}

/** One sentence for a port badge: enough to see a wrong wire without compiling. */
function outputHint(node, { feed = null } = {}) {
    if (!node) return null;

    if (node.type === "feed") {
        const topic = topicOf(node.settings);
        return topic || "no event chosen yet";
    }
    if (node.type === "metric") {
        const path = node.settings ? node.settings.path : null;
        const resolved = metricPath(feed, path);
        if (!resolved) return path ? `${path} — not a path this reading publishes` : "no path chosen yet";
        return resolved.values ? `${resolved.kind} · one of ${resolved.values.join("|")}` : resolved.kind;
    }
    if (node.type === "state" || node.type === "constant") {
        const value = node.settings ? node.settings[node.type === "state" ? "init" : "value"] : undefined;
        return value === undefined ? "no value written yet" : `${kindOfValue(value)} · ${JSON.stringify(value)}`;
    }
    return outputKind(node, { feed });
}

/* ------------------------------------------------------------
 * What a picker is offered
 * ---------------------------------------------------------- */

/** The catalog's events, grouped by the family and timeframe they belong to. */
function eventGroups() {
    return Object.freeze(Object.entries(FAMILIES).map(([key, family]) => Object.freeze({
        key,
        label: family.label || key,
        timeframe: family.timeframe ? true : false,
        events: Object.freeze(family.timeframe ? family.timeframes.map((timeframe) => `${key}_${timeframe}`) : [key]),
        paths: pathsOf(key)
    })));
}

/** The palette, in the order a person builds a strategy: value, logic, then the action. */
function palette() {
    return Object.freeze(ROLE_ORDER.map((role) => Object.freeze({
        role,
        types: Object.freeze(
            Object.entries(NODE_TYPES)
                .filter(([, spec]) => spec.role === role)
                .map(([type, spec]) => Object.freeze({ type, ...spec }))
        )
    })));
}

module.exports = {
    PORT_KIND,
    ROLE,
    SETTING,
    ROLE_ORDER,
    NODE_TYPES,
    CONDITION_TYPES,
    VALUE_TYPES,
    COMPARISON_SPECS,
    nodeType,
    isConditionType,
    inputPort,
    outputPort,
    settingSpec,
    isInlinePort,
    requiredSettings,
    compatible,
    kindOfValue,
    metricFamily,
    metricPath,
    metricPaths,
    metricValues,
    topicOf,
    outputKind,
    outputHint,
    eventGroups,
    palette
};

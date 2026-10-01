/* ============================================================
 * File: bot-canvas/compiler/graph-to-ast.cjs
 * Section: bot-canvas/compiler
 * Version: 1.0.0
 *
 * Role:
 *   A drawing, written back as the document this engine reads: Graph → bot.json.
 *   Three rules shape this file.
 *
 *   1. THE VALIDATOR SPEAKS FIRST. compiler/graph-validation.cjs decides whether
 *      a drawing is a strategy at all, and this file never guesses, repairs or
 *      compiles around a mistake it can see. A graph that does not pass does not
 *      become a document, and what the caller gets back are the validator's own
 *      refusals, each already pointing at the node it belongs to.
 *
 *   2. THE DOCUMENT IS WRITTEN IN THE DSL'S OWN ORDER, and holds only what a
 *      person was told: a field nobody filled in is absent, a literal written
 *      into a port is an operand, and a canvas-only setting (emptyBlocks,
 *      implicitTrigger, labelWhere) is bookkeeping that never reaches bot.json.
 *      ROOT_FIELDS order means two canvases drawing one strategy produce one
 *      document, byte for byte, which is what makes a diff of two saves
 *      readable — and what makes the round trip in the B2 test an equality
 *      rather than a resemblance.
 *
 *   3. core/dsl-schema.cjs HAS THE FINAL WORD. The document built here is
 *      handed to the same compiler the runner uses. If it refuses, its code, its
 *      path and its sentence are what the caller sees (`source: "engine"`),
 *      because a canvas that compiled what the runner would refuse would be a
 *      canvas that lies about what it drew.
 * ============================================================ */

const { indexNodes, edgeInto, edgesInto, isPlainObject } = require("../core/graph-schema.cjs");
const { topicOf, settingSpec } = require("../core/node-types.cjs");
const { DSL_VERSION, COUNT_FIELDS, compileStrategy } = require("../../bot-engine/core/dsl-schema.cjs");
const { SEVERITY, diagnostic, nodeWhere, validateGraph, triggerFeed } = require("./graph-validation.cjs");

const nodesOfType = (graph, type) => graph.nodes.filter((node) => node.type === type);
const settingsOf = (node) => (isPlainObject(node.settings) ? node.settings : {});

/**
 * The three ways a count says how many frames matched, taken from the DSL's own
 * field list so a fourth threshold added there cannot go unnoticed here.
 */
const COUNT_TESTS = Object.freeze(COUNT_FIELDS.filter((field) => !["feed", "window", "when", "label"].includes(field)));

/** Nothing written: absent, null, and a blank string are all no answer. */
function filled(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && !value.trim()) return undefined;
    return value;
}

/**
 * The key a node writes into a map of the document. Every map is keyed by a
 * setting (a feed's `key`, a metric's `alias`, a state variable's `name`), and
 * the validator has already refused a missing or repeated one — a node in a
 * graph that passed always carries what it is called.
 */
function writtenKey(node, setting) {
    const value = filled(settingsOf(node)[setting]);
    return typeof value === "string" ? value : node.id;
}

const feedKey = (node) => writtenKey(node, "key");
const metricAlias = (node) => writtenKey(node, "alias");
const stateName = (node) => writtenKey(node, "name");

/** One complaint this file has to make because the validator could not. */
function issue(code, where, message, extra) {
    return diagnostic(SEVERITY.ERROR, code, where, message, extra);
}

/* ------------------------------------------------------------
 * The blocks a node writes
 *
 * Each builder reads one node (or one kind of node) and returns the piece of
 * the document it stands for, or null for a piece the document does not have.
 * Nothing here checks anything: the validator has already refused every shape
 * that would make these functions guess.
 * ---------------------------------------------------------- */

/** The document's own fields, in ROOT_FIELDS order. */
function headerOf(strategy) {
    const settings = settingsOf(strategy);
    const header = { name: filled(settings.name) };

    const bot = filled(settings.bot);
    if (bot !== undefined) header.bot = bot;
    /* A description and a note are prose: an empty one is a field a person
     * erased, and the DSL keeps empty prose, so the canvas keeps it too. Every
     * other text setting a canvas holds as empty was never filled in. */
    if (settings.description !== undefined) header.description = settings.description;
    if (typeof settings.enabled === "boolean") header.enabled = settings.enabled;

    return header;
}

/**
 * The universe: the symbols the strategy becomes, and the venue they are listed
 * on. A canvas holding no symbols writes no block — instances started by hand
 * are what the DSL calls a universe of none — and the venue is a field of the
 * block, never a block of its own. The one exception is an empty block the
 * loaded document carried: it is written back empty, because a canvas that
 * quietly repaired what its author wrote would hide the mistake instead of
 * showing it.
 */
function universeOf(strategy, empty) {
    const settings = settingsOf(strategy);
    const symbols = Array.isArray(settings.symbols) ? settings.symbols.filter((entry) => filled(entry) !== undefined) : [];
    const exchange = filled(settings.exchange);

    if (!symbols.length) {
        return empty.includes("universe") ? { universe: {} } : {};
    }

    const universe = { symbols: symbols.map((symbol) => String(symbol).trim().toUpperCase()) };
    if (exchange !== undefined) universe.exchange = exchange;
    return { universe };
}

/** One entry per feed node: the topic its three parts spell, and its cadence. */
function feedsOf(graph) {
    const feeds = {};

    for (const feed of nodesOfType(graph, "feed")) {
        const settings = settingsOf(feed);
        const entry = { topic: topicOf(settings) };
        const exchange = filled(settings.exchange);
        if (exchange !== undefined) entry.exchange = exchange;
        if (Number.isInteger(settings.maxAgeMs)) entry.maxAgeMs = settings.maxAgeMs;
        if (Number.isInteger(settings.history)) entry.history = settings.history;
        feeds[feedKey(feed)] = entry;
    }

    return feeds;
}

/** One entry per metric node: the feed it reads, the path inside it, its label. */
function metricsOf(graph, index) {
    const metrics = {};

    for (const metric of nodesOfType(graph, "metric")) {
        const settings = settingsOf(metric);
        const wired = edgeInto(index, metric.id, "feed");
        const feed = wired ? index.byId.get(wired.from.node) : null;
        const entry = {
            feed: feed && feed.type === "feed" ? feedKey(feed) : "",
            path: filled(settings.path)
        };
        const label = filled(settings.label);
        if (label !== undefined) entry.label = label;
        metrics[metricAlias(metric)] = entry;
    }

    return metrics;
}

/**
 * The state block: what a signal does to a variable, and what it started as. A
 * block the canvas holds nothing for is written only when the document carried
 * it as an empty block — the DSL allows no state at all, but it does allow the
 * empty block, and that difference is the author's, not the canvas's.
 */
function stateOf(graph, empty) {
    const state = {};

    for (const variable of nodesOfType(graph, "state")) {
        const settings = settingsOf(variable);
        const entry = { init: settings.init };
        if (isPlainObject(settings.onSignal)) entry.onSignal = { ...settings.onSignal };
        if (Number.isInteger(settings.resetAfterMs)) entry.resetAfterMs = settings.resetAfterMs;
        state[stateName(variable)] = entry;
    }

    if (!Object.keys(state).length && !empty.includes("state")) return null;
    return state;
}

/** The action: what a signal means. Its `when` is a wire, not a field. */
function actionOf(action) {
    const settings = settingsOf(action);
    const out = { type: settings.type };

    for (const key of ["side", "size", "sizeValue", "severity"]) {
        const value = filled(settings[key]);
        if (value !== undefined) out[key] = value;
    }
    /* A note is prose, kept even when empty, for the same reason a description
     * is: an empty string is a string the DSL accepts, and what a person erased
     * must come back erased rather than filled in. */
    if (settings.note !== undefined) out.note = settings.note;

    return out;
}

/** How often a signal may fire: both fields are absent when nobody said. */
function cadenceOf(strategy) {
    const settings = settingsOf(strategy);
    const out = {};

    if (Number.isInteger(settings.cooldownMs)) out.cooldownMs = settings.cooldownMs;
    if (typeof settings.once === "boolean") out.once = settings.once;

    return out;
}

/**
 * Which feed starts an evaluation. The wire is the answer when there is one —
 * the validator has already said so, even when the canvas also remembers a
 * trigger the document only implied — and a canvas that remembers the document
 * implied it writes no key at all, so the DSL implies the same one feed again.
 */
function triggerOf(index, strategy, feeds) {
    const wired = edgeInto(index, strategy.id, "trigger");
    const source = wired ? index.byId.get(wired.from.node) : null;
    if (source && source.type === "feed") return feedKey(source);
    if (settingsOf(strategy).implicitTrigger === true) return undefined;
    return feeds.length === 1 ? feedKey(feeds[0]) : null;
}



/* ------------------------------------------------------------
 * The condition tree: when
 *
 * A condition node becomes the one key the DSL names it after, and a value is
 * an operand the way the DSL writes one: `$alias` for a metric, `$state.name`
 * for a variable, the value itself for a literal. A literal typed into a port
 * and a literal drawn as a constant node are the same operand, which is why a
 * constant compiles to its value: the document holds values, and the canvas
 * holds two ways of writing one.
 * ---------------------------------------------------------- */

function valueOf(context, source, issues) {
    switch (source.type) {
        case "metric":
            return `$${metricAlias(source)}`;
        case "state":
            return `$state.${stateName(source)}`;
        case "constant":
            return settingsOf(source).value;
        default:
            issues.push(
                issue(
                    "bad-operand",
                    nodeWhere(context.at.get(source.id)),
                    `a ${source.type} node is not a value: a metric, a state variable or a literal is`,
                    { nodeId: source.id }
                )
            );
            return null;
    }
}

/** The operand of one input port: what is wired into it, or what it was told. */
function operandOf(context, node, port, issues) {
    const wired = edgeInto(context.index, node.id, port);
    if (wired) {
        const source = context.index.byId.get(wired.from.node);
        return source ? valueOf(context, source, issues) : null;
    }
    const inline = settingsOf(node)[port];
    return inline === undefined ? null : inline;
}

/** The conditions arriving at a list port, in the order their slots name. */
function childrenOf(context, node, port, issues) {
    return edgesInto(context.index, node.id, port).map((arrival) => {
        const source = context.index.byId.get(arrival.edge.from.node);
        return source ? conditionOf(context, source, issues) : null;
    });
}

function conditionOf(context, node, issues) {
    const settings = settingsOf(node);
    const label = filled(settings.label);
    const out = {};
    let labelInside = false;
    let within;

    switch (node.type) {
        case "all":
        case "any": {
            out[node.type] = childrenOf(context, node, "in", issues);
            break;
        }
        case "not": {
            const children = childrenOf(context, node, "in", issues);
            out.not = children.length ? children[0] : null;
            break;
        }
        case "count": {
            const test = COUNT_TESTS.includes(settings.test) ? settings.test : "atLeast";
            const threshold = Number.isInteger(settings.count) ? settings.count : 1;
            const explicit = settings.count !== undefined || COUNT_TESTS.includes(settings.test);
            const [child] = childrenOf(context, node, "when", issues);
            const frame = edgeInto(context.index, node.id, "frame");
            const counted = frame ? context.index.byId.get(frame.from.node) : null;
            const block = {};

            /* A count walks the trigger's frames unless a feed was wired in, so a
             * wire to the trigger's own feed usually means the block said
             * nothing about its feed — unless it named it, which the canvas
             * remembers: absent, present and present-as-the-default are three
             * ways to say it, and the document keeps the one it was given. */
            if (counted && counted.type === "feed" && (counted !== context.trigger || settings.feedNamed === true)) block.feed = feedKey(counted);
            block.window = settings.window;
            /* The order the DSL writes a count in, so two writers of one strategy
             * produce one text: the feed counted, the window, how many of them,
             * what counts, and only then the name. */
            if (explicit) block[test] = threshold;
            block.when = child === undefined ? null : child;
            /* A count may name itself inside the block or beside it like any
             * other condition; the canvas remembers which, and the DSL refuses
             * the same label in both places. */
            if (label !== undefined && settings.labelWhere !== "node") {
                block.label = label;
                labelInside = true;
            }
            out.count = block;
            break;
        }
        case "exists": {
            out.exists = operandOf(context, node, "value", issues);
            break;
        }
        case "in": {
            out.in = [operandOf(context, node, "value", issues), settings.list];
            break;
        }
        case "between": {
            out.between = [
                operandOf(context, node, "value", issues),
                operandOf(context, node, "low", issues),
                operandOf(context, node, "high", issues)
            ];
            break;
        }
        case "crossesAbove":
        case "crossesBelow": {
            out[node.type] = [operandOf(context, node, "value", issues), operandOf(context, node, "level", issues)];
            if (Number.isInteger(settings.withinMs)) within = settings.withinMs;
            break;
        }
        default: {
            out[node.type] = [operandOf(context, node, "left", issues), operandOf(context, node, "right", issues)];
            break;
        }
    }

    if (label !== undefined && !labelInside) out.label = label;
    if (within !== undefined) out.withinMs = within;

    return out;
}

/** The condition the action fires on: the one wire into its when port. */
function whenOf(context, action, issues) {
    const wired = edgeInto(context.index, action.id, "when");
    if (!wired) {
        issues.push(
            issue(
                "unwired-condition",
                `${nodeWhere(context.at.get(action.id))}.inputs.when`,
                "nothing reaches the action's when port: a strategy that fires on nothing is not a strategy yet",
                { nodeId: action.id, port: "when" }
            )
        );
        return null;
    }
    const source = context.index.byId.get(wired.from.node);
    return source ? conditionOf(context, source, issues) : null;
}


/* ------------------------------------------------------------
 * The entry
 * ---------------------------------------------------------- */

/** The blocks a loaded document carried but nothing fills — canvas bookkeeping. */
function emptyBlocksOf(graph) {
    const strategy = nodesOfType(graph, "strategy")[0];
    const declared = settingsOf(strategy).emptyBlocks;
    const allowed = settingSpec("strategy", "emptyBlocks").values;
    if (!Array.isArray(declared)) return [];
    return declared.filter((block) => allowed.includes(block));
}

/** Freezing the document keeps a caller from editing what the engine just read. */
function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

/**
 * The document a drawing stands for, block by block, in the order the DSL
 * writes them. A graph that passed the validator always writes one — the only
 * two shapes that could stop it (no strategy, no action) are refusals there —
 * but the guard stays, because a compiler that answered with a half-document
 * would be worse than one that said why it stopped.
 */
function writeDocument(graph) {
    const index = indexNodes(graph);
    const at = new Map(graph.nodes.map((node, position) => [node.id, position]));
    const strategy = nodesOfType(graph, "strategy")[0];
    const action = nodesOfType(graph, "action")[0];

    if (!strategy) {
        return { ok: false, diagnostics: [issue("missing-strategy", "$.nodes", "a canvas needs its strategy node: it is the document's name, universe and cadence")] };
    }
    if (!action) {
        return { ok: false, diagnostics: [issue("missing-action", "$.nodes", "a strategy says what a signal means: the action node is what says it")] };
    }

    const issues = [];
    const feeds = nodesOfType(graph, "feed");
    const context = { graph, index, at, trigger: triggerFeed(graph, index) };
    const document = { version: DSL_VERSION, ...headerOf(strategy), ...universeOf(strategy, emptyBlocksOf(graph)) };
    const trigger = triggerOf(index, strategy, feeds);

    if (typeof trigger === "string") {
        document.trigger = trigger;
    } else if (trigger === null) {
        issues.push(
            issue(
                "missing-trigger",
                `${nodeWhere(at.get(strategy.id))}.inputs.trigger`,
                `with ${feeds.length} feeds, say which one starts an evaluation — one of: ${feeds.map((feed) => feed.id).join(", ")}`,
                { nodeId: strategy.id, port: "trigger" }
            )
        );
    }

    document.feeds = feedsOf(graph);
    document.metrics = metricsOf(graph, index);
    const state = stateOf(graph, emptyBlocksOf(graph));
    if (state) document.state = state;
    document.when = whenOf(context, action, issues);
    document.action = actionOf(action);
    Object.assign(document, cadenceOf(strategy));

    if (issues.length) return { ok: false, diagnostics: issues };
    return { ok: true, document };
}

/**
 * A drawing, compiled: validated by this layer, written as a document, and read
 * by the same compiler the runner uses. The document is returned on every path
 * that got as far as writing one — a panel showing what a mistake costs is more
 * use than a panel showing nothing — while the plan exists only when the engine
 * accepted the result, because a plan is what a bot runs.
 *
 * The diagnostics keep their source: `canvas` for what this layer refused (the
 * `where` is a graph path, and `nodeId` names the node to point at), `engine`
 * for what core/dsl-schema.cjs refused (the `where` is a document path, in the
 * engine's own code and sentence). One vocabulary per mistake either way.
 *
 * @param {object|string} input the graph object the editor posts, or its JSON
 * @param {{ strict?:boolean }} [options] `strict` refuses what it would warn
 * @returns {{ ok:boolean, strict:boolean, graph:object, document:object|null,
 *             plan:object|null, errors:object[], warnings:object[],
 *             diagnostics:object[] }}
 */
function compileGraph(input, { strict = false } = {}) {
    const validated = validateGraph(input, { strict });
    const refused = { strict: validated.strict, graph: validated.graph, ok: false, document: null, plan: null };

    if (!validated.ok) {
        return Object.freeze({
            ...refused,
            errors: validated.errors,
            warnings: validated.warnings,
            diagnostics: validated.diagnostics
        });
    }

    const written = writeDocument(validated.graph);
    if (!written.ok) {
        const errors = Object.freeze(written.diagnostics);
        return Object.freeze({
            ...refused,
            errors,
            warnings: validated.warnings,
            diagnostics: Object.freeze([...errors, ...validated.warnings])
        });
    }

    const document = deepFreeze(written.document);
    const compiled = compileStrategy(document);

    if (!compiled.ok) {
        const errors = Object.freeze(
            compiled.errors.map((error) =>
                diagnostic(SEVERITY.ERROR, error.code, error.where, error.message, { source: "engine" })
            )
        );
        return Object.freeze({
            strict: validated.strict,
            graph: validated.graph,
            ok: false,
            document,
            plan: null,
            errors,
            warnings: validated.warnings,
            diagnostics: Object.freeze([...errors, ...validated.warnings])
        });
    }

    return Object.freeze({
        strict: validated.strict,
        graph: validated.graph,
        ok: true,
        document,
        plan: compiled.plan,
        errors: Object.freeze([]),
        warnings: validated.warnings,
        diagnostics: validated.warnings
    });
}

module.exports = {
    compileGraph,
    writeDocument
};

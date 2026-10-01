/* ============================================================
 * File: bot-canvas/compiler/ast-to-graph.cjs
 * Section: bot-canvas/compiler
 * Version: 1.0.0
 *
 * Role:
 *   A document, opened as a drawing: bot.json → Graph. This is the direction a
 *   person starts in — a strategy written as a document, loaded onto a canvas to
 *   be read, rearranged and saved again — so it is the direction that may not
 *   lose anything and may not throw. Three rules shape this file.
 *
 *   1. NOTHING THE DOCUMENT SAYS IS DROPPED SILENTLY. Every block becomes its
 *      nodes and wires, every field that was written lands on a node as it was
 *      written, and the four canvas-only settings (emptyBlocks, implicitTrigger,
 *      labelWhere, feedNamed) are recorded so that compiler/graph-to-ast.cjs
 *      writes the same document back: a document that compiles here compiles back
 *      to itself, which is what the B2 test asserts.
 *
 *   2. A BROKEN DOCUMENT STILL OPENS. The editor has to show what is wrong
 *      rather than refuse to show anything: a shape this file cannot read
 *      becomes as much of a node as can be drawn from it, nothing is repaired
 *      and nothing is defaulted in, and core/dsl-schema.cjs is asked for its own
 *      verdict, reported in its own words (`source: "engine"`).
 *
 *   3. POSITIONS ARE DERIVED, OR REMEMBERED. compiler/layout.cjs places every
 *      node deterministically — one document draws one picture — and a sidecar
 *      (what the editor saved beside the document) overrides the position of
 *      every node it remembers. Nothing else about a node comes from a sidecar.
 * ============================================================ */

const { node, edge, isPlainObject, ID_PATTERN, LIMITS: GRAPH_LIMITS } = require("../core/graph-schema.cjs");
const { parseFeedTopic, COUNT_FIELDS, OPERATORS, compileStrategy } = require("../../bot-engine/core/dsl-schema.cjs");
const { SEVERITY, diagnostic, validateGraph } = require("./graph-validation.cjs");
const { layoutGraph, applySidecar } = require("./layout.cjs");

/** The ways a count says how many frames matched, from the DSL's own field list,
 *  so a fourth threshold added there cannot go unnoticed here. */
const COUNT_TESTS = Object.freeze(COUNT_FIELDS.filter((field) => !["feed", "window", "when", "label"].includes(field)));

/** What "empty" means for each block: nothing in it — and for the universe,
 *  nothing it could become instances of. A block the document wrote empty is
 *  remembered as empty, because a canvas that filled one in would be inventing
 *  the part of the strategy its author had not written yet. */
const BLOCK_IS_EMPTY = Object.freeze({
    feeds: (block) => Object.keys(block).length === 0,
    metrics: (block) => Object.keys(block).length === 0,
    state: (block) => Object.keys(block).length === 0,
    universe: (block) => Object.keys(block).length === 0 || !(Array.isArray(block.symbols) && block.symbols.length)
});
const BLOCKS = Object.freeze(Object.keys(BLOCK_IS_EMPTY));

/** Nothing written: null and undefined are both no answer. An empty string is a
 *  string the author wrote, and is kept where the DSL keeps it. */
const written = (value) => value !== undefined && value !== null;

/** A complaint the engine made about the strategy: the verdict that stops a bot. */
function engineIssue(code, where, message) {
    return diagnostic(SEVERITY.ERROR, code, where, message, { source: "engine" });
}

/**
 * A node id, derived from the name the document gave it and made unique. Ids are
 * how wires name their ends, so they have to hold the character rule the graph
 * schema states: a letter first, then letters, digits and . _ - :. A name that is
 * not one (a metric alias in a document that never compiled, say) is kept as
 * close to what it said as an id can be.
 */
function idFor(taken, seed) {
    const clean = String(seed).replace(/[^A-Za-z0-9._:-]/g, "_");
    const base = (ID_PATTERN.test(clean) ? clean : `n${clean}`).slice(0, GRAPH_LIMITS.idLength);
    let id = base;
    let suffix = 2;
    while (taken.has(id)) {
        id = `${base.slice(0, GRAPH_LIMITS.idLength - 4)}-${suffix}`;
        suffix += 1;
    }
    taken.add(id);
    return id;
}

/** A topic read back into the three settings a feed node holds. */
function topicParts(topic) {
    const parsed = parseFeedTopic(topic);
    if (parsed) return { assetClass: parsed.assetClass, asset: parsed.asset, eventType: parsed.eventType };
    /* A topic this layer cannot read is still a topic the author wrote: the
     * first segment is always the root, so the three settings after it are the
     * parts to show, even when one of them is not a part this layer knows. */
    const segments = typeof topic === "string" ? topic.split(".") : [];
    if (segments.length !== 4) return {};
    return { assetClass: segments[1], asset: segments[2], eventType: segments[3] };
}


/* ------------------------------------------------------------
 * The document, drawn
 * ---------------------------------------------------------- */

/** The blocks a document carried empty, so the canvas can remember them. */
function emptyBlocksOf(document) {
    return BLOCKS.filter((block) => isPlainObject(document[block]) && BLOCK_IS_EMPTY[block](document[block]));
}

/** The strategy node: the header, the universe, the cadence, the bookkeeping. */
function strategySettings(document) {
    const settings = { name: document.name };

    for (const field of ["bot", "description"]) if (written(document[field])) settings[field] = document[field];
    if (typeof document.enabled === "boolean") settings.enabled = document.enabled;

    const universe = isPlainObject(document.universe) ? document.universe : null;
    if (universe) {
        if (Array.isArray(universe.symbols) && universe.symbols.length) settings.symbols = universe.symbols.slice();
        if (written(universe.exchange)) settings.exchange = universe.exchange;
    }

    if (Number.isInteger(document.cooldownMs)) settings.cooldownMs = document.cooldownMs;
    if (typeof document.once === "boolean") settings.once = document.once;

    /* The document wrote no trigger key. With one feed the DSL reads that feed as
     * the one that starts an evaluation: the canvas draws no wire for it and the
     * strategy node remembers instead, which is how the key comes back absent.
     * With several feeds there is nothing to imply — a document that says nothing
     * is refused — so the canvas asks which feed it is rather than remembering. */
    const feedKeys = isPlainObject(document.feeds) ? Object.keys(document.feeds) : [];
    if (!Object.prototype.hasOwnProperty.call(document, "trigger") && feedKeys.length === 1) settings.implicitTrigger = true;

    const empty = emptyBlocksOf(document);
    if (empty.length) settings.emptyBlocks = empty;

    return settings;
}

/** The action node: what a signal means. */
function actionSettings(raw) {
    const action = isPlainObject(raw) ? raw : {};
    const settings = { type: action.type };

    for (const field of ["side", "size", "sizeValue", "severity", "note"]) {
        if (written(action[field])) settings[field] = action[field];
    }

    return settings;
}

/** Which feed starts an evaluation, as the document implies or says. */
function triggerKeyOf(document, feeds) {
    if (typeof document.trigger === "string") return document.trigger;
    const keys = Object.keys(feeds);
    return keys.length === 1 ? keys[0] : null;
}

/**
 * A document as a graph: the strategy node, one node per feed, metric and state
 * variable, the condition tree the action fires on, and the action. Node ids come
 * from the names the document wrote (`feed.flow`, `metric.cvd`, `when.0.gt`), so
 * two loads of one document draw one picture — and a reload of a graph the canvas
 * saved finds the nodes it drew.
 */
function buildGraph(document) {
    const nodes = [];
    const edges = [];
    const context = {
        nodes,
        edges,
        taken: new Set(),
        feeds: new Map(),
        metrics: new Map(),
        state: new Map(),
        triggerKey: null,
        addNode(id, type, settings) {
            nodes.push(node({ id, type, settings }));
            return id;
        },
        wire(from, fromPort, to, toPort, index = null) {
            edges.push(edge({ from: { node: from, port: fromPort }, to: { node: to, port: toPort, index } }));
        }
    };

    const strategy = context.addNode(idFor(context.taken, "strategy"), "strategy", strategySettings(document));
    const feeds = isPlainObject(document.feeds) ? document.feeds : {};

    for (const [key, raw] of Object.entries(feeds)) {
        const entry = isPlainObject(raw) ? raw : {};
        const settings = { key, ...topicParts(entry.topic) };
        for (const field of ["exchange", "maxAgeMs", "history"]) if (written(entry[field])) settings[field] = entry[field];
        context.feeds.set(key, context.addNode(idFor(context.taken, `feed.${key}`), "feed", settings));
    }

    const metrics = isPlainObject(document.metrics) ? document.metrics : {};
    for (const [alias, raw] of Object.entries(metrics)) {
        const entry = isPlainObject(raw) ? raw : {};
        const settings = { alias };
        for (const field of ["path", "label"]) if (written(entry[field])) settings[field] = entry[field];
        const id = context.addNode(idFor(context.taken, `metric.${alias}`), "metric", settings);
        context.metrics.set(alias, id);
        /* A metric may only read a feed the document declared: a name that is not
         * one of them is shown as a metric with no feed wire, never as a feed
         * node invented for it. */
        if (context.feeds.has(entry.feed)) context.wire(context.feeds.get(entry.feed), "out", id, "feed");
    }

    const state = isPlainObject(document.state) ? document.state : {};
    for (const [name, raw] of Object.entries(state)) {
        const entry = isPlainObject(raw) ? raw : {};
        const settings = { name };
        for (const field of ["init", "onSignal", "resetAfterMs"]) if (written(entry[field])) settings[field] = entry[field];
        context.state.set(name, context.addNode(idFor(context.taken, `state.${name}`), "state", settings));
    }

    context.triggerKey = triggerKeyOf(document, feeds);

    const when = addCondition(context, document.when, "when");
    const action = context.addNode(idFor(context.taken, "action"), "action", actionSettings(document.action));
    if (when) context.wire(when, "out", action, "when");

    /* The wire is drawn where the document said which feed starts an evaluation.
     * A one-feed document that left the key out implied it, and an implied trigger
     * is not a drawn one: the flag on the strategy says so, and a wire would
     * overrule the flag the moment the canvas is saved again — which would write a
     * key the document never had. */
    const named = Object.prototype.hasOwnProperty.call(document, "trigger");
    if (named && context.triggerKey && context.feeds.has(context.triggerKey)) {
        context.wire(context.feeds.get(context.triggerKey), "out", strategy, "trigger");
    }

    return { nodes, edges };
}


/* ------------------------------------------------------------
 * The condition tree, drawn
 * ---------------------------------------------------------- */

/** An operand that names a value rather than being one. */
const NAMED = Symbol("named");

const inlineOf = (operand) => (typeof operand === "string" && operand.startsWith("$") ? NAMED : operand);

/** The node a `$operand` names: a declared value, or one drawn for a name the
 *  document used without declaring. The canvas shows the reference; what is
 *  missing from it is the validator's to say. */
function operandNode(context, operand) {
    const isState = operand.startsWith("$state.");
    const named = isState ? context.state : context.metrics;
    const key = isState ? operand.slice("$state.".length) : operand.slice(1);
    if (named.has(key)) return named.get(key);

    const kind = isState ? "state" : "metric";
    const setting = isState ? { name: key } : { alias: key };
    const id = context.addNode(idFor(context.taken, `${kind}.${key}`), kind, setting);
    named.set(key, id);
    return id;
}

/** The wire an operand needs when it names a value. */
function wireOperand(context, condition, port, operand) {
    if (inlineOf(operand) !== NAMED) return;
    const source = operandNode(context, operand);
    if (source) context.wire(source, "out", condition, port);
}

/** The literal a port was told, or nothing when the operand names a value. */
function inlineSetting(settings, port, operand) {
    const value = inlineOf(operand);
    if (value !== NAMED && value !== undefined) settings[port] = value;
}

/**
 * One condition of the document, drawn, with the values it names: the node that
 * evaluates it and the wires into its ports. Returns the id a wire may leave
 * from, or null for a shape this file cannot read — which only a document the
 * engine has already refused can hold.
 */
function addCondition(context, ast, seed) {
    if (!isPlainObject(ast)) return null;
    const operator = OPERATORS.find((name) => Object.prototype.hasOwnProperty.call(ast, name));
    if (!operator) return null;

    const payload = ast[operator];
    const label = typeof ast.label === "string" && ast.label.trim() ? ast.label : null;
    const settings = {};
    if (label) settings.label = label;

    switch (operator) {
        case "all":
        case "any": {
            const id = context.addNode(idFor(context.taken, seed), operator, settings);
            const list = Array.isArray(payload) ? payload : [];
            list.forEach((child, slot) => {
                const childId = addCondition(context, child, `${seed}.${slot}`);
                if (childId) context.wire(childId, "out", id, "in", slot);
            });
            return id;
        }
        case "not": {
            const id = context.addNode(idFor(context.taken, seed), "not", settings);
            const childId = addCondition(context, payload, `${seed}.0`);
            if (childId) context.wire(childId, "out", id, "in");
            return id;
        }
        case "count": {
            const block = isPlainObject(payload) ? payload : {};
            const test = COUNT_TESTS.find((field) => written(block[field]));
            const inner = typeof block.label === "string" && block.label.trim() ? block.label : null;
            const selfLabel = inner || label;
            delete settings.label;
            settings.window = block.window;
            if (test) {
                settings.test = test;
                settings.count = block[test];
            }
            /* A count may name itself inside its block or beside it; the canvas
             * remembers which, because the DSL refuses the same label in both. */
            if (selfLabel) {
                settings.label = selfLabel;
                settings.labelWhere = inner ? "count" : "node";
            }
            /* A block that names a feed and one that leaves it to the trigger
             * are two different documents, and the canvas draws the same wire
             * either way: it is the writing that has to be remembered. */
            if (written(block.feed)) settings.feedNamed = true;
            const id = context.addNode(idFor(context.taken, seed), "count", settings);
            const childId = addCondition(context, block.when, `${seed}.0`);
            if (childId) context.wire(childId, "out", id, "when");
            /* The frames a count walks: the feed it names, or the trigger's own
             * — drawn either way, since the canvas shows what is counted. */
            const counted = typeof block.feed === "string" ? block.feed : context.triggerKey;
            if (typeof counted === "string" && context.feeds.has(counted)) {
                context.wire(context.feeds.get(counted), "out", id, "frame");
            }
            return id;
        }
        case "exists": {
            const id = context.addNode(idFor(context.taken, seed), "exists", settings);
            wireOperand(context, id, "value", payload);
            return id;
        }
        case "in": {
            const [value, list] = Array.isArray(payload) ? payload : [];
            settings.list = Array.isArray(list) ? list.slice() : list;
            const id = context.addNode(idFor(context.taken, seed), "in", settings);
            wireOperand(context, id, "value", value);
            return id;
        }
        case "between": {
            const [value, low, high] = Array.isArray(payload) ? payload : [];
            inlineSetting(settings, "low", low);
            inlineSetting(settings, "high", high);
            const id = context.addNode(idFor(context.taken, seed), "between", settings);
            wireOperand(context, id, "value", value);
            wireOperand(context, id, "low", low);
            wireOperand(context, id, "high", high);
            return id;
        }
        case "crossesAbove":
        case "crossesBelow": {
            const [value, level] = Array.isArray(payload) ? payload : [];
            inlineSetting(settings, "level", level);
            if (Number.isInteger(ast.withinMs)) settings.withinMs = ast.withinMs;
            const id = context.addNode(idFor(context.taken, seed), operator, settings);
            wireOperand(context, id, "value", value);
            wireOperand(context, id, "level", level);
            return id;
        }
        default: {
            const [left, right] = Array.isArray(payload) ? payload : [];
            inlineSetting(settings, "left", left);
            inlineSetting(settings, "right", right);
            const id = context.addNode(idFor(context.taken, seed), operator, settings);
            wireOperand(context, id, "left", left);
            wireOperand(context, id, "right", right);
            return id;
        }
    }
}

/* ------------------------------------------------------------
 * The public act: a document, opened
 * ---------------------------------------------------------- */

/** JSON text or an object, as a document — or the reason it is neither. */
function readDocument(input) {
    const refusal = {
        ok: false,
        code: "bad-document",
        message: "a strategy document is an object: { name, feeds, metrics, when, action }"
    };

    if (typeof input !== "string") return isPlainObject(input) ? { ok: true, document: input } : refusal;

    try {
        const parsed = JSON.parse(input);
        return isPlainObject(parsed) ? { ok: true, document: parsed } : refusal;
    } catch (err) {
        return { ok: false, code: "bad-json", message: `this is not JSON: ${err.message}` };
    }
}

/**
 * A document, opened as a drawing.
 *
 * Both verdicts are asked for, and both are reported. The engine's comes first,
 * because it is the one that stops a bot: a document that does not compile still
 * becomes a graph — the editor has to show the person what they wrote and where
 * it went wrong — but `ok` is then false and `errors` holds the reasons, each in
 * the words of the layer that refused it. A document that compiles and draws
 * cleanly is `ok`, and its plan is the plan the runner would use.
 *
 * @param {string|object} input bot.json, as text or as the parsed object
 * @param {{ sidecar?:object|null, strict?:boolean, layout?:boolean }} [options]
 *   `sidecar` the positions the editor saved beside the document
 *   `strict`  refuse what the canvas would otherwise only warn about
 *   `layout`  place the nodes (the default); `false` leaves every position as it
 *             was drawn, which for a document is none of them
 * @returns {{ ok:boolean, strict:boolean, graph:object|null, document:object|null,
 *             plan:object|null, errors:object[], warnings:object[],
 *             diagnostics:object[] }}
 */
function loadDocument(input, { sidecar = null, strict = false, layout = true } = {}) {
    const read = readDocument(input);
    if (!read.ok) {
        const errors = Object.freeze([diagnostic(SEVERITY.ERROR, read.code, "$", read.message)]);
        return Object.freeze({
            ok: false,
            strict: Boolean(strict),
            graph: null,
            document: null,
            plan: null,
            errors,
            warnings: Object.freeze([]),
            diagnostics: errors
        });
    }

    const document = read.document;
    const compiled = compileStrategy(document);
    const drawn = buildGraph(document);
    /* Positions are laid out before the validator sees the graph: a graph that
     * has been validated carries a position for every node (the origin for the
     * ones nobody placed), and laying out an already-placed drawing is how a
     * sidecar would be undone. */
    const validated = validateGraph(applySidecar(layout ? layoutGraph(drawn) : drawn, sidecar), { strict });

    const engine = compiled.ok
        ? []
        : compiled.errors.map((error) => engineIssue(error.code, error.where, error.message));
    const errors = Object.freeze([...engine, ...validated.errors]);

    return Object.freeze({
        ok: compiled.ok && validated.ok,
        strict: validated.strict,
        graph: validated.graph,
        document,
        plan: compiled.ok ? compiled.plan : null,
        errors,
        warnings: validated.warnings,
        diagnostics: Object.freeze([...errors, ...validated.warnings])
    });
}

module.exports = {
    loadDocument,
    buildGraph
};

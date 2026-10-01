/**
 * B2 — Seam: bot.json → the canvas → bot.json
 * bot-engine/core/dsl-schema.cjs             (the grammar, its own example, the compiler)
 * bot-canvas/core/graph-schema.cjs           (what a drawing is)
 * bot-canvas/core/node-types.cjs             (what a node may say)
 * bot-canvas/compiler/ast-to-graph.cjs       (a document, opened)
 * bot-canvas/compiler/graph-validation.cjs   (is this drawing a strategy at all)
 * bot-canvas/compiler/graph-to-ast.cjs       (a drawing, written back)
 * bot-canvas/compiler/layout.cjs             (where a node sits, twice over)
 * ============================================================
 * A strategy can be written three ways: as a document a person edits, as a bot
 * the runner executes, and now as a drawing on a canvas. What makes the canvas
 * usable is that the three agree — a document loaded onto it is the same document
 * when it is saved again, byte for byte; a drawing that was never a document
 * becomes one that draws itself back; and a document the DSL refuses still opens,
 * saying what is wrong in each layer's own words. This test walks the seam in
 * both directions and pins down what the two sides promise each other:
 *
 *   1. the DSL's own example opens whole: one node per feed, metric, variable and
 *      condition, every field on the node it belongs to, and every position
 *      derived from the document rather than from the moment it was loaded;
 *   2. a document that compiles here compiles back to itself — the same bytes, in
 *      the DSL's own order, and the same plan the runner would use;
 *   3. the other direction is a seam too: a graph drawn by hand becomes a
 *      document, and that document draws itself back to the same graph;
 *   4. a broken document still opens — the canvas shows what was written and what
 *      is wrong, never throws, and never repairs anything quietly;
 *   5. positions are presentation and never meaning: a sidecar may move a node and
 *      may do nothing else, what the document says is the same bytes wherever the
 *      nodes sit, and an id or a coordinate it invents changes nothing at all;
 *   6. what the canvas remembers for itself (a block written empty, a trigger only
 *      implied, where a label sits, which feed a count named) never reaches
 *      bot.json — it is bookkeeping the DSL has no field for;
 *   7. every operator the DSL has travels both ways, so a canvas cannot render a
 *      condition it cannot write back;
 *   8. one document is one drawing: the layout is derived from the document, so
 *      opening and saving the same strategy again changes nothing, either way;
 *   9. a drawing that is not a strategy is refused where it was drawn — which
 *      node, which wire, which port — an input that is not a graph at all is
 *      refused as what it is, and nothing is written out of either;
 *  10. what the canvas only advises is still said, and `strict` makes every one
 *      of those notes a refusal, under the same name: one vocabulary, always.
 *
 * Run: node bot-canvas/tests/seam-canvas.test.cjs
 *      node bot-canvas/tests/run-all.cjs            (this and every later file)
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { DSL_VERSION, EXAMPLE, ROOT_FIELDS, LIMITS: DSL_LIMITS, compileStrategy } = require(path.join(ROOT, "bot-engine", "core", "dsl-schema.cjs"));
const { GRAPH_VERSION, LIMITS, ID_PATTERN, emptyGraph, node, edge, indexNodes, edgeInto, edgesInto } = require(path.join(ROOT, "bot-canvas", "core", "graph-schema.cjs"));
const { ROLE_ORDER, nodeType } = require(path.join(ROOT, "bot-canvas", "core", "node-types.cjs"));
const { loadDocument, buildGraph } = require(path.join(ROOT, "bot-canvas", "compiler", "ast-to-graph.cjs"));
const { compileGraph, writeDocument } = require(path.join(ROOT, "bot-canvas", "compiler", "graph-to-ast.cjs"));
const { validateGraph } = require(path.join(ROOT, "bot-canvas", "compiler", "graph-validation.cjs"));
const { SIDECAR_VERSION, BOX, columnOf, layoutGraph, applySidecar, sidecarOf, sidecarPath } = require(path.join(ROOT, "bot-canvas", "compiler", "layout.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `B2: ${msg}`);
    checks += 1;
};

/* ------------------------------------------------------------
 * Fixtures and readers
 * ---------------------------------------------------------- */

/** A document as text, which is how two documents are compared here: the fields
 *  a document holds, in the order it holds them. */
const text = (value) => JSON.stringify(value, null, 2);

/**
 * A fixture in the order the DSL writes one. Two objects with the same fields in
 * a different order are the same strategy, so the fixtures are put in ROOT_FIELDS
 * order before anything is compared byte for byte — otherwise this file would be
 * testing the order its own literal happens to be typed in.
 */
function ordered(blocks) {
    const out = {};
    for (const field of ROOT_FIELDS) if (Object.prototype.hasOwnProperty.call(blocks, field)) out[field] = blocks[field];
    return out;
}

/** A strategy the DSL accepts: one feed, one metric, one comparison. */
const base = (extra = {}) => ordered({
    version: DSL_VERSION,
    name: "seam",
    trigger: "a",
    feeds: { a: { topic: "analytics.crypto.${asset}.cvd", history: 5 } },
    metrics: { cvd: { feed: "a", path: "aggregate.cvd" } },
    when: { gt: ["$cvd", 0] },
    action: { type: "alert" },
    ...extra
});

const byId = (graph, id) => graph.nodes.find((entry) => entry.id === id) || null;
const nodesOfType = (graph, type) => graph.nodes.filter((entry) => entry.type === type);
const wireId = (graph, id, port) => {
    const arrival = edgeInto(indexNodes(graph), id, port);
    return arrival ? arrival.from.node : null;
};
const wire = (from, fromPort, to, toPort, index = null) => edge({ from: { node: from, port: fromPort }, to: { node: to, port: toPort, index } });

/** A graph without the positions: what a drawing says when it is not about where. */
const withoutPositions = (graph) => JSON.stringify({
    nodes: graph.nodes.map(({ position, ...rest }) => rest),
    edges: graph.edges
});

/** Settings compared by what they say, not the order the reader happened to build
 *  them in: where a key sits in an object is not a field of a strategy. */
function sortedKeys(value) {
    if (Array.isArray(value)) return value.map(sortedKeys);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortedKeys(value[key]);
    return out;
}

/** What a drawing says without its names or its places: one entry per node — its
 *  type, its settings, and the ports its wires leave from and arrive at. Two
 *  drawings of one strategy whose nodes were named differently are the same
 *  drawing by this measure. */
const shapeOf = (graph) => JSON.stringify(graph.nodes
    .map((entry) => ({
        type: entry.type,
        settings: sortedKeys(entry.settings),
        wires: graph.edges
            .filter((w) => w.from.node === entry.id || w.to.node === entry.id)
            .map((w) => (w.from.node === entry.id ? `out:${w.from.port}` : `in:${w.to.port}`))
            .sort()
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

/** The canvas's own bookkeeping: settings that belong to the drawing, not to the
 *  strategy, and which therefore may never appear in a document. */
const CANVAS_ONLY = ["implicitTrigger", "emptyBlocks", "labelWhere", "feedNamed"];

/* ------------------------------------------------------------
 * 1. A document, opened whole
 * ---------------------------------------------------------- */

function theExampleOpensWhole() {
    const opened = loadDocument(EXAMPLE, { strict: true });
    const graph = opened.graph;

    ok(opened.ok && opened.strict, "the DSL's own example opens, strictly");
    ok(opened.errors.length === 0 && opened.warnings.length === 0, "with nothing to complain about");
    ok(graph !== null && graph.version === GRAPH_VERSION, "what comes back is a graph of this canvas's own version");
    ok(nodesOfType(graph, "strategy").length === 1, "one document becomes one strategy node");
    ok(graph.nodes.every((entry) => ID_PATTERN.test(entry.id)), "every node is named by an id a wire may hold");
    ok(new Set(graph.nodes.map((entry) => entry.id)).size === graph.nodes.length, "and no two nodes are the same name");
    ok(graph.nodes.every((entry) => entry.position !== null), "every node was placed without anyone placing it");
    ok(new Set(graph.nodes.map((entry) => `${entry.position.x},${entry.position.y}`)).size === graph.nodes.length, "no two of them on top of each other");
    ok(graph.nodes.every((entry) => Math.abs(entry.position.x) <= LIMITS.coord && Math.abs(entry.position.y) <= LIMITS.coord), "all inside the space a canvas can draw");

    const strategy = byId(graph, "strategy");
    ok(strategy !== null && strategy.settings.name === EXAMPLE.name && strategy.settings.bot === EXAMPLE.bot, "the strategy node carries the header: the name and the id signals carry");
    ok(strategy.settings.description === EXAMPLE.description, "and the description, word for word");
    ok(strategy.settings.symbols.join(",") === EXAMPLE.universe.symbols.join(","), "the universe becomes the symbols of one strategy node");
    ok(strategy.settings.exchange === EXAMPLE.universe.exchange && strategy.settings.cooldownMs === EXAMPLE.cooldownMs, "with its venue and the least time between two signals");
    ok(wireId(graph, "strategy", "trigger") === "feed.flow", "the trigger is a wire from the feed the document named");

    for (const key of Object.keys(EXAMPLE.feeds)) {
        const feed = byId(graph, `feed.${key}`);
        ok(feed !== null && feed.type === "feed", `feed "${key}" is drawn as the node its key names`);
    }
    ok(byId(graph, "feed.flow").settings.assetClass === "crypto" && byId(graph, "feed.flow").settings.asset === "${asset}", "a feed carries the parts of the topic it reads");
    ok(byId(graph, "feed.flow").settings.eventType === "cvd" && byId(graph, "feed.flow").settings.maxAgeMs === EXAMPLE.feeds.flow.maxAgeMs, "the event it subscribes to, and how old a reading may be");
    ok(byId(graph, "feed.flow").settings.history === EXAMPLE.feeds.flow.history, "and how much of it to keep");

    for (const alias of Object.keys(EXAMPLE.metrics)) {
        const metric = byId(graph, `metric.${alias}`);
        ok(metric !== null && metric.type === "metric", `metric "${alias}" is drawn as a node of its own`);
    }
    ok(byId(graph, "metric.cvd").settings.path === EXAMPLE.metrics.cvd.path, "a metric keeps the path it reads");
    ok(byId(graph, "metric.cvd").settings.label === EXAMPLE.metrics.cvd.label, "and the name it was given");
    ok(wireId(graph, "metric.cvd", "feed") === "feed.flow", "and is wired to the feed it reads");

    const signals = byId(graph, "state.signals");
    ok(signals !== null && signals.settings.init === EXAMPLE.state.signals.init, "a state variable carries what it started as");
    ok(signals.settings.onSignal.add === EXAMPLE.state.signals.onSignal.add, "and what a signal does to it");
    ok(signals.settings.resetAfterMs === EXAMPLE.state.signals.resetAfterMs, "and when it forgets");

    ok(byId(graph, "when") !== null && byId(graph, "when").type === "all", "a logic operator becomes one node");
    ok(edgesInto(indexNodes(graph), "when", "in").length === EXAMPLE.when.all.length, "with one wire per condition it holds");

    const count = byId(graph, "when.0");
    ok(count !== null && count.type === "count", "a count is a node of its own");
    ok(count.settings.window === 5, "carrying the window it walks");
    ok(count.settings.test === "atLeast" && count.settings.count === 3, "which threshold it uses, and what the threshold is");
    ok(wireId(graph, "when.0", "frame") === "feed.flow", "and the feed whose frames it counts");
    ok(byId(graph, "when.0.0") !== null && byId(graph, "when.0.0").type === "gt", "the condition inside it is a node too, under the count's own name");
    ok(byId(graph, "when.0.0").settings.right === 0, "with the literal it was told in its port");
    ok(byId(graph, "when.1").settings.label === "the aggressors are buyers", "a label lands on the condition it names");

    const action = byId(graph, "action");
    ok(action !== null && action.settings.type === EXAMPLE.action.type, "the action says what a signal means");
    ok(action.settings.severity === EXAMPLE.action.severity && action.settings.note === EXAMPLE.action.note, "with its severity and its note");
    ok(wireId(graph, "action", "when") === "when", "and fires on the tree wired into it");

    ok(JSON.stringify(opened.plan) === JSON.stringify(compileStrategy(EXAMPLE).plan), "the plan is the plan the runner would use");
}

/* ------------------------------------------------------------
 * 2. The same document again, and the other direction
 * ---------------------------------------------------------- */

function theDocumentCompilesBackToItself() {
    const opened = loadDocument(EXAMPLE, { strict: true });
    const back = compileGraph(opened.graph, { strict: true });

    ok(back.ok && back.graph !== null, "the drawing compiles back");
    ok(text(back.document) === text(EXAMPLE), "into the document that was loaded, byte for byte");
    ok(JSON.stringify(back.plan) === JSON.stringify(compileStrategy(EXAMPLE).plan), "and its plan is the runner's own plan for that document");
    ok(Object.keys(back.document).every((field) => ROOT_FIELDS.includes(field)), "with no field the DSL does not know");
    ok(Object.keys(back.document).length === Object.keys(EXAMPLE).length, "and nothing the document said was dropped on the way");

    const at = Object.keys(back.document).map((field) => ROOT_FIELDS.indexOf(field));
    ok(at.every((position, index) => index === 0 || at[index - 1] < position), "written in the DSL's own order, so two saves of one strategy are one text");
}

function aDrawingBecomesItsOwnDocument() {
    const hand = Object.assign(emptyGraph({ title: "drawn by hand" }), {
        nodes: [
            node({ id: "strategy", type: "strategy", settings: { name: "smoke bot", symbols: ["BTCUSDT"], exchange: "binance", cooldownMs: 300000, once: true, description: "a smoke bot" } }),
            node({ id: "feed", type: "feed", settings: { key: "cvd", assetClass: "crypto", asset: "${asset}", eventType: "cvd", history: 60, maxAgeMs: 60000 } }),
            node({ id: "cvd1m", type: "metric", settings: { alias: "cvd1m", path: "aggregate.cvd", label: "merged cvd" } }),
            node({ id: "gt", type: "gt", settings: { right: 0, label: "buyers" } }),
            node({ id: "action", type: "action", settings: { type: "alert", severity: "info", note: "look" } })
        ],
        edges: [
            wire("feed", "out", "strategy", "trigger"),
            wire("feed", "out", "cvd1m", "feed"),
            wire("cvd1m", "out", "gt", "left"),
            wire("gt", "out", "action", "when")
        ]
    });

    ok(validateGraph(hand, { strict: true }).ok, "a graph nobody wrote a document for is a strategy all the same");
    const first = compileGraph(hand, { strict: true });
    ok(first.ok, "so it compiles");
    ok(first.document.name === "smoke bot" && first.document.trigger === "cvd", "the strategy node is the header, and the trigger is the wire into it");
    ok(first.document.metrics.cvd1m.feed === "cvd", "a metric wired to a feed writes that feed");
    ok(first.document.metrics.cvd1m.path === "aggregate.cvd" && first.document.metrics.cvd1m.label === "merged cvd", "with the path it reads and the name it was given");
    ok(text(first.document.when) === text({ gt: ["$cvd1m", 0], label: "buyers" }), "a comparison with one wire and one literal writes both, in the DSL's own shape");
    ok(first.document.cooldownMs === 300000 && first.document.once === true, "the cadence is written where the DSL writes it");
    ok(first.document.universe.symbols.length === 1 && first.document.universe.symbols[0] === "BTCUSDT", "and the symbols a strategy node gathered become a universe again");
    ok(first.document.version === DSL_VERSION, "the document names the DSL version it was written for");

    const reopened = loadDocument(first.document, { strict: true });
    ok(reopened.ok, "the document it wrote draws itself back");
    ok(reopened.graph.nodes.length === hand.nodes.length, "with the nodes it was drawn from");
    ok(byId(reopened.graph, "feed.cvd") !== null && byId(reopened.graph, "metric.cvd1m") !== null, "named after what the document calls them, which is what a wire names");

    const second = compileGraph(reopened.graph, { strict: true });
    ok(second.ok && text(second.document) === text(first.document), "and saving it again writes the same bytes");
    ok(JSON.stringify(second.plan) === JSON.stringify(first.plan), "for the same plan");
    ok(shapeOf(second.graph) === shapeOf(first.graph), "and the drawing came back: the same nodes with the same settings and the same wires, under the names the document gave them");
    ok(writeDocument(hand).ok, "a drawing is a document even before anything validated it");
}

/* ------------------------------------------------------------
 * 3. A document the DSL refuses still opens
 * ---------------------------------------------------------- */

function aBrokenDocumentStillOpens() {
    const broken = base({ name: "broken", trigger: "nope", when: { gt: ["$nope", 3] } });
    const opened = loadDocument(broken, { strict: true });

    ok(opened.ok === false, "a document the DSL refuses does not load clean");
    ok(opened.graph !== null && opened.graph.nodes.length > 0, "but it still opens: the editor has something to show");
    ok(opened.errors.length > 0 && opened.plan === null, "with the reasons, and no plan to run");
    ok(opened.errors.every((entry) => entry.source === "engine" || entry.source === "canvas"), "each reason from the layer that refused it");
    ok(opened.errors.every((entry) => typeof entry.code === "string" && typeof entry.where === "string" && entry.message.length > 0), "and each pointing at a place, in words");
    ok(opened.errors.some((entry) => entry.source === "engine"), "the engine's own verdict is among them");
    ok(byId(opened.graph, "metric.nope") !== null, "a value the document reads but never declares is drawn as the node it names");
    ok(byId(opened.graph, "metric.nope").settings.alias === "nope", "so the person can see which name is missing");
    ok(wireId(opened.graph, "metric.nope", "feed") === null, "with no feed invented for it");
    ok(edgeInto(indexNodes(opened.graph), "strategy", "trigger") === null, "and a trigger that names no feed is no wire");

    const twoFeeds = base({
        name: "ambiguous",
        feeds: { a: { topic: "analytics.crypto.${asset}.cvd", history: 5 }, b: { topic: "analytics.crypto.${asset}.orderbook_imbalance", history: 5 } },
        metrics: { cvd: { feed: "a", path: "aggregate.cvd" } }
    });
    delete twoFeeds.trigger;
    const guessed = loadDocument(twoFeeds, { strict: true });
    ok(guessed.ok === false, "two feeds and no trigger is refused: the DSL will not guess which one was meant");
    ok(guessed.errors.some((entry) => entry.code === "missing-trigger" && entry.source === "canvas"), "and the canvas says so in its own words, beside the engine's");
    ok(byId(guessed.graph, "strategy").settings.implicitTrigger === undefined, "without remembering a trigger the document never implied");

    const asText = loadDocument(JSON.stringify(EXAMPLE));
    ok(asText.ok && text(asText.graph) === text(loadDocument(EXAMPLE).graph), "a document that arrives as text opens exactly as the object it parses to");
    const nonsense = loadDocument("this is not json");
    ok(nonsense.ok === false && nonsense.graph === null && nonsense.errors[0].code === "bad-json", "a file that is not JSON is refused in its own words");
    const wrong = loadDocument(42);
    ok(wrong.ok === false && wrong.graph === null && wrong.errors[0].code === "bad-document", "and so is a file that is not an object");
    const bare = loadDocument({ version: DSL_VERSION, name: "bare" });
    ok(bare.ok === false && bare.graph !== null && bare.graph.nodes.length === 2, "a document that is barely one still opens, with the strategy it named and the action every strategy needs");
    ok(!byId(bare.graph, "action").settings.type && wireId(bare.graph, "action", "when") === null, "the action empty and unwired, so a person has somewhere to say what a signal means");
    ok(bare.errors.some((entry) => entry.source === "engine") && bare.errors.some((entry) => entry.source === "canvas"), "and both layers say what is missing, each in its own words");
}

/* ------------------------------------------------------------
 * 4. Where a node sits is not what it says
 * ---------------------------------------------------------- */

function positionsArePresentation() {
    const opened = loadDocument(EXAMPLE, { strict: true });
    const sidecar = sidecarOf(opened.graph, { document: "squeeze-confluence.json" });
    for (const at of Object.values(sidecar.positions)) {
        at.x += 5000;
        at.y -= 3000;
    }
    const moved = loadDocument(EXAMPLE, { sidecar, strict: true });

    ok(byId(moved.graph, "action").position.x === sidecar.positions.action.x, "a node is drawn where the sidecar remembers it");
    ok(byId(moved.graph, "action").position.y === sidecar.positions.action.y, "on both axes");
    ok(text(compileGraph(moved.graph).document) === text(EXAMPLE), "move every node and the document is the same bytes: a position is not something a strategy says");
    ok(JSON.stringify(compileGraph(moved.graph).plan) === JSON.stringify(compileGraph(opened.graph).plan), "and the plan is unmoved too");
    ok(text(withoutPositions(moved.graph)) === text(withoutPositions(opened.graph)), "the drawing is the same drawing, in a different place");

    const flat = loadDocument(EXAMPLE, { layout: false });
    ok(flat.graph.nodes.every((entry) => entry.position.x === 0 && entry.position.y === 0), "with the layout off nobody placed anything: every node sits at the origin a graph schema starts one at");

    const laid = layoutGraph(buildGraph(EXAMPLE));
    ok(text(laid) === text(layoutGraph(buildGraph(EXAMPLE))), "the layout is derived, so one document is one drawing");
    ok(byId(laid, "strategy").position.x === BOX.marginX && byId(laid, "strategy").position.y === BOX.marginY, "the first column starts at the margin");
    ok(byId(laid, "feed.flow").position.x === BOX.marginX + BOX.width + BOX.columnGap, "and the next column one box and one gap further along");
    ok(columnOf("feed") === ROLE_ORDER.indexOf(nodeType("feed").role), "a column per role");
    ok(columnOf("a-type-nobody-knows") === ROLE_ORDER.length, "and a type nobody knows is drawn last rather than on top of the first column");

    const onlyPositions = applySidecar(opened.graph, { positions: { action: { x: 1.5, y: -2.5 } }, viewport: { x: 3, y: 4, zoom: 2 } });
    ok(byId(onlyPositions, "action").position.x === 1.5 && byId(onlyPositions, "action").position.y === -2.5, "a sidecar says where, and a fraction of a pixel is a place a node may sit");
    ok(onlyPositions.viewport.zoom === 2 && onlyPositions.viewport.x === 3 && onlyPositions.viewport.y === 4, "and how the canvas was looking at it when it saved");
    ok(byId(onlyPositions, "strategy").position.x === byId(opened.graph, "strategy").position.x, "every node the sidecar does not mention keeps the place the layout gave it");
    ok(text(applySidecar(opened.graph, { title: "something else", nodes: [], edges: [{ from: {}, to: {} }] })) === text(opened.graph), "a sidecar cannot add, rename or rewire: positions and a viewport are all it is read for");
}

/* ------------------------------------------------------------
 * 5. What a sidecar may say, and what it may not
 * ---------------------------------------------------------- */

function theSidecarIsClampedAndIgnored() {
    const opened = loadDocument(EXAMPLE, { strict: true });
    const wild = applySidecar(opened.graph, {
        positions: {
            action: { x: 10 * LIMITS.coord, y: -10 * LIMITS.coord },
            strategy: { x: Number.NaN, y: "9" },
            feed: { x: 1, y: 1 }
        },
        viewport: { x: 10 * LIMITS.coord, y: -10 * LIMITS.coord, zoom: 99 }
    });

    ok(byId(wild, "action").position.x === LIMITS.coord && byId(wild, "action").position.y === -LIMITS.coord, "a coordinate is clamped into the space a canvas can draw");
    ok(byId(wild, "strategy").position.x === 0 && byId(wild, "strategy").position.y === 0, "a coordinate that is not a number is no coordinate at all");
    ok(byId(wild, "feed.flow").position.x === byId(opened.graph, "feed.flow").position.x, "an id the graph does not hold is ignored");
    ok(wild.nodes.length === opened.graph.nodes.length, "so a sidecar cannot add a node by naming one");
    ok(wild.viewport.zoom === LIMITS.zoomMax && wild.viewport.x === LIMITS.coord && wild.viewport.y === -LIMITS.coord, "and the viewport is clamped into the same space");

    ok(text(applySidecar(opened.graph, "not a sidecar")) === text(opened.graph), "a sidecar that is not an object changes nothing");
    ok(text(applySidecar(opened.graph, { positions: { strategy: null } })) === text(opened.graph), "and neither does a position that is not one");
    ok(text(applySidecar(opened.graph, { positions: { action: { x: 5, y: 5 } } })).includes("\"zoom\": 1"), "a sidecar with no viewport leaves the canvas looking where it was");

    ok(sidecarPath("bots/squeeze-confluence.json") === "bots/squeeze-confluence.canvas.json", "a sidecar lives beside the document it belongs to");
    ok(sidecarPath("SQUEEZE.JSON") === "SQUEEZE.canvas.json", "whatever case the extension was written in");
    ok(sidecarPath(null) === ".canvas.json", "and a document with no path at all gets a sidecar anyway");

    const saved = sidecarOf(wild, { document: "squeeze-confluence.json" });
    ok(saved.version === SIDECAR_VERSION && saved.document === "squeeze-confluence.json", "what the editor saves names itself and the document it belongs to");
    ok(Object.keys(saved.positions).length === wild.nodes.length, "and remembers where each node sits");
    ok(text(applySidecar(opened.graph, saved)) === text(wild), "so opening it again puts every node back where it was");
    ok(sidecarOf(opened.graph).document === null, "and a sidecar with no document to name says so rather than guessing");
}

/* ------------------------------------------------------------
 * 6. What the canvas remembers for itself never reaches bot.json
 * ---------------------------------------------------------- */

function canvasBookkeepingStaysOnTheCanvas() {
    const implied = ordered({
        version: DSL_VERSION,
        name: "one feed, no trigger written",
        description: "the DSL implies the only feed there is",
        feeds: { a: { topic: "analytics.crypto.${asset}.cvd", history: 5 } },
        metrics: { cvd: { feed: "a", path: "aggregate.cvd" } },
        when: { gt: ["$cvd", 0] },
        action: { type: "alert" }
    });
    const opened = loadDocument(implied, { strict: true });
    ok(opened.ok, "a one-feed strategy that wrote no trigger key compiles: the DSL implies the feed it has");
    ok(opened.warnings.length === 0, "and nothing is warned about: the flag and the drawing agree about which feed starts an evaluation");

    /* A person who then draws that wire by hand: the wire is the answer, the flag
     * becomes a note, and the validator says as much rather than refusing. */
    const drawnOn = { ...opened.graph, edges: [...opened.graph.edges, wire("feed.a", "out", "strategy", "trigger")] };
    const judged = validateGraph(drawnOn);
    ok(judged.ok, "a wire drawn onto an implied trigger is still a strategy");
    ok(judged.warnings.some((entry) => entry.code === "stale-trigger-flag"), "and it is warned about: the wire is what compiles, the flag is only what the document implied");
    ok(compileGraph(drawnOn).document.trigger === "a", "so the document then names the trigger the person drew");
    ok(compileGraph(drawnOn, { strict: true }).ok === false, "while a canvas asked to be strict refuses the disagreement outright");
    ok(byId(opened.graph, "strategy").settings.implicitTrigger === true, "so the canvas remembers that the key was absent");
    ok(edgeInto(indexNodes(opened.graph), "strategy", "trigger") === null, "and draws no wire for a trigger the document only implied");
    const back = compileGraph(opened.graph, { strict: true });
    ok(back.ok && text(back.document) === text(implied), "which is how the key comes back absent, byte for byte");
    ok(Object.prototype.hasOwnProperty.call(back.document, "trigger") === false, "with no trigger key written at all");

    const emptyState = base({ state: {} });
    const withState = loadDocument(emptyState, { strict: true });
    ok(withState.ok, "a document that wrote its state block empty compiles: an empty block is not a missing one");
    ok(byId(withState.graph, "strategy").settings.emptyBlocks.join(",") === "state", "the canvas remembers which block was written empty");
    ok(text(compileGraph(withState.graph).document) === text(emptyState), "so the empty block is written back, not filled in and not dropped");

    const named = base({ when: { count: { feed: "a", window: 3, when: { gt: ["$cvd", 0] } } } });
    const withName = loadDocument(named, { strict: true });
    ok(withName.ok, "a count that named the trigger's own feed compiles");
    ok(byId(withName.graph, "when").settings.feedNamed === true, "and the canvas remembers that the block said so, though the wire looks like every other count's");
    ok(wireId(withName.graph, "when", "frame") === "feed.a", "the counted feed is drawn either way");
    ok(text(compileGraph(withName.graph).document) === text(named), "so the feed the block named is written back");

    const silent = base({ when: { count: { window: 3, when: { gt: ["$cvd", 0] } } } });
    const silentOpened = loadDocument(silent, { strict: true });
    ok(silentOpened.ok && byId(silentOpened.graph, "when").settings.feedNamed === undefined, "a count that said nothing about its feed is not remembered as having named one");
    const silentBack = compileGraph(silentOpened.graph).document;
    ok(text(silentBack) === text(silent), "and its block comes back without the key, byte for byte");
    ok(!Object.prototype.hasOwnProperty.call(silentBack.when.count, "feed"), "which the DSL reads as the trigger's own frames");
    ok(!Object.prototype.hasOwnProperty.call(silentBack.when.count, "atLeast"), "and a threshold nobody wrote is not invented either");

    const beside = base({ when: { count: { window: 3, when: { gt: ["$cvd", 0] } }, label: "rare" } });
    const besideOpened = loadDocument(beside, { strict: true });
    ok(besideOpened.ok && byId(besideOpened.graph, "when").settings.labelWhere === "node", "a label written beside the count is remembered as having been written beside it");
    ok(text(compileGraph(besideOpened.graph).document) === text(beside), "and comes back beside it rather than inside the block");

    const inside = base({ when: { count: { window: 3, when: { gt: ["$cvd", 0] }, label: "three of five" } } });
    const insideOpened = loadDocument(inside, { strict: true });
    ok(insideOpened.ok && byId(insideOpened.graph, "when").settings.labelWhere === "count", "a label written inside the block is remembered the same way, the other way round");
    ok(text(compileGraph(insideOpened.graph).document) === text(inside), "and comes back inside it");

    const written = text(compileGraph(loadDocument(EXAMPLE, { strict: true }).graph).document);
    const mentions = CANVAS_ONLY.filter((key) => written.includes(key));
    ok(mentions.length === 0, `the canvas's own bookkeeping (${mentions.join(", ") || "none of it"}) never reaches bot.json`);
    ok(CANVAS_ONLY.every((key) => !ROOT_FIELDS.includes(key)), "and the DSL has no such fields to reach");

    const refused = loadDocument(base({ universe: {} }), { strict: true });
    ok(refused.ok === false, "the DSL refuses a universe with no symbols");
    ok(byId(refused.graph, "strategy").settings.emptyBlocks.includes("universe"), "the canvas still remembers the block was written");
    ok(Object.prototype.hasOwnProperty.call(writeDocument(refused.graph).document, "universe"), "and writes it back empty rather than inventing a symbol");
}

/* ------------------------------------------------------------
 * 7. Every operator the DSL has travels both ways
 * ---------------------------------------------------------- */

function everyOperatorTravelsBothWays() {
    const document = base({
        when: {
            any: [
                { not: { gt: ["$cvd", 0] } },
                { between: ["$cvd", -1, 1] },
                { exists: "$cvd" },
                { crossesAbove: ["$cvd", 5], withinMs: 60000 },
                { in: ["$cvd", [1, 2]] }
            ]
        }
    });
    const opened = loadDocument(document, { strict: true });
    ok(opened.ok, "a document that uses every operator this DSL has opens");
    ok(byId(opened.graph, "when").type === "any" && byId(opened.graph, "when.0").type === "not", "logic is a node with a wire per child");
    ok(byId(opened.graph, "when.3").settings.withinMs === 60000, "a time window on a crossing stays on the crossing");
    const back = compileGraph(opened.graph, { strict: true });
    ok(back.ok && text(back.document) === text(document), "and all five come back the way they were written");

    const again = loadDocument(back.document, { strict: true });
    ok(text(withoutPositions(again.graph)) === text(withoutPositions(opened.graph)), "so the operator a canvas drew is the operator it writes");

    const nested = loadDocument(base({ when: { not: { any: [{ lt: ["$cvd", 0] }, { exists: "$cvd" }] } } }), { strict: true });
    ok(nested.ok && byId(nested.graph, "when").type === "not" && byId(nested.graph, "when.0").type === "any", "and nesting reads as nesting, in either direction");
    ok(text(compileGraph(nested.graph).document.when) === text({ not: { any: [{ lt: ["$cvd", 0] }, { exists: "$cvd" }] } }), "which writes back one level at a time");
}

/* ------------------------------------------------------------
 * 8. One document, one drawing, every time
 * ---------------------------------------------------------- */

function oneDocumentIsOneDrawing() {
    ok(text(buildGraph(EXAMPLE)) === text(buildGraph(EXAMPLE)), "the same document draws the same nodes and wires, twice");
    ok(text(loadDocument(EXAMPLE).graph) === text(loadDocument(EXAMPLE).graph), "and loads to the same drawing, positions and all");

    const sidecar = sidecarOf(loadDocument(EXAMPLE).graph, { document: "squeeze-confluence.json" });
    const reloaded = loadDocument(EXAMPLE, { sidecar });
    ok(text(sidecarOf(reloaded.graph, { document: "squeeze-confluence.json" })) === text(sidecar), "what the editor saves is what it loaded: opening and saving changes nothing");

    const first = compileGraph(reloaded.graph);
    const second = compileGraph(loadDocument(first.document).graph);
    ok(text(second.document) === text(first.document), "a save after a load is a fixed point: the text stops changing");
    ok(withoutPositions(second.graph) === withoutPositions(first.graph), "and the drawing it was saved from comes back, node for node and wire for wire");
    ok(text(layoutGraph(buildGraph(EXAMPLE))) === text(layoutGraph(buildGraph(EXAMPLE))), "because the layout adds nothing that depends on when it ran");

    const strict = loadDocument(EXAMPLE, { strict: true });
    const loose = loadDocument(EXAMPLE);
    ok(text(withoutPositions(strict.graph)) === text(withoutPositions(loose.graph)), "and asking for strict refuses nothing a document this one does not have to worry about");
}

/* ------------------------------------------------------------
 * 9. A drawing that is not a strategy is refused where it was drawn
 * ---------------------------------------------------------- */

const clone = (value) => JSON.parse(JSON.stringify(value));
const example = () => clone(buildGraph(EXAMPLE));

/** How the validator counts a node's place, which is how it points at it. */
const atOf = (graph, id) => graph.nodes.findIndex((entry) => entry.id === id);
const whereNode = (graph, id) => `$.nodes[${atOf(graph, id)}]`;
const pushNode = (graph, entry) => {
    graph.nodes.push(node(entry));
    return graph.nodes.length - 1;
};
const pushEdge = (graph, entry) => {
    graph.edges.push(entry);
    return graph.edges.length - 1;
};
const dropEdges = (graph, keep) => {
    graph.edges = graph.edges.filter(keep);
    return graph;
};

/** A strategy with two feeds: what the trigger and staleness rules are about. */
function pair({ b = {}, when, metrics } = {}) {
    return ordered({
        version: DSL_VERSION,
        name: "two feeds",
        trigger: "a",
        feeds: { a: { topic: "analytics.crypto.${asset}.cvd", history: 5 }, b: { topic: "analytics.crypto.${asset}.orderbook_imbalance", ...b } },
        metrics: metrics || { cvd: { feed: "a", path: "aggregate.cvd" }, imbalance: { feed: "b", path: "weightedImbalance" } },
        when: when || { all: [{ gt: ["$cvd", 0] }, { gt: ["$imbalance", 0.05] }] },
        action: { type: "alert" }
    });
}

/**
 * One refusal, and everything a refusal promises: the drawing is not a strategy,
 * the code is the name of the rule that was broken, the complaint points at the
 * place the mistake was drawn rather than at a path in a document, the layer
 * that can see it is the one that says it, and — the promise that makes a
 * refusal safe to trust — nothing is written out of it, not even under `strict`,
 * whose only job is to add notes to what was already refused.
 */
function refused(name, graph, code, where = null) {
    const judged = validateGraph(graph);
    ok(judged.ok === false, `${name}: a drawing like this is not a strategy`);
    const entry = judged.errors.find((item) => item.code === code);

    ok(Boolean(entry), `${name}: refused as "${code}"`);
    if (!entry) return null;

    ok(entry.source === "canvas", `${name}: by the layer that can see it`);
    ok(entry.where.startsWith("$") && entry.message.length > 0, `${name}: with a place in the drawing and a sentence about it`);
    if (where) ok(entry.where === where, `${name}: at ${where}, which is where it was drawn`);

    const strict = compileGraph(graph, { strict: true });
    ok(strict.ok === false && strict.document === null, `${name}: and no document is written out of it`);
    return entry;
}

/** A wire is a promise that two ports exist; the wires below break it. */
function wiresThatLeadNowhereAreRefused() {
    {
        const graph = example();
        const border = pushEdge(graph, wire("metric.cvd", "out", "nobody", "feed"));
        refused("a wire into a node nobody drew", graph, "unknown-node", `$.edges[${border}]`);
    }
    {
        const graph = example();
        const border = pushEdge(graph, wire("metric.cvd", "out", "metric.cvd", "feed"));
        const entry = refused("a node reading itself", graph, "self-edge", `$.edges[${border}]`);
        ok(entry && entry.nodeId === "metric.cvd", "a node reading itself: the refusal names the node, not only the wire");
    }
    {
        const graph = example();
        graph.edges[0].from.port = "nope";
        refused("a wire leaving a port that does not exist", graph, "unknown-port", "$.edges[0].from.port");
    }
    {
        const graph = example();
        graph.edges[0].to.port = "nope";
        refused("a wire arriving at a port that does not exist", graph, "unknown-port", "$.edges[0].to.port");
    }
    {
        const graph = example();
        const border = pushEdge(graph, wire("feed.flow", "out", "metric.cvd", "feed"));
        refused("two wires into a port that takes one", graph, "port-arity", `$.edges[${border}].to.port`);
    }
    {
        const graph = example();
        const border = pushEdge(graph, clone(graph.edges[0]));
        const entry = refused("the same wire drawn twice", graph, "port-arity", `$.edges[${border}].to.port`);
        ok(entry && typeof entry.edgeId === "string" && entry.edgeId.includes("->"), "the same wire drawn twice: refused under the name of the wire, because it is two wires");
    }
    {
        const graph = example();
        graph.edges[0].to.index = 3;
        refused("a slot on a port that takes one wire", graph, "bad-slot", "$.edges[0].to.index");
    }
    {
        const graph = example();
        const slot = graph.edges.findIndex((entry) => entry.to.node === "when" && entry.to.port === "in");
        graph.edges[slot].to.index = null;
        refused("a list whose order nobody wrote", graph, "bad-slot", `$.edges[${slot}].to.index`);
    }
    {
        const graph = dropEdges(example(), (entry) => !(entry.to.node === "when" && entry.to.port === "in"));
        refused("a list with nothing in it", graph, "bad-arity", whereNode(graph, "when"));
    }
    {
        const graph = example();
        pushNode(graph, { id: "loop.a", type: "gt", settings: { left: 1, right: 2 } });
        pushNode(graph, { id: "loop.b", type: "gt", settings: { left: 3, right: 4 } });
        pushEdge(graph, wire("loop.a", "out", "loop.b", "left"));
        pushEdge(graph, wire("loop.b", "out", "loop.a", "left"));
        const entry = refused("a value built out of itself", graph, "cycle", "$.edges");
        ok(entry && JSON.stringify(entry.cycle) === JSON.stringify(["loop.a", "loop.b", "loop.a"]), "a value built out of itself: refused as the path it walks, so a person can find the loop");
    }
}

/** A node is a type, an id, and the settings that type declares — no more. */
function nodesThatCannotBeNodesAreRefused() {
    {
        const graph = example();
        const second = pushNode(graph, clone(graph.nodes[atOf(graph, "metric.cvd")]));
        const entry = refused("two nodes with one id", graph, "duplicate-id", `$.nodes[${second}]`);
        ok(entry && entry.nodeId === "metric.cvd", "two nodes with one id: the refusal says which id, because a wire into it would be ambiguous");
    }
    {
        const graph = example();
        const second = pushNode(graph, { id: "metric.mystery", type: "metric", settings: { alias: "cvd", path: "aggregate.cvd" } });
        const entry = refused("two metrics written under one name", graph, "duplicate-alias", `$.nodes[${second}].settings.alias`);
        ok(entry && entry.at === whereNode(graph, "metric.cvd"), "two metrics written under one name: the first one is named too, so the pair can be found");
    }
    {
        const graph = example();
        const second = pushNode(graph, { id: "feed.other", type: "feed", settings: { key: "flow", assetClass: "crypto", asset: "ETHUSDT", eventType: "cvd" } });
        refused("two feeds written under one key", graph, "duplicate-feed-key", `$.nodes[${second}].settings.key`);
    }
    {
        const graph = example();
        const second = pushNode(graph, { id: "state.other", type: "state", settings: { name: "signals", init: 0 } });
        const entry = refused("two state variables written under one name", graph, "duplicate-state-name", `$.nodes[${second}].settings.name`);
        ok(entry && entry.at === whereNode(graph, "state.signals"), "two state variables written under one name: the first one is named too, because one would overwrite the other");
    }
    {
        const graph = example();
        const stranger = pushNode(graph, { id: "unicorn", type: "unicorn" });
        refused("a node of a type this canvas cannot draw", graph, "unknown-type", `$.nodes[${stranger}]`);
    }
    {
        const graph = example();
        graph.nodes[atOf(graph, "strategy")].settings.nope = 1;
        refused("a node told something it does not declare", graph, "unknown-setting", "$.nodes[0].settings.nope");
    }
    {
        const graph = example();
        graph.nodes = graph.nodes.filter((entry) => entry.type !== "strategy");
        refused("a canvas with no strategy on it", graph, "missing-strategy", "$.nodes");
    }
    {
        const graph = example();
        graph.nodes = graph.nodes.filter((entry) => entry.type !== "action");
        refused("a canvas with no action on it", graph, "missing-action", "$.nodes");
    }
    {
        const graph = example();
        const second = pushNode(graph, { id: "strategy2", type: "strategy", settings: { name: "second" } });
        refused("two strategies on one canvas", graph, "duplicate-strategy", `$.nodes[${second}]`);
    }
    {
        const graph = example();
        const second = pushNode(graph, { id: "action2", type: "action", settings: { type: "alert" } });
        refused("two actions on one canvas", graph, "duplicate-action", `$.nodes[${second}]`);
    }
    {
        const graph = example();
        const orphan = pushNode(graph, { id: "metric.orphan", type: "metric", settings: { alias: "orphan", path: "aggregate.cvd" } });
        pushEdge(graph, wire("feed.flow", "out", "metric.orphan", "feed"));
        refused("a metric no condition reads", graph, "unused-metric", `$.nodes[${orphan}]`);
    }
    {
        const graph = example();
        const loose = pushNode(graph, { id: "when.loose", type: "gt", settings: { left: 1, right: 2 } });
        refused("a condition wired to nothing", graph, "unwired-condition", `$.nodes[${loose}]`);
    }
    {
        const graph = dropEdges(example(), (entry) => !(entry.to.node === "strategy" && entry.to.port === "trigger"));
        refused("a drawing with no wire into the trigger", graph, "missing-trigger", "$.nodes[0].inputs.trigger");
    }
}

/**
 * A document the DSL refuses still opens — what a person drew is not a document
 * until they save it. What is asked of the drawing is that the canvas says the
 * engine's own sentence about it, under the engine's own name for it, pointed at
 * the node that was drawn rather than at a path inside the document.
 */
function whatTheEngineRefusesTheCanvasRefusesToo() {
    {
        const graph = loadDocument(pair()).graph;
        const entry = refused("a feed read without saying how old a value may be", graph, "no-staleness-bound", `${whereNode(graph, "feed.b")}.settings.maxAgeMs`);
        ok(entry && entry.nodeId === "feed.b", "a feed read without saying how old a value may be: pointed at that feed, not at the document's $.feeds.b");
    }
    {
        const graph = loadDocument(pair({
            when: { count: { feed: "a", window: 3, atLeast: 5, when: { gt: ["$cvd", 0] } } },
            metrics: { cvd: { feed: "a", path: "aggregate.cvd" } }
        })).graph;
        const entry = refused("a threshold no window can satisfy", graph, "bad-threshold", `${whereNode(graph, "when")}.settings.count`);
        ok(entry && entry.message.includes("window"), "a threshold no window can satisfy: the sentence names the window it cannot fit in");
    }
    {
        const graph = loadDocument(pair({ b: { maxAgeMs: 60000 }, when: { count: { feed: "a", window: 3, atLeast: 2, when: { gt: ["$imbalance", 0] } } } })).graph;
        const entry = refused("a count reading a feed it does not count", graph, "count-cross-feed", whereNode(graph, "metric.imbalance"));
        ok(entry && entry.nodeId === "metric.imbalance", "a count reading a feed it does not count: pointed at the metric that came from the wrong feed");
    }
    {
        const graph = loadDocument(pair({
            when: { count: { feed: "a", window: 3, atLeast: 2, when: { count: { feed: "a", window: 3, atLeast: 1, when: { gt: ["$cvd", 0] } } } } },
            metrics: { cvd: { feed: "a", path: "aggregate.cvd" } }
        })).graph;
        const inner = byId(graph, "when.0");
        ok(inner && inner.type === "count", "a count inside a count: the inner count is a count, so the refusal below is aimed at the real thing");
        refused("a count inside a count", graph, "nested-count", whereNode(graph, "when.0"));
    }
    {
        const graph = example();
        graph.nodes[0].settings.symbols = [];
        refused("a venue with no symbols to list", graph, "universe-exchange", "$.nodes[0].settings.exchange");
    }
    {
        const graph = example();
        graph.nodes[0].settings.symbols = Array.from({ length: DSL_LIMITS.universe + 1 }, (_, i) => `SYM${i}`);
        refused("a universe longer than the engine reads", graph, "too-many-symbols", "$.nodes[0].settings.symbols");
    }
    {
        const graph = example();
        graph.nodes[0].settings.symbols = ["BTCUSDT", "btcusdt"];
        refused("one symbol listed twice", graph, "duplicate-symbol", "$.nodes[0].settings.symbols");
    }
    {
        const graph = example();
        byId(graph, "feed.flow").settings.eventType = "trades";
        refused("a feed of a kind nobody publishes", graph, "unknown-topic", `${whereNode(graph, "feed.flow")}.settings`);
    }
}

/**
 * The input may not be a graph at all, and that is its own refusal: what arrived
 * is refused as what it is, and never repaired into a strategy. The shape of the
 * drawing is read as far as it can be — a version from another canvas is a note,
 * not a mistake — and nothing is written out of any of it.
 */
function theShapeOfTheInputIsJudgedToo() {
    const shapes = [
        ["text that is not json", "not json at all", ["bad-json", "missing-strategy", "missing-action"]],
        ["nothing at all", null, ["bad-graph", "missing-strategy", "missing-action"]],
        ["a number", 42, ["bad-graph", "missing-strategy", "missing-action"]],
        ["a list where a graph belongs", [1, 2, 3], ["bad-graph", "missing-strategy", "missing-action"]],
        ["nodes that are not a list", { version: GRAPH_VERSION, nodes: {}, edges: {} }, ["bad-nodes", "bad-edges"]],
        ["edges that are not a list", { version: GRAPH_VERSION, nodes: [], edges: "none" }, ["bad-edges"]],
        ["a node that is not an object", { version: GRAPH_VERSION, nodes: [1], edges: [] }, ["bad-node"]],
        ["an edge missing its ends", { version: GRAPH_VERSION, nodes: [], edges: [{}] }, ["bad-edge"]],
        ["a position that is not a place", { version: GRAPH_VERSION, nodes: [{ id: "a", type: "feed", position: "left" }], edges: [] }, ["bad-position"]],
        ["a position that is not a number", { version: GRAPH_VERSION, nodes: [{ id: "a", type: "feed", position: { x: "left", y: null } }], edges: [] }, ["bad-position"]],
        ["settings that are not settings", { version: GRAPH_VERSION, nodes: [{ id: "a", type: "feed", settings: 7 }], edges: [] }, ["bad-settings"]],
        ["a viewport that is not a viewport", { version: GRAPH_VERSION, nodes: [], edges: [], viewport: "wide" }, ["bad-viewport"]],
        ["a node with no id", { version: GRAPH_VERSION, nodes: [{ id: "", type: "feed" }], edges: [] }, ["missing-id"]],
        ["an id no canvas draws", { version: GRAPH_VERSION, nodes: [{ id: "9 bad id", type: "feed" }], edges: [] }, ["bad-id"]],
        ["an id longer than a canvas draws", { version: GRAPH_VERSION, nodes: [{ id: `a${"b".repeat(90)}`, type: "feed" }], edges: [] }, ["bad-id"]]
    ];

    for (const [name, input, codes] of shapes) {
        const judged = validateGraph(input);
        ok(judged.ok === false, `${name}: is not a strategy and is not repaired into one`);
        for (const code of codes) {
            const entry = judged.errors.find((item) => item.code === code);
            ok(Boolean(entry), `${name}: refused as "${code}", which is what it is`);
            if (entry && entry.where) ok(entry.where.startsWith("$"), `${name}: and "${code}" points into the input, at ${entry.where}`);
        }
        ok(compileGraph(input).document === null, `${name}: and nothing is written out of it, not even by a canvas that was not asked to be strict`);
    }

    const asText = JSON.stringify({ version: GRAPH_VERSION, nodes: [], edges: [] });
    ok(validateGraph(asText).graph && validateGraph(asText).graph.version === GRAPH_VERSION, "a graph that arrives as text is parsed before it is judged, so a file read from disk and a drawing are one thing");

    const foreign = validateGraph({ version: "other/9", nodes: [], edges: [] });
    ok(foreign.warnings.some((item) => item.code === "version-mismatch"), "a graph stamped by another canvas is a note, not a refusal");
    ok(foreign.errors.some((item) => item.code === "missing-strategy"), "and it is still judged on its shape, because that is what can be read");
}

/* ------------------------------------------------------------
 * 10. What is only advised, and what strict makes of it
 * ---------------------------------------------------------- */

/**
 * A note is not a refusal — the canvas may not refuse what the engine runs — but
 * it is not nothing either: it is said, at the node it is about, in a sentence;
 * and under `strict` the same note becomes a refusal under the same name. One
 * vocabulary for one mistake; whether it stops you is the only thing that
 * changes, and a strict canvas writes nothing at all.
 */
function advised(name, graph, code) {
    const judged = validateGraph(graph);
    ok(judged.ok === true, `${name}: is a strategy, and nothing about it is refused`);
    const entry = judged.warnings.find((item) => item.code === code);
    ok(Boolean(entry), `${name}: but it is worth saying, as "${code}"`);
    if (entry) ok(entry.where.startsWith("$") && entry.message.length > 0, `${name}: said at a place in the drawing, in a sentence`);

    const strict = validateGraph(graph, { strict: true });
    ok(strict.ok === false, `${name}: and strict does not let it pass`);
    ok(strict.warnings.length === 0, `${name}: strict has nothing left to advise`);
    ok(strict.errors.some((item) => item.code === code), `${name}: because a note under strict is a refusal under the same name, "${code}"`);

    ok(compileGraph(graph).document !== null, `${name}: a canvas that only advises still writes the document it was drawn from`);
    ok(compileGraph(graph, { strict: true }).document === null, `${name}: and a strict canvas writes nothing at all`);
    return entry;
}

function whatIsOnlyAdvisedIsSaidAndStrictRefusesIt() {
    {
        const graph = loadDocument(pair({ when: { gt: ["$cvd", 0] }, metrics: { cvd: { feed: "a", path: "aggregate.cvd" } } })).graph;
        const entry = advised("a feed the document subscribes to and never reads", graph, "unread-feed");
        ok(entry && entry.where === whereNode(graph, "feed.b"), "a feed the document subscribes to and never reads: at the feed itself, because the subscription is what is wasted");
    }
    {
        const graph = loadDocument(pair({
            when: { count: { feed: "a", window: 500, atLeast: 2, when: { gt: ["$cvd", 0] } } },
            metrics: { cvd: { feed: "a", path: "aggregate.cvd" } }
        })).graph;
        const entry = advised("a window longer than the frames the feed kept", graph, "window-over-history");
        ok(entry && entry.where === `${whereNode(graph, "when")}.settings.window`, "a window longer than the frames the feed kept: at the window, the number that asks for more than there is");
    }
    {
        const graph = loadDocument(pair({
            b: { maxAgeMs: 60000 },
            metrics: { cvd: { feed: "a", path: "aggregate.cvd" }, name: { feed: "a", path: "symbol" } },
            when: { gt: ["$cvd", "$name"] }
        })).graph;
        const entry = advised("a number put beside the traded symbol", graph, "mixed-kinds");
        ok(entry && entry.where === whereNode(graph, "when"), "a number put beside the traded symbol: at the comparison that puts them together");
    }
    {
        const graph = example();
        pushNode(graph, { id: "constant.one", type: "constant", settings: { value: 1 } });
        const entry = advised("a constant nobody reads", graph, "unused-constant");
        ok(entry && entry.where === `$.nodes[${atOf(graph, "constant.one")}]`, "a constant nobody reads: at the node on the drawing, not at something the document once held");
    }
    {
        const graph = example();
        pushNode(graph, { id: "state.other", type: "state", settings: { name: "other", init: 0 } });
        const entry = advised("a variable nobody reads", graph, "unread-state");
        ok(entry && entry.where === `$.nodes[${atOf(graph, "state.other")}]`, "a variable nobody reads: at the node on the drawing, which would still change on every signal");
    }
    {
        const graph = example();
        graph.nodes[0].settings.emptyBlocks = ["feeds"];
        const entry = advised("a block remembered as empty while its nodes are drawn", graph, "empty-block-in-use");
        ok(entry && entry.where === "$.nodes[0].settings.emptyBlocks", "a block remembered as empty while its nodes are drawn: at the flag, because the flag is what the drawing ignores");
    }

    /* The other side of the same coin: two feeds, the second saying how stale it
     * may be, is a strategy the engine wants whole — so the canvas has nothing to
     * say about it, and hands back the bytes it was given. */
    const good = pair({ b: { maxAgeMs: 60000 } });
    const opened = loadDocument(good, { strict: true });
    ok(opened.ok && opened.warnings.length === 0, "two feeds where the second says how old a value may be: nothing to refuse and nothing to advise");
    ok(validateGraph(opened.graph, { strict: true }).ok, "and the drawing of it is a strategy by the canvas's own judgement too");
    const back = compileGraph(opened.graph, { strict: true });
    ok(back.ok && text(back.document) === text(good), "so it comes back as the bytes it was written as, with nothing added for saying so");
}

/* ------------------------------------------------------------
 * The run
 * ---------------------------------------------------------- */

theExampleOpensWhole();
theDocumentCompilesBackToItself();
aDrawingBecomesItsOwnDocument();
aBrokenDocumentStillOpens();
positionsArePresentation();
theSidecarIsClampedAndIgnored();
canvasBookkeepingStaysOnTheCanvas();
everyOperatorTravelsBothWays();
oneDocumentIsOneDrawing();
wiresThatLeadNowhereAreRefused();
nodesThatCannotBeNodesAreRefused();
whatTheEngineRefusesTheCanvasRefusesToo();
theShapeOfTheInputIsJudgedToo();
whatIsOnlyAdvisedIsSaidAndStrictRefusesIt();

console.log(`B2 canvas seam: ${checks} checks passed`);

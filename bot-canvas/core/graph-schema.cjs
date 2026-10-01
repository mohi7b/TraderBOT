/* ============================================================
 * File: bot-canvas/core/graph-schema.cjs
 * Section: bot-canvas/core
 * Version: 1.0.0
 *
 * Role:
 *   The canvas document: what the editor draws and what it posts back. A
 *   graph is nodes (the parts of a strategy), edges (which value feeds which
 *   port), and the positions a mouse left them at.
 *
 *   Two rules shape this file:
 *
 *   1. THE GRAPH IS DATA, NEVER A WIDGET TREE. Everything here survives
 *      JSON.stringify → JSON.parse unchanged, because the canvas is another
 *      process and the compiler is this one: they speak one document, not one
 *      object graph.
 *
 *   2. POSITIONS ARE THE ONLY PRESENTATION THAT TRAVELS. Where a node sits is
 *      carried — a canvas that forgot its layout would be unusable — but
 *      nothing in the compiler reads it: move every node and the strategy is
 *      the same strategy. bot.json itself holds no coordinates, because the
 *      DSL refuses fields it does not define; compiler/layout.cjs keeps them
 *      beside the document instead.
 *
 *   Normalisation is shape-only and never hides a mistake: two nodes with the
 *   same id stay two nodes with the same id and the validator refuses them,
 *   because a canvas that silently repaired a duplicate id would delete a
 *   user's work to look clean.
 * ============================================================ */

const GRAPH_VERSION = "bot-canvas/1";

const LIMITS = Object.freeze({
    nodes: 600,
    edges: 3_000,
    idLength: 80,
    titleLength: 120,
    coord: 1_000_000,
    zoomMin: 0.1,
    zoomMax: 4
});

/* The id of a user-drawn node: a letter, then letters, digits and `.`, `_`,
 * `-`, `:` — shapes both a CSS selector and a JSON key survive. The ids the
 * compilers derive from a strategy (`feed.flow`, `when.all.0`) obey it. */
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteOr(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/* ------------------------------------------------------------
 * Nodes, edges, graphs
 * ---------------------------------------------------------- */

/** One node: an id, a type, where it sits, and what it was told. */
function node({ id, type, position = null, settings = {} } = {}) {
    return {
        id,
        type,
        position: position === null ? null : { x: finiteOr(position.x, 0), y: finiteOr(position.y, 0) },
        settings: isPlainObject(settings) ? settings : {}
    };
}

/** One edge: a value leaving an output port and arriving at an input port. */
function edge({ id = null, from, to } = {}) {
    return {
        id: id === null ? null : id,
        from: { node: from && from.node, port: from && from.port },
        to: {
            node: to && to.node,
            port: to && to.port,
            index: to && to.index === undefined ? null : to.index
        }
    };
}

/**
 * The name of an edge, derived from what it connects rather than handed out:
 * `${from.node}.${from.port}->${to.node}.${to.port}`, with `#<index>` when the
 * arrival is one slot of a variadic port. Two compilers building the same
 * strategy therefore build the same edge ids, and a diff of two graphs reads
 * as a diff of the two strategies.
 */
function edgeKey(from, to) {
    const index = to && (to.index === null || to.index === undefined) ? "" : `#${to.index}`;
    return `${from.node}.${from.port}->${to.node}.${to.port}${index}`;
}

/** A graph with nothing in it — what a new canvas opens on. */
function emptyGraph({ title = null } = {}) {
    return {
        version: GRAPH_VERSION,
        title,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
    };
}

function isGraph(value) {
    return isPlainObject(value) && value.version === GRAPH_VERSION;
}

/**
 * An id nothing in the graph holds yet: `metric`, `metric_2`, `metric_3`…
 * Deterministic, so a canvas that adds three nodes twice adds the same three
 * ids twice, and a test can name them.
 */
function suggestNodeId(prefix, taken = new Set()) {
    const cleaned = String(prefix).replace(/[^A-Za-z0-9_.:-]/g, "");
    const base = ID_PATTERN.test(cleaned) ? cleaned : `node_${cleaned}`;
    if (!taken.has(base)) return base;

    for (let n = 2; n < 10_000; n += 1) {
        const candidate = `${base}_${n}`;
        if (!taken.has(candidate)) return candidate;
    }

    return `${base}_${taken.size}`;
}

/* ------------------------------------------------------------
 * Normalisation — the shape, never the meaning
 * ---------------------------------------------------------- */

function normalizePosition(raw, issues, where) {
    if (raw === null || raw === undefined) return { x: 0, y: 0 };
    if (!isPlainObject(raw)) {
        issues.push({ code: "bad-position", where: `${where}.position`, message: "a position is { x, y } in pixels" });
        return { x: 0, y: 0 };
    }

    const x = finiteOr(raw.x, null);
    const y = finiteOr(raw.y, null);
    if (x === null || y === null) {
        issues.push({ code: "bad-position", where: `${where}.position`, message: "a position is two finite numbers" });
    }

    return {
        x: clamp(x === null ? 0 : x, -LIMITS.coord, LIMITS.coord),
        y: clamp(y === null ? 0 : y, -LIMITS.coord, LIMITS.coord)
    };
}

function normalizeSettings(raw, issues, where) {
    if (raw === null || raw === undefined) return {};
    if (!isPlainObject(raw)) {
        issues.push({ code: "bad-settings", where: `${where}.settings`, message: "a node's settings are an object" });
        return {};
    }
    return { ...raw };
}

function normalizeNode(raw, at, issues) {
    const where = `$.nodes[${at}]`;
    if (!isPlainObject(raw)) {
        issues.push({ code: "bad-node", where, message: "a node is an object: { id, type, position, settings }" });
        return null;
    }

    return {
        id: raw.id === null || raw.id === undefined ? "" : String(raw.id),
        type: raw.type === null || raw.type === undefined ? "" : String(raw.type),
        position: normalizePosition(raw.position, issues, where),
        settings: normalizeSettings(raw.settings, issues, where)
    };
}

function normalizeEdge(raw, at, issues) {
    const where = `$.edges[${at}]`;
    if (!isPlainObject(raw)) {
        issues.push({ code: "bad-edge", where, message: "an edge is an object: { from: { node, port }, to: { node, port } }" });
        return null;
    }

    const from = isPlainObject(raw.from) ? raw.from : null;
    const to = isPlainObject(raw.to) ? raw.to : null;
    if (!from || !to) {
        issues.push({ code: "bad-edge", where, message: "an edge has two ends: from and to" });
        return null;
    }

    const text = (value) => (value === null || value === undefined ? "" : String(value));

    return {
        id: raw.id === null || raw.id === undefined ? null : String(raw.id),
        from: { node: text(from.node), port: text(from.port) },
        to: { node: text(to.node), port: text(to.port), index: to.index === null || to.index === undefined ? null : to.index }
    };
}

/** The viewport: pixels and a scale, clamped to what a canvas can draw. */
function normalizeViewport(raw, issues) {
    const fallback = { x: 0, y: 0, zoom: 1 };
    if (raw === null || raw === undefined) return fallback;
    if (!isPlainObject(raw)) {
        issues.push({ code: "bad-viewport", where: "$.viewport", message: "a viewport is { x, y, zoom }" });
        return fallback;
    }

    return {
        x: clamp(finiteOr(raw.x, 0), -LIMITS.coord, LIMITS.coord),
        y: clamp(finiteOr(raw.y, 0), -LIMITS.coord, LIMITS.coord),
        zoom: clamp(finiteOr(raw.zoom, 1), LIMITS.zoomMin, LIMITS.zoomMax)
    };
}

/**
 * Any JSON that claims to be a graph, as a graph — plus every shape mistake
 * found on the way, in words an error panel can show. Nothing is invented and
 * nothing is dropped for being wrong: a node without an id keeps an empty id,
 * so the validator can say so.
 *
 * @returns {{ graph: object, issues: {code:string, where:string, message:string}[] }}
 */
function normalizeGraph(raw) {
    const issues = [];
    if (!isPlainObject(raw)) {
        issues.push({ code: "bad-graph", where: "$", message: "a canvas graph is an object: { nodes, edges }" });
        return { graph: emptyGraph(), issues };
    }

    if (raw.version !== undefined && raw.version !== GRAPH_VERSION) {
        issues.push({
            code: "version-mismatch",
            where: "$.version",
            message: `this canvas reads "${GRAPH_VERSION}" graphs; "${raw.version}" is not one`
        });
    }

    const rawNodes = raw.nodes === undefined ? [] : raw.nodes;
    const rawEdges = raw.edges === undefined ? [] : raw.edges;
    if (!Array.isArray(rawNodes)) issues.push({ code: "bad-nodes", where: "$.nodes", message: "nodes is a list" });
    if (!Array.isArray(rawEdges)) issues.push({ code: "bad-edges", where: "$.edges", message: "edges is a list" });

    const nodes = (Array.isArray(rawNodes) ? rawNodes : [])
        .map((entry, at) => normalizeNode(entry, at, issues))
        .filter((entry) => entry !== null);
    const edges = (Array.isArray(rawEdges) ? rawEdges : [])
        .map((entry, at) => normalizeEdge(entry, at, issues))
        .filter((entry) => entry !== null);

    return {
        graph: {
            version: GRAPH_VERSION,
            title: typeof raw.title === "string" && raw.title.trim() ? raw.title : null,
            nodes,
            edges,
            viewport: normalizeViewport(raw.viewport, issues)
        },
        issues
    };
}

/* ------------------------------------------------------------
 * Reading a graph without walking it more than once
 * ---------------------------------------------------------- */

/**
 * The lookups every other file needs, built once:
 *   byId        id → node (the LAST node with that id wins; the validator is
 *               the one that reports a duplicate, not this index)
 *   nodesById   id → every node carrying it, in the order they were written
 *   outEdges    node id → the edges leaving it, in the order they were written
 *   inEdges     node id → the edges arriving at it, sorted by (port, index,
 *               order) so a walk of a variadic port is the order the strategy
 *               meant — `all`'s children are its `in` slots, 0 first — and
 *               never the order a JSON object happened to be written in.
 */
function indexNodes(graph) {
    const byId = new Map();
    const nodesById = new Map();
    const outEdges = new Map();
    const inEdges = new Map();

    for (const entry of graph.nodes) {
        if (!nodesById.has(entry.id)) nodesById.set(entry.id, []);
        nodesById.get(entry.id).push(entry);
        byId.set(entry.id, entry);
    }

    for (const nodeId of nodesById.keys()) {
        outEdges.set(nodeId, []);
        inEdges.set(nodeId, []);
    }

    graph.edges.forEach((entry, order) => {
        if (!outEdges.has(entry.from.node)) outEdges.set(entry.from.node, []);
        if (!inEdges.has(entry.to.node)) inEdges.set(entry.to.node, []);
        outEdges.get(entry.from.node).push({ edge: entry, order });
        inEdges.get(entry.to.node).push({ edge: entry, order });
    });

    const byArrival = (a, b) => (
        String(a.edge.to.port).localeCompare(String(b.edge.to.port))
        || (a.edge.to.index === null ? -1 : a.edge.to.index) - (b.edge.to.index === null ? -1 : b.edge.to.index)
        || a.order - b.order
    );

    for (const [key, list] of inEdges) inEdges.set(key, list.slice().sort(byArrival));

    return { byId, nodesById, outEdges, inEdges };
}

/** The edges arriving at one port of one node, already in slot order. */
function edgesInto(index, nodeId, port) {
    return (index.inEdges.get(nodeId) || []).filter((entry) => entry.edge.to.port === port);
}

/** The one edge arriving at a single-valued port, or null. */
function edgeInto(index, nodeId, port) {
    const arrivals = edgesInto(index, nodeId, port);
    return arrivals.length ? arrivals[0].edge : null;
}

/* ------------------------------------------------------------
 * Text
 * ---------------------------------------------------------- */

/** A graph as JSON a human can diff: the canonical form, not a minified one. */
function serializeGraph(graph) {
    return `${JSON.stringify(graph, null, 2)}\n`;
}

/**
 * JSON text or an object, as a graph. A string that is not JSON is a mistake
 * worth its own words — a canvas that answered "empty graph" to a typo would
 * lose the drawing the user believed they had saved.
 */
function parseGraph(input) {
    if (typeof input !== "string") return normalizeGraph(input);

    try {
        return normalizeGraph(JSON.parse(input));
    } catch (err) {
        return {
            graph: emptyGraph(),
            issues: [{ code: "bad-json", where: "$", message: `this is not JSON: ${err.message}` }]
        };
    }
}

module.exports = {
    GRAPH_VERSION,
    LIMITS,
    ID_PATTERN,
    isPlainObject,
    node,
    edge,
    edgeKey,
    emptyGraph,
    isGraph,
    suggestNodeId,
    normalizeGraph,
    indexNodes,
    edgesInto,
    edgeInto,
    serializeGraph,
    parseGraph
};

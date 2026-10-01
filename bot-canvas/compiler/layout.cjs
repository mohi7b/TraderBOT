/* ============================================================
 * File: bot-canvas/compiler/layout.cjs
 * Section: bot-canvas/compiler
 * Version: 1.0.0
 *
 * Role:
 *   Where a node sits, twice over. `layoutGraph` DERIVES a position for every
 *   node nobody placed — one document draws one picture, because a canvas that
 *   opened differently every time would be a canvas nobody could learn.
 *   `applySidecar` restores the positions a person moved, from the file the
 *   editor saves beside bot.json; the DSL refuses coordinate fields, so what a
 *   person arranged cannot travel inside the document itself.
 *
 *   Two rules shape this file:
 *
 *   1. A POSITION IS PRESENTATION AND NEVER MEANING. Nothing here reads a
 *      setting, a port or a wire: move every node and compiler/graph-to-ast.cjs
 *      writes the same bot.json. The layout is a first drawing, not a
 *      calligraphy — within a column the order the nodes were written in, which
 *      for a loaded document is the order of its own blocks.
 *
 *   2. WHAT A PERSON MOVED IS THEIR WORK. A sidecar may only say where a node
 *      sits: an id it names that the graph no longer holds is ignored, a
 *      coordinate it gives is clamped into the space a canvas can draw, and
 *      nothing else about a node comes from it. A sidecar cannot add, rename or
 *      rewire anything — a second document is a second opinion.
 * ============================================================ */

const { nodeType, ROLE_ORDER } = require("../core/node-types.cjs");
const { LIMITS, isPlainObject } = require("../core/graph-schema.cjs");

const SIDECAR_VERSION = "bot-canvas/sidecar/1";

/** The box a node is drawn as, and the gaps between them. The editor renders
 *  these numbers; this file only ever adds them up. */
const BOX = Object.freeze({
    width: 208,
    height: 96,
    columnGap: 96,
    rowGap: 40,
    marginX: 48,
    marginY: 48
});

/** One column per role, in the order a strategy reads: the strategy itself, its
 *  feeds, the values read from them, the conditions, and the action they fire. */
function columnOf(type) {
    const spec = nodeType(type);
    const at = spec ? ROLE_ORDER.indexOf(spec.role) : -1;
    return at === -1 ? ROLE_ORDER.length : at;
}

function clampCoord(value, fallback = 0) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(LIMITS.coord, Math.max(-LIMITS.coord, value));
}

function clampZoom(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return 1;
    return Math.min(LIMITS.zoomMax, Math.max(LIMITS.zoomMin, value));
}

/* ------------------------------------------------------------
 * A first drawing
 * ---------------------------------------------------------- */

/**
 * The graph, with a position for every node that has none. A node that carries a
 * position keeps it — which is why this is asked for the graph a document was
 * drawn into, before the validator normalises the positions nobody wrote to the
 * origin. Rows are counted per column, so one document always produces one
 * picture and a diff of two drawings shows what changed, not what moved.
 */
function layoutGraph(graph) {
    const rows = new Map();

    const nodes = graph.nodes.map((entry) => {
        const placed = isPlainObject(entry.position) && typeof entry.position.x === "number" && typeof entry.position.y === "number";
        if (placed) return entry;

        const column = columnOf(entry.type);
        const row = rows.get(column) || 0;
        rows.set(column, row + 1);

        return {
            ...entry,
            position: {
                x: BOX.marginX + column * (BOX.width + BOX.columnGap),
                y: BOX.marginY + row * (BOX.height + BOX.rowGap)
            }
        };
    });

    return { ...graph, nodes };
}

/* ------------------------------------------------------------
 * The drawing a person left
 * ---------------------------------------------------------- */

/**
 * The graph, with the positions a sidecar remembers laid over it. The sidecar is
 * the editor's own file — `{ version, document, positions, viewport }` — and
 * every part of it is optional: what it does not name keeps what the graph
 * carried, so a sidecar written by an older canvas still opens.
 */
function applySidecar(graph, sidecar) {
    if (!isPlainObject(sidecar)) return graph;

    const positions = isPlainObject(sidecar.positions) ? sidecar.positions : {};
    const nodes = graph.nodes.map((entry) => {
        const remembered = positions[entry.id];
        if (!isPlainObject(remembered)) return entry;
        return { ...entry, position: { x: clampCoord(remembered.x), y: clampCoord(remembered.y) } };
    });

    const viewport = isPlainObject(sidecar.viewport)
        ? { x: clampCoord(sidecar.viewport.x), y: clampCoord(sidecar.viewport.y), zoom: clampZoom(sidecar.viewport.zoom) }
        : graph.viewport || { x: 0, y: 0, zoom: 1 };

    return { ...graph, nodes, viewport };
}

/**
 * What the editor saves beside a document: where the nodes are and how the
 * canvas was looking at them. Everything else a graph holds is already in the
 * document, and a copy of it here could disagree with the original.
 */
function sidecarOf(graph, { document = null } = {}) {
    const positions = {};
    for (const entry of graph.nodes) {
        if (isPlainObject(entry.position)) positions[entry.id] = { x: entry.position.x, y: entry.position.y };
    }

    const viewport = isPlainObject(graph.viewport) ? graph.viewport : { x: 0, y: 0, zoom: 1 };

    return {
        version: SIDECAR_VERSION,
        document: typeof document === "string" ? document : null,
        positions,
        viewport: { x: clampCoord(viewport.x), y: clampCoord(viewport.y), zoom: clampZoom(viewport.zoom) }
    };
}

/** Where a sidecar for a document lives: `my-bot.json` → `my-bot.canvas.json`. */
function sidecarPath(documentPath) {
    const name = String(documentPath === undefined || documentPath === null ? "" : documentPath).replace(/\.json$/i, "");
    return `${name}.canvas.json`;
}

module.exports = {
    SIDECAR_VERSION,
    BOX,
    columnOf,
    layoutGraph,
    applySidecar,
    sidecarOf,
    sidecarPath
};

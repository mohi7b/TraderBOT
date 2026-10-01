/* ============================================================
 * File: bot-canvas/compiler/graph-validation.cjs
 * Section: bot-canvas/compiler
 * Version: 1.0.0
 *
 * Role:
 *   Whether a drawing is a strategy. Every rule the graph can answer on its
 *   own is asked here, before one byte of bot.json is written, so the person
 *   who drew it is told WHICH NODE is wrong instead of reading a sentence
 *   about `$.when.all[2].gt[0]`.
 *
 *   Three rules shape this file:
 *
 *   1. THE CODES ARE THE DSL'S. Where a rule here is the same rule
 *      core/dsl-schema.cjs enforces — an unread metric, a comparison of two
 *      literals, a metric that must lead the operand list, a missing action —
 *      the code is the same string, so a panel that already renders engine
 *      errors renders these too and nobody learns a second vocabulary for the
 *      same mistake. A rule only a graph can break (a dangling wire, two
 *      nodes writing one key, a cycle) gets a code of its own, and
 *      compiler/graph-to-ast.cjs lists which is which.
 *
 *   2. STRICTER IS ALLOWED, LOOSER IS NOT. A condition wired to nothing is
 *      not a document the DSL would refuse — it is not in the document at
 *      all, because no `when` names it; dropping it silently would delete
 *      work, so it is refused here. In the other direction nothing may pass:
 *      every graph this accepts must compile to a document
 *      compileStrategy() accepts, and the seam test proves it, on a document
 *      and on a graph drawn by hand.
 *
 *   3. AN UNKNOWN IS NOT A MISTAKE. A metric with no path chosen publishes
 *      `any`, and `any` reaches any port: the kind is reported when it is
 *      known, never guessed. A warning says what a person would want to know
 *      (two kinds put beside each other, a feed nobody reads) and never
 *      blocks a compile — unless the caller asks for `strict`, where an
 *      advisory becomes a refusal, because that is what strict means.
 * ============================================================ */

const {
    LIMITS: GRAPH_LIMITS,
    ID_PATTERN,
    isPlainObject,
    edgeKey,
    edgeInto,
    edgesInto,
    indexNodes,
    parseGraph
} = require("../core/graph-schema.cjs");
const {
    PORT_KIND,
    ROLE,
    SETTING,
    nodeType,
    inputPort,
    outputPort,
    settingSpec,
    requiredSettings,
    compatible,
    kindOfValue,
    metricFamily,
    metricPath,
    outputKind,
    topicOf,
    isConditionType
} = require("../core/node-types.cjs");
const { isComparable } = require("../../bot-engine/core/catalog.cjs");
const {
    LIMITS,
    KEY_PATTERN,
    FEED_PATTERN,
    MUTATIONS,
    ACTIONS,
    SIZES,
    ENTER_SIDES,
    EXIT_SIDES,
    parseFeedTopic
} = require("../../bot-engine/core/dsl-schema.cjs");

const SEVERITY = Object.freeze({ ERROR: "error", WARN: "warn" });

/** One complaint, with the node and the wire it belongs to. */
function diagnostic(severity, code, where, message, extra = {}) {
    return Object.freeze({
        severity,
        code,
        where,
        message,
        /* Where the canvas should point: a node id, an edge key, a port. */
        nodeId: extra.nodeId === undefined ? null : extra.nodeId,
        edgeId: extra.edgeId === undefined ? null : extra.edgeId,
        port: extra.port === undefined ? null : extra.port,
        /* The other place the same mistake lives: a key written twice. */
        at: extra.at === undefined ? null : extra.at,
        /* A cycle, as the ids it walks. */
        cycle: extra.cycle === undefined ? null : extra.cycle,
        /* canvas = this file found it; engine = core/dsl-schema.cjs did. */
        source: extra.source === undefined ? "canvas" : extra.source
    });
}

function createDiagnostics() {
    const list = [];
    const add = (severity, code, where, message, extra) => {
        list.push(diagnostic(severity, code, where, message, extra));
        return null;
    };

    return {
        list,
        add,
        error: (code, where, message, extra) => add(SEVERITY.ERROR, code, where, message, extra),
        warn: (code, where, message, extra) => add(SEVERITY.WARN, code, where, message, extra),
        errors: () => list.filter((entry) => entry.severity === SEVERITY.ERROR),
        warnings: () => list.filter((entry) => entry.severity === SEVERITY.WARN)
    };
}

/** The answer: what was refused, what is worth knowing, in the order found. */
function settle(diag, strict) {
    const errors = diag.errors();
    const warnings = diag.warnings();

    if (!strict) {
        return Object.freeze({
            ok: errors.length === 0,
            strict: false,
            errors: Object.freeze(errors),
            warnings: Object.freeze(warnings),
            diagnostics: Object.freeze([...errors, ...warnings])
        });
    }

    const raised = warnings.map((entry) => diagnostic(SEVERITY.ERROR, entry.code, entry.where, entry.message, entry));
    return Object.freeze({
        ok: errors.length === 0 && raised.length === 0,
        strict: true,
        errors: Object.freeze([...errors, ...raised]),
        warnings: Object.freeze([]),
        diagnostics: Object.freeze([...errors, ...raised])
    });
}

/* ------------------------------------------------------------
 * What a setting may be
 * ---------------------------------------------------------- */

/** Nothing written: an empty string is a field nobody filled in, not a value. */
function isMissing(value, setting) {
    if (value === undefined) return true;
    if (setting.kind === SETTING.TEXT || setting.kind === SETTING.TEXTAREA || setting.kind === SETTING.PATH) {
        return typeof value !== "string" || !value.trim();
    }
    return false;
}

/** A literal, the way the DSL reads one: a number, a word or a flag. */
function isLiteral(value) {
    if (typeof value === "number") return Number.isFinite(value);
    return typeof value === "string" || typeof value === "boolean";
}

function listIssue(value, setting) {
    if (!Array.isArray(value)) return "a list of values";
    if (setting.values) {
        /* A list drawn from a vocabulary: the block names, not free text. */
        const bad = value.filter((entry) => !setting.values.includes(entry));
        return bad.length ? `one of: ${setting.values.join(", ")}` : null;
    }
    if (!value.length) return "a list of at least one value";
    if (value.length > 64) return "at most 64 values";
    const bad = value.filter((entry) => !isLiteral(entry));
    return bad.length ? "numbers, words and flags only" : null;
}

function mutationIssue(value) {
    if (!isPlainObject(value)) return "{ set: v } | { add: n } | { toggle: true }";
    const keys = Object.keys(value);
    if (keys.length !== 1 || !MUTATIONS.includes(keys[0])) return `one of: ${MUTATIONS.join(", ")}`;
    return null;
}

/**
 * One setting's value against its own declaration — never against a second
 * list of rules. Returns the complaint (a sentence fragment), or null.
 *
 * `type` is needed for the one rule a declaration cannot carry: a metric's
 * alias and a state variable's name are keys of the document's maps and must
 * match what a key may be, while a strategy's `name` is what a person calls the
 * bot and is free text.
 */
function settingIssue(setting, value, type) {
    switch (setting.kind) {
        case SETTING.TEXT:
        case SETTING.TEXTAREA: {
            if (typeof value !== "string") return "a string";
            if (setting.maxLength && value.length > setting.maxLength) {
                return `a string of at most ${setting.maxLength} characters`;
            }
            if (setting.key === "key" && !FEED_PATTERN.test(value)) return "lower case letters, digits and underscores";
            const isKey = (type === "metric" && setting.key === "alias") || (type === "state" && setting.key === "name");
            if (isKey && setting.required && !KEY_PATTERN.test(value)) {
                return "a letter, then letters, digits and underscores";
            }
            return null;
        }
        case SETTING.PATH:
            return typeof value === "string" ? null : "a path, as core/catalog.cjs spells it";
        case SETTING.INT: {
            if (!Number.isInteger(value)) return "a whole number";
            if (setting.min !== null && value < setting.min) return `a whole number of at least ${setting.min}`;
            if (setting.max !== null && value > setting.max) return `a whole number of at most ${setting.max}`;
            return null;
        }
        case SETTING.NUMBER: {
            if (typeof value !== "number" || !Number.isFinite(value)) return "a finite number";
            if (setting.min !== null && value < setting.min) return `a number of at least ${setting.min}`;
            if (setting.max !== null && value > setting.max) return `a number of at most ${setting.max}`;
            return null;
        }
        case SETTING.BOOL:
            return typeof value === "boolean" ? null : "true or false";
        case SETTING.ENUM:
            return setting.values.includes(value) ? null : `one of: ${setting.values.join(", ")}`;
        case SETTING.LIST:
            return listIssue(value, setting);
        case SETTING.MUTATION:
            return mutationIssue(value);
        case SETTING.SYMBOLS: {
            if (!Array.isArray(value)) return "a list of symbols";
            if (setting.max && value.length > setting.max) return `at most ${setting.max} symbols`;
            const bad = value.find((entry) => typeof entry !== "string" || !entry.trim() || /\s/.test(entry));
            return bad === undefined ? null : "symbols like BTCUSDT or ETH, without spaces";
        }
        case SETTING.VALUE:
            /* null is the one operand with no meaning at all: the DSL refuses
             * it, in its own words, so the code it uses is used here too. */
            if (value === null) return "null-operand";
            return isLiteral(value) ? null : "a finite number, a string or a boolean";
        default:
            return null;
    }
}

/* ------------------------------------------------------------
 * Nodes
 * ---------------------------------------------------------- */

/**
 * The code one setting's refusal carries. Where core/dsl-schema.cjs names this
 * same mistake itself — a feed key that is not a name, a window that is not a
 * frame count, a level that is not a number — the code is that name, so a panel
 * that renders engine errors renders these without being taught a second
 * vocabulary. Only what the DSL has no name for falls back to `bad-setting`.
 */
const SETTING_CODES = Object.freeze({
    "feed.key": "bad-feed-name",
    "feed.maxAgeMs": "bad-max-age",
    "feed.history": "bad-history",
    "metric.alias": "bad-metric-name",
    "state.name": "bad-state-name",
    "state.init": "bad-state-init",
    "state.resetAfterMs": "bad-reset",
    "count.window": "bad-window",
    "count.count": "bad-threshold",
    "count.label": "bad-label",
    "crossesAbove.withinMs": "bad-within",
    "crossesBelow.withinMs": "bad-within",
    "action.type": "bad-action",
    "action.side": "bad-side",
    "action.size": "bad-size",
    "action.sizeValue": "bad-size-value",
    "action.severity": "bad-severity",
    "action.note": "bad-note"
});

function settingCode(type, key, setting, value) {
    const named = SETTING_CODES[`${type}.${key}`];
    if (named) return named;
    /* A list that is not a list and a list whose entries are wrong are two
     * different sentences, and the DSL says so with two codes. */
    if (setting.kind === SETTING.LIST) return Array.isArray(value) ? "bad-list-item" : "bad-list";
    if (setting.kind === SETTING.NUMBER) return "bad-number";
    return "bad-setting";
}

/**
 * A required setting nobody wrote, and the name the DSL gives that same absence.
 * The DSL never asks "is it there" and "is it right" separately — it validates
 * the value it means to use, so `undefined` fails the same test a wrong value
 * fails — which is why a missing `window` is `bad-window` there and must be
 * `bad-window` here too. Only what has no DSL name of its own stays
 * `missing-setting`.
 */
const MISSING_CODES = Object.freeze({
    "strategy.name": "bad-name",
    "feed.key": "bad-feed-name",
    "metric.alias": "bad-metric-name",
    "metric.path": "unknown-path",
    "state.name": "bad-state-name",
    "state.init": "bad-state-init",
    "constant.value": "bad-operand",
    "count.window": "bad-window",
    "in.list": "bad-list",
    "action.type": "bad-action"
});

const missingCode = (type, key) => MISSING_CODES[`${type}.${key}`] || "missing-setting";

const nodeWhere = (at) => `$.nodes[${at}]`;

/** Two nodes may not carry one id: a wire into it would be ambiguous. */
function checkIdentities(graph, index, diag) {
    graph.nodes.forEach((node, at) => {
        const id = typeof node.id === "string" ? node.id : "";
        if (!id) {
            diag.error("missing-id", nodeWhere(at), "a node needs an id — the wires name it", { nodeId: null });
            return;
        }
        if (id.length > GRAPH_LIMITS.idLength) {
            diag.error("bad-id", nodeWhere(at), `an id is at most ${GRAPH_LIMITS.idLength} characters`, { nodeId: id });
        } else if (!ID_PATTERN.test(id)) {
            diag.error("bad-id", nodeWhere(at), `"${id}" is not an id: a letter, then letters, digits and . _ - :`, { nodeId: id });
        }
    });

    for (const [id, list] of index.nodesById) {
        if (list.length < 2) continue;
        const at = graph.nodes.indexOf(list[1]);
        diag.error(
            "duplicate-id",
            nodeWhere(at),
            `${list.length} nodes carry the id "${id}": a wire into it would be ambiguous`,
            { nodeId: id }
        );
    }
}

/** A node's type, its settings, and the ones it was told to have. */
function checkNodeShape(graph, index, diag) {
    graph.nodes.forEach((node, at) => {
        const where = nodeWhere(at);
        const id = typeof node.id === "string" && node.id ? node.id : null;
        const spec = nodeType(node.type);
        if (!spec) {
            diag.error("unknown-type", where, `"${node.type}" is not a node this canvas draws`, { nodeId: id });
            return;
        }

        if (node.settings !== undefined && !isPlainObject(node.settings)) {
            diag.error("bad-settings", `${where}.settings`, "a node's settings are an object", { nodeId: id });
            return;
        }
        const settings = node.settings || {};

        for (const [key, value] of Object.entries(settings)) {
            const setting = settingSpec(node.type, key);
            if (!setting) {
                diag.error(
                    "unknown-setting",
                    `${where}.settings.${key}`,
                    `a ${node.type} node is not told "${key}" (${spec.settings.map((entry) => entry.key).join(", ")})`,
                    { nodeId: id, port: key }
                );
                continue;
            }

            const issue = settingIssue(setting, value, node.type);
            if (issue === "null-operand") {
                diag.error(
                    "null-operand",
                    `${where}.settings.${key}`,
                    "null is the absence of a value, not a value — ask with exists when the question is whether it is there",
                    { nodeId: id, port: key }
                );
            } else if (issue) {
                diag.error(
                    settingCode(node.type, key, setting, value),
                    `${where}.settings.${key}`,
                    `${key} is ${issue}`,
                    { nodeId: id, port: key }
                );
            }
        }

        for (const setting of requiredSettings(node.type)) {
            if (!isMissing(settings[setting.key], setting)) continue;
            diag.error(
                missingCode(node.type, setting.key),
                `${where}.settings.${setting.key}`,
                `${setting.title || setting.key} is needed${setting.hint ? `: ${setting.hint}` : ""}`,
                { nodeId: id, port: setting.key }
            );
        }
    });
}

/* ------------------------------------------------------------
 * Keys the document is built from — one node writes each
 * ---------------------------------------------------------- */

/**
 * The document holds ONE map of feeds, ONE map of metrics, ONE map of state,
 * and each map is keyed by a setting. Two nodes writing the same key is not a
 * document the DSL would refuse: it is a document that quietly holds one of
 * them. Only the canvas can see the other, so the canvas says so.
 */
const WRITTEN_KEYS = Object.freeze([
    Object.freeze({ type: "feed", key: "key", code: "duplicate-feed-key", what: "feed" }),
    Object.freeze({ type: "metric", key: "alias", code: "duplicate-alias", what: "metric" }),
    Object.freeze({ type: "state", key: "name", code: "duplicate-state-name", what: "state variable" })
]);

function checkWrittenKeys(graph, diag) {
    for (const rule of WRITTEN_KEYS) {
        const seen = new Map();
        graph.nodes.forEach((node, at) => {
            if (node.type !== rule.type) return;
            const value = (node.settings || {})[rule.key];
            if (typeof value !== "string" || !value) return;
            const first = seen.get(value);
            if (first === undefined) {
                seen.set(value, at);
                return;
            }
            diag.error(
                rule.code,
                `${nodeWhere(at)}.settings.${rule.key}`,
                `"${value}" is the ${rule.key} of ${rule.what} nodes — one would overwrite the other in the document`,
                { nodeId: node.id, port: rule.key, at: `$.nodes[${first}]` }
            );
        });
    }
}

/* ------------------------------------------------------------
 * The strategy node: the document's name, universe and cadence
 * ---------------------------------------------------------- */

function checkStrategyNode(node, at, graph, diag) {
    const settings = node.settings || {};
    const id = node.id;
    const where = nodeWhere(at);
    const symbols = Array.isArray(settings.symbols) ? settings.symbols : [];
    const exchange = typeof settings.exchange === "string" ? settings.exchange : "";

    if (exchange && !symbols.length) {
        diag.error(
            "universe-exchange",
            `${where}.settings.exchange`,
            `"${exchange}" says where the symbols are listed, but no symbols are: write the symbols, or leave the venue empty`,
            { nodeId: id, port: "exchange" }
        );
    }

    const normalized = symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean);
    if (normalized.length !== new Set(normalized).size) {
        diag.error("duplicate-symbol", `${where}.settings.symbols`, "a symbol is listed twice", {
            nodeId: id,
            port: "symbols"
        });
    }
    if (normalized.length > LIMITS.universe) {
        diag.error(
            "too-many-symbols",
            `${where}.settings.symbols`,
            `${normalized.length} symbols is more than the ${LIMITS.universe} allowed`,
            { nodeId: id, port: "symbols" }
        );
    }

    /* A block the canvas remembers as empty while nodes of that block are on
     * the canvas: the nodes are what compile, so say the flag is ignored
     * rather than letting it look as though the nodes had been dropped. */
    const empty = Array.isArray(settings.emptyBlocks) ? settings.emptyBlocks : [];
    if (!empty.length) return;
    const present = {
        feeds: nodesOfType(graph, "feed").length,
        metrics: nodesOfType(graph, "metric").length,
        state: nodesOfType(graph, "state").length,
        universe: symbols.length
    };
    for (const block of empty) {
        if (!present[block]) continue;
        diag.warn(
            "empty-block-in-use",
            `${where}.settings.emptyBlocks`,
            `"${block}" is remembered as an empty block, but the canvas holds ${present[block]} of it: the nodes compile`,
            { nodeId: id, port: "emptyBlocks" }
        );
    }
}

/* ------------------------------------------------------------
 * The action node: what a signal means, and what it may carry
 * ---------------------------------------------------------- */

/**
 * The action is the one node whose settings must agree with EACH OTHER: enter
 * and exit are about a side and close and alert are not; a size with no
 * sizeValue is an intention nobody can size; a severity outside an alert
 * belongs to nothing. Each refusal is the DSL's own code and its own sentence,
 * because a run that reached bot.json would be refused with exactly these.
 */
function checkActionNode(node, at, diag) {
    const where = nodeWhere(at);
    const settings = node.settings || {};
    const type = settings.type;
    if (!ACTIONS.includes(type)) return; /* the settings pass has already said it */

    const side = settings.side === undefined ? null : settings.side;
    if (type === "enter" && !ENTER_SIDES.includes(side)) {
        diag.error("bad-side", `${where}.settings.side`, 'enter needs a side: "long" or "short"', {
            nodeId: node.id,
            port: "side"
        });
    }
    if (type === "exit" && !EXIT_SIDES.includes(side)) {
        diag.error("bad-side", `${where}.settings.side`, 'exit needs a side: "long", "short" or "both"', {
            nodeId: node.id,
            port: "side"
        });
    }
    if ((type === "close" || type === "alert") && side !== null) {
        diag.error("side-not-allowed", `${where}.settings.side`, `${type} is not about one side`, {
            nodeId: node.id,
            port: "side"
        });
    }

    const size = settings.size === undefined ? "none" : settings.size;
    const sized = SIZES.includes(size);
    if (sized && (type === "close" || type === "alert") && size !== "none") {
        diag.error("size-not-allowed", `${where}.settings.size`, `${type} takes no size`, {
            nodeId: node.id,
            port: "size"
        });
    }

    const value = settings.sizeValue === undefined ? null : settings.sizeValue;
    const pin = { nodeId: node.id, port: "sizeValue" };
    const sizeWhere = `${where}.settings.sizeValue`;
    const number = typeof value === "number" && Number.isFinite(value);
    if (value !== null && (!number || value <= 0)) {
        diag.error("bad-size-value", sizeWhere, "sizeValue is a positive finite number", pin);
    } else if (value !== null && size === "none") {
        diag.error("bad-size-value", sizeWhere, "sizeValue says nothing when size is none", pin);
    } else if (value !== null && size === "risk_pct" && value > 100) {
        diag.error("bad-size-value", sizeWhere, "a risk of more than 100% of the account is not a size, it is a hope", pin);
    } else if (sized && size !== "none" && value === null) {
        diag.error("missing-size-value", sizeWhere, `size "${size}" needs a sizeValue`, pin);
    }

    if (type !== "alert" && settings.severity !== undefined) {
        diag.error("severity-not-allowed", `${where}.settings.severity`, "severity belongs to an alert", {
            nodeId: node.id,
            port: "severity"
        });
    }
}

/* ------------------------------------------------------------
 * The metric node: the one node the document's path lives in
 * ---------------------------------------------------------- */

const nodesOfType = (graph, type) => graph.nodes.filter((node) => node.type === type);

/** The node feeding one input port, or null when nothing is wired there. */
function sourceNode(index, node, port) {
    const arrival = edgeInto(index, node.id, port);
    return arrival ? index.byId.get(arrival.from.node) || null : null;
}

function checkMetricNode(node, at, index, diag) {
    const settings = node.settings || {};
    const feedNode = sourceNode(index, node, "feed");
    if (!feedNode) return; /* a wire nobody drew is the ports pass's business */
    const path = typeof settings.path === "string" ? settings.path.trim() : "";
    if (!path) return; /* a path nobody wrote is a missing setting, said once */

    const family = metricFamily(feedNode);
    const resolved = metricPath(feedNode, path);
    if (!resolved) {
        const event = settings.eventType || (feedNode.settings || {}).eventType || "feed";
        diag.error(
            "unknown-path",
            `${nodeWhere(at)}.settings.path`,
            `the ${event} reading has no "${path}" — see core/catalog.cjs (family ${family ? family.key : "?"})`,
            { nodeId: node.id, port: "path" }
        );
        return;
    }

    if (!isComparable(resolved.kind)) {
        diag.error(
            "path-not-comparable",
            `${nodeWhere(at)}.settings.path`,
            `"${path}" is a ${resolved.kind}, not a value a condition may compare (exists is the way to ask)`,
            { nodeId: node.id, port: "path" }
        );
    }
}

/* ------------------------------------------------------------
 * Wires
 * ---------------------------------------------------------- */

/** The ports a node type takes, in the words a message can show. */
function portNames(type) {
    const spec = nodeType(type);
    return spec ? spec.inputs.map((port) => port.name).join(", ") || "nothing" : "nothing";
}

function checkEdges(graph, index, diag) {
    graph.edges.forEach((entry, at) => {
        const where = `$.edges[${at}]`;
        const id = edgeKey(entry.from, entry.to);
        const from = index.byId.get(entry.from.node) || null;
        const to = index.byId.get(entry.to.node) || null;

        if (!from || !to) {
            const missing = !from ? entry.from.node : entry.to.node;
            diag.error("unknown-node", where, `no node carries the id "${missing}": this wire ends nowhere`, {
                edgeId: id,
                nodeId: (from || to || {}).id || null
            });
            return;
        }

        const pin = { edgeId: id, nodeId: to.id, port: entry.to.port };

        if (from.id === to.id) {
            diag.error("self-edge", where, `a ${from.type} node cannot read itself`, pin);
            return;
        }

        const out = outputPort(from.type);
        if (!out || out.name !== entry.from.port) {
            diag.error(
                "unknown-port",
                `${where}.from.port`,
                `${from.type} has no output "${entry.from.port}"${out ? `: it publishes ${out.name}` : ": nothing leaves it"}`,
                { edgeId: id, nodeId: from.id, port: entry.from.port }
            );
            return;
        }

        const port = inputPort(to.type, entry.to.port);
        if (!port) {
            diag.error(
                "unknown-port",
                `${where}.to.port`,
                `${to.type} has no input "${entry.to.port}" — it takes ${portNames(to.type)}`,
                pin
            );
            return;
        }

        /* Slots: only a numbered list port has them, and it needs one on every
         * wire, because the slot IS the order the list will be compiled in. */
        if (entry.to.index !== null) {
            if (!port.variadic) {
                diag.error(
                    "bad-slot",
                    `${where}.to.index`,
                    `${to.type}.${port.name} takes one wire: a slot number belongs to a list port`,
                    pin
                );
                return;
            }
            if (!Number.isInteger(entry.to.index) || entry.to.index < 0 || entry.to.index >= GRAPH_LIMITS.edges) {
                diag.error("bad-slot", `${where}.to.index`, "a slot is a whole number from 0 up", pin);
                return;
            }
        } else if (port.variadic) {
            diag.error(
                "bad-slot",
                `${where}.to.index`,
                `every wire into ${to.type}.${port.name} carries its slot, 0 first: the slot is the order of the list`,
                pin
            );
            return;
        }

        const kind = outputKind(from, { feed: sourceNode(index, from, "feed") });
        if (kind === PORT_KIND.FEED && port.kind !== PORT_KIND.FEED) {
            diag.error(
                "port-kind",
                where,
                `a feed is read through a metric: wire ${from.id} into a metric's feed port, and the metric into ${to.type}.${port.name}`,
                pin
            );
            return;
        }
        if (!compatible(kind, port.kind)) {
            diag.error(
                "port-kind",
                where,
                `${from.type} publishes a ${kind}; ${to.type}.${port.name} takes a ${port.kind}`,
                pin
            );
            return;
        }
    });
}

/* ------------------------------------------------------------
 * Ports: how many wires, whether anything arrives, what a wire may be
 * ---------------------------------------------------------- */

/**
 * The ports the DSL insists on, in a port's own words. A comparison's side may
 * be a wire OR a literal written into it (`inline`), which is why "filled"
 * asks both; a variadic port with nothing in it is the list the DSL calls
 * "a non-empty list of conditions", and it says so in the same words.
 */
function checkPorts(graph, index, diag) {
    graph.nodes.forEach((node, at) => {
        const spec = nodeType(node.type);
        if (!spec) return;
        const where = nodeWhere(at);
        const settings = node.settings || {};

        for (const port of spec.inputs) {
            const arrivals = edgesInto(index, node.id, port.name);

            if (arrivals.length > 1 && !port.variadic) {
                const last = arrivals[arrivals.length - 1];
                diag.error(
                    "port-arity",
                    `$.edges[${last.order}].to.port`,
                    `${node.type}.${port.name} takes one wire — ${arrivals.length} arrive`,
                    { edgeId: edgeKey(last.edge.from, last.edge.to), nodeId: node.id, port: port.name }
                );
                continue;
            }

            const setting = settingSpec(node.type, port.name);
            const filled = arrivals.length > 0
                || Boolean(port.inline && setting && !isMissing(settings[port.name], setting));
            if (!port.required || filled) continue;

            if (port.variadic) {
                diag.error("bad-arity", where, `${node.type} takes a non-empty list of conditions`, {
                    nodeId: node.id,
                    port: port.name
                });
                continue;
            }
            diag.error(
                "missing-value",
                where,
                `nothing arrives at ${node.type}'s ${port.title || port.name}${port.hint ? `: ${port.hint}` : ""}`,
                { nodeId: node.id, port: port.name }
            );
        }
    });
}

/* ------------------------------------------------------------
 * Operands: what a comparison may be made of
 * ---------------------------------------------------------- */

/**
 * The DSL's own refusals for "this side is the metric", kept word for word:
 * a metricOnly port that holds something else is the same mistake the engine
 * would name, at the same code, with the canvas's node beside it.
 */
const METRIC_ONLY = Object.freeze({
    exists: { code: "exists-metric", message: "exists asks about a metric" },
    between: { code: "between-metric", message: "the first value of between is the metric" },
    in: { code: "in-metric", message: "the value of in is a metric" },
    crossesAbove: { code: "cross-metric", message: "the first side of crossesAbove is the metric that crossed" },
    crossesBelow: { code: "cross-metric", message: "the first side of crossesBelow is the metric that crossed" }
});

/** Whether a side is a literal: no wire at all, or a wire from a constant. */
function operandIsLiteral(index, node, port) {
    const source = sourceNode(index, node, port);
    return !source || source.type === "constant";
}

/** The kind a port will carry: from the wire that arrives, or from the words. */
function portKind(index, node, port) {
    const source = sourceNode(index, node, port.name);
    if (source) return outputKind(source, { feed: sourceNode(index, source, "feed") });
    if (!port.inline) return null;
    const setting = settingSpec(node.type, port.name);
    return setting ? kindOfValue((node.settings || {})[port.name]) : null;
}

const PLAIN_COMPARISONS = Object.freeze(["gt", "gte", "lt", "lte", "eq", "neq"]);
const KIND_PORTS = Object.freeze(["left", "right", "low", "high", "level", "value"]);

function checkOperands(graph, index, diag) {
    graph.nodes.forEach((node, at) => {
        const spec = nodeType(node.type);
        if (!spec || spec.role !== ROLE.COMPARE) return;
        const where = nodeWhere(at);
        const operator = spec.operator;

        for (const port of spec.inputs) {
            if (!port.metricOnly) continue;
            const source = sourceNode(index, node, port.name);
            if (!source || source.type === "metric") continue;
            const say = METRIC_ONLY[operator] || { code: "metric-value", message: `the first value of ${operator} is the metric` };
            diag.error(say.code, where, say.message, { nodeId: node.id, port: port.name });
        }

        if (PLAIN_COMPARISONS.includes(operator)
            && operandIsLiteral(index, node, "left")
            && operandIsLiteral(index, node, "right")) {
            diag.error(
                "constant-condition",
                where,
                "both sides are literals: that is a constant, not a condition about the market",
                { nodeId: node.id }
            );
        }

        /* Advisory only: the DSL compares whatever it is given, and this layer
         * refuses nothing for it. Two kinds put beside each other are almost
         * never what the person meant, so the canvas says so once. */
        const kinds = new Set();
        for (const port of spec.inputs) {
            if (!KIND_PORTS.includes(port.name)) continue;
            const kind = portKind(index, node, port);
            if (kind && kind !== PORT_KIND.ANY) kinds.add(kind);
        }
        if (kinds.size > 1) {
            diag.warn(
                "mixed-kinds",
                where,
                `${node.type} puts a ${[...kinds].join(" beside a ")}: the engine compares them, but a rule like that rarely says what it means`,
                { nodeId: node.id }
            );
        }
    });
}

/* ------------------------------------------------------------
 * Cycles — a value cannot be built out of itself
 * ---------------------------------------------------------- */

/**
 * Three colours over the wires: white (not seen), grey (on this path), black
 * (finished). A wire into a grey node is a loop, and the loop is reported once,
 * as the ids it walks, because "there is a cycle" without the path is a
 * complaint nobody can act on.
 */
function checkCycles(graph, index, diag) {
    const mark = new Map();
    const path = [];

    const visit = (id) => {
        mark.set(id, 1);
        path.push(id);

        for (const entry of index.outEdges.get(id) || []) {
            const next = entry.edge.to.node;
            if (!index.byId.has(next)) continue; /* a wire to nowhere is already refused */
            if (next === id) continue; /* a self-wire is refused where it is drawn */
            const seen = mark.get(next);
            if (seen === 1) {
                const loop = [...path.slice(path.indexOf(next)), next];
                diag.error("cycle", "$.edges", `a value cannot be built out of itself: ${loop.join(" → ")}`, {
                    nodeId: next,
                    cycle: loop
                });
                continue;
            }
            if (!seen) visit(next);
        }

        path.pop();
        mark.set(id, 2);
    };

    for (const node of graph.nodes) {
        if (!mark.get(node.id)) visit(node.id);
    }
}

/* ------------------------------------------------------------
 * What the document will hold — and what it will not
 * ---------------------------------------------------------- */

/**
 * Reachability is asked from the two ends that write the document: the
 * strategy and the action. Everything a person drew and did not connect is
 * either work about to be lost (a condition — no `when` names it, so the
 * document would not hold it) or a wire that does nothing (a feed nobody
 * reads, a state variable nobody watches), and the two are not the same kind
 * of news.
 */
function reachedFrom(graph, index) {
    const reached = new Set();
    const walkUp = (id) => {
        if (reached.has(id)) return;
        reached.add(id);
        for (const entry of index.inEdges.get(id) || []) walkUp(entry.edge.from.node);
    };

    for (const node of graph.nodes) {
        if (node.type === "strategy" || node.type === "action") walkUp(node.id);
    }

    return reached;
}

function checkReachability(graph, reached, diag) {
    graph.nodes.forEach((node, at) => {
        if (reached.has(node.id)) return;
        const where = nodeWhere(at);
        const id = node.id;

        if (node.type === "metric") {
            const alias = (node.settings || {}).alias;
            diag.error("unused-metric", where, `"${alias}" is declared but no condition reads it`, { nodeId: id });
            return;
        }
        if (isConditionType(node.type)) {
            diag.error(
                "unwired-condition",
                where,
                "nothing reads this condition: wire it into a list, or into the action's when port",
                { nodeId: id }
            );
            return;
        }
        if (node.type === "feed") {
            diag.warn(
                "unread-feed",
                where,
                "nothing the document holds reads this feed, and it is not the trigger: it would be subscribed to for nothing",
                { nodeId: id }
            );
            return;
        }
        if (node.type === "state") {
            diag.warn("unread-state", where, "nothing reads this variable: it would still change on every signal", {
                nodeId: id
            });
            return;
        }
        if (node.type === "constant") {
            diag.warn("unused-constant", where, "nothing reads this constant: it is written into the ports it feeds", {
                nodeId: id
            });
        }
    });
}

/* ------------------------------------------------------------
 * The trigger, and how stale a reading may be
 * ---------------------------------------------------------- */

/** Whether a condition the document will hold walks this feed's reading. */
function readByCondition(feed, index, reached) {
    for (const entry of index.outEdges.get(feed.id) || []) {
        const next = index.byId.get(entry.edge.to.node);
        if (!next || !reached.has(next.id)) continue;
        if (next.type === "metric" || isConditionType(next.type)) return true;
    }
    return false;
}

/**
 * The feed whose reading starts an evaluation: the one wired into the strategy's
 * trigger port, or — the DSL's own rule — the only feed there is. Null when the
 * canvas does not answer that question yet.
 */
function triggerFeed(graph, index) {
    const strategies = nodesOfType(graph, "strategy");
    if (strategies.length !== 1) return null;
    const wired = sourceNode(index, strategies[0], "trigger");
    if (wired && wired.type === "feed") return wired;
    const feeds = nodesOfType(graph, "feed");
    return feeds.length === 1 ? feeds[0] : null;
}

/**
 * Which feed starts an evaluation — the cadence problem, answered on the
 * canvas. With one feed the answer needs neither wire nor key: the DSL implies
 * that feed, and the strategy node remembers it with `implicitTrigger`. With
 * more than one the wire IS the answer, and every other feed a condition reads
 * must say how old a value may be, or a 15m reading would feed a 1m decision
 * forever. Both refusals are the DSL's own, word for word.
 */
function checkTrigger(graph, index, reached, diag) {
    const strategies = nodesOfType(graph, "strategy");
    if (strategies.length !== 1) return; /* the roots pass has already said it */

    const strategy = strategies[0];
    const at = graph.nodes.indexOf(strategy);
    const wired = sourceNode(index, strategy, "trigger");
    const feeds = nodesOfType(graph, "feed");
    const settings = strategy.settings || {};

    if (wired && wired.type !== "feed") return; /* the wires pass says this, in kinder words */

    if (!wired) {
        if (!feeds.length) return; /* nothing drawn yet: the ports pass says what is missing */
        if (feeds.length > 1) {
            diag.error(
                "missing-trigger",
                `${nodeWhere(at)}.inputs.trigger`,
                `with ${feeds.length} feeds, say which one starts an evaluation — one of: ${feeds.map((feed) => feed.id).join(", ")}`,
                { nodeId: strategy.id, port: "trigger" }
            );
            return;
        }
    } else if (settings.implicitTrigger === true) {
        diag.warn(
            "stale-trigger-flag",
            nodeWhere(at),
            "the canvas remembers a trigger the document only implied, but a wire is drawn into the trigger port: the wire is what compiles",
            { nodeId: strategy.id, port: "implicitTrigger" }
        );
    }

    const trigger = triggerFeed(graph, index);
    if (!trigger) return;

    for (const feed of feeds) {
        if (feed === trigger) continue;
        if (!readByCondition(feed, index, reached)) continue;
        const age = (feed.settings || {}).maxAgeMs;
        if (typeof age === "number" && Number.isInteger(age) && age > 0) continue;
        const key = (feed.settings || {}).key || feed.id;
        diag.error(
            "no-staleness-bound",
            `${nodeWhere(graph.nodes.indexOf(feed))}.settings.maxAgeMs`,
            `"${key}" is read by a condition without being the trigger: give it a maxAgeMs, so a value from an hour ago cannot pass for a live one`,
            { nodeId: feed.id, port: "maxAgeMs" }
        );
    }
}

/** Two feeds reading one topic are one topic read twice, and the DSL refuses it. */
function checkFeedTopics(graph, diag) {
    const seen = new Map();

    for (const feed of nodesOfType(graph, "feed")) {
        const where = nodeWhere(graph.nodes.indexOf(feed));
        const settings = feed.settings || {};
        const parts = ["assetClass", "asset", "eventType"].map((key) => settings[key]);
        if (parts.some((part) => typeof part !== "string" || !part)) continue; /* the setting pass has said it */

        /* The three parts spell a topic; core/dsl-schema.cjs is the one that
         * knows which topics exist, so it is the one that says whether this is
         * one of them — a canvas that kept its own copy of the catalog would be
         * a second place for the catalog to be wrong. */
        const parsed = parseFeedTopic(topicOf(settings));
        if (!parsed) {
            diag.error(
                "unknown-topic",
                `${where}.settings`,
                `analytics.${parts.join(".").toLowerCase()} is not a topic this layer knows: analytics.<assetClass>.<asset>.<event>`,
                { nodeId: feed.id }
            );
            continue;
        }

        const first = seen.get(parsed.topic);
        if (!first) {
            seen.set(parsed.topic, feed);
            continue;
        }
        const firstSettings = first.settings || {};
        diag.error(
            "duplicate-feed",
            `${where}.settings`,
            `"${settings.key || feed.id}" (${feed.id}) reads the same topic as "${firstSettings.key || first.id}" (${first.id}): ${parsed.topic}`,
            { nodeId: feed.id, at: nodeWhere(graph.nodes.indexOf(first)) }
        );
    }
}


/* ------------------------------------------------------------
 * count: the one node that looks backwards
 * ---------------------------------------------------------- */

const COUNT_TESTS = Object.freeze(["atLeast", "atMost", "exactly"]);

/**
 * A count walks ONE feed's stored frames, so the sub-condition it asks of each
 * frame may only name metrics of that feed — a frame of feed A holds no value
 * of feed B, and a count that read today's book while walking yesterday's tape
 * would be a fiction that reads like a fact. It also may not count again inside
 * itself, its window may not be longer than the frames the feed kept, and its
 * threshold may not exceed the window it counts in.
 *
 * Every refusal here is the DSL's own code and sentence, said at the node the
 * person drew instead of at `$.when.all[0].count.when.gt[0]`.
 */
function checkCounts(graph, index, diag, trigger) {
    for (const count of nodesOfType(graph, "count")) {
        const where = nodeWhere(graph.nodes.indexOf(count));
        const settings = count.settings || {};
        const frame = sourceNode(index, count, "frame");
        if (frame && frame.type !== "feed") continue; /* the wires pass has said this */
        const counted = frame || trigger;
        const kept = counted && Number.isInteger((counted.settings || {}).history)
            ? counted.settings.history
            : (counted ? LIMITS.defaultHistory : null);

        /* The window is what the count looks at; the threshold is how many of
         * those frames must match — a number larger than the window can never
         * be satisfied, which is the DSL's `bad-threshold`, word for word. */
        const window = settings.window;
        const test = COUNT_TESTS.includes(settings.test) ? settings.test : "atLeast";
        const threshold = settings.count === undefined ? 1 : settings.count;
        if (Number.isInteger(window) && Number.isInteger(threshold) && threshold > window) {
            diag.error(
                "bad-threshold",
                `${where}.settings.count`,
                `${test} is a whole number between 1 and the window (${window})`,
                { nodeId: count.id, port: "count" }
            );
        }

        if (Number.isInteger(window) && kept !== null && window > kept) {
            const key = (counted.settings || {}).key || counted.id;
            /* Advice, not a refusal: the DSL reads a window of up to 500 frames
             * from a feed that may keep fewer, and a canvas that refused what
             * the engine runs would refuse a strategy that works. */
            diag.warn(
                "window-over-history",
                `${where}.settings.window`,
                `feed "${key}" keeps ${kept} frames: only ${kept} of the ${window} asked for will ever be looked at`,
                { nodeId: count.id, port: "window" }
            );
        }

        const seen = new Set([count.id]);
        const walkUp = (id) => {
            if (seen.has(id)) return;
            seen.add(id);
            const node = index.byId.get(id);
            if (!node) return;

            if (node.type === "count") {
                diag.error(
                    "nested-count",
                    nodeWhere(graph.nodes.indexOf(node)),
                    "a count inside a count: ask that question of a stored frame instead",
                    { nodeId: node.id }
                );
                return;
            }
            if (node.type === "metric") {
                const from = sourceNode(index, node, "feed");
                if (!counted || !from || from.id === counted.id) return;
                const alias = (node.settings || {}).alias || node.id;
                diag.error(
                    "count-cross-feed",
                    nodeWhere(graph.nodes.indexOf(node)),
                    `"$${alias}" belongs to feed "${(from.settings || {}).key || from.id}", which the counted frames do not carry: a count reads one feed's history`,
                    { nodeId: node.id, port: "feed" }
                );
                return;
            }
            for (const entry of index.inEdges.get(id) || []) walkUp(entry.edge.from.node);
        };

        const start = sourceNode(index, count, "when");
        if (start) walkUp(start.id);
    }
}

/* ------------------------------------------------------------
 * The two nodes the document is built around
 * ---------------------------------------------------------- */

/**
 * The strategy and the action are what the document hangs off: one names it,
 * gives it a universe and a cadence; the other says what a signal means. A
 * canvas with two of either is a canvas whose meaning is undefined, and a
 * canvas with none is not a strategy yet.
 */
function checkRoots(graph, diag) {
    const strategies = nodesOfType(graph, "strategy");
    const actions = nodesOfType(graph, "action");

    if (!strategies.length) {
        diag.error("missing-strategy", "$.nodes", "a canvas needs its strategy node: it is the document's name, universe and cadence");
    } else if (strategies.length > 1) {
        const at = graph.nodes.indexOf(strategies[1]);
        diag.error("duplicate-strategy", nodeWhere(at), `one strategy per canvas: this graph has ${strategies.length}`, {
            nodeId: strategies[1].id
        });
    }

    if (!actions.length) {
        diag.error("missing-action", "$.nodes", "a strategy says what a signal means: add the action node");
    } else if (actions.length > 1) {
        const at = graph.nodes.indexOf(actions[1]);
        diag.error("duplicate-action", nodeWhere(at), "one action per strategy: which one a signal takes would be undefined", {
            nodeId: actions[1].id
        });
    }
}

/* ------------------------------------------------------------
 * The entry
 * ---------------------------------------------------------- */

/**
 * Whether a drawing is a strategy — every question, in the order a person
 * would ask them: is there one strategy and one action; is every node a node
 * this canvas draws, told what it declares; is every wire a wire that exists;
 * does every port the DSL insists on have what it needs; are the operands
 * things the DSL allows; is there a loop; is everything reached from the
 * action; and which feed starts an evaluation.
 *
 * The input may be the object the editor posts or the JSON it saved: a string
 * that is not JSON and a graph stamped by another canvas are both REPORTED,
 * never repaired, because a canvas that answered "empty strategy" to a typo
 * would lose the drawing its author believed they had saved.
 *
 * `strict` promotes every advisory to a refusal, which is what strict means.
 * The codes do not change: a panel shows one vocabulary for one mistake.
 *
 * @returns {{ ok:boolean, strict:boolean, graph:object,
 *             errors:object[], warnings:object[], diagnostics:object[] }}
 */
function validateGraph(input, { strict = false } = {}) {
    const parsed = parseGraph(input);
    const graph = parsed.graph;
    const diag = createDiagnostics();

    for (const issue of parsed.issues) {
        /* A graph stamped by another canvas is worth knowing about and not
         * worth refusing: its shape was normalised either way, and what is
         * below judges what the normalisation produced. */
        diag.add(
            issue.code === "version-mismatch" ? SEVERITY.WARN : SEVERITY.ERROR,
            issue.code,
            issue.where,
            issue.message
        );
    }

    const index = indexNodes(graph);

    checkRoots(graph, diag);
    checkIdentities(graph, index, diag);
    checkNodeShape(graph, index, diag);
    checkWrittenKeys(graph, diag);
    graph.nodes.forEach((node, at) => {
        if (node.type === "strategy") checkStrategyNode(node, at, graph, diag);
        else if (node.type === "metric") checkMetricNode(node, at, index, diag);
        else if (node.type === "action") checkActionNode(node, at, diag);
    });

    checkEdges(graph, index, diag);
    checkPorts(graph, index, diag);
    checkOperands(graph, index, diag);
    checkCycles(graph, index, diag);

    const reached = reachedFrom(graph, index);
    checkReachability(graph, reached, diag);
    checkTrigger(graph, index, reached, diag);
    checkFeedTopics(graph, diag);
    checkCounts(graph, index, diag, triggerFeed(graph, index));

    return Object.freeze({ ...settle(diag, strict), graph });
}

/**
 * Every complaint as one line, in the order it was found: severity, code,
 * where, what. A panel renders the objects themselves; a terminal, a log and
 * a failing test want this.
 */
function formatDiagnostics(result) {
    return result.diagnostics
        .map((entry) => `${entry.severity} ${entry.code} ${entry.where}: ${entry.message}`)
        .join("\n");
}

module.exports = {
    SEVERITY,
    validateGraph,
    formatDiagnostics,
    /* The pieces compiler/graph-to-ast.cjs builds with, so that one file owns
     * what a complaint looks like and which feed starts an evaluation. */
    diagnostic,
    nodeWhere,
    triggerFeed
};




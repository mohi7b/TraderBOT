/* ============================================================
 * File: bot-engine/topics.cjs
 * Section: bot-engine
 * Version: 1.0.0
 *
 * Role:
 *   The topic namespace of the execution layer — the one place where a
 *   decision gets a name, exactly the way analytics-engine/topics.cjs is
 *   the one place where a reading gets one.
 *
 * Format:
 *   execution.<bot>.<asset>.<event>
 *   execution.btc-breakout-confluence.btc.signal
 *   └ bot:   lower case; letters, digits, dashes and underscores kept
 *   └ asset: the base asset of the symbol the decision was about
 *   └ event: signal | bot_status
 *
 *   The shape mirrors analytics.<assetClass>.<asset>.<event> on purpose: a
 *   consumer that can parse one namespace can parse the other, and the bus
 *   channel is built the same way —
 *
 *     topic    execution.<bot>.<asset>.<event>     "which asset?"  (subscribers)
 *     channel  execution:<bot>:<symbol>:<event>    "which symbol?" (bus axis)
 *
 *   The asset class and the venue are NOT topic segments: they travel on the
 *   envelope (meta.assetClass, meta.exchange) and on the bus context, exactly
 *   as they do for an analytics reading. A decision about one asset stays one
 *   topic whatever venue the reading behind it came from.
 * ============================================================ */

const { baseAssetOf } = require("../collector/crypto/common/envelope.cjs");

const EXECUTION_ROOT = "execution";

/** The bus "market" of every execution channel (analytics uses "analytics"). */
const EXECUTION_MARKET = "execution";

/**
 * The two things a bot says on the bus:
 *   signal     a complete evaluation that fired, with the evidence it fired on
 *   bot_status a lifecycle report (start/pause/stop) — about the bot, not the
 *              market, and never mixed into a signal
 */
const EXECUTION_EVENTS = Object.freeze({
    SIGNAL: "signal",
    BOT_STATUS: "bot_status"
});

const EXECUTION_EVENT_LIST = Object.freeze(Object.values(EXECUTION_EVENTS));

/**
 * Bot id: lower case, dashes and underscores kept (they are how a bot is
 * named), every other character removed. A dot can therefore never create a
 * fifth segment and break parseExecutionTopic().
 */
function normalizeBotId(bot) {
    return String(bot === null || bot === undefined ? "" : bot)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
}

/** Asset segment: lower case, alphanumeric only — the analytics rule. */
function normalizeExecutionAsset(asset) {
    return String(asset === null || asset === undefined ? "" : asset)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function normalizeExecutionEvent(eventType) {
    return String(eventType === null || eventType === undefined ? "" : eventType)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
}

/**
 * Build a decision topic.
 *   executionTopic({ bot: "Btc Breakout", symbol: "BTCUSDT", eventType: "signal" })
 *     → "execution.btcbreakout.btc.signal"
 */
function executionTopic({ bot, symbol = null, asset = null, eventType } = {}) {
    const id = normalizeBotId(bot);
    const base = normalizeExecutionAsset(asset || baseAssetOf(symbol));
    const event = normalizeExecutionEvent(eventType);

    if (!id) throw new Error("executionTopic: a bot id is required");
    if (!base) throw new Error("executionTopic: a symbol or asset is required");
    if (!event) throw new Error("executionTopic: eventType is required");

    return [EXECUTION_ROOT, id, base, event].join(".");
}

function isExecutionTopic(topic) {
    return typeof topic === "string" && topic.startsWith(`${EXECUTION_ROOT}.`);
}

/** Parse "execution.btcbreakout.btc.signal" back into its parts (null when invalid). */
function parseExecutionTopic(topic) {
    if (!isExecutionTopic(topic)) return null;
    const [root, bot, asset, eventType] = String(topic).split(".");
    if (!root || !bot || !asset || !eventType) return null;
    return { root, bot, asset, eventType };
}

/** Bus channel of an execution entry: execution:<bot>:<symbol>:<event>. */
function executionChannel(entry = {}) {
    return [
        entry.market || EXECUTION_MARKET,
        entry.bot || entry.exchange || "unknown",
        entry.symbol || "unknown",
        entry.event || "unknown"
    ].join(":");
}

/**
 * True when a bus entry is a decision (the guard the analytics engine and the
 * bot engine both need: neither may eat its own output, and neither may eat
 * the other's).
 */
function isExecutionEntry(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (entry.market === EXECUTION_MARKET) return true;
    const nested = entry.envelope || (entry.payload && (entry.payload.envelope || entry.payload));
    return Boolean(nested && nested.meta && nested.meta.sourceType === "bot");
}

module.exports = {
    EXECUTION_ROOT,
    EXECUTION_MARKET,
    EXECUTION_EVENTS,
    EXECUTION_EVENT_LIST,
    normalizeBotId,
    executionTopic,
    isExecutionTopic,
    parseExecutionTopic,
    executionChannel,
    isExecutionEntry
};

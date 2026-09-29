/* ============================================================
 * File: bot-engine/core/egress.cjs
 * Section: bot-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   Everything the bot engine sends OUT of itself:
 *
 *     1. builds the execution envelope  (sourceType: "bot")
 *     2. derives its topic              execution.<bot>.<asset>.<event>
 *     3. hands the entry to sinks and (optionally) to the Realtime bus
 *
 *   It is the deliberate mirror of analytics-engine/core/egress.cjs: a
 *   decision leaves this layer the way a reading leaves that one, because
 *   both are frames of one vocabulary and both must be routable, storable
 *   and auditable by the same consumers.
 *
 *   Bus channel vs topic:
 *     channel  execution:<bot>:<symbol>:<event>   "which bot?"   (bus axis)
 *     topic    execution.<bot>.<asset>.<event>    "which asset?" (subscribers)
 *   Both travel on the entry, so a consumer can use whichever it holds. The
 *   bus dimension uses market = "execution" and exchange = <bot id>, exactly
 *   as the analytics layer uses market = "analytics" and exchange =
 *   <assetClass>: decisions stay out of the realtime channels without
 *   inventing a second bus, and a bot never collides with a venue name.
 *
 *   What a signal carries: the action the strategy asked for, the frame it
 *   fired on, every metric value it was decided on, and the state the
 *   decision left behind. The evidence travels WITH the decision, so nobody
 *   has to reconstruct afterwards why a bot did what it did.
 * ============================================================ */

const {
    createEnvelope,
    validateEnvelope,
    baseAssetOf,
    MARKET_TYPES,
    SOURCE_TYPE,
    ASSET_CLASS
} = require("../../collector/crypto/common/envelope.cjs");
const {
    EXECUTION_MARKET,
    EXECUTION_EVENTS,
    executionTopic,
    executionChannel,
    normalizeBotId
} = require("../topics.cjs");

/** Execution envelope: the collector frame, published by the execution layer. */
function executionEnvelope({
    bot,
    eventType,
    name = null,
    data = null,
    symbol = null,
    assetClass = ASSET_CLASS.CRYPTO,
    exchange = null,
    marketType = null,
    timestamp = null,
    receiveTimestamp = null,
    provenance = null
} = {}) {
    const id = normalizeBotId(bot);
    if (!id) throw new Error("executionEnvelope: a bot id is required");

    /* The frame vocabulary is the collector's (spot|futures): a venue word for
     * the market type is provenance, never a frame value — the same rule as
     * analytics-engine/core/egress.cjs, so a decision is never dropped for a
     * naming detail. */
    const framedMarketType = MARKET_TYPES.includes(marketType) ? marketType : null;
    const framedProvenance = {
        origin: "bot-engine",
        stage: "bot-engine",
        bot: id,
        strategy: name,
        ...(provenance || {})
    };
    if (!framedMarketType && marketType) framedProvenance.sourceMarketType = marketType;

    return createEnvelope({
        assetClass,
        sourceType: SOURCE_TYPE.BOT,
        marketType: framedMarketType,
        exchange,
        symbol,
        eventType,
        data,
        timestamp,
        receiveTimestamp,
        provenance: framedProvenance
    });
}

/** "execution.squeeze-confluence.eth.signal" (null when it cannot be mapped). */
function topicForEnvelope(envelope) {
    const provenance = (envelope && envelope.meta && envelope.meta.provenance) || {};

    try {
        return executionTopic({
            bot: provenance.bot,
            symbol: envelope.meta.symbol,
            eventType: envelope.meta.eventType
        });
    } catch (err) {
        return null;
    }
}

/** The bus/sink entry of one execution envelope. */
function executionEntry(envelope) {
    const provenance = envelope.meta.provenance || {};
    const bot = normalizeBotId(provenance.bot);

    const entry = {
        event: envelope.meta.eventType,
        market: EXECUTION_MARKET,
        /* The bus axis segment, and the id a consumer routes on. */
        bot,
        exchange: bot,
        symbol: envelope.meta.symbol,
        asset: baseAssetOf(envelope.meta.symbol),
        topic: topicForEnvelope(envelope),
        source: envelope.meta.sourceType,
        envelope
    };
    entry.channel = executionChannel(entry);
    return entry;
}

/**
 * @param {object}   options
 * @param {object}   [options.bus]        EventBus-compatible ({publish})
 * @param {Function} [options.sink]       single extra receiver
 * @param {Function[]} [options.sinks]    extra receivers
 * @param {Function} [options.onInvalid]  (errors, envelope) => void
 * @returns {(envelope) => object|null}   publisher (null when rejected)
 */
function createExecutionBridge({ bus = null, sink = null, sinks = [], onInvalid = null } = {}) {
    const receivers = [sink, ...(Array.isArray(sinks) ? sinks : [])].filter((fn) => typeof fn === "function");

    return function publishExecutionEnvelope(envelope) {
        if (!envelope || !envelope.meta) return null;

        const validation = validateEnvelope(envelope);
        if (!validation.ok) {
            if (onInvalid) onInvalid(validation.errors, envelope);
            return null;
        }

        const entry = executionEntry(envelope);

        /* A decision about nothing cannot be routed: a signal always names the
         * bot, the symbol and the event, or it is not a decision. */
        if (!entry.topic || !entry.bot || !entry.symbol) {
            if (onInvalid) onInvalid(["a decision needs a bot id, a symbol and an event type to become a topic"], envelope);
            return null;
        }

        for (const receiver of receivers) {
            try {
                receiver(entry);
            } catch (err) {
                /* A broken subscriber must never break the pipeline. */
            }
        }

        if (bus && typeof bus.publish === "function") {
            bus.publish(entry, {
                market: entry.market,
                exchange: entry.exchange,
                symbol: entry.symbol
            });
        }

        return entry;
    };
}

module.exports = {
    EXECUTION_MARKET,
    EXECUTION_EVENTS,
    executionEnvelope,
    topicForEnvelope,
    executionEntry,
    createExecutionBridge
};

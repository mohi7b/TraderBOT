/* ============================================================
 * File: execution-engine/core/egress.cjs
 * Section: execution-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   Everything this layer sends OUT of itself:
 *
 *     1. builds the order envelope  (sourceType: "execution")
 *     2. derives its topic          execution.<bot>.<asset>.<event>
 *     3. hands the entry to sinks and (optionally) to the Realtime bus
 *
 *   Two things this layer says, and only two:
 *
 *     order          an order exists, with the venue's id on it
 *     order_blocked  a decision became no order, and here is what refused it
 *
 *   The second one is the reason this file exists at all. A refusal that is
 *   merely logged is a refusal that is lost: the bus is where a dashboard, an
 *   alert or an audit finds it, and it travels the same frame as the order that
 *   was allowed, so nobody has to read two vocabularies to see both.
 *
 *   Three rules:
 *
 *   1. AN ORDER IS ANNOUNCED WHERE A DECISION WAS. Same namespace, same frame,
 *      same four segments — a consumer that routes execution.btcbreakout.btc.*
 *      gets the order without learning a second address. But the envelope
 *      carries sourceType "execution", not "bot", and core/signal.cjs insists
 *      on "bot": this layer's own order event can therefore never be re-read as
 *      a fresh decision. That isolation is enforced by the reader, not by a
 *      convention someone has to remember.
 *
 *   2. WHAT IS ANNOUNCED IS THE LEDGER'S VIEW, NOT THE VENUE'S ANSWER. The
 *      payload is built from core/orders.cjs ORDER_FIELDS — the same fields the
 *      account stores — so a consumer reads one shape whether the venue
 *      answered `accepted`, `PARTIALLY_FILLED` or `NEW`. A venue's status word
 *      never reaches the bus.
 *
 *   3. BOTH EVENTS CARRY THE SAME KEYS. `order` is null on a blocked event,
 *      `blocked` is null on an order event, and everything else — key, bot,
 *      symbol, clientOrderId, status, reason, at — is always there. A consumer
 *      never has to branch before it can read.
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
    executionTopic,
    executionChannel,
    normalizeBotId
} = require("../../bot-engine/topics.cjs");
const { ORDER_FIELDS, isPlainObject } = require("./orders.cjs");

/** The bus "market" — the same axis a decision travels on. */
const ORDER_MARKET = EXECUTION_MARKET;

/** What this layer publishes. */
const ORDER_EVENTS = Object.freeze({
    ORDER: "order",
    ORDER_BLOCKED: "order_blocked"
});

const ORDER_EVENT_LIST = Object.freeze(Object.values(ORDER_EVENTS));

/** The fields copied out of a ledger order, in the order they are written. */
const ORDER_PAYLOAD_FIELDS = ORDER_FIELDS;

/**
 * Order envelope: the collector frame, published by the execution layer.
 *
 * `bot` and `symbol` are what give the frame its topic (rule 1 above); every
 * other field is the collector's vocabulary, so an order is as storable and as
 * filterable as a measurement.
 */
function orderEnvelope({
    bot,
    eventType,
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
    if (!id) throw new Error("orderEnvelope: a bot id is required");

    /* A venue word for the market type is provenance, never a frame value —
     * the same rule as analytics-engine/core/egress.cjs and bot-engine/
     * core/egress.cjs, so an order is never dropped for a naming detail. */
    const framedMarketType = MARKET_TYPES.includes(marketType) ? marketType : null;
    const framedProvenance = {
        origin: "execution-engine",
        stage: "execution-engine",
        bot: id,
        ...(provenance || {})
    };
    if (!framedMarketType && marketType) framedProvenance.sourceMarketType = marketType;

    return createEnvelope({
        assetClass,
        sourceType: SOURCE_TYPE.EXECUTION,
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

/** "execution.btcbreakout.btc.order" (null when it cannot be mapped). */
function topicForEnvelope(envelope) {
    const meta = envelope && envelope.meta;
    const provenance = (meta && meta.provenance) || {};

    try {
        return executionTopic({
            bot: provenance.bot,
            symbol: meta.symbol,
            eventType: meta.eventType
        });
    } catch (err) {
        return null;
    }
}

/* ------------------------------------------------------------
 * The payload — one shape, whatever the venue said
 * ---------------------------------------------------------- */

function numberOrNull(value) {
    /* null and "" are "no number", not zero: Number(null) is 0, and a
     * timestamp of 0 is a fact this layer must not invent. */
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/** The first of these that is a finite number, or null. */
function firstNumber(...values) {
    for (const value of values) {
        const number = numberOrNull(value);
        if (number !== null) return number;
    }
    return null;
}

/**
 * The ledger's view of one of its own orders — and nothing else.
 *
 * Built from core/orders.cjs ORDER_FIELDS, so the payload on the bus and the
 * record in the account cannot drift apart: a field added to the ledger is
 * announced, and a venue's own vocabulary (an extra status word, a fee object)
 * is never copied in.
 */
function pickOrder(order) {
    if (!isPlainObject(order)) return null;

    const picked = {
        clientOrderId: order.clientOrderId === undefined ? null : order.clientOrderId,
        venueOrderId: order.venueOrderId === undefined ? null : order.venueOrderId
    };

    for (const field of ORDER_PAYLOAD_FIELDS) {
        if (field === "clientOrderId") continue;
        picked[field] = order[field] === undefined ? null : order[field];
    }

    return Object.freeze(picked);
}

/**
 * The payload of one event — the same keys on both, so a consumer never has to
 * branch before it can read (rule 3):
 *
 *   an order event   → the order as the account holds it
 *   a blocked event  → what was asked, and what refused it
 *
 * @param {object}   options
 * @param {string}   [options.eventType]  one of ORDER_EVENTS
 * @param {object}   [options.order]      the ledger order (on an order event)
 * @param {object}   [options.verdict]    the guardrails verdict behind it
 * @param {string}   [options.key]        the decision identity
 * @param {number}   [options.at]
 * @param {string}   [options.reason]
 * @returns {object} frozen payload
 */
function orderPayload({
    eventType = ORDER_EVENTS.ORDER,
    order = null,
    verdict = null,
    key = null,
    at = null,
    reason = null
} = {}) {
    const blocked = eventType === ORDER_EVENTS.ORDER_BLOCKED;
    const record = blocked ? null : pickOrder(order);
    const fields = isPlainObject(verdict) ? verdict : {};

    return Object.freeze({
        event: eventType,
        at: firstNumber(at, record && record.updatedAt, record && record.createdAt, fields.at),
        key: key || (typeof fields.key === "string" ? fields.key : null),
        bot: (record && record.bot) || fields.bot || null,
        symbol: (record && record.symbol) || fields.symbol || null,
        clientOrderId: record ? record.clientOrderId : null,
        venueOrderId: record ? record.venueOrderId : null,
        status: record ? record.status : null,
        /* What was asked for: from the order once it exists, from the verdict
         * when it never became one. */
        side: (record && record.side) || fields.side || null,
        intent: (record && record.intent) || fields.intent || null,
        units: record ? record.units : numberOrNull(fields.units),
        price: record ? record.price : numberOrNull(fields.price),
        notional: record ? record.notional : numberOrNull(fields.notional),
        order: record,
        blocked: blocked
            ? Object.freeze({
                code: fields.code || null,
                rule: fields.rule || null,
                reason: fields.reason || reason || null
            })
            : null,
        reason: reason || (blocked ? fields.reason || null : (record && record.reason) || null)
    });
}

/* ------------------------------------------------------------
 * The entry — the address on the bus, and the sink shape
 * ---------------------------------------------------------- */

/** Bus channel of an order entry: execution:<bot>:<symbol>:<event>. */
function orderChannel(entry) {
    return executionChannel(entry || {});
}

/** The bus/sink entry of one order envelope. */
function orderEntry(envelope) {
    const meta = envelope.meta;
    const provenance = meta.provenance || {};
    const payload = isPlainObject(envelope.payload) ? envelope.payload : {};
    const bot = normalizeBotId(provenance.bot);

    const entry = {
        event: meta.eventType,
        market: ORDER_MARKET,
        /* The bus axis segment, and the id a consumer routes on. */
        bot,
        exchange: bot,
        symbol: meta.symbol,
        asset: baseAssetOf(meta.symbol),
        /* Lifted out of the payload so a consumer can filter on the order it
         * is waiting for (clientOrderId) without unwrapping the frame. */
        clientOrderId: payload.clientOrderId || null,
        status: payload.status || null,
        order: payload.order || null,
        topic: topicForEnvelope(envelope),
        source: meta.sourceType,
        envelope
    };

    entry.channel = orderChannel(entry);
    return entry;
}

/**
 * True when an entry is this layer's own order event.
 *
 * The bus "market" (`execution`) is shared with the decisions this layer
 * consumes, so the test cannot be the market alone: an order entry is one whose
 * event is an order event, or whose frame says its sourceType is "execution".
 * Written for the same reason bot-engine/topics.cjs has isExecutionEntry: a
 * layer must be able to recognise its own output before it acts on it.
 */
function isOrderEntry(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (ORDER_EVENT_LIST.includes(entry.event)) return true;

    const nested = entry.envelope || (entry.payload && (entry.payload.envelope || entry.payload));
    return Boolean(nested && nested.meta && nested.meta.sourceType === SOURCE_TYPE.EXECUTION);
}



/* ------------------------------------------------------------
 * The bridge — out to the sinks and the bus
 * ---------------------------------------------------------- */

/**
 * @param {object}   options
 * @param {object}   [options.bus]        EventBus-compatible ({publish})
 * @param {Function} [options.sink]       single extra receiver
 * @param {Function[]} [options.sinks]    extra receivers
 * @param {Function} [options.onInvalid]  (errors, envelope) => void
 * @returns {(envelope) => object|null}   publisher (null when rejected)
 */
function createOrderBridge({ bus = null, sink = null, sinks = [], onInvalid = null } = {}) {
    const receivers = [sink, ...(Array.isArray(sinks) ? sinks : [])].filter((fn) => typeof fn === "function");

    return function publishOrderEnvelope(envelope) {
        if (!envelope || !envelope.meta) return null;

        const validation = validateEnvelope(envelope);
        if (!validation.ok) {
            if (onInvalid) onInvalid(validation.errors, envelope);
            return null;
        }

        const entry = orderEntry(envelope);

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
                exchange: entry.bot,
                symbol: entry.symbol
            });
        }

        return entry;
    };
}

module.exports = {
    ORDER_MARKET,
    ORDER_EVENTS,
    ORDER_EVENT_LIST,
    ORDER_PAYLOAD_FIELDS,
    orderEnvelope,
    topicForEnvelope,
    pickOrder,
    orderPayload,
    orderChannel,
    orderEntry,
    isOrderEntry,
    createOrderBridge
};

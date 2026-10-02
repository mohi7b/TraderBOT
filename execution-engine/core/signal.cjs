/* ============================================================
 * File: execution-engine/core/signal.cjs
 * Section: execution-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   What this layer READS. A decision arrives from the bot engine on the
 *   execution namespace, and this file is the one place that says what is in
 *   it, which of its values matter, and how an order gets a price.
 *
 *     execution.signal  ──►  readSignal  ──►  { bot, symbol, action, at, price }
 *
 *   It is the deliberate mirror of core/egress.cjs, which says what the layer
 *   WRITES: the same envelope, read in the other direction.
 *
 *   Three rules:
 *
 *   1. A SIGNAL IS AN ENVELOPE, WHEREVER IT IS FOUND. The realtime bus wraps
 *      a publication as { channel, event, …, payload } and the runner's
 *      bridge hands the entry itself; a test may hand the bare frame. All
 *      three are read the same way, so no layer has to know which one it is
 *      holding — the wrapper is not part of what a decision means.
 *
 *   2. A DECISION ABOUT NOTHING IS NOT A SIGNAL. No bot, no symbol, no action,
 *      no instant: readSignal answers null rather than a half-read decision,
 *      and the caller refuses it in its own words. Nothing downstream may
 *      invent a field the bot engine did not send.
 *
 *   3. A PRICE IS FOUND, AND SAID WHERE FROM. An order cannot be sized without
 *      one, and the signal carries one only when the strategy read a price.
 *      So a price is looked for in the signal (an explicit price, then a metric
 *      that names one) and the answer says WHICH — `priceSource` — so an audit
 *      can tell "the strategy's own price" from "the venue's mark price".
 * ============================================================ */

const { baseAssetOf, SOURCE_TYPE } = require("../../collector/crypto/common/envelope.cjs");
const { normalizeBotId } = require("../../bot-engine/topics.cjs");
const { isPlainObject, isPositive } = require("./orders.cjs");

/**
 * The last segment of a metric path that means "a price". A metric is named by
 * the strategy, so the execution layer cannot demand one alias; it can only
 * recognise the names a price goes by in this platform's catalog —
 * `aggregate.lastPrice`, `price`, `ticker.close`, `markPrice`, and the rest.
 */
const PRICE_PATHS = Object.freeze([
    "price",
    "lastprice",
    "markprice",
    "indexprice",
    "tradeprice",
    "midprice",
    "last",
    "mark",
    "mid",
    "close",
    "lasttrade"
]);

/** The price a signal carries, and where it was found. */
function priceOf(payload, meta) {
    /* 1. The signal said so itself: a strategy that read a price may carry it. */
    for (const value of [payload.price, meta && meta.price]) {
        if (isPositive(value)) return { value, alias: null, path: "$.price", source: "signal" };
    }

    /* 2. A metric the strategy read is a price: the freshest one wins. */
    const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
    let best = null;

    for (const metric of metrics) {
        if (!isPlainObject(metric)) continue;
        if (typeof metric.path !== "string" || !isPositive(metric.value)) continue;
        if (metric.fresh === false || metric.stale === true) continue;

        const segments = metric.path.toLowerCase().split(/[.[\]]+/).filter(Boolean);
        const last = segments[segments.length - 1] || "";
        if (!PRICE_PATHS.includes(last)) continue;

        /* The freshest reading wins: an old price is a price that is no longer true. */
        const ageMs = Number.isFinite(metric.ageMs) ? metric.ageMs : Number.POSITIVE_INFINITY;
        if (!best || ageMs < best.ageMs) {
            best = {
                value: metric.value,
                alias: metric.alias || null,
                path: metric.path,
                source: `metric:${metric.alias || metric.path}`,
                ageMs
            };
        }
    }

    if (best) return { value: best.value, alias: best.alias, path: best.path, source: best.source };

    /* 3. Nothing in it names a price: the venue's own mark price is the only
     *    place left, and that belongs to the adapter, not to this file. */
    return { value: null, alias: null, path: null, source: null };
}

/** The envelope inside any of the wrappers a decision travels in. */
function envelopeOf(entry) {
    if (!isPlainObject(entry)) return null;
    if (isPlainObject(entry.meta) && isPlainObject(entry.payload)) return entry;
    if (isPlainObject(entry.envelope)) return entry.envelope;

    const payload = entry.payload;
    if (isPlainObject(payload)) {
        if (isPlainObject(payload.envelope)) return payload.envelope;
        if (isPlainObject(payload.meta) && isPlainObject(payload.payload)) return payload;
    }

    return null;
}

/**
 * One decision, read.
 *
 * Answers null for anything that is not a decision of the bot engine's
 * namespace: a reading, a status, a frame with no action, or a decision with
 * no bot or no symbol to act on. It never repairs and never guesses.
 *
 * @returns {object|null} { bot, symbol, asset, exchange, event, at, action,
 *                          metrics, price, priceAlias, pricePath, priceSource,
 *                          topic, envelope, entry }
 */
function readSignal(entry) {
    const envelope = envelopeOf(entry);
    if (!envelope) return null;

    const meta = envelope.meta;
    const payload = envelope.payload;
    if (!isPlainObject(meta) || !isPlainObject(payload)) return null;

    /* Only the bot layer decides: an analytics reading, a collector frame or
     * this layer's own order event is not a decision, and is refused as what
     * it is instead of being read for fields it does not have. */
    if (meta.sourceType !== SOURCE_TYPE.BOT) return null;
    if (meta.eventType !== "signal") return null;

    const wrapper = isPlainObject(entry.payload) && isPlainObject(entry.payload.envelope) ? entry.payload : entry;
    const bot = normalizeBotId(wrapper.bot || meta.provenance && meta.provenance.bot);
    const symbol = typeof wrapper.symbol === "string" && wrapper.symbol ? wrapper.symbol : meta.symbol;
    if (!bot || typeof symbol !== "string" || !symbol) return null;

    const action = payload.action;
    if (!isPlainObject(action) || typeof action.type !== "string") return null;

    const at = Number.isFinite(Number(payload.at)) ? Number(payload.at) : Number(meta.timestamp);
    if (!Number.isFinite(at)) return null;

    const price = priceOf(payload, meta);

    return Object.freeze({
        bot,
        symbol,
        asset: baseAssetOf(symbol),
        exchange: meta.exchange || null,
        event: meta.eventType,
        at,
        action,
        metrics: Object.freeze(Array.isArray(payload.metrics) ? payload.metrics.slice() : []),
        price: price.value,
        priceAlias: price.alias,
        pricePath: price.path,
        priceSource: price.source,
        topic: typeof wrapper.topic === "string" ? wrapper.topic : null,
        envelope,
        entry
    });
}

/** True when an entry can be read as a decision at all. */
function isSignalEntry(entry) {
    return readSignal(entry) !== null;
}

module.exports = {
    PRICE_PATHS,
    envelopeOf,
    priceOf,
    readSignal,
    isSignalEntry
};

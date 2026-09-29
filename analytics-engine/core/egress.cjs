/* ============================================================
 * File: analytics-engine/core/egress.cjs
 * Section: analytics-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   Everything the analytics engine sends OUT of itself:
 *
 *     1. builds the analytics envelope  (sourceType: "analytics")
 *     2. derives its topic              analytics.<assetClass>.<asset>.<event>
 *     3. hands the entry to sinks and (optionally) to the Realtime bus
 *
 *   Bus channel vs topic — they answer two different questions:
 *     channel  analytics:crypto:BTCUSDT:cvd   "which symbol?"   (bus axis)
 *     topic    analytics.crypto.btc.cvd       "which asset?"    (subscribers)
 *   Both are carried on the entry, so a consumer can use whichever key it
 *   already has. The bus dimension uses `market = "analytics"` and
 *   `exchange = <assetClass>`; that keeps analytics traffic out of the
 *   realtime channels (spot/futures) without inventing a second bus.
 *
 *   marketType: the frame only knows the collector vocabulary
 *   (spot|futures, MARKET_TYPES). A venue word such as okx's "swap" is kept
 *   as provenance.sourceMarketType instead of being copied into the frame —
 *   a reading is never dropped because of a naming detail.
 * ============================================================ */

const {
    createEnvelope,
    validateEnvelope,
    baseAssetOf,
    MARKET_TYPES,
    SOURCE_TYPE,
    ASSET_CLASS
} = require("../../collector/crypto/common/envelope.cjs");
const { analyticsTopic } = require("../topics.cjs");

/** The bus "market" of every analytics channel. */
const ANALYTICS_MARKET = "analytics";

/** Analytics envelope: same frame as the collector, different sourceType.
 *
 *  The frame vocabulary is the collector's (marketType spot|futures). A venue
 *  word (okx "swap", a bare "perp", …) is provenance, not a frame field: it
 *  is recorded as provenance.sourceMarketType and the frame gets null, so an
 *  unknown market word can never cost a finished reading.
 */
function analyticsEnvelope({
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
    const framedMarketType = MARKET_TYPES.includes(marketType) ? marketType : null;
    const framedProvenance = { origin: "analytics-engine", ...(provenance || {}) };

    if (!framedMarketType && marketType) framedProvenance.sourceMarketType = marketType;

    return createEnvelope({
        assetClass,
        sourceType: SOURCE_TYPE.ANALYTICS,
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

/** "analytics.crypto.btc.cvd" (null when the envelope cannot be mapped). */
function topicForEnvelope(envelope) {
    if (!envelope || !envelope.meta) return null;

    const provenance = envelope.meta.provenance || {};

    try {
        return analyticsTopic({
            assetClass: envelope.meta.assetClass,
            /* The asset segment is the base asset of the symbol the reading
             * carried — unless the publisher knows better and said so
             * (provenance.topicAsset): an on-chain subject id such as TETH is
             * a fund ticker, not a pair quoted in ETH. */
            asset: provenance.topicAsset || baseAssetOf(envelope.meta.symbol),
            eventType: envelope.meta.eventType
        });
    } catch (err) {
        return null;
    }
}

/** Bus channel of an analytics entry: analytics:<assetClass>:<symbol>:<event>. */
function analyticsChannel(entry) {
    return [
        entry.market || ANALYTICS_MARKET,
        entry.exchange || "unknown",
        entry.symbol || "unknown",
        entry.event || "unknown"
    ].join(":");
}

/** The bus/sink entry of one analytics envelope. */
function analyticsEntry(envelope) {
    const entry = {
        event: envelope.meta.eventType,
        market: ANALYTICS_MARKET,
        exchange: envelope.meta.assetClass,
        symbol: envelope.meta.symbol,
        asset: baseAssetOf(envelope.meta.symbol),
        topic: topicForEnvelope(envelope),
        source: envelope.meta.sourceType,
        envelope
    };
    entry.channel = analyticsChannel(entry);
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
function createAnalyticsBridge({ bus = null, sink = null, sinks = [], onInvalid = null } = {}) {
    const receivers = [sink, ...(Array.isArray(sinks) ? sinks : [])].filter((fn) => typeof fn === "function");

    return function publishAnalyticsEnvelope(envelope) {
        if (!envelope || !envelope.meta) return null;

        const validation = validateEnvelope(envelope);
        if (!validation.ok) {
            if (onInvalid) onInvalid(validation.errors, envelope);
            return null;
        }

        const entry = analyticsEntry(envelope);

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
    ANALYTICS_MARKET,
    analyticsEnvelope,
    topicForEnvelope,
    analyticsChannel,
    analyticsEntry,
    createAnalyticsBridge
};

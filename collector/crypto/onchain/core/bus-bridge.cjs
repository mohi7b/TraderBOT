/* ============================================================
 * File: collector/crypto/onchain/core/bus-bridge.cjs
 * Section: collector/crypto/onchain/core
 * Version: 1.0.0
 *
 * Role:
 *   Put on-chain readings on the Realtime event bus in the same shape the
 *   derivatives and liquidity collectors use: the full envelope travels as
 *   the entry payload, so analytics-engine — already subscribed to the bus —
 *   can turn it into analytics.<assetClass>.<asset>.<event> without either
 *   side knowing about the other.
 *
 *   The bus axis is "onchain" (never spot/futures), so an exchange reserve
 *   number can never be mistaken for a crypto trade on the realtime
 *   channels:
 *       onchain:crypto:BTC:network_metrics
 *       onchain:crypto:BINANCE:exchange_reserves
 *       onchain:crypto:USDT:stablecoin_supply
 *       onchain:crypto:IBIT:etf_quote
 *
 *   The frame inside carries the honest classification:
 *       assetClass          crypto
 *       marketType          null        (an on-chain datum is not a venue market)
 *       symbol              the subject (BTC | BINANCE | USDT | IBIT)
 *       exchange            where the datum belongs (bitcoin | binance | tether | nasdaq)
 *       provenance          origin "onchain", subjectKind, network, issuer,
 *                           listing, underlying + the provider that answered
 * ============================================================ */

const { createEnvelope, validateEnvelope, SOURCE_TYPE } = require("../../common/envelope.cjs");

/** The bus axis this module owns. */
const ONCHAIN_MARKET = "onchain";

/** Reading → envelope (the frame the analytics engine validates). */
function readingEnvelope(reading) {
    if (!reading || !reading.subjectId) return null;

    return createEnvelope({
        assetClass: reading.assetClass,
        sourceType: SOURCE_TYPE.ONCHAIN,
        /* An on-chain reading is neither spot nor futures. */
        marketType: null,
        exchange: reading.exchange,
        symbol: reading.subjectId,
        eventType: reading.eventType,
        data: reading.data,
        timestamp: reading.timestamp,
        receiveTimestamp: reading.receivedAt,
        provenance: reading.provenance
    });
}

/**
 * @param {object} bus       EventBus-compatible ({publish(entry, ctx)})
 * @param {object} [options] sink: (entry) => void, onInvalid: (errors, envelope) => void
 * @returns {(envelope) => object|null} publisher
 */
function createOnchainBridge({ bus = null, sink = null, onInvalid = null } = {}) {
    return function publishEnvelope(envelope) {
        if (!envelope || !envelope.meta) return null;

        const validation = validateEnvelope(envelope);
        if (!validation.ok) {
            if (onInvalid) onInvalid(validation.errors, envelope);
            return null;
        }

        const entry = {
            event: envelope.meta.eventType,
            /* The bus axis this collector owns; the honest venue word stays
             * inside the frame as meta.exchange. */
            market: ONCHAIN_MARKET,
            exchange: envelope.meta.assetClass,
            symbol: envelope.meta.symbol,
            envelope
        };

        if (sink) sink(entry);
        if (!bus || typeof bus.publish !== "function") return entry;

        return bus.publish({ ...entry, source: envelope.meta.sourceType }, {
            market: entry.market,
            exchange: entry.exchange,
            symbol: entry.symbol
        });
    };
}

/** Convenience: one reading straight onto the bus. */
function createReadingPublisher({ bridge, now = () => Date.now() } = {}) {
    if (typeof bridge !== "function") throw new TypeError("createReadingPublisher: bridge is required");

    return function publishReading(reading) {
        if (!reading) return null;
        const envelope = readingEnvelope(reading);
        if (!envelope) return null;
        /* The envelope's processedAt is set by createEnvelope; the reading's
         * own timestamp stays the provider's time, never ours. */
        void now;
        return bridge(envelope);
    };
}

module.exports = { ONCHAIN_MARKET, readingEnvelope, createOnchainBridge, createReadingPublisher };
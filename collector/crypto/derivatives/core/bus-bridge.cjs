/* ============================================================
 * File: collector/crypto/derivatives/core/bus-bridge.cjs
 * Section: collector/crypto/derivatives/core
 * Version: 1.0.0
 *
 * Role:
 *   Publish derivatives envelopes onto the Realtime event bus
 *   (collector/crypto/realtime/core/event-bus.cjs).
 *
 *   The bus channel format is <market>:<exchange>:<symbol>:<event>, so a
 *   derivatives sample becomes e.g.
 *       futures:binance:BTCUSDT:open_interest
 *   The full envelope (with meta.sourceType = "derivatives") travels as
 *   the entry payload, which is what analytics-engine consumes.
 *
 *   Bus publishing is optional and injected: the collector works without
 *   a bus, and the bus is never required unless a bridge is created.
 * ============================================================ */

const { validateEnvelope } = require("../../common/envelope.cjs");

/** envelope.eventType → bus event name (open_interest, funding, ...) */
function busEventFor(envelope) {
    return envelope.meta.eventType;
}

/**
 * @param {object} bus     EventBus-compatible ({publish(entry, ctx)})
 * @param {object} options sink: (entry) => void   extra receiver, optional
 * @returns {(envelope) => object|null} publisher
 */
function createBusBridge({ bus = null, sink = null, onInvalid = null } = {}) {
    return function publishEnvelope(envelope) {
        if (!envelope || !envelope.meta) return null;

        const validation = validateEnvelope(envelope);
        if (!validation.ok) {
            if (onInvalid) onInvalid(validation.errors, envelope);
            return null;
        }

        const event = busEventFor(envelope);
        const entry = {
            event,
            market: envelope.meta.marketType,
            exchange: envelope.meta.exchange,
            symbol: envelope.meta.symbol,
            envelope
        };

        if (sink) sink(entry);
        if (!bus || typeof bus.publish !== "function") return entry;

        return bus.publish({ ...entry, source: envelope.meta.sourceType }, {
            market: envelope.meta.marketType,
            exchange: envelope.meta.exchange,
            symbol: envelope.meta.symbol
        });
    };
}

module.exports = { createBusBridge, busEventFor };

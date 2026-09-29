/* ============================================================
 * File: collector/liquidity_6markets/core/bus-bridge.cjs
 * Section: collector/liquidity_6markets/core
 * Version: 1.0.0
 *
 * Role:
 *   Publish six-market readings onto the Realtime event bus in the same
 *   shape the derivatives collector uses (see
 *   collector/crypto/derivatives/core/bus-bridge.cjs): the full envelope
 *   travels as the entry payload, so analytics-engine — which is already
 *   subscribed to the bus — turns it into analytics.<assetClass>.<asset>.<event>
 *   without either side knowing about the other.
 *
 *   The bus channel axis is "liquidity" (never spot/futures), so a gold
 *   quote can never be mistaken for a crypto trade on the realtime
 *   channels:
 *       liquidity:commodities:XAUUSD:ticker
 *       liquidity:forex:EURUSD:ticker
 *
 *   The frame inside carries the honest classification:
 *       assetClass            forex | commodities | indices | bonds |
 *                             realestatecredit | crypto
 *       marketType            spot | futures | null  (frame vocabulary)
 *       provenance.sourceMarketType   the venue's own word ("cash", "yield")
 * ============================================================ */

const { createEnvelope, validateEnvelope, SOURCE_TYPE } = require("../../crypto/common/envelope.cjs");
const { provenanceOf } = require("./instrument.cjs");

/** The bus axis this module owns. */
const LIQUIDITY_MARKET = "liquidity";

/** Reading → envelope (the frame the analytics engine validates). */
function readingEnvelope(reading, { eventType = null, flow = null, instrument = null } = {}) {
    if (!reading || !reading.instrument) return null;

    const type = eventType || reading.eventType || "ticker";
    const data = {
        price: reading.price,
        bid: reading.bid,
        ask: reading.ask,
        bidSize: reading.bidSize,
        askSize: reading.askSize,
        open: reading.open,
        high: reading.high,
        low: reading.low,
        close: reading.close,
        volume: reading.volume,
        barInterval: reading.barInterval,
        quoteSpreadBps: reading.quoteSpreadBps,
        kind: reading.kind,
        sourceMarket: reading.sourceMarket,
        /* Explicit evidence flags: the analytics side never has to guess
         * whether a number is a measurement or a stand-in. */
        evidence: {
            bidAsk: reading.bid !== null && reading.ask !== null,
            depth: reading.depth === true,
            candle: reading.open !== null && reading.close !== null,
            cvd: "proxy"
        }
    };

    if (type === "depth") {
        const size = reading.depth ? { bidSize: reading.bidSize, askSize: reading.askSize } : null;
        data.bids = reading.bid !== null && size ? [[reading.bid, size.bidSize]] : null;
        data.asks = reading.ask !== null && size ? [[reading.ask, size.askSize]] : null;
    }

    if (flow) data.flow = {
        priceSpreadBps: flow.priceSpreadBps,
        tradableSpreadBps: flow.tradableSpreadBps,
        depthImbalance: flow.depthImbalance,
        cvdProxy: flow.cvdProxy,
        cvdMethod: flow.cvdMethod,
        venueCount: flow.venueCount
    };

    return createEnvelope({
        assetClass: reading.assetClass,
        sourceType: SOURCE_TYPE.LIQUIDITY,
        marketType: reading.marketType,
        exchange: reading.venue,
        symbol: reading.instrument,
        eventType: type,
        data,
        timestamp: reading.timestamp,
        receiveTimestamp: reading.receivedAt,
        provenance: provenanceOf(instrument || { kind: reading.kind, sourceMarket: reading.sourceMarket }, {
            providerSymbol: (reading.provenance && reading.provenance.providerSymbol) || null
        })
    });
}

/**
 * @param {object} bus       EventBus-compatible ({publish(entry, ctx)})
 * @param {object} [options] sink: (entry) => void, onInvalid: (errors, envelope) => void
 * @returns {(envelope) => object|null} publisher
 */
function createLiquidityBridge({ bus = null, sink = null, onInvalid = null } = {}) {
    return function publishEnvelope(envelope) {
        if (!envelope || !envelope.meta) return null;

        const validation = validateEnvelope(envelope);
        if (!validation.ok) {
            if (onInvalid) onInvalid(validation.errors, envelope);
            return null;
        }

        const entry = {
            event: envelope.meta.eventType,
            /* The bus axis this collector owns; the honest market word stays
             * inside the frame as meta.marketType. */
            market: LIQUIDITY_MARKET,
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

/** Convenience: reading (+ optional flow) straight onto the bus. */
function createReadingPublisher({ bridge, engine = null, now = () => Date.now() } = {}) {
    if (typeof bridge !== "function") throw new TypeError("createReadingPublisher: bridge is required");

    return function publishReading(reading) {
        if (!reading) return null;
        const flow = engine ? engine.snapshot(reading.instrument, { at: now() }) : null;
        const envelope = readingEnvelope(reading, { flow });
        if (!envelope) return null;
        return bridge(envelope);
    };
}

module.exports = {
    LIQUIDITY_MARKET,
    readingEnvelope,
    createLiquidityBridge,
    createReadingPublisher
};

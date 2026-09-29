/* ============================================================
 * File: collector/liquidity_6markets/core/quote-normalizer.cjs
 * Section: collector/liquidity_6markets/core
 * Version: 1.0.0
 *
 * Role:
 *   Turn whatever a provider handed back into ONE canonical reading,
 *   the same shape for a gold quote, a 10-year yield and a crypto book
 *   ticker:
 *
 *     { instrument, assetClass, kind, venue, price, bid, ask,
 *       bidSize, askSize, depth, open, high, low, close, volume,
 *       barInterval, timestamp, receivedAt }
 *
 *   Nothing is invented. A provider that serves no bid/ask leaves
 *   bid/ask null (and the reading then has no bid-ask spread); one that
 *   serves no sizes leaves `depth: false`. A reading without a usable
 *   price is not a reading — it is a rejection reason.
 *
 *   eventType says what the venue actually handed over, and it is
 *   restricted to the three evidential words the analytics router
 *   already routes: "ticker" (a quote), "depth" (book sizes) and
 *   "trade" (a print). A candle is *not* one of them: it travels inside
 *   a ticker reading as open/high/low/close/volume.
 * ============================================================ */

const DEFAULT_FRESHNESS_MS = 90_000;

/** Frame event words this collector is allowed to claim. */
const READING_EVENTS = Object.freeze(["ticker", "depth", "trade"]);

function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function positive(value) {
    const number = finite(value);
    return number !== null && number > 0 ? number : null;
}

/** Median of the finite prices (robust against one lagging venue). */
function medianOf(values = []) {
    const usable = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (usable.length === 0) return null;
    const middle = Math.floor(usable.length / 2);
    return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

/** Basis points of a spread against a reference price. */
function toBps(spread, mid) {
    const base = positive(mid);
    const value = finite(spread);
    if (base === null || value === null) return null;
    return (value / base) * 10_000;
}

/**
 * One canonical reading.
 * @throws {TypeError|RangeError} on a structural problem (programmer error)
 */
function createReading({
    instrument,
    venue,
    price = null,
    bid = null,
    ask = null,
    bidSize = null,
    askSize = null,
    open = null,
    high = null,
    low = null,
    close = null,
    volume = null,
    barInterval = null,
    eventType = "ticker",
    timestamp = null,
    receivedAt = null,
    provenance = null
} = {}) {
    if (!instrument || typeof instrument !== "object" || !instrument.id || !instrument.assetClass) {
        throw new TypeError("reading.instrument must be a created instrument (see core/instrument.cjs)");
    }
    if (typeof venue !== "string" || venue.trim() === "") throw new TypeError("reading.venue is required");
    if (!READING_EVENTS.includes(eventType)) {
        throw new RangeError(`reading.eventType "${eventType}" is not routable (${READING_EVENTS.join("|")})`);
    }

    const bestBid = positive(bid);
    const bestAsk = positive(ask);
    const derivedMid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
    const lastPrice = positive(price) || derivedMid;

    if (lastPrice === null) return null;

    const sizeBid = finite(bidSize);
    const sizeAsk = finite(askSize);
    const hasDepth = sizeBid !== null && sizeAsk !== null && (sizeBid > 0 || sizeAsk > 0);

    const quoteSpread = bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? bestAsk - bestBid : null;

    return Object.freeze({
        instrument: instrument.id,
        assetClass: instrument.assetClass,
        kind: instrument.kind,
        venue: venue.trim(),
        quote: instrument.quote,
        marketType: instrument.marketType,
        sourceMarket: instrument.sourceMarket,
        price: lastPrice,
        bid: bestBid,
        ask: bestAsk,
        bidSize: sizeBid,
        askSize: sizeAsk,
        depth: hasDepth,
        open: positive(open),
        high: positive(high),
        low: positive(low),
        close: positive(close),
        volume: finite(volume),
        barInterval: barInterval || null,
        eventType,
        quoteSpreadBps: quoteSpread === null ? null : toBps(quoteSpread, lastPrice),
        timestamp: finite(timestamp) || Date.now(),
        receivedAt: finite(receivedAt) || Date.now(),
        provenance: Object.freeze({ ...(provenance || {}) })
    });
}

/** Age of a reading at `at` (ms), or null when it carries no timestamp. */
function ageOf(reading, at = Date.now()) {
    const timestamp = reading ? finite(reading.timestamp) : null;
    return timestamp === null ? null : Math.max(0, at - timestamp);
}

/**
 * Provider output → reading. `parsed` is a provider's own small object
 * (see providers/*.cjs); anything unusable yields null plus a reason,
 * so the collector can report "this venue refused" instead of crashing.
 *
 * @returns {{reading: object|null, reason: string|null}}
 */
function normalizeQuote(parsed, { instrument, venue, now = Date.now() } = {}) {
    if (!parsed || typeof parsed !== "object") return { reading: null, reason: "provider returned nothing usable" };

    const reading = createReading({
        instrument,
        venue,
        price: parsed.price,
        bid: parsed.bid,
        ask: parsed.ask,
        bidSize: parsed.bidSize,
        askSize: parsed.askSize,
        open: parsed.open,
        high: parsed.high,
        low: parsed.low,
        close: parsed.close,
        volume: parsed.volume,
        barInterval: parsed.barInterval,
        eventType: parsed.eventType || "ticker",
        timestamp: parsed.timestamp,
        receivedAt: now,
        provenance: { providerSymbol: parsed.providerSymbol || null }
    });

    if (!reading) return { reading: null, reason: `no usable price from "${venue}"` };
    return { reading, reason: null };
}

module.exports = {
    DEFAULT_FRESHNESS_MS,
    READING_EVENTS,
    finite,
    positive,
    medianOf,
    toBps,
    createReading,
    normalizeQuote,
    ageOf
};

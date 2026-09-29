/* ============================================================
 * File: collector/crypto/common/envelope.cjs
 * Section: collector/crypto/common
 * Version: 1.0.0
 *
 * Role:
 *   The standardised envelope of the whole collector: ONE shape for
 *   every datum that leaves a collector or an engine, whatever its
 *   layer. It is the machine-readable answer to "which layer did this
 *   come from?" — realtime, historical, derivatives or analytics —
 *   and it is what the analytics-engine consumes and produces.
 *
 *   meta.assetClass  "crypto" | "macro" | "forex" | "commodities" |
 *                    "indices" | "bonds" | "realestatecredit"
 *   meta.sourceType  "realtime" | "historical" | "derivatives" | "analytics" |
 *                    "liquidity" | "onchain" | "bot"
 *   meta.marketType  "spot" | "futures" | null
 *
 *   The layers divide in two, and the division is what keeps a derived layer
 *   from eating its own output: the collectors measure ("realtime",
 *   "historical", "derivatives", "liquidity", "onchain"), and the engines
 *   decide on what was measured ("analytics", "bot"). A derived layer that
 *   ingests another derived layer's output would be reading its own opinion
 *   back as evidence.
 *
 *   The 6-market liquidity engine (collector/liquidity_6markets) publishes
 *   the five non-crypto classes with sourceType "liquidity"; the frame
 *   vocabulary for marketType stays spot|futures, so an instrument word
 *   ("cash", "yield") travels as provenance.sourceMarketType instead.
 *
 * Relations:
 *   - built from  : market-packet.cjs (realtime), the historical API,
 *                   collector/crypto/derivatives/* and analytics-engine/*
 *   - consumed by : analytics-engine/core/egress.cjs (topic mapping)
 *   - bridged via : fromMarketPacket() / fromBusEntry()
 *
 *   canonical-*-packet.cjs keeps owning the *content* of a venue
 *   packet — this file only standardises the *outer* frame.
 * ============================================================ */

const ENVELOPE_SCHEMA_VERSION = 1;

const ASSET_CLASS = Object.freeze({
    CRYPTO: "crypto",
    MACRO: "macro",
    /* Sub-phase 2.2 — the six liquidity markets (collector/liquidity_6markets). */
    FOREX: "forex",
    COMMODITIES: "commodities",
    INDICES: "indices",
    BONDS: "bonds",
    REAL_ESTATE_CREDIT: "realestatecredit"
});

const SOURCE_TYPE = Object.freeze({
    REALTIME: "realtime",
    HISTORICAL: "historical",
    DERIVATIVES: "derivatives",
    ANALYTICS: "analytics",
    /* Sub-phase 2.2 — the 6-market liquidity/flow collector. */
    LIQUIDITY: "liquidity",
    /* Sub-phase 2.3 — the on-chain & institutional flow collector. */
    ONCHAIN: "onchain",
    /* The execution layer — a decision, not a measurement. It is a sourceType of
     * the same frame because a decision must be as easy to route, store and
     * audit as a reading: the bot engine publishes it exactly the way the
     * analytics engine publishes a reading. */
    BOT: "bot"
});

const MARKET_TYPE = Object.freeze({
    SPOT: "spot",
    FUTURES: "futures"
});

const ASSET_CLASSES = Object.freeze(Object.values(ASSET_CLASS));
const SOURCE_TYPES = Object.freeze(Object.values(SOURCE_TYPE));
const MARKET_TYPES = Object.freeze(Object.values(MARKET_TYPE));

/* ------------------------------------------------------------
 * Symbol normalisation (topic naming + cross-venue aggregation)
 *   BTCUSDT → BTC      BTC-USDT-SWAP → BTC      XBTUSDTM → BTC
 *   ETHUSDC → ETH      1INCHUSDT → 1INCH
 * ---------------------------------------------------------- */

/* Longest first: USDT before USD, USDTM before USDT. */
const QUOTE_SUFFIXES = ["USDTM", "USDT", "USDC", "BUSD", "USD", "EUR", "BTC", "ETH"];

/* Contract markers are not currencies: they are stripped only when what is
 * left still ends with a known quote, so a base asset that merely ends with
 * the same letters (e.g. "ADAM") is never touched.
 *   BTC-USDT-SWAP → BTCUSDT     BTCUSDT_PERP → BTCUSDT     XBTUSDTM → XBTUSDT
 */
const CONTRACT_MARKERS = ["QUARTERLY", "FUTURES", "SWAP", "PERP", "FUT", "M"];

/* KuCoin quotes BTC as XBT. */
const VENUE_TICKERS = { XBT: "BTC" };

/* A quote that carries a contract marker but is still the same currency. */
const QUOTE_ALIASES = { USDTM: "USDT" };

function endsWithQuote(candidate) {
    return QUOTE_SUFFIXES.some((suffix) => candidate.length > suffix.length && candidate.endsWith(suffix));
}

function stripContractMarkers(symbol) {
    let out = symbol;
    let stripped = true;

    while (stripped) {
        stripped = false;
        for (const marker of CONTRACT_MARKERS) {
            if (out.length > marker.length && out.endsWith(marker)) {
                const candidate = out.slice(0, out.length - marker.length);
                if (endsWithQuote(candidate)) {
                    out = candidate;
                    stripped = true;
                    break;
                }
            }
        }
    }
    return out;
}

/** Upper-case, separator-free symbol with contract markers removed. */
function normalizedSymbol(symbol) {
    if (symbol === null || symbol === undefined) return null;

    const cleaned = String(symbol).toUpperCase().replace(/[-_/\s]/g, "");
    return cleaned ? stripContractMarkers(cleaned) : null;
}

function baseAssetOf(symbol) {
    const cleaned = normalizedSymbol(symbol);
    if (!cleaned) return null;

    for (const suffix of QUOTE_SUFFIXES) {
        if (cleaned.length > suffix.length && cleaned.endsWith(suffix)) {
            const base = cleaned.slice(0, cleaned.length - suffix.length);
            return VENUE_TICKERS[base] || base;
        }
    }

    return VENUE_TICKERS[cleaned] || cleaned;
}

/** Quote asset of a pair (null when the symbol carries no known quote). */
function quoteAssetOf(symbol) {
    const cleaned = normalizedSymbol(symbol);
    if (!cleaned) return null;

    for (const suffix of QUOTE_SUFFIXES) {
        if (cleaned.length > suffix.length && cleaned.endsWith(suffix)) {
            return QUOTE_ALIASES[suffix] || suffix;
        }
    }

    return null;
}

/**
 * The pair in one canonical form, so the same market reported by different
 * venues lands in one bucket:
 *   binance "BTCUSDT" + okx "BTC-USDT-SWAP" + bybit "BTCUSDT" → "BTCUSDT"
 * Falls back to the base asset when no quote is recognised ("BTC").
 */
function canonicalSymbol(symbol) {
    const base = baseAssetOf(symbol);
    if (!base) return null;

    const quote = quoteAssetOf(symbol);
    return quote ? `${base}${quote}` : base;
}


/* ------------------------------------------------------------
 * Envelope construction
 * ---------------------------------------------------------- */
function createEnvelope({
    assetClass = ASSET_CLASS.CRYPTO,
    sourceType = SOURCE_TYPE.REALTIME,
    marketType = null,
    exchange = null,
    symbol = null,
    eventType,
    data = null,
    timestamp = null,
    receiveTimestamp = null,
    sequence = null,
    provenance = null
} = {}) {
    const receivedAt = receiveTimestamp === null || receiveTimestamp === undefined || receiveTimestamp === ""
        || !Number.isFinite(Number(receiveTimestamp))
        ? Date.now()
        : Number(receiveTimestamp);
    const observedAt = timestamp === null || timestamp === undefined || timestamp === ""
        || !Number.isFinite(Number(timestamp))
        ? receivedAt
        : Number(timestamp);

    return {
        schemaVersion: ENVELOPE_SCHEMA_VERSION,
        meta: {
            id: `${exchange || "unknown"}:${symbol || "unknown"}:${eventType || "unknown"}:${observedAt}`,
            assetClass,
            sourceType,
            marketType,
            exchange,
            symbol,
            baseAsset: baseAssetOf(symbol),
            eventType: eventType || null,
            provenance,
            sequence: sequence === undefined ? null : sequence,
            timestamp: observedAt,
            receiveTimestamp: receivedAt,
            processedAt: Date.now()
        },
        payload: data
    };
}

function isEnvelope(value) {
    return !!value
        && typeof value === "object"
        && Number(value.schemaVersion) === ENVELOPE_SCHEMA_VERSION
        && !!value.meta
        && typeof value.meta === "object"
        && typeof value.meta.sourceType === "string"
        && typeof value.meta.eventType === "string";
}

/* ------------------------------------------------------------
 * Validation — used by the tests and by egress before publishing.
 * ---------------------------------------------------------- */
function validateEnvelope(envelope) {
    const errors = [];
    const meta = envelope && envelope.meta;

    if (!envelope || typeof envelope !== "object") {
        return { ok: false, errors: ["envelope is not an object"] };
    }
    if (Number(envelope.schemaVersion) !== ENVELOPE_SCHEMA_VERSION) {
        errors.push(`schemaVersion must be ${ENVELOPE_SCHEMA_VERSION}`);
    }
    if (!meta || typeof meta !== "object") {
        return { ok: false, errors: errors.concat("meta is missing") };
    }
    if (!ASSET_CLASSES.includes(meta.assetClass)) errors.push(`unknown assetClass "${meta.assetClass}"`);
    if (!SOURCE_TYPES.includes(meta.sourceType)) errors.push(`unknown sourceType "${meta.sourceType}"`);
    if (meta.marketType !== null && meta.marketType !== undefined && !MARKET_TYPES.includes(meta.marketType)) {
        errors.push(`unknown marketType "${meta.marketType}"`);
    }
    if (!meta.eventType) errors.push("eventType is required");
    if (!meta.id) errors.push("id is required");
    if (!Number.isFinite(Number(meta.timestamp))) errors.push("timestamp must be a number");
    if (!Number.isFinite(Number(meta.processedAt))) errors.push("processedAt must be a number");
    if (!("payload" in envelope)) errors.push("payload is required (may be null)");

    return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------
 * Bridges — the producers that already exist
 * ---------------------------------------------------------- */

/** realtime REST/WS packet (market-packet.cjs) → envelope */
function fromMarketPacket(packet, { sourceType = SOURCE_TYPE.REALTIME, assetClass = ASSET_CLASS.CRYPTO } = {}) {
    if (!packet || typeof packet !== "object") return null;

    return createEnvelope({
        assetClass,
        sourceType,
        marketType: packet.market || null,
        exchange: packet.exchange || null,
        symbol: packet.symbol || null,
        eventType: packet.eventType || null,
        data: packet.payload === undefined ? null : packet.payload,
        timestamp: packet.timestamp,
        receiveTimestamp: packet.receiveTimestamp,
        sequence: packet.sequence === undefined ? null : packet.sequence,
        provenance: {
            origin: "market-packet",
            schemaVersion: packet.schemaVersion === undefined ? null : packet.schemaVersion,
            source: packet.source || null
        }
    });
}

/** event-bus entry ({channel,event,market,exchange,symbol,at,payload}) → envelope */
function fromBusEntry(entry, { sourceType = SOURCE_TYPE.REALTIME, assetClass = ASSET_CLASS.CRYPTO } = {}) {
    if (!entry || typeof entry !== "object") return null;

    const payload = entry.payload || {};
    return createEnvelope({
        assetClass,
        sourceType,
        marketType: entry.market || payload.market || null,
        exchange: entry.exchange || null,
        symbol: entry.symbol || null,
        eventType: entry.event || payload.event || payload.type || null,
        data: payload,
        timestamp: entry.at,
        receiveTimestamp: payload.receiveTimestamp || entry.at,
        provenance: { origin: "event-bus", channel: entry.channel || null }
    });
}

module.exports = {
    ENVELOPE_SCHEMA_VERSION,
    ASSET_CLASS,
    SOURCE_TYPE,
    MARKET_TYPE,
    ASSET_CLASSES,
    SOURCE_TYPES,
    MARKET_TYPES,
    baseAssetOf,
    quoteAssetOf,
    canonicalSymbol,
    normalizedSymbol,
    createEnvelope,
    isEnvelope,
    validateEnvelope,
    fromMarketPacket,
    fromBusEntry
};

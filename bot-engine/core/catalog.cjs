/* ============================================================
 * File: bot-engine/core/catalog.cjs
 * Section: bot-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   What the analytical layer can actually be asked about. A strategy names a
 *   feed (a topic) and a path inside the reading that topic carries; this file
 *   is the list of paths that exist, so a strategy asking for a field nobody
 *   publishes is refused WHEN IT IS LOADED instead of never firing at runtime.
 *
 *   That distinction is the whole point of this file. A dotted path that does
 *   not resolve is invisible at runtime: the feed arrives, the value is
 *   undefined, the comparison is false, and the bot sits there looking healthy
 *   for a week. Refusing at load time turns that into a sentence.
 *
 *   The list is written from the readers themselves — the payload each topic
 *   carries is exactly what that module's reading method returned
 *   (the index.cjs of each analytics-engine module) — and it is deliberately closed: a
 *   real field this file does not name is a catalog change, made on purpose.
 *
 * Kinds (a pipe list is an enumeration):
 *   scalar            a number, or null — null is "not measured", never 0
 *   string, boolean   as they read
 *   up|down           an enumeration: only these values ever appear
 *   object, array     containers; a metric must not stop on one
 *   opaque            real, but not a shape this layer promises (a collector's
 *                     verbatim block, a raw sample list)
 *
 * Wildcards: a segment written <period> matches digits, <name> matches one
 * word. The module defaults are listed in EXAMPLES so a picker can offer them
 * without this file pretending they are the only legal values.
 * ============================================================ */

const {
    INDICATOR_TIMEFRAMES,
    PRICE_ACTION_TIMEFRAMES,
    CROSS_MARKET_TIMEFRAMES
} = require("../../analytics-engine/topics.cjs");

const CATALOG_VERSION = 1;

const KIND = Object.freeze({
    SCALAR: "scalar",
    STRING: "string",
    BOOLEAN: "boolean",
    OBJECT: "object",
    ARRAY: "array",
    OPAQUE: "opaque"
});

/** The kinds a condition may compare. Everything else exists, but is no value. */
const COMPARABLE = Object.freeze([KIND.SCALAR, KIND.STRING, KIND.BOOLEAN]);

/* ------------------------------------------------------------
 * Order flow (analytics-engine/modules/delta-flow, liquidations)
 * ---------------------------------------------------------- */

const ORDER_FLOW_FAMILIES = Object.freeze({
    cvd: {
        timeframe: false,
        label: "who is buying and selling, per venue and merged",
        paths: {
            symbol: KIND.STRING,
            venues: KIND.OBJECT,
            aggregate: KIND.OBJECT,
            series: KIND.ARRAY,
            timestamp: KIND.SCALAR,
            "aggregate.symbol": KIND.STRING,
            "aggregate.venues": KIND.SCALAR,
            "aggregate.trades": KIND.SCALAR,
            "aggregate.buyQty": KIND.SCALAR,
            "aggregate.sellQty": KIND.SCALAR,
            "aggregate.volume": KIND.SCALAR,
            "aggregate.cvd": KIND.SCALAR,
            "aggregate.buyNotional": KIND.SCALAR,
            "aggregate.sellNotional": KIND.SCALAR,
            "aggregate.cvdUsd": KIND.SCALAR,
            "aggregate.takerBuyRatio": KIND.SCALAR,
            "aggregate.vwap": KIND.SCALAR,
            "aggregate.windowMs": KIND.SCALAR,
            "aggregate.windowStart": KIND.SCALAR,
            "aggregate.lastTradeAt": KIND.SCALAR,
            "aggregate.timestamp": KIND.SCALAR
        }
    },
    orderbook_imbalance: {
        timeframe: false,
        label: "one venue's book: mid, spread and both imbalances",
        paths: {
            symbol: KIND.STRING,
            exchange: KIND.STRING,
            midPrice: KIND.SCALAR,
            bestBid: KIND.SCALAR,
            bestAsk: KIND.SCALAR,
            spread: KIND.SCALAR,
            spreadBps: KIND.SCALAR,
            bidNotional: KIND.SCALAR,
            askNotional: KIND.SCALAR,
            bidLevels: KIND.SCALAR,
            askLevels: KIND.SCALAR,
            imbalance: KIND.SCALAR,
            weightedImbalance: KIND.SCALAR,
            bias: "bid|ask|flat",
            timestamp: KIND.SCALAR
        }
    },
    liquidation_heatmap: {
        timeframe: false,
        label: "where positions were forced out, and how one-sidedly",
        paths: {
            symbol: KIND.STRING,
            windowMs: KIND.SCALAR,
            binPct: KIND.SCALAR,
            bins: KIND.ARRAY,
            binsTouched: KIND.SCALAR,
            clusters: KIND.ARRAY,
            "totals.notional": KIND.SCALAR,
            "totals.longNotional": KIND.SCALAR,
            "totals.shortNotional": KIND.SCALAR,
            "totals.netNotional": KIND.SCALAR,
            "totals.longShare": KIND.SCALAR,
            "totals.count": KIND.SCALAR,
            "totals.averageNotional": KIND.SCALAR,
            "totals.minPrice": KIND.SCALAR,
            "totals.maxPrice": KIND.SCALAR,
            "totals.vwap": KIND.SCALAR,
            largest: KIND.OPAQUE,
            exchanges: KIND.OBJECT,
            windowStart: KIND.SCALAR,
            timestamp: KIND.SCALAR
        }
    }
});

/* ------------------------------------------------------------
 * Derivatives (analytics-engine/modules/derivatives)
 * ---------------------------------------------------------- */

const DERIVATIVES_FAMILIES = Object.freeze({
    open_interest: {
        timeframe: false,
        label: "how much is open, where, and how fast it is being built",
        paths: {
            symbol: KIND.STRING,
            at: KIND.SCALAR,
            venues: KIND.ARRAY,
            totalUsd: KIND.SCALAR,
            totalBase: KIND.SCALAR,
            concentration: KIND.SCALAR,
            stale: KIND.ARRAY,
            timestamp: KIND.SCALAR,
            "leader.exchange": KIND.STRING,
            "leader.oiUsd": KIND.SCALAR,
            "leader.share": KIND.SCALAR,
            "change.windowMs": KIND.SCALAR,
            "change.referenceAt": KIND.SCALAR,
            "change.absoluteUsd": KIND.SCALAR,
            "change.percent": KIND.SCALAR
        }
    },
    oi_weighted_funding: {
        timeframe: false,
        label: "what holding the position pays, weighted by open interest",
        paths: {
            symbol: KIND.STRING,
            at: KIND.SCALAR,
            venues: KIND.ARRAY,
            unpriced: KIND.ARRAY,
            weightedAnnualized: KIND.SCALAR,
            weightedRate: KIND.SCALAR,
            weightedRateBps: KIND.SCALAR,
            simpleAnnualized: KIND.SCALAR,
            simpleRate: KIND.SCALAR,
            "coverage.venues": KIND.SCALAR,
            "coverage.weightedVenues": KIND.SCALAR,
            "coverage.oiUsd": KIND.SCALAR,
            dispersion: KIND.OPAQUE,
            timestamp: KIND.SCALAR
        }
    },
    positioning: {
        timeframe: false,
        label: "which side of the market is crowded",
        paths: {
            symbol: KIND.STRING,
            venues: KIND.ARRAY,
            ratio: KIND.SCALAR,
            simpleRatio: KIND.SCALAR,
            longAccount: KIND.SCALAR,
            shortAccount: KIND.SCALAR,
            timestamp: KIND.SCALAR
        }
    }
});

/* ------------------------------------------------------------
 * Venue dislocations (analytics-engine/modules/arbitrage)
 * ---------------------------------------------------------- */

const DISLOCATION_FAMILIES = Object.freeze({
    cross_exchange_spread: {
        timeframe: false,
        label: "what the same asset costs on two venues at once",
        paths: {
            symbol: KIND.STRING,
            venues: KIND.ARRAY,
            venuesCount: KIND.SCALAR,
            stale: KIND.ARRAY,
            excluded: KIND.ARRAY,
            mid: KIND.SCALAR,
            high: KIND.SCALAR,
            low: KIND.SCALAR,
            spreadUsd: KIND.SCALAR,
            spreadBps: KIND.SCALAR,
            roundTripFeeBps: KIND.SCALAR,
            netSpreadBps: KIND.SCALAR,
            tradable: KIND.BOOLEAN,
            timestamp: KIND.SCALAR
        }
    },
    funding_carry: {
        timeframe: false,
        label: "the best funding a venue pays against the average",
        paths: {
            symbol: KIND.STRING,
            venues: KIND.ARRAY,
            stale: KIND.ARRAY,
            best: KIND.OPAQUE,
            "average.rate": KIND.SCALAR,
            "average.annualized": KIND.SCALAR,
            "dispersion.minRate": KIND.SCALAR,
            "dispersion.maxRate": KIND.SCALAR,
            "dispersion.minAnnualized": KIND.SCALAR,
            "dispersion.maxAnnualized": KIND.SCALAR,
            "dispersion.stdevAnnualized": KIND.SCALAR,
            timestamp: KIND.SCALAR
        }
    }
});

/* ------------------------------------------------------------
 * The six-market liquidity layer (analytics-engine/modules/liquidity)
 * ---------------------------------------------------------- */

const LIQUIDITY_FAMILIES = Object.freeze({
    price_reading: {
        timeframe: false,
        label: "what the asset is worth across venues, and how far they disagree",
        paths: {
            symbol: KIND.STRING,
            asset: KIND.STRING,
            assetClass: KIND.STRING,
            marketType: KIND.STRING,
            at: KIND.SCALAR,
            venueCount: KIND.SCALAR,
            freshCount: KIND.SCALAR,
            stale: KIND.BOOLEAN,
            venues: KIND.ARRAY,
            price: KIND.SCALAR,
            high: KIND.OBJECT,
            low: KIND.OBJECT,
            "high.exchange": KIND.STRING,
            "high.price": KIND.SCALAR,
            "low.exchange": KIND.STRING,
            "low.price": KIND.SCALAR,
            priceSpreadBps: KIND.SCALAR,
            bidAskSpreadBps: KIND.SCALAR,
            bidAskVenue: KIND.STRING,
            depthImbalance: KIND.SCALAR,
            depthVenues: KIND.ARRAY,
            evidence: KIND.OPAQUE,
            timestamp: KIND.SCALAR
        }
    },
    liquidity_flow: {
        timeframe: false,
        label: "what the engine measured against what the collector reported",
        paths: {
            symbol: KIND.STRING,
            asset: KIND.STRING,
            assetClass: KIND.STRING,
            marketType: KIND.STRING,
            at: KIND.SCALAR,
            venueCount: KIND.SCALAR,
            freshCount: KIND.SCALAR,
            stale: KIND.BOOLEAN,
            "engine.price": KIND.SCALAR,
            "engine.priceSpreadBps": KIND.SCALAR,
            "engine.dispersionBps": KIND.SCALAR,
            "engine.bidAskSpreadBps": KIND.SCALAR,
            "engine.bidAskVenue": KIND.STRING,
            "engine.tradableSpreadBps": KIND.SCALAR,
            "engine.longVenue": KIND.STRING,
            "engine.shortVenue": KIND.STRING,
            "engine.depthImbalance": KIND.SCALAR,
            "engine.depthVenues": KIND.ARRAY,
            reported: KIND.OPAQUE,
            evidence: KIND.OPAQUE,
            timestamp: KIND.SCALAR
        }
    },
    candle: {
        timeframe: false,
        label: "the last bar a venue handed over — one event per bar",
        paths: {
            symbol: KIND.STRING,
            asset: KIND.STRING,
            assetClass: KIND.STRING,
            marketType: KIND.STRING,
            exchange: KIND.STRING,
            venue: KIND.STRING,
            interval: KIND.SCALAR,
            open: KIND.SCALAR,
            high: KIND.SCALAR,
            low: KIND.SCALAR,
            close: KIND.SCALAR,
            volume: KIND.SCALAR,
            timestamp: KIND.SCALAR,
            ageMs: KIND.SCALAR,
            stale: KIND.BOOLEAN,
            at: KIND.SCALAR
        }
    },
    onchain_flow: {
        timeframe: false,
        label: "what a chain, holder, stablecoin or fund holds, and how it moved",
        paths: {
            event: KIND.STRING,
            at: KIND.SCALAR,
            readings: KIND.SCALAR,
            firstAt: KIND.SCALAR,
            lastAt: KIND.SCALAR,
            gauge: KIND.OPAQUE,
            providers: KIND.ARRAY,
            agreement: KIND.SCALAR,
            sources: KIND.ARRAY,
            seen: KIND.ARRAY,
            stale: KIND.ARRAY,
            missing: KIND.ARRAY,
            reported: KIND.OPAQUE,
            evidence: KIND.OPAQUE,
            timestamp: KIND.SCALAR,
            "subject.id": KIND.STRING,
            "subject.kind": KIND.STRING,
            "subject.underlying": KIND.STRING,
            "subject.issuer": KIND.STRING,
            "subject.listing": KIND.STRING,
            "subject.network": KIND.STRING,
            "subject.assetClass": KIND.STRING
        }
    }
});

/* ------------------------------------------------------------
 * The bar layers (analytics-engine/modules/indicators, price_action)
 *
 * Both readings are built from the same closed bar and carry the same bar
 * fields — the indicator layer answers with numbers, the price-action layer
 * with structure — so the shared part is written once, here, instead of twice
 * with a typo between them.
 * ---------------------------------------------------------- */

const BAR_COMMON = Object.freeze({
    symbol: KIND.STRING,
    timeframe: KIND.STRING,
    interval: KIND.SCALAR,
    at: KIND.SCALAR,
    bar: KIND.OBJECT,
    openTime: KIND.SCALAR,
    closeTime: KIND.SCALAR,
    price: KIND.SCALAR,
    changePct: KIND.SCALAR,
    barAge: KIND.SCALAR,
    source: KIND.STRING,
    builtFrom: KIND.SCALAR,
    volumeComplete: KIND.BOOLEAN,
    params: KIND.OBJECT,
    series: KIND.OPAQUE
});

const BAR_FAMILIES = Object.freeze({
    indicators: {
        timeframe: true,
        timeframes: INDICATOR_TIMEFRAMES,
        label: "RSI, ATR, the SMA/EMA ladders, MACD, Bollinger and both VWAPs",
        paths: {
            ...BAR_COMMON,
            indicators: KIND.OBJECT,
            "indicators.rsi": KIND.SCALAR,
            "indicators.atr": KIND.SCALAR,
            "indicators.sma": KIND.OBJECT,
            "indicators.sma.<period>": KIND.SCALAR,
            "indicators.ema": KIND.OBJECT,
            "indicators.ema.<period>": KIND.SCALAR,
            "indicators.macd": KIND.OBJECT,
            "indicators.macd.macd": KIND.SCALAR,
            "indicators.macd.signal": KIND.SCALAR,
            "indicators.macd.histogram": KIND.SCALAR,
            "indicators.bollinger": KIND.OBJECT,
            "indicators.bollinger.lower": KIND.SCALAR,
            "indicators.bollinger.middle": KIND.SCALAR,
            "indicators.bollinger.upper": KIND.SCALAR,
            "indicators.vwap": KIND.OBJECT,
            "indicators.vwap.window": KIND.SCALAR,
            "indicators.vwap.windowBars": KIND.SCALAR,
            "indicators.vwap.windowFrom": KIND.SCALAR,
            "indicators.vwap.windowComplete": KIND.BOOLEAN,
            "indicators.vwap.session": KIND.SCALAR,
            "indicators.vwap.sessionBars": KIND.SCALAR,
            "indicators.vwap.sessionFrom": KIND.SCALAR,
            "indicators.vwap.sessionDay": KIND.SCALAR,
            "indicators.vwap.sessionComplete": KIND.BOOLEAN,
            "indicators.vwap.volumeBars": KIND.SCALAR,
            "indicators.vwap.volume": KIND.SCALAR
        }
    },
    price_action: {
        timeframe: true,
        timeframes: PRICE_ACTION_TIMEFRAMES,
        label: "the swings, breaks, gaps, order blocks and sweeps on one bar",
        paths: {
            ...BAR_COMMON,
            structure: KIND.OBJECT,
            "structure.trend": "up|down",
            "structure.bias": KIND.OBJECT,
            "structure.bias.index": KIND.SCALAR,
            "structure.bias.openTime": KIND.SCALAR,
            "structure.bias.side": "up|down",
            "structure.bias.kind": "bos|mss",
            "structure.bias.level": KIND.SCALAR,
            "structure.bias.levelIndex": KIND.SCALAR,
            "structure.bias.levelOpenTime": KIND.SCALAR,
            "structure.bias.price": KIND.SCALAR,
            "structure.breaks": KIND.ARRAY,
            "structure.fairValueGaps": KIND.ARRAY,
            "structure.fairValueGap": KIND.OBJECT,
            "structure.orderBlocks": KIND.ARRAY,
            "structure.orderBlock": KIND.OBJECT,
            "structure.sweeps": KIND.ARRAY,
            "structure.sweep": KIND.OBJECT,
            "structure.counts.swings.highs": KIND.SCALAR,
            "structure.counts.swings.lows": KIND.SCALAR,
            "structure.counts.breaks": KIND.SCALAR,
            "structure.counts.gaps": KIND.SCALAR,
            "structure.counts.filledGaps": KIND.SCALAR,
            "structure.counts.blocks": KIND.SCALAR,
            "structure.counts.consumedBlocks": KIND.SCALAR,
            "structure.counts.sweeps": KIND.SCALAR,
            "structure.levels.high": KIND.OBJECT,
            "structure.levels.high.index": KIND.SCALAR,
            "structure.levels.high.openTime": KIND.SCALAR,
            "structure.levels.high.price": KIND.SCALAR,
            "structure.levels.low": KIND.OBJECT,
            "structure.levels.low.index": KIND.SCALAR,
            "structure.levels.low.openTime": KIND.SCALAR,
            "structure.levels.low.price": KIND.SCALAR,
            "structure.range.from": KIND.SCALAR,
            "structure.range.to": KIND.SCALAR,
            "structure.range.high": KIND.SCALAR,
            "structure.range.low": KIND.SCALAR
        }
    }
});

/* ------------------------------------------------------------
 * The cross-market layer (analytics-engine/modules/cross_market)
 *
 * Three readings that answer about two series at once. `coefficient`,
 * `spreadPct` and `ratio` are the numbers a StatArb bot reads; each reading
 * also names what it was measured against (`against`, `benchmark`), which is
 * the part a signal's evidence is expected to carry.
 * ---------------------------------------------------------- */

const CROSS_MARKET_FAMILIES = Object.freeze({
    macro_correlation: {
        timeframe: true,
        timeframes: CROSS_MARKET_TIMEFRAMES,
        label: "how much this series and the macro anchor of its market moved together",
        paths: {
            ...BAR_COMMON,
            against: KIND.OBJECT,
            "against.symbol": KIND.STRING,
            "against.assetClass": KIND.STRING,
            "against.source": KIND.STRING,
            "against.bars": KIND.SCALAR,
            "against.newestOpenTime": KIND.SCALAR,
            "against.anchors": KIND.ARRAY,
            coefficient: KIND.SCALAR,
            samples: KIND.SCALAR,
            missing: KIND.SCALAR,
            gaps: KIND.SCALAR,
            "pairWindow.from": KIND.SCALAR,
            "pairWindow.to": KIND.SCALAR,
            "pairWindow.intervalMs": KIND.SCALAR,
            "latest.openTime": KIND.SCALAR,
            "latest.closeTime": KIND.SCALAR,
            "latest.subject": KIND.SCALAR,
            "latest.peer": KIND.SCALAR,
            method: KIND.STRING
        }
    },
    relative_strength: {
        timeframe: true,
        timeframes: CROSS_MARKET_TIMEFRAMES,
        label: "how the subject did against the benchmark of its own market",
        paths: {
            ...BAR_COMMON,
            dominance: KIND.BOOLEAN,
            market: KIND.STRING,
            benchmark: KIND.OBJECT,
            "benchmark.symbol": KIND.STRING,
            "benchmark.assetClass": KIND.STRING,
            "benchmark.source": KIND.STRING,
            "benchmark.bars": KIND.SCALAR,
            "benchmark.newestOpenTime": KIND.SCALAR,
            subjectWindow: KIND.OPAQUE,
            benchmarkWindow: KIND.OPAQUE,
            spreadPct: KIND.SCALAR,
            ratio: KIND.SCALAR,
            pairs: KIND.SCALAR,
            missing: KIND.SCALAR,
            gaps: KIND.SCALAR,
            window: KIND.OPAQUE,
            method: KIND.STRING
        }
    },
    market_leverage_risk: {
        timeframe: false,
        label: "how much leverage the measurements that answered can account for",
        paths: {
            symbol: KIND.STRING,
            at: KIND.SCALAR,
            score: KIND.SCALAR,
            ratio: KIND.SCALAR,
            max: KIND.SCALAR,
            band: KIND.STRING,
            parts: KIND.OBJECT,
            present: KIND.ARRAY,
            missing: KIND.ARRAY,
            weights: KIND.OBJECT,
            thresholds: KIND.OBJECT,
            method: KIND.STRING,
            params: KIND.OBJECT
        }
    }
});

/* The whole catalog: every family the analytical layer can publish. */
const FAMILIES = Object.freeze({
    ...ORDER_FLOW_FAMILIES,
    ...DERIVATIVES_FAMILIES,
    ...DISLOCATION_FAMILIES,
    ...LIQUIDITY_FAMILIES,
    ...BAR_FAMILIES,
    ...CROSS_MARKET_FAMILIES
});

/**
 * The values a wildcard can hold, for a picker — the module defaults, never a
 * closed list: the modules accept other periods (their own `params` carry the
 * ones in force), and a strategy may name any positive integer.
 */
const EXAMPLES = Object.freeze({
    "indicators.sma.<period>": Object.freeze(["20", "50", "200"]),
    "indicators.ema.<period>": Object.freeze(["9", "21", "50", "200"])
});

/* ------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------- */

/** A pipe list is an enumeration ("up|down"); everything else is a kind. */
function isEnum(kind) {
    return typeof kind === "string" && kind.includes("|");
}

function enumValues(kind) {
    return isEnum(kind) ? kind.split("|") : null;
}

/** Whether a condition may compare this kind at all. */
function isComparable(kind) {
    if (isEnum(kind)) return true;
    return COMPARABLE.includes(kind);
}

/**
 * Which family publishes one eventType, and on which timeframe.
 *   "cvd"            → { key: "cvd", timeframe: null }
 *   "indicators_15m" → { key: "indicators", timeframe: "15m" }
 *   "nonsense"       → null
 */
function familyOfEvent(eventType) {
    const event = String(eventType === null || eventType === undefined ? "" : eventType).trim().toLowerCase();
    if (!event) return null;

    for (const [key, family] of Object.entries(FAMILIES)) {
        if (!family.timeframe) {
            if (event === key) return { key, timeframe: null, family };
            continue;
        }
        const prefix = `${key}_`;
        if (!event.startsWith(prefix)) continue;
        const timeframe = event.slice(prefix.length);
        if (family.timeframes.includes(timeframe)) return { key, timeframe, family };
    }

    return null;
}

/** Every event name this layer can be asked about, in family order. */
const EVENTS = Object.freeze(
    Object.entries(FAMILIES).flatMap(([key, family]) => (
        family.timeframe ? family.timeframes.map((timeframe) => `${key}_${timeframe}`) : [key]
    ))
);

/** Every (topic event, path) pair, for a picker or a docs page. */
function pathsOf(eventOrFamily) {
    const resolved = familyOfEvent(eventOrFamily);
    const key = resolved ? resolved.key : String(eventOrFamily || "").trim().toLowerCase();
    const family = FAMILIES[key];
    if (!family) return null;

    return Object.freeze(Object.entries(family.paths).map(([path, kind]) => Object.freeze({
        path,
        kind: isEnum(kind) ? KIND.STRING : kind,
        values: enumValues(kind),
        comparable: isComparable(kind),
        examples: EXAMPLES[path] || null
    })));
}

/** One pattern segment against one path segment (`<period>` matches digits). */
function segmentMatches(pattern, segment) {
    if (pattern === segment) return true;

    const wildcard = /^<([a-z]+)>$/.exec(pattern);
    if (!wildcard) return false;
    if (wildcard[1] === "period") return /^[0-9]+$/.test(segment);
    return /^[A-Za-z0-9_.+-]+$/.test(segment);
}

/**
 * The kind of one path inside one family, or null when the analytical layer
 * does not publish it. Exact names win over wildcards, so a concrete path is
 * never shadowed by a broader pattern.
 */
function resolvePath(familyKey, path) {
    const family = FAMILIES[familyKey];
    const wanted = String(path === null || path === undefined ? "" : path).trim().replace(/^\.+|\.+$/g, "");
    if (!family || !wanted) return null;

    const exact = family.paths[wanted];
    if (exact !== undefined) {
        return Object.freeze({
            path: wanted,
            pattern: wanted,
            kind: isEnum(exact) ? KIND.STRING : exact,
            values: enumValues(exact),
            comparable: isComparable(exact),
            examples: EXAMPLES[wanted] || null
        });
    }

    const segments = wanted.split(".");
    for (const [pattern, kind] of Object.entries(family.paths)) {
        if (!pattern.includes("<")) continue;
        const patternSegments = pattern.split(".");
        if (patternSegments.length !== segments.length) continue;
        if (!patternSegments.every((segment, at) => segmentMatches(segment, segments[at]))) continue;

        return Object.freeze({
            path: wanted,
            pattern,
            kind: isEnum(kind) ? KIND.STRING : kind,
            values: enumValues(kind),
            comparable: isComparable(kind),
            examples: EXAMPLES[pattern] || null
        });
    }

    return null;
}

function catalogStats() {
    const paths = Object.values(FAMILIES).reduce((total, family) => total + Object.keys(family.paths).length, 0);
    return Object.freeze({
        version: CATALOG_VERSION,
        families: Object.keys(FAMILIES).length,
        events: EVENTS.length,
        paths
    });
}

module.exports = {
    CATALOG_VERSION,
    KIND,
    COMPARABLE,
    FAMILIES,
    EXAMPLES,
    EVENTS,
    familyOfEvent,
    pathsOf,
    resolvePath,
    isEnum,
    enumValues,
    isComparable,
    segmentMatches,
    catalogStats
};


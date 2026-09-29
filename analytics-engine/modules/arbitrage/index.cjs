/* ============================================================
 * File: analytics-engine/modules/arbitrage/index.cjs
 * Section: analytics-engine/modules/arbitrage
 * Version: 1.0.0
 *
 * Role:
 *   Module 3 of the analytics engine: cross-exchange dislocations.
 *
 *     a) Price spread (basis between venues)
 *        mid         = median of the fresh venue prices
 *        high / low  = the two venues you would actually trade
 *        spreadUsd   = high.price − low.price
 *        spreadBps   = spreadUsd / mid × 10 000
 *        netSpreadBps= spreadBps − roundTripFeeBps
 *        tradable    = netSpreadBps > 0
 *        The median (not the mean) is the reference because one lagging
 *        venue must not drag the reference with it. A venue further than
 *        `maxDeviationBps` from the median is reported as `excluded`
 *        (stale/wrong symbol) instead of creating a fake edge.
 *
 *     b) Funding carry (perpetual funding arbitrage)
 *        Each venue's rate is annualised with its own interval
 *        (8 h → 1095×/year, 4 h → 2190×/year) before comparing, because
 *        comparing a 4-hourly 0.01% with an 8-hourly 0.01% is comparing
 *        two different yields.
 *        The carry is: long the LOWEST-funding venue, short the HIGHEST.
 *        spreadRate        = rate(short) − rate(long)        per interval
 *        spreadAnnualized  = ann(short) − ann(long)          per 365 d
 *
 *   Pure functions (crossExchangeSpread / fundingArbitrage) do the maths;
 *   the class only stores the latest venue sample per symbol.
 * ============================================================ */

const math = require("../../core/math.cjs");
const { annualizeFunding } = require("../../../collector/crypto/derivatives/core/canonical.cjs");

const DEFAULT_STALE_MS = 90_000;
const DEFAULT_TAKER_FEE_BPS = 5;       /* one taker side, per venue */
const DEFAULT_MAX_DEVIATION_BPS = 500; /* 5% from the median → excluded */

function feeConfig(feeBps) {
    if (typeof feeBps === "number") return { taker: Number(feeBps), roundTrip: Number(feeBps) * 2 };
    const value = math.finite(feeBps && feeBps.taker) === null ? DEFAULT_TAKER_FEE_BPS : feeBps.taker;
    return { taker: value, roundTrip: value * 2 };
}

/** Fresh, finite samples only — a stale venue is never silently priced. */
function usableEntries(entries = [], { at, staleMs = DEFAULT_STALE_MS }) {
    const usable = [];
    const stale = [];

    for (const entry of entries) {
        const price = math.positive(entry.price);
        const timestamp = math.finite(entry.timestamp);
        if (price === null) continue;

        const ageMs = timestamp === null ? null : Math.max(0, at - timestamp);
        if (ageMs !== null && ageMs > staleMs) {
            stale.push({ exchange: entry.exchange || null, ageMs });
            continue;
        }
        usable.push({ ...entry, price, ageMs });
    }

    return { usable, stale };
}

/**
 * @param {Array<{exchange:string, symbol?:string, price:number, timestamp?:number}>} entries
 * @returns {object} spread reading (never throws)
 */
function crossExchangeSpread(entries = [], {
    symbol = null,
    at = Date.now(),
    staleMs = DEFAULT_STALE_MS,
    maxDeviationBps = DEFAULT_MAX_DEVIATION_BPS,
    takerFeeBps = DEFAULT_TAKER_FEE_BPS
} = {}) {
    const { usable, stale } = usableEntries(entries, { at, staleMs });
    const fee = feeConfig(takerFeeBps);

    const empty = {
        symbol: symbol || (entries[0] && entries[0].symbol) || null,
        venues: usable.map((entry) => ({ exchange: entry.exchange, price: entry.price, ageMs: entry.ageMs })),
        venuesCount: usable.length,
        stale,
        excluded: [],
        mid: null,
        high: null,
        low: null,
        spreadUsd: null,
        spreadBps: null,
        roundTripFeeBps: fee.roundTrip,
        netSpreadBps: null,
        tradable: false,
        timestamp: at
    };

    if (usable.length < 2) return empty;

    const mid = math.median(usable.map((entry) => entry.price));
    const excluded = [];
    const kept = [];

    for (const entry of usable) {
        const deviationBps = math.bpsDiff(entry.price, mid);
        if (deviationBps !== null && Math.abs(deviationBps) > maxDeviationBps) {
            excluded.push({ exchange: entry.exchange, price: entry.price, deviationBps, ageMs: entry.ageMs });
            continue;
        }
        kept.push({ ...entry, deviationBps });
    }

    if (kept.length < 2) return { ...empty, mid, excluded, venues: kept };

    const high = kept.reduce((best, entry) => (entry.price > best.price ? entry : best), kept[0]);
    const low = kept.reduce((best, entry) => (entry.price < best.price ? entry : best), kept[0]);
    const spreadUsd = high.price - low.price;
    const spreadBps = math.bpsDiff(high.price, low.price);
    const netSpreadBps = spreadBps === null ? null : spreadBps - fee.roundTrip;

    return {
        symbol: symbol || high.symbol || (entries[0] && entries[0].symbol) || null,
        venues: kept.map((entry) => ({ exchange: entry.exchange, price: entry.price, deviationBps: entry.deviationBps, ageMs: entry.ageMs })),
        venuesCount: kept.length,
        stale,
        excluded,
        mid,
        high: { exchange: high.exchange, price: high.price },
        low: { exchange: low.exchange, price: low.price },
        spreadUsd,
        spreadBps,
        roundTripFeeBps: fee.roundTrip,
        netSpreadBps,
        tradable: netSpreadBps !== null && netSpreadBps > 0,
        timestamp: at
    };
}

/**
 * Funding carry across venues.
 * @param {Array<{exchange:string, rate:number, intervalHours?:number, timestamp?:number}>} entries
 */
function fundingArbitrage(entries = [], {
    symbol = null,
    at = Date.now(),
    staleMs = DEFAULT_STALE_MS,
    yearDays = 365
} = {}) {
    const venues = [];
    const stale = [];

    for (const entry of entries) {
        const rate = math.finite(entry.rate);
        if (rate === null) continue;

        const timestamp = math.finite(entry.timestamp);
        const ageMs = timestamp === null ? null : Math.max(0, at - timestamp);
        if (ageMs !== null && ageMs > staleMs) {
            stale.push({ exchange: entry.exchange || null, ageMs });
            continue;
        }

        const intervalHours = math.positive(entry.intervalHours) || 8;
        venues.push({
            exchange: entry.exchange || null,
            rate,
            intervalHours,
            annualized: annualizeFunding(rate, intervalHours, yearDays),
            nextFundingTime: math.finite(entry.nextFundingTime),
            ageMs
        });
    }

    const empty = {
        symbol: symbol || (entries[0] && entries[0].symbol) || null,
        venues,
        stale,
        best: null,
        average: { rate: null, annualized: null },
        dispersion: { minRate: null, maxRate: null, minAnnualized: null, maxAnnualized: null, stdevAnnualized: null },
        timestamp: at
    };

    if (venues.length < 2) return empty;

    const byRate = [...venues].sort((a, b) => a.rate - b.rate);
    const low = byRate[0];
    const high = byRate[byRate.length - 1];

    const rates = venues.map((venue) => venue.rate);
    const annualized = venues.map((venue) => venue.annualized).filter((value) => value !== null);
    const spreadRate = high.rate - low.rate;
    const spreadAnnualized = math.sum([high.annualized, low.annualized === null ? null : -low.annualized]);

    return {
        symbol: symbol || null,
        venues,
        stale,
        best: {
            /* Long the venue that pays least (or receives most) funding. */
            long: { exchange: low.exchange, rate: low.rate, intervalHours: low.intervalHours, annualized: low.annualized },
            /* Short the venue that charges the most funding to longs. */
            short: { exchange: high.exchange, rate: high.rate, intervalHours: high.intervalHours, annualized: high.annualized },
            spreadRate,
            spreadBps: math.toBps(spreadRate),
            spreadAnnualized,
            /* Annualised carry as a percentage of notional. */
            spreadAnnualizedPercent: spreadAnnualized === null ? null : spreadAnnualized * 100
        },
        average: {
            rate: math.mean(rates),
            annualized: math.mean(annualized)
        },
        dispersion: {
            minRate: Math.min(...rates),
            maxRate: Math.max(...rates),
            minAnnualized: annualized.length ? Math.min(...annualized) : null,
            maxAnnualized: annualized.length ? Math.max(...annualized) : null,
            stdevAnnualized: math.stdev(annualized)
        },
        timestamp: at
    };
}

/* ------------------------------------------------------------
 * Stateful facade: holds the latest price/funding per venue.
 * ---------------------------------------------------------- */
class CrossExchangeArbitrage {
    constructor({
        staleMs = DEFAULT_STALE_MS,
        maxDeviationBps = DEFAULT_MAX_DEVIATION_BPS,
        takerFeeBps = DEFAULT_TAKER_FEE_BPS,
        yearDays = 365,
        now = Date.now
    } = {}) {
        this.staleMs = staleMs;
        this.maxDeviationBps = maxDeviationBps;
        this.takerFeeBps = takerFeeBps;
        this.yearDays = yearDays;
        this.now = now;

        this.prices = new Map();   // "exchange:symbol" → {exchange, symbol, price, timestamp}
        this.fundings = new Map(); // "exchange:symbol" → {…, rate, intervalHours}
    }

    static key(exchange, symbol) {
        return `${exchange || "unknown"}:${String(symbol || "unknown").toUpperCase()}`;
    }

    ingestPrice(sample = {}) {
        const price = math.positive(sample.price);
        if (!sample.symbol || price === null) return null;

        const entry = {
            exchange: sample.exchange || null,
            symbol: String(sample.symbol).toUpperCase(),
            price,
            timestamp: math.finite(sample.timestamp) || this.now()
        };
        this.prices.set(CrossExchangeArbitrage.key(entry.exchange, entry.symbol), entry);
        return entry;
    }

    /** Accepts a last price or a mark price — both are a mid reference. */
    ingestMark(sample = {}) {
        const price = math.positive(sample.price) !== null ? sample.price : sample.markPrice;
        return this.ingestPrice({ ...sample, price });
    }

    ingestFunding(sample = {}) {
        const rate = math.finite(sample.rate);
        if (!sample.symbol || rate === null) return null;

        const entry = {
            exchange: sample.exchange || null,
            symbol: String(sample.symbol).toUpperCase(),
            rate,
            intervalHours: math.positive(sample.intervalHours) || 8,
            nextFundingTime: math.finite(sample.nextFundingTime),
            timestamp: math.finite(sample.timestamp) || this.now()
        };
        this.fundings.set(CrossExchangeArbitrage.key(entry.exchange, entry.symbol), entry);
        return entry;
    }

    entriesFor(map, symbol) {
        const upper = String(symbol || "").toUpperCase();
        const out = [];
        for (const entry of map.values()) {
            if (entry.symbol === upper) out.push(entry);
        }
        return out;
    }

    spread(symbol, options = {}) {
        const upper = String(symbol || "").toUpperCase();
        return crossExchangeSpread(this.entriesFor(this.prices, upper), {
            symbol: upper,
            at: this.now(),
            staleMs: this.staleMs,
            maxDeviationBps: this.maxDeviationBps,
            takerFeeBps: this.takerFeeBps,
            ...options
        });
    }

    funding(symbol, options = {}) {
        const upper = String(symbol || "").toUpperCase();
        return fundingArbitrage(this.entriesFor(this.fundings, upper), {
            symbol: upper,
            at: this.now(),
            staleMs: this.staleMs,
            yearDays: this.yearDays,
            ...options
        });
    }

    /** Both dislocations of one symbol, exactly as the engine publishes them. */
    snapshot(symbol, options = {}) {
        return {
            symbol: String(symbol || "").toUpperCase(),
            spread: this.spread(symbol, options),
            funding: this.funding(symbol, options)
        };
    }

    reset({ symbol = null } = {}) {
        const upper = symbol === null ? null : String(symbol).toUpperCase();
        let removed = 0;
        for (const map of [this.prices, this.fundings]) {
            for (const [key, entry] of [...map.entries()]) {
                if (upper === null || entry.symbol === upper) {
                    map.delete(key);
                    removed += 1;
                }
            }
        }
        return removed;
    }
}

module.exports = {
    CrossExchangeArbitrage,
    crossExchangeSpread,
    fundingArbitrage,
    usableEntries,
    DEFAULT_STALE_MS,
    DEFAULT_TAKER_FEE_BPS,
    DEFAULT_MAX_DEVIATION_BPS
};

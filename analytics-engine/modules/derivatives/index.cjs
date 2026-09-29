/* ============================================================
 * File: analytics-engine/modules/derivatives/index.cjs
 * Section: analytics-engine/modules/derivatives
 * Version: 1.0.0
 *
 * Role:
 *   Module 4 of the analytics engine: derivatives positioning.
 *
 *     a) Open interest, aggregated across venues
 *        totalUsd      = Σ venue OI (USD notional; a venue without a USD
 *                        figure is derived from base × mark, never
 *                        guessed from another venue's price)
 *        shares        = venue OI / total
 *        concentration = Herfindahl index Σ share² (1.0 = one venue holds
 *                        everything, ~0.2 = evenly spread over five)
 *        leader        = the venue holding the largest book
 *        change        = ΔOI versus the reading `changeWindowMs` ago
 *
 *     b) OI-weighted funding  ("the funding the marginal dollar pays")
 *        Per venue the rate is first annualised with its OWN interval
 *        (8 h → 1095 settlements/year, 4 h → 2190), then weighted:
 *          weightedAnnualized = Σ (ann_i × oiUsd_i) / Σ oiUsd_i
 *          weightedRate8h     = weightedAnnualized / 1095
 *        A venue funding an 8 h 0.01% cannot be averaged with a 4 h
 *        0.01% before annualising — that is the whole point of weighting
 *        annualised values. Venues without OI are excluded from the
 *        weighting but still reported (`coverage` says how much of the
 *        market the weighted number actually covers).
 *
 *     c) Positioning regime
 *        OI change + weighted funding + long/short ratio, each reduced to
 *        a sign, combined into one label (crowded long / crowded short /
 *        deleveraging / neutral / null when the inputs are missing).
 * ============================================================ */

const math = require("../../core/math.cjs");
const { annualizeFunding } = require("../../../collector/crypto/derivatives/core/canonical.cjs");

const DEFAULT_STALE_MS = 90_000;
const DEFAULT_CHANGE_WINDOW_MS = 60 * 60 * 1000;  /* 1 h */
const ANNUALIZE_BASE_HOURS = 8;

/**
 * Open interest across venues.
 * @param {Array<{exchange:string, oiUsd?:number, oiBase?:number, oiContracts?:number,
 *                markPrice?:number, timestamp?:number}>} entries
 */
function aggregateOpenInterest(entries = [], {
    symbol = null,
    at = Date.now(),
    staleMs = DEFAULT_STALE_MS
} = {}) {
    const venues = [];

    for (const entry of entries) {
        const markPrice = math.positive(entry.markPrice);
        const oiBase = math.positive(entry.oiBase);
        const oiUsd = math.positive(entry.oiUsd) !== null
            ? math.positive(entry.oiUsd)
            : math.multiply(oiBase, markPrice);

        const timestamp = math.finite(entry.timestamp);
        const ageMs = timestamp === null ? null : Math.max(0, at - timestamp);
        if (oiUsd === null) continue;

        venues.push({
            exchange: entry.exchange || null,
            oiUsd,
            oiBase,
            oiContracts: math.finite(entry.oiContracts),
            markPrice,
            ageMs,
            fresh: ageMs === null || ageMs <= staleMs,
            share: null
        });
    }

    const fresh = venues.filter((venue) => venue.fresh);
    const totalUsd = math.sum(fresh.map((venue) => venue.oiUsd));
    const totalBase = math.sum(fresh.map((venue) => venue.oiBase));

    const withShares = venues.map((venue) => ({
        ...venue,
        share: venue.fresh && totalUsd ? venue.oiUsd / totalUsd : null
    }));

    const shares = withShares.map((venue) => venue.share).filter((share) => share !== null);
    const leader = withShares
        .filter((venue) => venue.share !== null)
        .sort((a, b) => b.oiUsd - a.oiUsd)[0] || null;

    return {
        symbol: symbol || null,
        at,
        venues: withShares,
        totalUsd,
        totalBase,
        /* Herfindahl concentration: Σ share² (1 = monopolistic venue). */
        concentration: shares.length ? shares.reduce((acc, share) => acc + share ** 2, 0) : null,
        leader: leader ? { exchange: leader.exchange, oiUsd: leader.oiUsd, share: leader.share } : null,
        stale: venues.filter((venue) => !venue.fresh).map((venue) => ({ exchange: venue.exchange, ageMs: venue.ageMs })),
        timestamp: at
    };
}

/**
 * Positioning regime from OI change + weighted funding + long/short ratio.
 * Every input that is missing simply cannot vote; when none can, the
 * label is null rather than a fabricated "neutral".
 */
function positioningRegime({
    oiChangePct = null,
    weightedAnnualized = null,
    longShortRatio = null,
    thresholdPct = 0.5
} = {}) {
    const change = math.finite(oiChangePct);
    const funding = math.finite(weightedAnnualized);
    const lsr = math.finite(longShortRatio);

    const signals = {
        oiRising: change === null ? null : change > thresholdPct,
        oiFalling: change === null ? null : change < -thresholdPct,
        fundingPositive: funding === null ? null : funding > 0,
        fundingNegative: funding === null ? null : funding < 0,
        longsCrowded: lsr === null ? null : lsr > 1,
        shortsCrowded: lsr === null ? null : lsr < 1
    };

    let label = null;
    if (signals.oiRising && signals.fundingPositive && signals.longsCrowded) label = "crowded_long";
    else if (signals.oiRising && signals.fundingNegative && signals.shortsCrowded) label = "crowded_short";
    else if (signals.oiFalling) label = "deleveraging";
    else if (change !== null || funding !== null || lsr !== null) label = "neutral";

    return { label, signals, oiChangePct: change, weightedAnnualized: funding, longShortRatio: lsr, thresholdPct };
}

/**
 * OI-weighted funding across venues.
 * @param {Array<{exchange:string, symbol?:string, rate:number, oiUsd?:number,
 *                intervalHours?:number, timestamp?:number}>} entries
 */
function oiWeightedFunding(entries = [], {
    symbol = null,
    at = Date.now(),
    staleMs = DEFAULT_STALE_MS,
    yearDays = 365
} = {}) {
    const venues = [];
    const unpriced = [];
    let weightedTotal = 0;
    let weightTotal = 0;

    for (const entry of entries) {
        const rate = math.finite(entry.rate);
        if (rate === null) continue;

        const timestamp = math.finite(entry.timestamp);
        const ageMs = timestamp === null ? null : Math.max(0, at - timestamp);
        const intervalHours = math.positive(entry.intervalHours) || ANNUALIZE_BASE_HOURS;
        const annualized = annualizeFunding(rate, intervalHours, yearDays);
        const oiUsd = math.positive(entry.oiUsd);
        const fresh = ageMs === null || ageMs <= staleMs;

        const record = {
            exchange: entry.exchange || null,
            rate,
            intervalHours,
            annualized,
            oiUsd,
            ageMs,
            fresh,
            weight: null,
            contribution: null
        };

        if (oiUsd !== null && annualized !== null && fresh) {
            weightedTotal += annualized * oiUsd;
            weightTotal += oiUsd;
        } else if (oiUsd === null) {
            unpriced.push(record);
        }

        venues.push(record);
    }

    const weightedAnnualized = weightTotal > 0 ? weightedTotal / weightTotal : null;

    return {
        symbol: symbol || (entries[0] && entries[0].symbol) || null,
        at,
        venues: venues.map((record) => ({
            ...record,
            weight: record.oiUsd !== null && weightTotal > 0 && record.fresh ? record.oiUsd / weightTotal : null,
            contribution: record.oiUsd !== null && weightTotal > 0 && record.fresh && record.annualized !== null
                ? (record.oiUsd / weightTotal) * record.annualized
                : null
        })),
        /* Venues that quote a rate but no OI: reported, not weighted. */
        unpriced: unpriced.map((record) => ({ exchange: record.exchange, rate: record.rate, annualized: record.annualized })),
        weightedAnnualized,
        /* 8-hour-equivalent rate: what the weighted average pays per settlement. */
        weightedRate: weightedAnnualized === null ? null : weightedAnnualized / ((24 / ANNUALIZE_BASE_HOURS) * yearDays),
        weightedRateBps: math.toBps(
            weightedAnnualized === null ? null : weightedAnnualized / ((24 / ANNUALIZE_BASE_HOURS) * yearDays)
        ),
        simpleAnnualized: math.mean(venues.map((record) => record.annualized)),
        simpleRate: math.mean(venues.map((record) => record.rate)),
        coverage: {
            venues: venues.length,
            weightedVenues: venues.filter((record) => record.weight !== null).length,
            oiUsd: weightTotal || null
        },
        dispersion: {
            minRate: venues.length ? Math.min(...venues.map((record) => record.rate)) : null,
            maxRate: venues.length ? Math.max(...venues.map((record) => record.rate)) : null,
            stdevAnnualized: math.stdev(venues.map((record) => record.annualized))
        },
        timestamp: at
    };
}

/* ------------------------------------------------------------
 * Stateful facade: latest OI / funding / long-short per venue, plus a
 * short OI history so a change over time can be reported.
 * ---------------------------------------------------------- */
class DerivativesAnalytics {
    constructor({
        staleMs = DEFAULT_STALE_MS,
        changeWindowMs = DEFAULT_CHANGE_WINDOW_MS,
        historyPoints = 240,
        now = Date.now
    } = {}) {
        this.staleMs = staleMs;
        this.changeWindowMs = Math.max(1000, Number(changeWindowMs) || DEFAULT_CHANGE_WINDOW_MS);
        this.historyPoints = Math.max(2, Number(historyPoints) || 240);
        this.now = now;

        this.openInterest = new Map();  // "exchange:symbol" → sample
        this.fundings = new Map();
        this.ratios = new Map();
        this.history = new Map();       // SYMBOL → [{at, totalUsd}]
    }

    static key(exchange, symbol) {
        return `${exchange || "unknown"}:${String(symbol || "unknown").toUpperCase()}`;
    }

    ingestOpenInterest(sample = {}) {
        if (!sample.symbol) return null;
        const entry = {
            exchange: sample.exchange || null,
            symbol: String(sample.symbol).toUpperCase(),
            oiUsd: math.positive(sample.oiUsd),
            oiBase: math.positive(sample.oiBase),
            oiContracts: math.finite(sample.oiContracts),
            markPrice: math.positive(sample.markPrice),
            timestamp: math.finite(sample.timestamp) || this.now()
        };
        this.openInterest.set(DerivativesAnalytics.key(entry.exchange, entry.symbol), entry);
        return entry;
    }

    ingestFunding(sample = {}) {
        const rate = math.finite(sample.rate);
        if (!sample.symbol || rate === null) return null;
        const entry = {
            exchange: sample.exchange || null,
            symbol: String(sample.symbol).toUpperCase(),
            rate,
            intervalHours: math.positive(sample.intervalHours) || ANNUALIZE_BASE_HOURS,
            nextFundingTime: math.finite(sample.nextFundingTime),
            timestamp: math.finite(sample.timestamp) || this.now()
        };
        this.fundings.set(DerivativesAnalytics.key(entry.exchange, entry.symbol), entry);
        return entry;
    }

    ingestLongShortRatio(sample = {}) {
        const ratio = math.finite(sample.ratio);
        const longAccount = math.finite(sample.longAccount);
        const shortAccount = math.finite(sample.shortAccount);
        if (!sample.symbol || (ratio === null && longAccount === null && shortAccount === null)) return null;

        const entry = {
            exchange: sample.exchange || null,
            symbol: String(sample.symbol).toUpperCase(),
            ratio: ratio !== null ? ratio : math.divide(longAccount, shortAccount),
            longAccount,
            shortAccount,
            timestamp: math.finite(sample.timestamp) || this.now()
        };
        this.ratios.set(DerivativesAnalytics.key(entry.exchange, entry.symbol), entry);
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
    openInterestSnapshot(symbol, options = {}) {
        const upper = String(symbol || "").toUpperCase();
        const at = options.at || this.now();
        const aggregate = aggregateOpenInterest(this.entriesFor(this.openInterest, upper), {
            symbol: upper,
            at,
            staleMs: this.staleMs
        });

        if (aggregate.totalUsd !== null) this.remember(upper, at, aggregate.totalUsd);

        const previous = this.previousTotal(upper, at);
        const changeUsd = previous === null || aggregate.totalUsd === null
            ? null
            : aggregate.totalUsd - previous.totalUsd;
        const changeRatio = previous === null ? null : math.divide(changeUsd, previous.totalUsd);

        return {
            ...aggregate,
            change: {
                windowMs: this.changeWindowMs,
                referenceAt: previous === null ? null : previous.at,
                absoluteUsd: changeUsd,
                percent: changeRatio === null ? null : changeRatio * 100
            }
        };
    }

    remember(symbol, at, totalUsd) {
        const bucket = this.history.get(symbol) || [];
        if (bucket.length && bucket[bucket.length - 1].at === at) {
            bucket[bucket.length - 1] = { at, totalUsd };
        } else {
            bucket.push({ at, totalUsd });
        }
        while (bucket.length > this.historyPoints) bucket.shift();
        this.history.set(symbol, bucket);
        return bucket;
    }

    /** The oldest reading inside the change window (null when none yet). */
    previousTotal(symbol, at) {
        const bucket = this.history.get(symbol) || [];
        const cutoff = at - this.changeWindowMs;
        for (const point of bucket) {
            if (point.at <= at && point.at >= cutoff) return point;
        }
        return null;
    }

    fundingSnapshot(symbol, options = {}) {
        const upper = String(symbol || "").toUpperCase();
        const at = options.at || this.now();
        const oi = this.entriesFor(this.openInterest, upper);

        /* Attach each venue's OI to its funding sample for the weighting. */
        const entries = this.entriesFor(this.fundings, upper).map((entry) => {
            const match = oi.find((sample) => sample.exchange === entry.exchange);
            return { ...entry, oiUsd: match ? match.oiUsd : null };
        });

        return oiWeightedFunding(entries, {
            symbol: upper,
            at,
            staleMs: this.staleMs,
            yearDays: options.yearDays || 365
        });
    }

    positioningSnapshot(symbol, options = {}) {
        const upper = String(symbol || "").toUpperCase();
        const at = options.at || this.now();
        const ratios = this.entriesFor(this.ratios, upper);
        const oi = this.entriesFor(this.openInterest, upper);

        /* Weight each venue's ratio by its OI; without OI, weight 1. */
        const weighted = ratios.map((entry) => {
            const match = oi.find((sample) => sample.exchange === entry.exchange);
            return [entry.ratio, match && match.oiUsd !== null ? match.oiUsd : 1];
        });

        return {
            symbol: upper,
            venues: ratios.map((entry) => ({
                exchange: entry.exchange,
                ratio: entry.ratio,
                longAccount: entry.longAccount,
                shortAccount: entry.shortAccount,
                ageMs: Math.max(0, at - entry.timestamp)
            })),
            ratio: math.weightedMean(weighted),
            simpleRatio: math.mean(ratios.map((entry) => entry.ratio)),
            longAccount: math.mean(ratios.map((entry) => entry.longAccount)),
            shortAccount: math.mean(ratios.map((entry) => entry.shortAccount)),
            timestamp: at
        };
    }

    snapshot(symbol, options = {}) {
        const upper = String(symbol || "").toUpperCase();
        const openInterest = this.openInterestSnapshot(upper, options);
        const funding = this.fundingSnapshot(upper, options);
        const positioning = this.positioningSnapshot(upper, options);

        return {
            symbol: upper,
            openInterest,
            funding,
            positioning,
            regime: positioningRegime({
                oiChangePct: openInterest.change ? openInterest.change.percent : null,
                weightedAnnualized: funding.weightedAnnualized,
                longShortRatio: positioning.ratio,
                thresholdPct: options.thresholdPct
            }),
            timestamp: options.at || this.now()
        };
    }

    reset({ symbol = null } = {}) {
        const upper = symbol === null ? null : String(symbol).toUpperCase();
        let removed = 0;
        for (const map of [this.openInterest, this.fundings, this.ratios]) {
            for (const [key, entry] of [...map.entries()]) {
                if (upper === null || entry.symbol === upper) {
                    map.delete(key);
                    removed += 1;
                }
            }
        }
        if (upper === null) this.history.clear();
        else this.history.delete(upper);
        return removed;
    }
}

module.exports = {
    DerivativesAnalytics,
    oiWeightedFunding,
    aggregateOpenInterest,
    positioningRegime,
    DEFAULT_STALE_MS,
    DEFAULT_CHANGE_WINDOW_MS,
    ANNUALIZE_BASE_HOURS
};

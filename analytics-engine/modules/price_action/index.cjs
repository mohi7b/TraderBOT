/* ============================================================
 * File: analytics-engine/modules/price_action/index.cjs
 * Section: analytics-engine/modules
 * Version: 1.0.0
 *
 * Role:
 *   The price-action layer: what the closed bars of one instrument say
 *   about its structure. Four readings, every one of them a shape of
 *   bars this module can point back to:
 *
 *     fair value gap (FVG)   three consecutive bars with a hole between
 *                            the first and the third that price has not
 *                            fully traded back through
 *     order block (OB)       the last opposite bar before the leg that
 *                            broke a swing — the zone the move came from
 *     liquidity sweep        a wick beyond a confirmed swing whose close
 *                            came back inside: the level was taken and
 *                            abandoned
 *     BOS / MSS              a close beyond a confirmed swing, with the
 *                            prevailing direction (BOS) or against it
 *                            (MSS — the direction turns)
 *
 *   The bars are not this module's business: they come from
 *   core/bars.cjs (BarSeries), the same vocabulary, the same rings and
 *   the same refusals the indicator layer reads. Two readers of one bar
 *   may not disagree about it, so this module adds nothing to the bar —
 *   it only reads the bars the shared layer ringed.
 *
 *   What a reading is NOT:
 *     - not a prediction: every field is a statement about bars that
 *       exist, and every structure carries the bar it came from
 *       (index + openTime)
 *     - not a repaint: structures are found on closed bars only, and
 *       the window is a ring — `series` says how many bars are held,
 *       dropped and missing, and the counts say how many structures the
 *       bounded lists are the newest of
 *     - not order-dependent: the bucket a bar belongs to and the swing
 *       it forms are arithmetic over bars, never arrival order
 *
 *   Honesty rules on top of the shared bar rules:
 *     - a swing point needs `swingStrength` bars on BOTH sides: the
 *       newest bars of the window are never a swing, they are not
 *       confirmed yet
 *     - a bar that only equals its neighbours' extreme is no swing at
 *       all: a swing is a unique extreme of its neighbourhood
 *     - a break needs a CLOSE beyond the level; a wick beyond it is a
 *       sweep
 *     - a level is swept or broken once: it stops being a level then,
 *       and the next structure has to form from a new swing
 *     - a gap is a gap whether or not anyone trades it, and the touched
 *       state and the filled state are stated separately
 *
 *   Run: node analytics-engine/tests/seam-price-action.test.cjs
 * ============================================================ */
"use strict";

const math = require("../../core/math.cjs");
const { BarSeries, normalizeSymbol, timeframeKey } = require("../../core/bars.cjs");
/* The served timeframes ARE the topic list: the module's rings and the router's
 * publications are built from one constant, so they cannot drift apart. */
const { PRICE_ACTION_TIMEFRAMES } = require("../../topics.cjs");

/**
 * The defaults of the structure reader. Every one of them is a choice, not a
 * measurement: each is carried in the reading's `params`, so a consumer can see
 * the choices its structure was read with.
 */
const DEFAULTS = Object.freeze({
    /* Bars on each side of a swing point — "a local extreme of five bars", the
     * smallest neighbourhood that is not one bar's noise. */
    swingStrength: 2,
    /* How far a confirmed level is followed, looking for the wick that sweeps
     * it or the bar that closes beyond it, and how far back an order block is
     * looked for before the break. */
    lookback: 12,
    /* Structures kept per (symbol, timeframe): the lists are bounded, and the
     * counts in the reading say how many there were. */
    maxStructures: 24
});

/** A swing point needs its whole neighbourhood: strength bars each side. */
const barsForSwings = (strength) => strength * 2 + 1;

/** The newest `limit` items of a list (the lists are bounded, oldest first). */
const newest = (list, limit) => (list.length > limit ? list.slice(list.length - limit) : list);

/* ------------------------------------------------------------
 * Structure — four readings over one window of closed bars
 * ---------------------------------------------------------- */

/**
 * The swing points of a window: the bars that are a unique extreme of their
 * neighbourhood (`strength` bars each side, all of them present).
 *
 * A point is confirmed only when its right-hand bars exist — the last
 * `strength` bars of the window can never be a swing, which is why a fresh
 * window has nothing to say yet. A bar that merely equals a neighbour's extreme
 * is not a swing: an extreme two bars share is not an extreme.
 *
 * @returns {{highs: object[], lows: object[]}} oldest first, each
 *   { index, openTime, price }
 */
function swingPoints(bars, strength) {
    const highs = [];
    const lows = [];

    for (let at = strength; at + strength < bars.length; at += 1) {
        const bar = bars[at];
        let high = true;
        let low = true;

        for (let off = 1; off <= strength; off += 1) {
            if (bars[at - off].high >= bar.high || bars[at + off].high >= bar.high) high = false;
            if (bars[at - off].low <= bar.low || bars[at + off].low <= bar.low) low = false;
            if (!high && !low) break;
        }

        if (high) highs.push(Object.freeze({ index: at, openTime: bar.openTime, price: bar.high }));
        if (low) lows.push(Object.freeze({ index: at, openTime: bar.openTime, price: bar.low }));
    }

    return { highs, lows };
}

/**
 * Break of structure and market structure shift: one pass over the window
 * carrying the newest CONFIRMED swing each way.
 *
 * At every bar the levels known so far are its newest confirmed swing high and
 * swing low (a point at `index` is known from bar `index + strength` on). A bar
 * whose CLOSE is beyond one of them breaks it:
 *
 *   - with the direction that was already in force → `bos` (continuation)
 *   - against it, for the first time → `mss` (the structure shifted)
 *   - the very first break has no direction to confirm or break: it is a `bos`,
 *     and it sets the direction
 *
 * The broken level is consumed on the spot: it is not a level any more, so the
 * next break has to come from a swing confirmed after it. A bar that pokes past
 * a level but closes back inside breaks nothing (that is the sweep in
 * `liquiditySweeps`, not a break).
 *
 * @returns {{events: object[], trend: string|null}} events oldest first, each
 *   { index, openTime, side, kind, level, levelIndex, levelOpenTime, price }
 */
function breakEvents(bars, swings, strength) {
    const events = [];
    let up = null;                     // the newest swing high confirmed so far
    let down = null;                   // …and the newest swing low
    let nextHigh = 0;
    let nextLow = 0;
    let trend = null;

    for (let at = 0; at < bars.length; at += 1) {
        while (nextHigh < swings.highs.length && swings.highs[nextHigh].index + strength <= at) {
            up = swings.highs[nextHigh];
            nextHigh += 1;
        }
        while (nextLow < swings.lows.length && swings.lows[nextLow].index + strength <= at) {
            down = swings.lows[nextLow];
            nextLow += 1;
        }

        const bar = bars[at];
        const over = up && bar.close > up.price ? up : null;
        const under = down && bar.close < down.price ? down : null;
        if (!over && !under) continue;

        /* Both sides broken in one bar: the newer level is the one that broke. */
        let level = over;
        let side = "up";
        if (!over || (under && under.index > level.index)) {
            level = under;
            side = "down";
        }

        const kind = trend !== null && trend !== side ? "mss" : "bos";
        trend = side;
        if (side === "up") up = null;
        else down = null;

        events.push(Object.freeze({
            index: at,
            openTime: bar.openTime,
            side,
            kind,
            level: level.price,
            levelIndex: level.index,
            levelOpenTime: level.openTime,
            price: bar.close
        }));
    }

    return { events, trend };
}

/**
 * Fair value gaps: three consecutive bars with a hole between the first and the
 * third — a bar that moved so fast it left a range untouched on both sides of it.
 *
 *   bullish   bars[at-2].high < bars[at].low    the hole is (before.high, after.low)
 *   bearish   bars[at-2].low  > bars[at].high   the hole is (after.high, before.low)
 *
 * The middle bar is the displacement; the gap belongs to that bar (its open
 * time), and its hole is the range price skipped.
 *
 * Every gap is then followed to the end of the window, to say what price did
 * with it:
 *
 *   touched   a bar traded back into the hole (its range reached the near edge)
 *   filled    a bar traded the hole away completely (its range reached the far
 *             edge, so the gap no longer exists as an untraded range)
 *   depth     0 untouched … 1 filled: the fraction of the hole that was retraced
 *
 * A gap is never removed from the list: what price did with it is part of the
 * reading. `sizeRatio` puts the hole next to the range of the three bars that
 * made it — a tenth of a tick and a tenth of the daily range are the same shape
 * and not the same gap, so both numbers are stated and the reader decides.
 *
 * @returns {object[]} oldest first, each { index, openTime, side, bottom, top,
 *   size, sizeRatio, touched, filled, depth }
 */
function fairValueGaps(bars) {
    const gaps = [];

    for (let at = 2; at < bars.length; at += 1) {
        const before = bars[at - 2];
        const after = bars[at];
        let side = null;
        let bottom = null;
        let top = null;

        if (before.high < after.low) {
            side = "bullish";
            bottom = before.high;
            top = after.low;
        } else if (before.low > after.high) {
            side = "bearish";
            bottom = after.high;
            top = before.low;
        }
        if (side === null) continue;

        const span = Math.max(
            before.high - before.low,
            bars[at - 1].high - bars[at - 1].low,
            after.high - after.low
        );

        let touched = null;
        let filled = null;
        for (let next = at + 1; next < bars.length; next += 1) {
            const bar = bars[next];
            const into = side === "bullish" ? bar.low < top : bar.high > bottom;
            if (into && touched === null) touched = Object.freeze({ index: next, openTime: bar.openTime });

            const through = side === "bullish" ? bar.low <= bottom : bar.high >= top;
            if (through) {
                filled = Object.freeze({ index: next, openTime: bar.openTime });
                break;
            }
        }

        const reached = filled
            ? (side === "bullish" ? bottom : top)
            : (touched ? (side === "bullish" ? bars[touched.index].low : bars[touched.index].high) : null);
        const depth = reached === null
            ? 0
            : math.clamp(
                side === "bullish" ? (top - reached) / (top - bottom) : (reached - bottom) / (top - bottom),
                0,
                1
            );

        gaps.push(Object.freeze({
            index: at,
            openTime: bars[at - 1].openTime,
            side,
            bottom,
            top,
            size: top - bottom,
            sizeRatio: span > 0 ? (top - bottom) / span : null,
            touched,
            filled,
            depth
        }));
    }

    return gaps;
}

/**
 * Order blocks: the last opposite bar before the leg that broke a swing.
 *
 * For a break UP the block is the newest down bar (close < open) within
 * `lookback` bars before the breaking bar — the zone the displacement left
 * behind; for a break DOWN it is the newest up bar. The zone is that bar's own
 * range (bottom/top), and the block carries the break it belongs to.
 *
 * The block is then followed like a gap: `touched` is the first bar that traded
 * back into the zone, `broken` the first bar that CLOSED through the far side. A
 * block price closed through is consumed, and it says so — nothing here is
 * quietly kept alive because it used to be interesting.
 *
 * @param {object[]} events the breaks, oldest first
 * @returns {object[]} oldest first, each { index, openTime, side, bottom, top,
 *   kind, breakIndex, breakOpenTime, touched, broken }
 */
function orderBlocks(bars, events, lookback) {
    const blocks = [];

    for (const event of events) {
        const wanted = event.side === "up" ? (bar) => bar.close < bar.open : (bar) => bar.close > bar.open;
        const floor = Math.max(0, event.index - lookback);
        let origin = null;

        for (let at = event.index - 1; at >= floor; at -= 1) {
            if (wanted(bars[at])) {
                origin = at;
                break;
            }
        }
        if (origin === null) continue;

        const block = bars[origin];
        const bottom = block.low;
        const top = block.high;
        let touched = null;
        let broken = null;

        for (let next = event.index + 1; next < bars.length; next += 1) {
            const bar = bars[next];
            if (touched === null && (event.side === "up" ? bar.low <= top : bar.high >= bottom)) {
                touched = Object.freeze({ index: next, openTime: bar.openTime });
            }

            const through = event.side === "up" ? bar.close < bottom : bar.close > top;
            if (through) {
                broken = Object.freeze({ index: next, openTime: bar.openTime });
                break;
            }
        }

        blocks.push(Object.freeze({
            index: origin,
            openTime: block.openTime,
            side: event.side,
            bottom,
            top,
            kind: event.kind,
            breakIndex: event.index,
            breakOpenTime: event.openTime,
            touched,
            broken
        }));
    }

    return blocks;
}

/**
 * Liquidity sweeps: a confirmed swing whose level was poked past by a wick and
 * left behind by the close.
 *
 *   a swing high is swept   when a later bar's high is above the level and its
 *                           close is back below it
 *   a swing low is swept    when a later bar's low is below the level and its
 *                           close is back above it
 *
 * A level is followed for at most `lookback` bars after it is confirmed, and the
 * search stops at the first bar that CLOSED beyond it: a level price closed
 * through was not swept, it was broken (`breakEvents` owns that) — the two
 * readings never count the same bar as both.
 *
 * The wick is the whole point: it is the evidence that the orders sitting behind
 * the level were taken, and the close back inside is the evidence that the level
 * was abandoned rather than crossed.
 *
 * @returns {object[]} oldest first, each { index, openTime, side, level,
 *   levelIndex, levelOpenTime, extreme, price, depth }
 */
function liquiditySweeps(bars, swings, lookback) {
    const sweeps = [];

    const follow = (points, side) => {
        for (const point of points) {
            const last = Math.min(bars.length - 1, point.index + lookback);

            for (let at = point.index + 1; at <= last; at += 1) {
                const bar = bars[at];
                if (side === "high" ? bar.close > point.price : bar.close < point.price) break;
                if (side === "high" ? bar.high <= point.price : bar.low >= point.price) continue;

                const extreme = side === "high" ? bar.high : bar.low;
                sweeps.push(Object.freeze({
                    index: at,
                    openTime: bar.openTime,
                    side,
                    level: point.price,
                    levelIndex: point.index,
                    levelOpenTime: point.openTime,
                    extreme,
                    price: bar.close,
                    /* How far past the level the wick reached. */
                    depth: Math.abs(extreme - point.price)
                }));
                break;
            }
        }
    };

    follow(swings.highs, "high");
    follow(swings.lows, "low");
    sweeps.sort((left, right) => left.index - right.index);

    return sweeps;
}

/* ------------------------------------------------------------
 * The module
 * ---------------------------------------------------------- */

/**
 * The price-action layer of one engine: it reads the closed bars core/bars.cjs
 * rings (one ring per (symbol, timeframe)) and answers with the structure of
 * those bars — never with a forecast. Ingestion, the rings, the per-timeframe
 * edge and the status view are the shared layer's (BarSeries); what this class
 * adds is the reading: four shapes found in the bars, each one pointing back at
 * the bar it came from.
 */
class PriceActionAnalytics extends BarSeries {
    /**
     * @param {object}   [options]
     * @param {Function} [options.now]            clock (tests inject a fake)
     * @param {string[]} [options.timeframes]     served timeframes (default: the topic list)
     * @param {number}   [options.maxBars]        ring capacity per (symbol, timeframe)
     * @param {number}   [options.maxInstruments] cap on tracked symbols
     * @param {number}   [options.minBars]        bars a timeframe needs before it publishes
     * @param {number}   [options.swingStrength]  bars on each side of a swing point
     * @param {number}   [options.lookback]       bars a confirmed level is followed for
     * @param {number}   [options.maxStructures]  structures kept in one reading
     */
    constructor({
        now = Date.now,
        timeframes = PRICE_ACTION_TIMEFRAMES,
        maxBars,
        maxInstruments,
        minBars,
        swingStrength = DEFAULTS.swingStrength,
        lookback = DEFAULTS.lookback,
        maxStructures = DEFAULTS.maxStructures
    } = {}) {
        const warnings = [];
        const strength = Math.max(1, Math.floor(math.positive(swingStrength) || DEFAULTS.swingStrength));

        /* A swing point needs its whole neighbourhood, so a window shorter than
         * that can never carry a structure. The floor is stated rather than
         * assumed: a module asked to publish on three bars is told that three
         * bars cannot hold a swing. */
        const floor = barsForSwings(strength);
        const requested = math.positive(minBars);
        let publish = requested === null ? floor : Math.floor(requested);
        if (publish < floor) {
            warnings.push(
                `minBars ${publish} is below one swing neighbourhood (${floor} bars): a structure needs both sides of its point`
            );
            publish = floor;
        }

        super({ now, timeframes, maxBars, maxInstruments, minBars: publish });

        this.swingStrength = strength;
        this.lookback = Math.max(1, Math.floor(math.positive(lookback) || DEFAULTS.lookback));
        this.maxStructures = Math.max(1, Math.floor(math.positive(maxStructures) || DEFAULTS.maxStructures));
        this.params = Object.freeze({
            swingStrength: this.swingStrength,
            lookback: this.lookback,
            maxStructures: this.maxStructures,
            publish: this.minBars
        });

        /* The structure of one (symbol, timeframe) is recomputed only when a new
         * bar closed on it: asked twice about one bar, the answer is the same
         * structure — and the shared layer already said which bar that is. */
        this.analyses = new Map();   // "SYMBOL|timeframe" → { edge, structure }

        this.warnings = Object.freeze(warnings);
    }

    /* ------------------------------------------------------------
     * The structure of one window
     * ---------------------------------------------------------- */

    /**
     * The structure of one ring's window: swings, breaks, gaps, blocks and
     * sweeps, all of them found in the bars the ring holds — never in the order
     * they arrived.
     *
     * The answer is cached per edge (the newest bar of that ring): the structure
     * of a window only changes when a bar is added to it, so two consumers
     * asking about one bar get the same picture.
     *
     * @returns {object|null} null when the window is shorter than one swing
     *   neighbourhood, so there is nothing to say about it
     */
    analyze(ring) {
        const key = `${ring.symbol}|${ring.timeframe}`;
        const edge = ring.newestOpenTime;
        const known = this.analyses.get(key);
        if (known && known.edge === edge) return known.structure;

        const bars = ring.bars();
        if (bars.length < this.minBars) return null;

        const swings = swingPoints(bars, this.swingStrength);
        const { events, trend } = breakEvents(bars, swings, this.swingStrength);
        const gaps = fairValueGaps(bars);
        const blocks = orderBlocks(bars, events, this.lookback);
        const sweeps = liquiditySweeps(bars, swings, this.lookback);

        /* What is still there is what a reader can work with: a gap price filled
         * is not a gap any more, and a block price closed through is consumed.
         * Both kinds stay in the counts, so the difference is visible. */
        const standingGaps = gaps.filter((gap) => gap.filled === null);
        const standingBlocks = blocks.filter((block) => block.broken === null);

        /* The lists carry the newest `maxStructures` of each kind; the counts say
         * how many there were, so a bounded list never reads as the whole truth. */
        const structure = Object.freeze({
            /* The direction the last break left behind, and that break itself. */
            trend,
            bias: events.length ? events[events.length - 1] : null,
            breaks: Object.freeze(newest(events, this.maxStructures)),
            fairValueGaps: Object.freeze(newest(standingGaps, this.maxStructures)),
            fairValueGap: standingGaps.length ? standingGaps[standingGaps.length - 1] : null,
            orderBlocks: Object.freeze(newest(standingBlocks, this.maxStructures)),
            orderBlock: standingBlocks.length ? standingBlocks[standingBlocks.length - 1] : null,
            sweeps: Object.freeze(newest(sweeps, this.maxStructures)),
            sweep: sweeps.length ? sweeps[sweeps.length - 1] : null,
            counts: Object.freeze({
                swings: Object.freeze({ highs: swings.highs.length, lows: swings.lows.length }),
                breaks: events.length,
                gaps: gaps.length,
                filledGaps: gaps.length - standingGaps.length,
                blocks: blocks.length,
                consumedBlocks: blocks.length - standingBlocks.length,
                sweeps: sweeps.length
            }),
            /* The newest confirmed extreme each way: the levels the next bar
             * would have to break to keep the direction going. */
            levels: Object.freeze({
                high: swings.highs.length ? swings.highs[swings.highs.length - 1] : null,
                low: swings.lows.length ? swings.lows[swings.lows.length - 1] : null
            }),
            range: Object.freeze({
                from: bars[0].openTime,
                to: bars[bars.length - 1].openTime,
                high: Math.max(...bars.map((bar) => bar.high)),
                low: Math.min(...bars.map((bar) => bar.low))
            })
        });

        this.analyses.set(key, { edge, structure });
        return structure;
    }

    /* ------------------------------------------------------------
     * Readings — what a consumer sees
     * ---------------------------------------------------------- */

    /**
     * The structure picture on one (symbol, timeframe), or null when there is
     * nothing honest to say: an unknown symbol, a timeframe this module does not
     * serve, or a ring still shorter than one swing neighbourhood.
     *
     * Everything in the reading is about one bar — the last closed bar of that
     * timeframe — and it carries that bar, so a structure can always be traced
     * back to the candles it was read from. `series` says how much of the window
     * is still there to be read.
     *
     * @param {string}        symbol
     * @param {string|number} timeframe   "15m" / 900000, however spelled
     * @returns {object|null}
     */
    reading(symbol, timeframe) {
        const name = normalizeSymbol(symbol);
        if (!name) return null;

        const label = timeframeKey(this.timeframes, timeframe);
        if (!label) return null;

        const ring = this.rings.get(`${name}|${label}`);
        if (!ring || ring.count < this.minBars) {
            this.counters.insufficient += 1;
            return null;
        }

        const structure = this.analyze(ring);
        if (!structure) {
            this.counters.insufficient += 1;
            return null;
        }

        const bar = ring.last();
        const at = this.now();
        this.counters.readings += 1;

        return Object.freeze({
            symbol: name,
            timeframe: label,
            interval: this.timeframes[label],
            at,
            /* The bar the structure belongs to: closed, and the newest one this
             * timeframe has. */
            bar,
            openTime: bar.openTime,
            closeTime: bar.closeTime,
            price: bar.close,
            changePct: ((bar.close - bar.open) / bar.open) * 100,
            /* How long the newest bar has been closed when the reading was taken:
             * a fresh reading and a replayed one are told apart without trusting
             * the consumer's own clock. */
            barAge: Math.max(0, at - bar.closeTime),
            source: ring.source,
            builtFrom: bar.builtFrom,
            volumeComplete: bar.volumeComplete,
            structure,
            params: this.params,
            series: ring.stats()
        });
    }

    /* ------------------------------------------------------------
     * The module's own state — for an operator, not for a chart
     * ---------------------------------------------------------- */

    /**
     * The module's own accounting: the timeframes it serves, the choices it
     * reads with, what it holds and what it refused. Not a reading — readings
     * speak about the market, this speaks about the module, and the two are
     * never mixed in one event.
     */
    stats() {
        return Object.freeze({
            timeframes: Object.freeze(Object.keys(this.timeframes)),
            intervals: Object.freeze({ ...this.timeframes }),
            params: this.params,
            bars: Object.freeze({ publish: this.minBars, capacity: this.maxBars }),
            instruments: Object.freeze({ tracked: this.symbols.size, cap: this.maxInstruments }),
            state: Object.freeze(this.seriesState()),
            counters: Object.freeze({ ...this.counters }),
            warnings: this.warnings
        });
    }

    /**
     * A structure is only ever the structure of the bars behind it: when those
     * bars are forgotten, so is it. The shared layer calls this before the rings
     * go, for one symbol or for every symbol it holds.
     */
    clearModuleState(symbol = null) {
        if (symbol === null) {
            this.analyses.clear();
            return;
        }

        const prefix = `${symbol}|`;
        for (const key of [...this.analyses.keys()]) {
            if (key.startsWith(prefix)) this.analyses.delete(key);
        }
    }
}

module.exports = {
    PriceActionAnalytics,
    swingPoints,
    breakEvents,
    fairValueGaps,
    orderBlocks,
    liquiditySweeps,
    DEFAULTS
};





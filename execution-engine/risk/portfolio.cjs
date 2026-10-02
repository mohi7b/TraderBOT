/* ============================================================
 * File: execution-engine/risk/portfolio.cjs
 * Section: execution-engine/risk
 * Version: 1.0.0
 *
 * Role:
 *   The running mirror of one account: what it holds, what it has made, what
 *   it has lost today, and what the venue last told it.
 *
 *     a profile says what MAY happen   (risk/profile.cjs)
 *     a portfolio says what DID        (this file)
 *
 *   Every risk limit is a percentage of equity, so the guardrails need the
 *   account's real numbers rather than the strategy's hopes: this file is
 *   where "real" is defined.
 *
 *   Four rules shape it:
 *
 *   1. EQUITY IS REALIZED. `equity()` counts the opening balance and closed
 *      trades, not marks. An open winner is not buying power, and sizing off
 *      unrealized profit is how one bad candle turns a good week into a
 *      liquidation. Exposure and drawdown are measured against the account as
 *      it is, never as it might be.
 *
 *   2. A FILL IS APPLIED ONCE. A venue reports fills as a cumulative
 *      `filledUnits` per order, and this file remembers how much of each order
 *      it already applied: a replayed fill is refused as a duplicate instead
 *      of quietly doubling a position. Together with the deterministic
 *      clientOrderId (core/orders.cjs) that makes at-least-once delivery safe.
 *
 *   3. THE PEAK NEVER MOVES DOWN. `peakEquity` only ever rises and drawdown is
 *      measured from it, so the account's worst moment stays remembered
 *      instead of being smoothed away by a good afternoon.
 *
 *   4. THE DAY IS A UTC DAY. Daily loss is measured from the day's first
 *      instant, so a rollover resets what today may lose — and nothing else.
 * ============================================================ */

const { isRiskProfile } = require("./profile.cjs");
const { INTENT, ORDER_SIDE, isOpen, isPlainObject, isPositive } = require("../core/orders.cjs");

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * Venues send decimals, and decimals are not exact in binary: 0.15 - 0.1 is
 * 0.049999999999999996. Prices and sizes are never rounded here — a real
 * discrepancy must still show up — but a comparison that decides whether a
 * fill is *allowed* has to forgive that noise, or a fully filled order gets
 * refused as an overfill.
 */
const EPSILON = 1e-9;

/** Where the day a moment belongs to began (UTC, counted from the epoch). */
function dayStartOf(at) {
    return Math.floor(at / DAY_MS) * DAY_MS;
}

/** The book a position lives in: one bot on one symbol. */
function positionKey(bot, symbol) {
    return `${bot || "?"}|${symbol || "?"}`;
}

function sideOfUnits(units) {
    if (units > 0) return "long";
    if (units < 0) return "short";
    return "flat";
}

function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

/**
 * The account, mirrored.
 *
 * @param {object}   options
 * @param {object}   options.plan            a compiled profile (risk/profile.cjs)
 * @param {Function} [options.now]           the clock, for tests
 * @param {number}   [options.openingEquity] override the profile's opening balance
 * @param {object[]} [options.holdings]      seed holdings: { bot, symbol, units, averagePrice }
 */
function createPortfolio({ plan, now = Date.now, openingEquity = null, holdings = [] } = {}) {
    if (!isRiskProfile(plan)) {
        throw new Error("createPortfolio: a compiled risk profile is required");
    }

    const clock = typeof now === "function" ? now : () => Number(now);
    const started = clock();
    const opening = isPositive(openingEquity) ? openingEquity : plan.account.equity;

    const state = {
        opening,
        realized: 0,
        fees: 0,
        trades: [],
        books: new Map(),
        marks: new Map(),
        orders: new Map(),
        openOrders: new Map(),
        applied: new Map(),
        seen: new Set(),
        stamps: [],
        counts: { placed: 0, refused: 0, fills: 0, duplicates: 0, trades: 0, wins: 0, losses: 0 },
        peak: opening,
        dayStart: dayStartOf(started),
        dayBaseRealized: 0,
        dayBaseFees: 0,
        halted: null
    };

    function numberNow() {
        const value = Number(clock());
        return Number.isFinite(value) ? value : started;
    }

    /* ------------------------------------------------------------
     * Reads — what the account is
     * ---------------------------------------------------------- */

    function equity() {
        return state.opening + state.realized - state.fees;
    }

    function refreshPeak() {
        if (equity() > state.peak) state.peak = equity();
    }

    function drawdownPct() {
        if (!isPositive(state.peak)) return 0;
        return ((state.peak - equity()) / state.peak) * 100;
    }

    function positionView(position) {
        return Object.freeze({
            bot: position.bot,
            symbol: position.symbol,
            units: position.units,
            absUnits: Math.abs(position.units),
            side: sideOfUnits(position.units),
            averagePrice: position.averagePrice,
            notional: isPositive(position.averagePrice) ? Math.abs(position.units) * position.averagePrice : null,
            stopPrice: position.stopPrice,
            openedAt: position.openedAt,
            updatedAt: position.updatedAt,
            orders: Object.freeze(position.orders.slice())
        });
    }

    function positionOf(bot, symbol) {
        const position = state.books.get(positionKey(bot, symbol));
        if (!position || position.units === 0) return null;
        return positionView(position);
    }

    function openPositions() {
        return Object.freeze(
            [...state.books.values()]
                .filter((position) => position.units !== 0)
                .sort((a, b) => positionKey(a.bot, a.symbol).localeCompare(positionKey(b.bot, b.symbol)))
                .map(positionView)
        );
    }

    function positionCount() {
        let open = 0;
        for (const position of state.books.values()) {
            if (position.units !== 0) open += 1;
        }
        return open;
    }

    function openOrders() {
        return Object.freeze([...state.openOrders.values()].map((order) => Object.freeze({ ...order })));
    }

    function trades() {
        return Object.freeze(state.trades.slice());
    }

    function counts() {
        return Object.freeze({ ...state.counts });
    }

    function isHalted() {
        return state.halted !== null;
    }

    /* ------------------------------------------------------------
     * The day, and what today has cost
     * ---------------------------------------------------------- */

    /** Move the day boundary forward. Everything else about the account stands. */
    function rollDay(at = null) {
        const moment = numeric(at) === null ? numberNow() : Number(at);
        const start = dayStartOf(moment);
        if (start <= state.dayStart) return false;

        state.dayStart = start;
        state.dayBaseRealized = state.realized;
        state.dayBaseFees = state.fees;
        return true;
    }

    /** What today has made or lost, net of fees, from the day's first instant. */
    function dayPnl(at = null) {
        if (at !== null) rollDay(at);
        return state.realized - state.dayBaseRealized - (state.fees - state.dayBaseFees);
    }

    /* ------------------------------------------------------------
     * Marks and exposure
     * ---------------------------------------------------------- */

    function mark(symbol, price, at = null) {
        if (typeof symbol !== "string" || !symbol || !isPositive(price)) return null;

        const entry = Object.freeze({ symbol, price, at: numeric(at) === null ? numberNow() : Number(at) });
        state.marks.set(symbol, entry);
        return entry;
    }

    function markOf(symbol) {
        return state.marks.get(symbol) || null;
    }

    /** Apply a batch of marks: { BTCUSDT: 61000 } or [{ symbol, price, at }]. */
    function markAll(marks) {
        const list = Array.isArray(marks)
            ? marks
            : isPlainObject(marks)
              ? Object.entries(marks).map(([symbol, price]) => ({ symbol, price }))
              : [];

        let applied = 0;
        for (const entry of list) {
            if (isPlainObject(entry) && mark(entry.symbol, entry.price, entry.at ?? null)) applied += 1;
        }
        return applied;
    }

    /**
     * Gross exposure of everything open, marked the best way available: a price
     * given here first, then the last mark, then the position's own average
     * (its cost).
     *
     * `unpriced` names whatever could not be marked at all. It is returned
     * rather than swallowed, because a caller that needs leverage has to refuse
     * to guess instead of understating what the account is risking.
     */
    function exposure(prices = {}) {
        const bySymbol = {};
        const unpriced = [];
        let total = 0;

        for (const position of state.books.values()) {
            if (position.units === 0) continue;

            const given = numeric(isPlainObject(prices) ? prices[position.symbol] : null);
            const marked = state.marks.get(position.symbol);
            const price = given ?? (marked ? marked.price : null) ?? position.averagePrice;

            if (!isPositive(price)) {
                unpriced.push(Object.freeze({ bot: position.bot, symbol: position.symbol }));
                continue;
            }

            const notional = Math.abs(position.units) * price;
            total += notional;
            bySymbol[position.symbol] = (bySymbol[position.symbol] || 0) + notional;
        }

        return Object.freeze({ total, bySymbol: Object.freeze(bySymbol), unpriced: Object.freeze(unpriced) });
    }

    /* ------------------------------------------------------------
     * Decisions, rate and traffic
     * ---------------------------------------------------------- */

    function pruneStamps(at) {
        const floor = at - DAY_MS;
        while (state.stamps.length && state.stamps[0] < floor) state.stamps.shift();
        while (state.stamps.length > 10_000) state.stamps.shift();
    }

    /** Orders actually placed in the last `minutes` — venue traffic, not refusals. */
    function ordersInWindow(minutes, at = null) {
        const moment = numeric(at) === null ? numberNow() : Number(at);
        const windowMs = Math.max(1, numeric(minutes) || 1) * MINUTE_MS;

        let count = 0;
        for (const stamp of state.stamps) {
            if (stamp <= moment && moment - stamp < windowMs) count += 1;
        }
        return count;
    }

    /** Orders placed since the day's first instant. */
    function ordersToday(at = null) {
        const moment = numeric(at) === null ? numberNow() : Number(at);
        const start = Math.max(state.dayStart, dayStartOf(moment));

        let count = 0;
        for (const stamp of state.stamps) {
            if (stamp >= start && stamp <= moment) count += 1;
        }
        return count;
    }

    function hasSeen(key) {
        return typeof key === "string" && key.length > 0 && state.seen.has(key);
    }

    function markSeen(key) {
        if (typeof key === "string" && key) state.seen.add(key);
        return key || null;
    }

    function halt(reason, at = null) {
        state.halted = Object.freeze({
            reason: typeof reason === "string" && reason ? reason : "halted",
            at: numeric(at) === null ? numberNow() : Number(at)
        });
        return state.halted;
    }

    function resume() {
        const was = state.halted;
        state.halted = null;
        return was;
    }

    function haltingReason() {
        return state.halted;
    }

    /* ------------------------------------------------------------
     * The book of record — orders, and how much of each was applied
     * ---------------------------------------------------------- */

    function orderOf(clientOrderId) {
        return state.orders.get(clientOrderId) || null;
    }

    function appliedOf(clientOrderId) {
        return state.applied.get(clientOrderId) || 0;
    }

    /** Keep the order book current without counting it as a new placement. */
    function update(order) {
        if (!isPlainObject(order) || typeof order.clientOrderId !== "string" || !order.clientOrderId) return null;

        state.orders.set(order.clientOrderId, order);
        if (isOpen(order.status)) state.openOrders.set(order.clientOrderId, order);
        else state.openOrders.delete(order.clientOrderId);

        return order;
    }

    /**
     * Record an order this account placed, and the decision behind it.
     *
     * The same call is what makes the decision "seen", because a decision is
     * handled once whether it became an order or a refusal: by the time the bus
     * replays it, the instant it was made for has passed, and a second order
     * for it would be a position nobody asked for.
     */
    function note(order, { key = null, at = null } = {}) {
        if (!update(order)) return null;

        const moment = numeric(at) === null ? numberNow() : Number(at);

        if (key) state.seen.add(key);
        state.counts.placed += 1;
        state.stamps.push(moment);
        pruneStamps(moment);

        return order;
    }

    /**
     * A decision handled by not acting on it.
     *
     * No rate stamp and no clock: nothing was sent to a venue, so a refusal
     * costs no rate budget. It still marks the decision seen, for the same
     * reason an order does — a replayed frame must stay one decision.
     */
    function refuseDecision(key) {
        if (key) state.seen.add(key);
        state.counts.refused += 1;
        return key || null;
    }

    /* ------------------------------------------------------------
     * Fills — the only thing that changes what the account holds
     * ---------------------------------------------------------- */

    function positionAt(bot, symbol, at) {
        const key = positionKey(bot, symbol);
        let position = state.books.get(key);

        if (!position) {
            position = {
                bot,
                symbol,
                units: 0,
                averagePrice: null,
                stopPrice: null,
                openedAt: at,
                updatedAt: at,
                orders: []
            };
            state.books.set(key, position);
        }

        return position;
    }

    /** What closing `qty` units at `price` makes or loses. Sign-aware. */
    function realizedOf(position, qty, price) {
        if (!isPositive(position.averagePrice)) return 0;
        return position.units > 0 ? (price - position.averagePrice) * qty : (position.averagePrice - price) * qty;
    }

    /**
     * Add units to a position, keeping the average price of what is open.
     *
     * When the incoming side fights what is open, the position is closed first
     * and only the remainder opens the other way — the same way a venue nets it
     * — so the realized P&L of the closed part is never lost in the wash.
     */
    function addUnits(position, units, price, at) {
        const base = Math.abs(position.units);
        const add = Math.abs(units);

        if (base === 0 || Math.sign(position.units) === Math.sign(units)) {
            const cost = (isPositive(position.averagePrice) ? position.averagePrice : price) * base + price * add;
            position.units += units;
            position.averagePrice = cost / (base + add);
            position.updatedAt = at;
            return { realized: 0, closed: 0, leftover: 0, flipped: false };
        }

        const closed = Math.min(add, base);
        const realized = realizedOf(position, closed, price);

        position.units += Math.sign(units) * closed;
        position.updatedAt = at;

        /* A closed position must land on exactly zero. Buying 0.3 and selling
         * 0.3 leaves 5.5e-17 behind in binary, and a position of one millionth
         * of a millionth of a coin is not flat: it would count against the
         * open-position limit, show up in exposure, and never let the same
         * symbol be entered again. */
        if (Math.abs(position.units) <= EPSILON) {
            position.units = 0;
            position.averagePrice = null;
        }

        const leftover = add - closed;
        if (leftover > EPSILON) {
            position.units = Math.sign(units) * leftover;
            position.averagePrice = price;
        }

        return { realized, closed, leftover: leftover > EPSILON ? leftover : 0, flipped: leftover > EPSILON };
    }

    /**
     * Apply a venue fill.
     *
     * `filledUnits` is the order's CUMULATIVE filled quantity — what a venue
     * reports — and that is what makes this idempotent: only the difference
     * against what was already applied moves the book, and a replayed event's
     * difference is zero, so it is refused as a duplicate instead of applied a
     * second time. A venue may send the same fill twice; that must not become
     * two positions.
     */
    function applyFill({ clientOrderId = null, order = null, filledUnits = null, price = null, fee = 0, at = null } = {}) {
        const empty = (reason) => ({ ok: false, reason, delta: 0, gross: 0, realized: 0, trade: null, position: null });

        const id = typeof clientOrderId === "string" && clientOrderId ? clientOrderId : order && order.clientOrderId;
        if (typeof id !== "string" || !id) return empty("no-client-order-id");

        const known = state.orders.get(id) || null;
        const units = numeric(order && order.units) ?? numeric(known && known.units);
        const cumulative = numeric(filledUnits) ?? numeric(order && order.filledUnits);
        if (!isPositive(cumulative)) return empty("no-filled-units");
        if (isPositive(units) && cumulative > units + EPSILON) return empty("overfill");

        const applied = state.applied.get(id) || 0;
        const delta = cumulative - applied;
        if (delta <= 0) {
            state.counts.duplicates += 1;
            return empty("duplicate-fill");
        }

        const fillPrice = numeric(price) ?? numeric(order && order.price) ?? numeric(known && known.price);
        if (!isPositive(fillPrice)) return empty("no-fill-price");

        const bot = (order && order.bot) || (known && known.bot) || null;
        const symbol = (order && order.symbol) || (known && known.symbol) || null;
        const given = (order && order.side) || (known && known.side) || null;
        const side = given === ORDER_SIDE.SELL || given === ORDER_SIDE.BUY ? given : null;
        if (!bot || !symbol || !side) return empty("no-order-to-fill");

        const intent = (order && order.intent) || (known && known.intent) || null;
        if (intent === INTENT.CLOSE && !positionOf(bot, symbol)) return empty("no-position-to-close");

        const moment = numeric(at) === null ? numberNow() : Number(at);
        const signed = side === ORDER_SIDE.SELL ? -delta : delta;
        const position = positionAt(bot, symbol, moment);
        const outcome = addUnits(position, signed, fillPrice, moment);

        const cost = isPositive(fee) ? fee : 0;
        const gross = outcome.realized;
        const realized = gross - cost;

        const stop = numeric(order && order.stopPrice) ?? numeric(known && known.stopPrice);
        if (isPositive(stop)) position.stopPrice = stop;
        if (!position.orders.includes(id)) position.orders.push(id);

        state.applied.set(id, cumulative);
        state.realized += gross;
        state.fees += cost;
        state.counts.fills += 1;
        if (outcome.closed > 0) {
            state.counts.trades += 1;
            if (realized >= 0) state.counts.wins += 1;
            else state.counts.losses += 1;
        }
        refreshPeak();

        const trade = Object.freeze({
            clientOrderId: id,
            bot,
            symbol,
            side,
            intent,
            delta,
            filledUnits: cumulative,
            price: fillPrice,
            fee: cost,
            gross,
            realized,
            closed: outcome.closed,
            flipped: outcome.flipped,
            at: moment
        });
        state.trades.push(trade);

        return { ok: true, reason: null, delta, gross, realized, trade, position: positionOf(bot, symbol) };
    }

    /* ------------------------------------------------------------
     * Reading the account as a whole
     * ---------------------------------------------------------- */

    function snapshot() {
        return Object.freeze({
            account: plan.account.id,
            currency: plan.account.currency,
            fileName: plan.name,
            openingEquity: state.opening,
            equity: equity(),
            realized: state.realized,
            fees: state.fees,
            peakEquity: state.peak,
            drawdownPct: drawdownPct(),
            dayStart: state.dayStart,
            dayPnl: dayPnl(),
            exposure: exposure().total,
            positions: openPositions(),
            openOrderIds: Object.freeze([...state.openOrders.keys()]),
            counts: counts(),
            halted: state.halted
        });
    }

    /** The same account with the lists counted instead of returned. */
    function stats() {
        const snap = snapshot();
        return Object.freeze({
            equity: snap.equity,
            realized: snap.realized,
            fees: snap.fees,
            peakEquity: snap.peakEquity,
            drawdownPct: snap.drawdownPct,
            dayPnl: snap.dayPnl,
            exposure: snap.exposure,
            positions: snap.positions.length,
            openOrders: snap.openOrderIds.length,
            placed: state.counts.placed,
            refused: state.counts.refused,
            fills: state.counts.fills,
            duplicates: state.counts.duplicates,
            trades: state.counts.trades
        });
    }

    /* ------------------------------------------------------------
     * What the account starts holding, before it has done anything
     * ---------------------------------------------------------- */

    for (const holding of Array.isArray(holdings) ? holdings : []) {
        if (!isPlainObject(holding) || typeof holding.symbol !== "string" || !holding.symbol) continue;

        const units = numeric(holding.units);
        if (units === null || units === 0) continue;

        /* A start-of-run position is real exposure, so it comes with a price.
         * Without one it cannot be valued, and it is left out rather than
         * carried at zero. */
        const price = numeric(holding.averagePrice) ?? numeric(holding.price);
        if (!isPositive(price)) continue;

        const position = positionAt(holding.bot || plan.account.id, holding.symbol, started);
        position.units = units;
        position.averagePrice = price;
        position.stopPrice = isPositive(holding.stopPrice) ? holding.stopPrice : null;
        position.updatedAt = started;
    }

    /* ------------------------------------------------------------
     * The account, as one object
     * ---------------------------------------------------------- */

    const api = Object.freeze({
        plan,
        account: plan.account,
        currency: plan.account.currency,
        limits: plan.limits,
        sizing: plan.sizing,
        allow: plan.allow,

        /* Reads */
        equity,
        refreshPeak,
        drawdownPct,
        dayPnl,
        positionOf,
        openPositions,
        positionCount,
        openOrders,
        orderOf,
        appliedOf,
        trades,
        counts,
        exposure,
        markOf,
        ordersInWindow,
        ordersToday,
        hasSeen,
        isHalted,
        haltingReason,
        snapshot,
        stats,

        /* Writes */
        rollDay,
        mark,
        markAll,
        note,
        update,
        refuseDecision,
        markSeen,
        halt,
        resume,
        applyFill
    });

    return api;
}

module.exports = {
    DAY_MS,
    MINUTE_MS,
    dayStartOf,
    positionKey,
    sideOfUnits,
    createPortfolio
};






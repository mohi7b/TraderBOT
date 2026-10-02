/* ============================================================
 * File: execution-engine/adapters/base-adapter.cjs
 * Section: execution-engine/adapters
 * Version: 1.0.0
 *
 * Role:
 *   The only place that knows what a VENUE is — and the only file in this
 *   layer that would have to be replaced to talk to a second one.
 *
 *     core/engine.cjs  ──dispatch(order)──►  this file  ──transport──►  a venue
 *     core/engine.cjs  ◄─order|fill|reject──  this file  ◄──onVenueEvent──
 *
 *   It is deliberately network-free. The wire is a `transport` function the
 *   caller supplies (a REST client, a websocket bridge, or — in every test in
 *   this folder — nothing at all, with the venue's answers typed by hand). So
 *   the seam can be walked end to end without a socket, and a real adapter is
 *   this file with one function filled in.
 *
 *   What this file owns, because nobody else can:
 *
 *   1. THE VENUE'S OWN RECORD. `dispatch` answers with the order as the venue
 *      has it: its own `venueOrderId`, the status it is alive under, and the
 *      units after the VENUE's market rules have been applied. The profile
 *      rounds a size to what the account may send; this file rounds what is
 *      left to what the market will accept — and a size that rounds away to
 *      nothing is refused, not sent as a zero order.
 *
 *   2. IDEMPOTENCY BY clientOrderId. The id came from the decision
 *      (core/orders.cjs), so a frame replayed by a reconnecting bus is the
 *      SAME order: dispatching it twice answers with the first order's
 *      venueOrderId and sends nothing a second time. A venue's own duplicate
 *      check is a second line of defence, never the first.
 *
 *   3. THE ORDER STATE MACHINE, held to core/orders.cjs TRANSITIONS. An event
 *      that would move an order somewhere it cannot go — a fill on a canceled
 *      order, a fill past the units that were placed — is REFUSED and
 *      answered with why. A venue and this layer disagreeing about what is
 *      alive must surface as a refusal, never as a position nobody can explain.
 *
 *   Three readings this file serves, so the layers above never hold a venue:
 *
 *     markPrice(symbol, at)  the venue's last price for one market
 *                            (the third and last place risk/guardrails.cjs
 *                            looks for a price, after signal and fresh mark)
 *     market                 the market rules a size and a price round to
 *                            ({ stepSize, tickSize, minNotional })
 *     orderOf / orders       the venue's book of record, by clientOrderId
 * ============================================================ */

const {
    ORDER_STATUS,
    buildOrder,
    floorTo,
    isOpen,
    isPlainObject,
    isPositive,
    notionalOf,
    roundTo,
    transition
} = require("../core/orders.cjs");

/** What a venue says about an order it has been given. */
const VENUE_EVENT = Object.freeze({
    ACCEPTED: "accepted",
    REJECTED: "rejected",
    FILL: "fill",
    CANCELED: "canceled",
    EXPIRED: "expired",
    MARK: "mark"
});

const VENUE_EVENT_LIST = Object.freeze(Object.values(VENUE_EVENT));

/** Why a dispatch or a venue event was refused (never silently dropped). */
const ADAPTER_REFUSALS = Object.freeze({
    NOT_AN_ORDER: "not-an-order",
    NO_SIZE_AFTER_ROUNDING: "no-size-after-rounding",
    BELOW_MIN_NOTIONAL: "below-min-notional",
    UNKNOWN_EVENT: "unknown-event",
    NO_CLIENT_ORDER_ID: "no-client-order-id",
    UNKNOWN_ORDER: "unknown-order",
    VENUE_ID_MISMATCH: "venue-order-mismatch",
    NO_FILL_UNITS: "no-fill-units",
    NO_FILL_PRICE: "no-fill-price",
    DUPLICATE_FILL: "duplicate-fill",
    OVERFILL: "overfill",
    NO_MARK: "no-mark"
});

/** A venue that states no rules: an order is sent exactly as it was sized. */
const DEFAULT_MARKET = Object.freeze({ stepSize: null, tickSize: null, minNotional: 0 });

/** The epsilon every ceiling in this layer shares (see risk/guardrails.cjs). */
const EPSILON = 1e-9;

function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

/** Round the venue's stated rules into one frozen, complete market. */
function readMarket(market) {
    const raw = isPlainObject(market) ? market : {};

    const stepSize = isPositive(numeric(raw.stepSize)) ? numeric(raw.stepSize) : null;
    const tickSize = isPositive(numeric(raw.tickSize)) ? numeric(raw.tickSize) : null;
    const minNotional = isPositive(numeric(raw.minNotional)) ? numeric(raw.minNotional) : 0;

    /* A venue that states no rules states no rules: one shared frozen market,
     * so every unconfigured venue in a test is the same venue. */
    if (!stepSize && !tickSize && !minNotional) return DEFAULT_MARKET;

    return Object.freeze({ stepSize, tickSize, minNotional });
}




/**
 * One venue, as this layer uses one.
 *
 * @param {object}    [options]
 * @param {string}    [options.name]       how the venue is named in ids and logs
 * @param {Function}  [options.transport]  (order, adapter) => void — the wire.
 *                                         Called once per order, never for a
 *                                         replay: idempotency lives here.
 * @param {object}    [options.market]     { stepSize, tickSize, minNotional }
 * @param {Function}  [options.now]        clock (default Date.now)
 * @param {Function}  [options.onEvent]    (result, order) => void — a tap for tests
 * @returns {object} the adapter (frozen surface; the books behind it are not)
 */
function createAdapter({ name = "paper", transport = null, market = null, now = Date.now, onEvent = null } = {}) {
    const wire = typeof transport === "function" ? transport : null;
    const tap = typeof onEvent === "function" ? onEvent : null;
    const clock = typeof now === "function" ? now : () => Number(now);
    const rules = readMarket(market);

    const state = {
        /** clientOrderId → the order record as the venue has it. */
        orders: new Map(),
        /** clientOrderId → { venueOrderId, at, fills: [{units, price, at}] }. */
        ledger: new Map(),
        /** symbol → { price, at } — the venue's last word on a market. */
        marks: new Map(),
        seq: 0,
        counts: {
            dispatched: 0,
            resent: 0,
            refused: 0,
            events: 0,
            applied: 0,
            rejected: 0,
            canceled: 0,
            fills: 0,
            ghosts: 0,
            marks: 0
        }
    };

    function numberNow() {
        const value = Number(clock());
        return Number.isFinite(value) ? value : Date.now();
    }

    function momentOf(at) {
        const value = numeric(at);
        return value === null ? numberNow() : value;
    }

    /** Every answer this file gives has the same shape, so a caller can branch. */
    function refuse(reason, order = null) {
        state.counts.refused += 1;
        return { ok: false, reason, order, venueOrderId: null, duplicate: false, fill: null, event: null, mark: null };
    }

    function accept(order, extra = {}) {
        const result = {
            ok: true,
            reason: null,
            order,
            venueOrderId: (order && order.venueOrderId) || null,
            duplicate: false,
            fill: null,
            event: null,
            mark: null,
            ...extra
        };
        if (tap) tap(result, order);
        return result;
    }

    /* ------------------------------------------------------------
     * The wire out — dispatch
     * ---------------------------------------------------------- */

    /**
     * Hand one order to the venue.
     *
     * The order is the shape core/orders.cjs builds and risk/guardrails.cjs
     * approved. What comes back is the shape the VENUE holds: everything the
     * account decided, rounded to the market's step and tick, with the venue's
     * own id and its own status on it.
     *
     * @returns {{ok:boolean, reason:string|null, order:object|null,
     *            venueOrderId:string|null, duplicate:boolean}}
     */
    function dispatch(order) {
        if (!isPlainObject(order) || typeof order.clientOrderId !== "string" || !order.clientOrderId) {
            return refuse(ADAPTER_REFUSALS.NOT_AN_ORDER);
        }

        const id = order.clientOrderId;

        /* A retry, a replayed frame, a bus that reconnected: the same decision
         * is the same order, so the FIRST venueOrderId answers and the wire is
         * not used a second time. A venue's duplicate check is never the first
         * line of defence. */
        const known = state.orders.get(id);
        if (known) {
            state.counts.resent += 1;
            return accept(known, { duplicate: true, reason: "already-dispatched" });
        }

        /* The venue's market rules, applied to what the account approved. A
         * size rounds DOWN — up is the unsafe way — and a price to a tick, so
         * what is recorded here is exactly what a real venue would accept. */
        const units = floorTo(order.units, rules.stepSize) ?? order.units;
        if (!isPositive(units)) return refuse(ADAPTER_REFUSALS.NO_SIZE_AFTER_ROUNDING, order);

        const price = order.price === null ? null : roundTo(order.price, rules.tickSize);
        const stopPrice = isPositive(numeric(order.stopPrice)) ? roundTo(order.stopPrice, rules.tickSize) : null;

        const notional = notionalOf(units, price ?? order.price);
        if (!isPositive(notional)) return refuse(ADAPTER_REFUSALS.NOT_AN_ORDER, order);
        if (rules.minNotional > 0 && notional < rules.minNotional - EPSILON) {
            return refuse(ADAPTER_REFUSALS.BELOW_MIN_NOTIONAL, order);
        }

        const at = momentOf(order.createdAt);
        state.seq += 1;

        const placed = buildOrder({
            clientOrderId: id,
            bot: order.bot,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            timeInForce: order.timeInForce,
            intent: order.intent,
            units,
            price,
            stopPrice,
            status: ORDER_STATUS.NEW,
            signalAt: order.signalAt,
            now: at
        });

        placed.venueOrderId = `${name}-${String(state.seq).padStart(6, "0")}`;

        /* new → open: the venue holds the order and it is alive until an event
         * says otherwise. An order that cannot make even that move is refused
         * here rather than half-recorded. */
        const moved = transition(placed, ORDER_STATUS.OPEN, { venueOrderId: placed.venueOrderId, updatedAt: at });
        if (!moved.ok) return refuse(moved.reason, order);

        state.orders.set(id, moved.order);
        state.ledger.set(id, { venueOrderId: moved.order.venueOrderId, at, fills: [] });
        state.counts.dispatched += 1;

        if (wire) {
            try {
                wire(moved.order, adapter);
            } catch (err) {
                /* A wire that throws did not unsend the order: the venue has it,
                 * and the answer below still says so. What happened on the wire
                 * is the venue's business, reported through its own events. */
            }
        }

        return accept(moved.order);
    }

    /* ------------------------------------------------------------
     * The wire in — what the venue says afterwards
     * ---------------------------------------------------------- */

    /**
     * One answer from the venue.
     *
     * @param {object} event
     * @param {string} event.type             one of VENUE_EVENT
     * @param {string} [event.clientOrderId]  which order it is about
     * @param {string} [event.venueOrderId]   the venue's own id, when it echoes one
     * @param {number} [event.filledUnits]    CUMULATIVE units filled, not a delta
     * @param {number} [event.price]          the fill price, or a mark's price
     * @param {number} [event.fee]            what the fill cost
     * @param {string} [event.reason]         why the venue rejected or canceled
     * @param {string} [event.symbol]         the market a mark is for
     * @param {number} [event.markPrice]      the mark, when `price` is not used
     * @param {number} [event.at]
     * @returns {{ok:boolean, reason:string|null, order:object|null,
     *            fill:object|null, mark:object|null}}
     */
    function onVenueEvent(event) {
        state.counts.events += 1;
        if (!isPlainObject(event) || !VENUE_EVENT_LIST.includes(event.type)) {
            return refuse(ADAPTER_REFUSALS.UNKNOWN_EVENT);
        }

        if (event.type === VENUE_EVENT.MARK) return markFrom(event);

        const id = typeof event.clientOrderId === "string" && event.clientOrderId ? event.clientOrderId : null;
        if (!id) return refuse(ADAPTER_REFUSALS.NO_CLIENT_ORDER_ID);

        const order = state.orders.get(id) || null;
        if (!order) {
            /* An order this venue never held. It is counted as a ghost and
             * refused: silence would hide a venue sending the wrong ids. */
            state.counts.ghosts += 1;
            return refuse(ADAPTER_REFUSALS.UNKNOWN_ORDER);
        }

        const at = momentOf(event.at);

        if (event.type === VENUE_EVENT.FILL) return applyFillEvent(order, event, at);

        const echoed = typeof event.venueOrderId === "string" && event.venueOrderId ? event.venueOrderId : null;
        if (echoed && order.venueOrderId && echoed !== order.venueOrderId) {
            return refuse(ADAPTER_REFUSALS.VENUE_ID_MISMATCH, order);
        }

        const to = event.type === VENUE_EVENT.ACCEPTED ? ORDER_STATUS.OPEN
            : event.type === VENUE_EVENT.REJECTED ? ORDER_STATUS.REJECTED
                : event.type === VENUE_EVENT.CANCELED ? ORDER_STATUS.CANCELED
                    : ORDER_STATUS.EXPIRED;

        /* A venue repeating itself is a confirmation, not a transition: an
         * order already open that is accepted again is the same open order. */
        if (to === order.status) return accept(order, { event, reason: "confirmed" });

        const patch = { updatedAt: at, venueOrderId: order.venueOrderId || echoed };
        if (to === ORDER_STATUS.REJECTED) patch.reason = typeof event.reason === "string" && event.reason ? event.reason : "rejected-by-venue";

        const moved = transition(order, to, patch);
        if (!moved.ok) return refuse(moved.reason, order);

        state.orders.set(id, moved.order);
        if (to === ORDER_STATUS.REJECTED) state.counts.rejected += 1;
        if (to === ORDER_STATUS.CANCELED) state.counts.canceled += 1;

        return accept(moved.order, { event, reason: to });
    }

    /**
     * A fill, as a venue reports one: the units filled SO FAR, and the price.
     *
     * Cumulative, not incremental — the same reading risk/portfolio.cjs takes,
     * for the same reason: a venue that re-sends a fill (which they do) must
     * not become a position twice. A fill that arrives after a cancel or a
     * reject cannot make the move at all and is refused by the state machine.
     */
    function applyFillEvent(order, event, at) {
        const id = order.clientOrderId;
        const cumulative = numeric(event.filledUnits) ?? numeric(event.filled);
        if (!isPositive(cumulative)) return refuse(ADAPTER_REFUSALS.NO_FILL_UNITS, order);
        if (cumulative > order.units + EPSILON) return refuse(ADAPTER_REFUSALS.OVERFILL, order);

        const price = numeric(event.price);
        if (!isPositive(price)) return refuse(ADAPTER_REFUSALS.NO_FILL_PRICE, order);

        const ledger = state.ledger.get(id) || { venueOrderId: order.venueOrderId, at, fills: [] };
        const held = ledger.fills.reduce((sum, fill) => sum + fill.units, 0);
        const delta = cumulative - held;
        if (delta <= 0) return refuse(ADAPTER_REFUSALS.DUPLICATE_FILL, order);

        const to = cumulative >= order.units - EPSILON ? ORDER_STATUS.FILLED : ORDER_STATUS.PARTIALLY_FILLED;

        const filledNotional = ledger.fills.reduce((sum, fill) => sum + fill.units * fill.price, 0) + delta * price;
        const moved = transition(order, to, {
            filledUnits: cumulative,
            averagePrice: filledNotional / cumulative,
            updatedAt: at
        });
        if (!moved.ok) return refuse(moved.reason, order);

        ledger.fills.push({ units: delta, price, at });
        state.orders.set(id, moved.order);
        state.ledger.set(id, ledger);
        state.counts.fills += 1;

        const fill = Object.freeze({
            clientOrderId: id,
            venueOrderId: moved.order.venueOrderId,
            bot: moved.order.bot,
            symbol: moved.order.symbol,
            side: moved.order.side,
            units: delta,
            filledUnits: cumulative,
            price,
            fee: numeric(event.fee) || 0,
            at
        });

        return accept(moved.order, { event, fill, reason: to });
    }

    /** A mark: the venue's word on what one market costs right now. */
    function markFrom(event) {
        const symbol = typeof event.symbol === "string" && event.symbol ? event.symbol : null;
        const price = numeric(event.markPrice) ?? numeric(event.mark) ?? numeric(event.price);
        if (!symbol || !isPositive(price)) return refuse(ADAPTER_REFUSALS.NO_MARK);

        const mark = Object.freeze({ symbol, price, at: momentOf(event.at) });
        state.marks.set(symbol, mark);
        state.counts.marks += 1;

        return accept(null, { event, mark, reason: "mark" });
    }

    /* ------------------------------------------------------------
     * Readings — so no layer above ever holds a venue
     * ---------------------------------------------------------- */

    /**
     * The venue's last price for one market, as `{ symbol, price, at }` — or
     * null when the venue has said nothing about it.
     *
     * This is the reading risk/guardrails.cjs asks for: the third and last
     * place it looks for a price, after the signal's own and the account's
     * fresh mark. `at` is accepted and ignored — a venue's mark is what the
     * venue says NOW, and the layer that cares about freshness (the account's
     * mark TTL) is the one that owns it.
     */
    function markPrice(symbol, at = null) {
        return state.marks.get(symbol) || null;
    }

    /** Teach the venue a price: a websocket tick, a REST poll, or a test. */
    function setMark(symbol, price, at = null) {
        return markFrom({ type: VENUE_EVENT.MARK, symbol, price, at });
    }

    /** The venue's record of one order, or null when it never held it. */
    function orderOf(clientOrderId) {
        return state.orders.get(clientOrderId) || null;
    }

    function orders() {
        return Array.from(state.orders.values());
    }

    function openOrders() {
        return orders().filter((order) => isOpen(order.status));
    }

    function counts() {
        return Object.freeze({ ...state.counts });
    }

    /** The venue as an audit sees it: its rules, its book, and what it counted. */
    function snapshot() {
        return Object.freeze({
            name,
            market: rules,
            seq: state.seq,
            counts: counts(),
            orders: orders(),
            openOrders: openOrders(),
            marks: Array.from(state.marks.values())
        });
    }

    /* The surface every other layer is allowed to touch. `dispatch` is the only
     * way in and `onVenueEvent` the only way back, so a real adapter is this
     * file with `transport` and the venue's event stream filled in. */
    const adapter = Object.freeze({
        name,
        market: rules,
        dispatch,
        onVenueEvent,
        markPrice,
        setMark,
        orderOf,
        orders,
        openOrders,
        counts,
        snapshot
    });

    return adapter;
}

module.exports = {
    VENUE_EVENT,
    VENUE_EVENT_LIST,
    ADAPTER_REFUSALS,
    DEFAULT_MARKET,
    readMarket,
    createAdapter
};




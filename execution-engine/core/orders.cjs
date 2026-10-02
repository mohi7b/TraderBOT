/* ============================================================
 * File: execution-engine/core/orders.cjs
 * Section: execution-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   The order vocabulary of the execution layer — the one file that says what
 *   an order IS: which side it is on, which kind it is, the states it may move
 *   through, how it is named, and the arithmetic that turns a strategy's
 *   *intent* into a *size*.
 *
 *     intent (a signal says: "enter long, risk 1%")   ──►  this file
 *     size   (units, notional, stop, margin)          ◄──  this file
 *
 *   Nothing here knows a venue, a profile or a bus. It is the arithmetic and
 *   the state machine all of them agree on, exactly the way
 *   bot-engine/core/dsl-schema.cjs is the vocabulary the canvas and the runner
 *   agree on.
 *
 *   Three rules shape this file:
 *
 *   1. AN ORDER IS A PROMISE ABOUT UNITS, NOT A WISH. `units` is always a
 *      finite positive number of base-asset units, and `notional` is always
 *      units × the price it was sized at. A layer that shops a "size: 1"
 *      around without saying what it is (units? percent? dollars?) cannot be
 *      audited — and this layer exists to be audited.
 *
 *   2. A STOP IS NOT OPTIONAL. `stopPriceOf` is the only place a protective
 *      stop is computed, and every entry gets one: `size: risk_pct` is
 *      converted into units *through the stop distance*, so what a position
 *      risks is exactly what the strategy said it was willing to lose, and
 *      never more. An entry without a stop is a shape this file cannot express.
 *
 *   3. ONE SIGNAL, ONE ID. `dedupeKeyOf` is the identity of a decision and
 *      `clientOrderId` is derived from it rather than from a counter, so a
 *      signal replayed by a reconnecting bus cannot become a second order —
 *      and a venue's own idempotency check becomes a second line of defence
 *      instead of the only one.
 *
 *   States, and where an order is allowed to go from each:
 *
 *     new ──► open ──► partially_filled ──► filled
 *      │       │             │
 *      │       │             └────────────► canceled
 *      ├──────►└───────────────► expired
 *      └────────────────────────────────► rejected
 * ============================================================ */

const ORDER_SIDE = Object.freeze({
    BUY: "buy",
    SELL: "sell"
});

const ORDER_TYPE = Object.freeze({
    MARKET: "market",
    LIMIT: "limit",
    STOP: "stop"
});

const TIME_IN_FORCE = Object.freeze({
    GTC: "gtc",
    IOC: "ioc",
    FOK: "fok"
});

const ORDER_STATUS = Object.freeze({
    NEW: "new",
    OPEN: "open",
    PARTIALLY_FILLED: "partially_filled",
    FILLED: "filled",
    CANCELED: "canceled",
    REJECTED: "rejected",
    EXPIRED: "expired"
});

/** The statuses in which an order is still alive at the venue. */
const OPEN_STATUSES = Object.freeze([ORDER_STATUS.NEW, ORDER_STATUS.OPEN, ORDER_STATUS.PARTIALLY_FILLED]);

/** The statuses an order never leaves. */
const TERMINAL_STATUSES = Object.freeze([
    ORDER_STATUS.FILLED,
    ORDER_STATUS.CANCELED,
    ORDER_STATUS.REJECTED,
    ORDER_STATUS.EXPIRED
]);

/**
 * Where an order may go, by status.
 *
 * A fill that arrives after a cancel is not applied, it is refused: the venue
 * and this layer disagreeing about what is alive has to surface as a refusal,
 * never as a position nobody can explain.
 */
const TRANSITIONS = Object.freeze({
    [ORDER_STATUS.NEW]: Object.freeze([ORDER_STATUS.OPEN, ORDER_STATUS.FILLED, ORDER_STATUS.REJECTED, ORDER_STATUS.CANCELED]),
    /* An open order may still be rejected: a venue can refuse an order it had
     * already acknowledged (post-only, self-trade prevention, a margin check
     * that runs after the ack). Recording that as a cancel would hide a
     * refusal, which is exactly what this machine exists to prevent. */
    [ORDER_STATUS.OPEN]: Object.freeze([ORDER_STATUS.PARTIALLY_FILLED, ORDER_STATUS.FILLED, ORDER_STATUS.CANCELED, ORDER_STATUS.EXPIRED, ORDER_STATUS.REJECTED]),
    [ORDER_STATUS.PARTIALLY_FILLED]: Object.freeze([ORDER_STATUS.PARTIALLY_FILLED, ORDER_STATUS.FILLED, ORDER_STATUS.CANCELED]),
    [ORDER_STATUS.FILLED]: Object.freeze([]),
    [ORDER_STATUS.CANCELED]: Object.freeze([]),
    [ORDER_STATUS.REJECTED]: Object.freeze([]),
    [ORDER_STATUS.EXPIRED]: Object.freeze([])
});

/** Why an order exists: opening exposure, or taking it away. */
const INTENT = Object.freeze({
    OPEN: "open",
    CLOSE: "close"
});

/** The fields an order record carries, in the order they are written. */
const ORDER_FIELDS = Object.freeze([
    "clientOrderId",
    "venueOrderId",
    "bot",
    "symbol",
    "side",
    "type",
    "timeInForce",
    "intent",
    "reduceOnly",
    "units",
    "filledUnits",
    "price",
    "stopPrice",
    "averagePrice",
    "notional",
    "status",
    "reason",
    "signalAt",
    "createdAt",
    "updatedAt"
]);

const LIMITS = Object.freeze({
    /** Venue client ids are capped in the low tens of characters on most venues. */
    clientOrderIdLength: 64,
    /** A units figure finer than this is noise, and a venue refuses it anyway. */
    units: 1e12,
    price: 1e12
});

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositive(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/* ------------------------------------------------------------
 * Naming — the identity of a decision
 * ---------------------------------------------------------- */

/** Lower case, dash-separated, nothing a venue would refuse to echo back. */
function slug(value, { max = 24 } = {}) {
    const out = String(value === null || value === undefined ? "" : value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return out.slice(0, max);
}

/**
 * The identity of one decision: which bot, which symbol, which instant, and
 * what the strategy said to do.
 *
 * Two entries with the same key are one decision seen twice — a replayed
 * frame, a reconnected bus, a retry — and a layer that places two orders for
 * them has doubled a position for free.
 */
function dedupeKeyOf({ bot, symbol, at, action } = {}) {
    const id = slug(bot, { max: 40 });
    const market = slug(symbol, { max: 40 });
    const when = Number.isFinite(Number(at)) ? Number(at) : "no-time";
    const type = action && typeof action.type === "string" ? action.type : "no-action";
    const side = action && typeof action.side === "string" ? action.side : "flat";
    const size = action && typeof action.size === "string" ? action.size : "none";
    const sizeValue = action && Number.isFinite(action.sizeValue) ? action.sizeValue : "no-value";

    return [id, market, when, type, side, size, sizeValue].join(":");
}

/**
 * The deterministic client id of one order.
 *
 *   clientOrderId({ bot: "btc-breakout", symbol: "BTCUSDT", at: 1000 })
 *     → "tb-btc-breakout-btcusdt-1000-entry"
 *
 * `kind` tells apart the orders one decision produces — the entry and the
 * stop that goes with it are two orders, not one order named twice.
 */
function clientOrderId({ bot, symbol, at, kind = "entry", seq = 0 } = {}) {
    const parts = [
        "tb",
        slug(bot, { max: 20 }) || "bot",
        slug(symbol, { max: 20 }) || "symbol",
        Number.isFinite(Number(at)) ? Number(at) : 0,
        slug(kind, { max: 12 }) || "order"
    ];
    if (Number.isFinite(Number(seq)) && Number(seq) > 0) parts.push(Number(seq));

    return parts.join("-").slice(0, LIMITS.clientOrderIdLength);
}

/* ------------------------------------------------------------
 * Intent — what a signal's action asks the venue to do
 * ---------------------------------------------------------- */

/**
 * The side and the intent behind one action.
 *
 *   enter long   → buy  to open        exit long   → sell to close
 *   enter short  → sell to open        exit short  → buy  to close
 *   exit both    → whatever is open    close       → whatever is open
 *   alert        → null: an alert is a signal, not an order
 *
 * `"both"` names no single venue side; the caller resolves it against what is
 * actually open, because only the caller knows.
 *
 * @returns {{intent: string, side: string, both: boolean}|null}
 */
function intentOf(action) {
    if (!isPlainObject(action)) return null;

    switch (action.type) {
        case "enter":
            if (action.side === "long") return { intent: INTENT.OPEN, side: ORDER_SIDE.BUY, both: false };
            if (action.side === "short") return { intent: INTENT.OPEN, side: ORDER_SIDE.SELL, both: false };
            return null;
        case "exit":
            if (action.side === "long") return { intent: INTENT.CLOSE, side: ORDER_SIDE.SELL, both: false };
            if (action.side === "short") return { intent: INTENT.CLOSE, side: ORDER_SIDE.BUY, both: false };
            if (action.side === "both") return { intent: INTENT.CLOSE, side: "both", both: true };
            return null;
        case "close":
            return { intent: INTENT.CLOSE, side: "both", both: true };
        default:
            /* alert — and anything a later DSL adds that is not an order yet. */
            return null;
    }
}

/** True when the action asks for an order at all. */
function isOrderAction(action) {
    return intentOf(action) !== null;
}

/* ------------------------------------------------------------
 * Arithmetic — intent + a price + an equity → a size
 * ---------------------------------------------------------- */

/** Floor to a step: a size rounds *down*, because up is the unsafe way. */
function floorTo(value, step = null) {
    if (!isPositive(value)) return null;
    if (!isPositive(step)) return value;

    return Math.floor(value / step) * step;
}

/** Round a price to a tick (a venue's smallest price move). */
function roundTo(value, step = null) {
    if (!isPositive(value)) return null;
    if (!isPositive(step)) return value;

    return Math.round(value / step) * step;
}

/** units × price. Nothing else in this layer invents a notional. */
function notionalOf(units, price) {
    if (!isPositive(units) || !isPositive(price)) return null;
    return units * price;
}

/** exposure ÷ equity. The only definition of leverage this layer uses. */
function leverageOf(notional, equity) {
    if (typeof notional !== "number" || !Number.isFinite(notional) || notional < 0) return null;
    if (!isPositive(equity)) return null;

    return notional / equity;
}

/** The margin a notional needs at some maximum leverage. */
function marginFor(notional, maxLeverage) {
    if (!isPositive(notional) || !isPositive(maxLeverage)) return null;

    return notional / maxLeverage;
}

/** Where the protective stop goes: `stopPct` below a long, above a short. */
function stopPriceOf({ side, price, stopPct, tick = null } = {}) {
    if (!isPositive(price) || !isPositive(stopPct)) return null;
    const distance = (price * stopPct) / 100;

    if (side === ORDER_SIDE.BUY) return roundTo(price - distance, tick);
    if (side === ORDER_SIDE.SELL) return roundTo(price + distance, tick);
    return null;
}

/**
 * The one conversion from "what the strategy asked" to "how much":
 *
 *   size "units"     units = sizeValue
 *   size "risk_pct"  riskAmount = equity × sizeValue/100
 *                    units      = riskAmount ÷ (price × stopPct/100)
 *
 * The second line is the point of the layer: the units are chosen so that
 * being stopped out costs exactly what the strategy said it was willing to
 * lose. Risk 2% of a 10 000 account with a 1% stop and the answer is 20 units
 * of risk, not 20 units of coin.
 *
 * @returns {{units:number, riskAmount:number|null, perUnitRisk:number|null, stopPct:number|null}|null}
 *          null when the numbers cannot produce a size: no price, no equity,
 *          no stop distance, or a result that is not positive.
 */
function unitsFor({ action, equity, price, stopPct, step = null } = {}) {
    if (!isPlainObject(action) || !isPositive(price)) return null;

    const size = action.size;
    const sizeValue = action.sizeValue;

    if (size === "units") {
        if (!isPositive(sizeValue)) return null;
        const units = floorTo(sizeValue, step);
        if (!isPositive(units)) return null;

        return { units, riskAmount: null, perUnitRisk: null, stopPct: isPositive(stopPct) ? stopPct : null };
    }

    if (size === "risk_pct") {
        if (!isPositive(sizeValue) || !isPositive(equity) || !isPositive(stopPct)) return null;

        const riskAmount = (equity * sizeValue) / 100;
        const perUnitRisk = (price * stopPct) / 100;
        const units = floorTo(riskAmount / perUnitRisk, step);
        if (!isPositive(units)) return null;

        return { units, riskAmount, perUnitRisk, stopPct };
    }

    /* "none" — a signal that sized nothing is not an order this layer can place. */
    return null;
}

/* ------------------------------------------------------------
 * Records
 * ---------------------------------------------------------- */

/**
 * One order, complete at the moment it is created.
 *
 * The record is what a venue, an audit and a user are all shown, so it holds
 * the *why* as well as the *what*: the signal instant it came from, the bot,
 * the side, the units, the price it was sized at, and the stop that goes with
 * it. `venueOrderId` stays null until the venue answers with one.
 */
function buildOrder({
    clientOrderId: id,
    bot,
    symbol,
    side,
    type = ORDER_TYPE.MARKET,
    timeInForce = TIME_IN_FORCE.GTC,
    intent = INTENT.OPEN,
    units,
    price,
    stopPrice = null,
    status = ORDER_STATUS.NEW,
    signalAt = null,
    now = Date.now()
} = {}) {
    const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();

    return {
        clientOrderId: id,
        venueOrderId: null,
        bot: bot || null,
        symbol: symbol || null,
        side,
        type,
        timeInForce,
        intent,
        reduceOnly: intent === INTENT.CLOSE,
        units,
        filledUnits: 0,
        price: isPositive(price) ? price : null,
        stopPrice: isPositive(stopPrice) ? stopPrice : null,
        averagePrice: null,
        notional: notionalOf(units, price),
        status,
        reason: null,
        signalAt: Number.isFinite(Number(signalAt)) ? Number(signalAt) : null,
        createdAt: at,
        updatedAt: at
    };
}

/** Every reason an order record is not a record (empty when it is one). */
function validateOrder(order) {
    const errors = [];
    const add = (code, where, message) => errors.push(Object.freeze({ code, where, message }));

    if (!isPlainObject(order)) {
        add("bad-order", "$", "an order is an object");
        return { ok: false, errors };
    }

    for (const field of Object.keys(order)) {
        if (!ORDER_FIELDS.includes(field)) add("unknown-field", `$.${field}`, `an order has no field "${field}"`);
    }

    if (typeof order.clientOrderId !== "string" || !order.clientOrderId) add("bad-client-order-id", "$.clientOrderId", "an order is named by its clientOrderId");
    if (!Object.values(ORDER_SIDE).includes(order.side)) add("bad-side", "$.side", `side is one of: ${Object.values(ORDER_SIDE).join(", ")}`);
    if (!Object.values(ORDER_TYPE).includes(order.type)) add("bad-type", "$.type", `type is one of: ${Object.values(ORDER_TYPE).join(", ")}`);
    if (!Object.values(ORDER_STATUS).includes(order.status)) add("bad-status", "$.status", `status is one of: ${Object.values(ORDER_STATUS).join(", ")}`);
    if (!Object.values(INTENT).includes(order.intent)) add("bad-intent", "$.intent", `intent is one of: ${Object.values(INTENT).join(", ")}`);
    if (!(order.bot || order.symbol)) add("bad-order", "$", "an order names the bot or the symbol it is for");
    if (!isPositive(order.units)) add("bad-units", "$.units", "units is a positive finite number");
    if (order.units > LIMITS.units) add("units-out-of-range", "$.units", `units is at most ${LIMITS.units}`);
    if (order.type !== ORDER_TYPE.MARKET && !isPositive(order.price)) add("bad-price", "$.price", `a ${order.type} order needs a positive price`);
    if (isPositive(order.price) && order.price > LIMITS.price) add("price-out-of-range", "$.price", `price is at most ${LIMITS.price}`);
    if (order.intent === INTENT.CLOSE && order.reduceOnly !== true) add("bad-reduce-only", "$.reduceOnly", "an order that closes is reduce-only");
    if (order.intent === INTENT.OPEN && order.reduceOnly === true) add("bad-reduce-only", "$.reduceOnly", "an order that opens is not reduce-only");

    return { ok: errors.length === 0, errors };
}

/** True when a status is one an order can still move out of. */
function isOpen(status) {
    return OPEN_STATUSES.includes(status);
}

/** True when a status is final. */
function isTerminal(status) {
    return TERMINAL_STATUSES.includes(status);
}

/**
 * Move one order to another status — the OMS in a dozen lines.
 *
 * A transition that is not in TRANSITIONS is refused with a reason instead of
 * applied, and an illegal state never enters a record: the caller keeps the
 * one it had and reports the refusal in its own words. A transition that would
 * produce an invalid record is refused the same way.
 *
 * @returns {{ok:boolean, order:object, reason:string|null}}
 */
function transition(order, to, patch = {}) {
    if (!isPlainObject(order)) return { ok: false, order: null, reason: "not-an-order" };
    if (!Object.values(ORDER_STATUS).includes(to)) return { ok: false, order, reason: "unknown-status" };

    const allowed = TRANSITIONS[order.status] || [];
    if (!allowed.includes(to)) return { ok: false, order, reason: `illegal-transition:${order.status}→${to}` };

    const next = {
        ...order,
        ...patch,
        status: to,
        updatedAt: Number.isFinite(Number(patch.updatedAt)) ? Number(patch.updatedAt) : order.updatedAt
    };
    if (!isPositive(next.filledUnits) && next.filledUnits !== 0) next.filledUnits = order.filledUnits || 0;

    const valid = validateOrder(next);
    if (!valid.ok) return { ok: false, order, reason: valid.errors[0].code };

    return { ok: true, order: next, reason: null };
}

module.exports = {
    ORDER_SIDE,
    ORDER_TYPE,
    TIME_IN_FORCE,
    ORDER_STATUS,
    OPEN_STATUSES,
    TERMINAL_STATUSES,
    TRANSITIONS,
    INTENT,
    ORDER_FIELDS,
    LIMITS,
    isPlainObject,
    isPositive,
    slug,
    dedupeKeyOf,
    clientOrderId,
    intentOf,
    isOrderAction,
    floorTo,
    roundTo,
    notionalOf,
    leverageOf,
    marginFor,
    stopPriceOf,
    unitsFor,
    buildOrder,
    validateOrder,
    isOpen,
    isTerminal,
    transition
};

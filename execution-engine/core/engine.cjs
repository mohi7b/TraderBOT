/* ============================================================
 * File: execution-engine/core/engine.cjs
 * Section: execution-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   The conductor: one decision in, one order out — or one refusal that says
 *   why. It owns the ORDER of the steps and nothing else.
 *
 *     bus ──signal──► handle ──► judge ──► adapter.dispatch ──► portfolio.note ──► bus
 *                                   │
 *                                   └──► a refusal is announced too (order_blocked)
 *
 *   Every step is one file's job, and the sequence is the design:
 *
 *     rollDay   the day boundary moves BEFORE anything is judged, so a decision
 *               at 00:00:01 is judged against today's loss, not yesterday's
 *     review    risk/guardrails.cjs judges the decision against the PLAN
 *     build     core/orders.cjs turns the verdict into an order record
 *     dispatch  adapters/base-adapter.cjs hands it to a venue — the only file
 *               that knows what a venue is
 *     note      risk/portfolio.cjs records it, and marks the decision handled
 *     announce  core/egress.cjs puts both outcomes on the bus
 *
 *   The wire back in has the same shape, in reverse: `onVenueEvent` is the one
 *   door, and what the venue says reaches the account (fills, marks) and the
 *   bus (the order's new status) through it.
 *
 *   Three things this file refuses to do:
 *
 *   1. IT DOES NOT JUDGE. Every ceiling and every size belongs to
 *      risk/guardrails.cjs. If this file disagreed with it there would be two
 *      risk policies and no way to say which one refused an order.
 *
 *   2. IT DOES NOT SWALLOW A REFUSAL. A decision that becomes no order is
 *      announced as `order_blocked` with the rule that stopped it.
 *
 *   3. IT DOES NOT ANNOUNCE NOTHING. The two exceptions are decisions that were
 *      never orders for this layer — a duplicate (the first handling is already
 *      the record) and an alert (a signal, not a trade) — and they are counted
 *      and readable in `stats()` rather than published twice.
 * ============================================================ */

const {
    ORDER_TYPE,
    TIME_IN_FORCE,
    ORDER_STATUS,
    buildOrder,
    clientOrderId,
    dedupeKeyOf,
    isPlainObject
} = require("./orders.cjs");
const { readSignal } = require("./signal.cjs");
const { ORDER_EVENTS, orderEnvelope, orderPayload, createOrderBridge } = require("./egress.cjs");
const { review } = require("../risk/guardrails.cjs");
const { createPortfolio } = require("../risk/portfolio.cjs");
const { isRiskProfile } = require("../risk/profile.cjs");

/**
 * Refusals that are not about an order, so no event is published for them:
 *
 *   duplicate     the same decision, already handled — its outcome is on the
 *                 bus already, and a second event would make one decision look
 *                 like two
 *   not-an-order  an alert: a signal, not a trade, and the bot published it
 *
 * Both are still counted per code and readable in stats().refusals, so this is
 * a decision about the bus, never about hiding something.
 */
const QUIET_CODES = Object.freeze(["duplicate", "not-an-order"]);

function numeric(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/**
 * One execution layer, wired to one venue and one account.
 *
 * @param {object}   options
 * @param {object}   options.profile      a compiled plan (risk/profile.cjs)
 * @param {object}   options.adapter      a venue (adapters/base-adapter.cjs)
 * @param {object}   [options.portfolio]  a live account; built from the plan when absent
 * @param {Function} [options.bridge]     a publisher (core/egress.cjs createOrderBridge)
 * @param {object}   [options.bus]        an EventBus, when no bridge is given
 * @param {Function} [options.sink]       one receiver, when no bridge is given
 * @param {Function[]} [options.sinks]    more receivers, when no bridge is given
 * @param {Function} [options.now]        clock (default Date.now)
 * @param {string}   [options.orderType]  the type every order is sent as
 * @param {string}   [options.timeInForce]
 * @returns {object} the engine (frozen surface; the books behind it are not)
 */
function createEngine({
    profile = null,
    adapter = null,
    portfolio = null,
    bridge = null,
    bus = null,
    sink = null,
    sinks = [],
    now = Date.now,
    orderType = ORDER_TYPE.MARKET,
    timeInForce = TIME_IN_FORCE.GTC
} = {}) {
    if (!isRiskProfile(profile)) {
        throw new Error("createEngine: a compiled risk profile is required — no plan is no trading");
    }
    if (!adapter || typeof adapter.dispatch !== "function" || typeof adapter.onVenueEvent !== "function") {
        throw new Error("createEngine: an adapter with dispatch and onVenueEvent is required");
    }

    const clock = typeof now === "function" ? now : () => Number(now);
    const account = portfolio || createPortfolio({ plan: profile, now: clock });

    if (!account || typeof account.equity !== "function") {
        throw new Error("createEngine: a live portfolio is required — a decision is judged against the account it moves");
    }

    const publish = typeof bridge === "function" ? bridge : createOrderBridge({ bus, sink, sinks });

    const state = {
        counts: {
            handled: 0,
            placed: 0,
            blocked: 0,
            quiet: 0,
            published: 0,
            events: 0,
            applied: 0,
            refusedEvents: 0,
            duplicates: 0,
            fills: 0,
            marks: 0
        },
        /** code → how many times it refused something (counted, never hidden). */
        refusals: new Map(),
        lastRefusal: null
    };

    function numberNow() {
        const value = Number(clock());
        return Number.isFinite(value) ? value : Date.now();
    }

    /** Count one refusal by code. A refusal that is counted is never lost. */
    function refuseWith(code, where = null) {
        const reason = code || "refused";
        state.refusals.set(reason, (state.refusals.get(reason) || 0) + 1);
        state.lastRefusal = Object.freeze({ code: reason, where, at: numberNow() });
        return reason;
    }

    /**
     * Put one order event on the bus.
     *
     * The frame's address comes from the bot and the symbol — the same two
     * segments the decision arrived on, so a consumer subscribing to
     * execution.<bot>.<asset>.* sees the order without a second subscription.
     * An event that has no bot or no symbol has no address, and is not
     * published (nothing to route it by).
     */
    function announce(eventType, { order = null, verdict = null, key = null, signal = null, at = null, reason = null } = {}) {
        const bot = (order && order.bot) || (signal && signal.bot) || (verdict && verdict.bot) || null;
        const symbol = (order && order.symbol) || (signal && signal.symbol) || (verdict && verdict.symbol) || null;
        if (!bot || !symbol) return null;

        const envelope = orderEnvelope({
            bot,
            eventType,
            data: orderPayload({ eventType, order, verdict, key, at, reason }),
            symbol,
            exchange: (signal && signal.exchange) || null,
            timestamp: at,
            receiveTimestamp: numberNow(),
            provenance: { bot, decision: key }
        });

        const entry = publish(envelope);
        if (entry) state.counts.published += 1;
        return entry;
    }

    /* ------------------------------------------------------------
     * In — one decision, judged
     * ---------------------------------------------------------- */

    /**
     * Read and judge one decision, without acting on it.
     *
     * This is the whole of the layer's policy in one call, and the only part of
     * `handle` a dashboard needs: the verdict, the order it would produce, and
     * the rule that would stop it. It writes nothing to the account except
     * moving the day boundary, which is a fact about the clock rather than a
     * decision about the market.
     *
     * @param {object} entry    a decision (a bus entry, a wrapped entry, a frame)
     * @param {object} [options]
     * @returns {object} frozen { ok, code, reason, key, at, rolled, signal, verdict, order }
     */
    function judge(entry, { at = null } = {}) {
        const signal = readSignal(entry);
        if (!signal) {
            return Object.freeze({
                ok: false,
                code: "not-a-signal",
                reason: "this entry is not a decision from the bot engine — nothing to judge",
                key: null,
                at: null,
                rolled: false,
                signal: null,
                verdict: null,
                order: null
            });
        }

        const moment = numeric(at) === null ? signal.at : Number(at);
        const rolled = account.rollDay(moment);
        const key = dedupeKeyOf(signal);
        const verdict = review({ signal, profile, portfolio: account, adapter, at: moment, key });

        if (!verdict.ok) {
            return Object.freeze({
                ok: false,
                code: verdict.code,
                reason: verdict.reason,
                key,
                at: moment,
                rolled,
                signal,
                verdict,
                order: null
            });
        }

        /* The order is the verdict's own numbers, cast into a record. The type
         * and the time-in-force are the only things this layer chooses: the
         * venue's vocabulary, not the trade's. `kind` in the id is what tells
         * an entry from the exit it may share an instant with. */
        const order = buildOrder({
            clientOrderId: clientOrderId({ bot: signal.bot, symbol: signal.symbol, at: signal.at, kind: verdict.kind }),
            bot: signal.bot,
            symbol: signal.symbol,
            side: verdict.side,
            type: orderType,
            timeInForce,
            intent: verdict.intent,
            units: verdict.units,
            price: verdict.price,
            stopPrice: verdict.stopPrice,
            status: ORDER_STATUS.NEW,
            signalAt: signal.at,
            now: moment
        });

        return Object.freeze({ ok: true, code: null, reason: null, key, at: moment, rolled, signal, verdict, order });
    }

    /**
     * One decision, all the way through: judge → dispatch → note → announce.
     *
     * A decision that is refused is announced as `order_blocked` carrying the
     * rule that stopped it — unless it was never an order for this layer (a
     * duplicate, an alert, or a frame that is not a decision at all). Those are
     * counted under `quiet` and in `refusals`, because their first handling is
     * already the record.
     *
     * @param {object} entry    a decision
     * @param {object} [options]
     * @returns {object} frozen judged result + { announced, venue }
     */
    function handle(entry, { at = null } = {}) {
        state.counts.handled += 1;

        const judged = judge(entry, { at });

        if (!judged.ok) {
            const quiet = judged.code === "not-a-signal" || QUIET_CODES.includes(judged.code);
            if (judged.signal) account.refuseDecision(judged.key);

            const announced = quiet
                ? null
                : announce(ORDER_EVENTS.ORDER_BLOCKED, {
                      verdict: judged.verdict,
                      key: judged.key,
                      signal: judged.signal,
                      at: judged.at,
                      reason: judged.reason
                  });

            if (quiet) state.counts.quiet += 1;
            else state.counts.blocked += 1;
            refuseWith(judged.code, quiet ? "quiet" : "blocked");

            return Object.freeze({ ...judged, announced, venue: null });
        }

        const placed = adapter.dispatch(judged.order);

        if (!placed.ok) {
            /* The venue refused the shape the account approved: a size that
             * rounds away, a notional below the market's floor. Nothing was
             * sent, so nothing is placed; the decision is still marked handled,
             * because a venue rule that changes is no reason to retry the same
             * decision under the same id. */
            account.refuseDecision(judged.key);
            const announced = announce(ORDER_EVENTS.ORDER_BLOCKED, {
                verdict: { ...judged.verdict, code: placed.reason, rule: "venue" },
                key: judged.key,
                signal: judged.signal,
                at: judged.at,
                reason: `the venue refused the order: ${placed.reason}`
            });

            state.counts.blocked += 1;
            refuseWith(placed.reason, "venue");

            return Object.freeze({
                ...judged,
                ok: false,
                code: placed.reason,
                reason: `the venue refused the order: ${placed.reason}`,
                announced,
                venue: placed
            });
        }

        if (placed.duplicate) {
            /* The venue already holds this clientOrderId: the same decision
             * arrived twice, or this account was rebuilt while the order stood.
             * The order exists, so it is kept current — but it is not placed a
             * second time and not announced a second time. */
            account.update(placed.order);
            account.markSeen(judged.key);
            state.counts.duplicates += 1;
            refuseWith("already-dispatched", "venue");

            return Object.freeze({ ...judged, reason: "already-dispatched", announced: null, venue: placed });
        }

        account.note(placed.order, { key: judged.key, at: judged.at });
        const announced = announce(ORDER_EVENTS.ORDER, {
            order: placed.order,
            verdict: judged.verdict,
            key: judged.key,
            signal: judged.signal,
            at: placed.order.updatedAt
        });
        state.counts.placed += 1;

        return Object.freeze({ ...judged, order: placed.order, announced, venue: placed });
    }

    /* ------------------------------------------------------------
     * Back in — what the venue says afterwards
     * ---------------------------------------------------------- */

    /**
     * One answer from the venue, however it arrives.
     *
     * Three things can come back, and each lands where it belongs:
     *
     *   a fill    → the account (risk/portfolio.cjs), then the bus — the order's
     *               status, units filled and average price are what a consumer
     *               needs to keep its own picture of this bot's book
     *   a mark    → the account's marks: the venue's last price is the price the
     *               open positions are valued at
     *   a status  → the account's order book, then the bus. A venue repeating
     *               itself ("confirmed") is not announced: nothing changed.
     *
     * An event this layer refuses — a duplicate fill, more units than were
     * placed, an order the venue never held — changes nothing and is counted
     * under `refusedEvents` and in `refusals`. A venue and an account
     * disagreeing about what is alive must never be silent.
     *
     * @param {object} event    a venue event (the adapter types it)
     * @returns {object} frozen { ok, reason, order, mark, fill, applied, announced }
     */
    function onVenueEvent(event = {}) {
        state.counts.events += 1;
        const result = adapter.onVenueEvent(event);

        if (!result.ok) {
            state.counts.refusedEvents += 1;
            refuseWith(result.reason, "venue-event");

            return Object.freeze({
                ok: false,
                reason: result.reason,
                order: result.order || null,
                mark: null,
                fill: null,
                applied: null,
                announced: null
            });
        }

        state.counts.applied += 1;

        if (result.mark) {
            const mark = account.mark(result.mark.symbol, result.mark.price, result.mark.at);
            if (mark) state.counts.marks += 1;

            return Object.freeze({ ok: true, reason: "mark", order: null, mark: result.mark, fill: null, applied: null, announced: null });
        }

        if (result.fill) {
            const applied = account.applyFill({
                clientOrderId: result.fill.clientOrderId,
                order: result.order,
                filledUnits: result.fill.filledUnits,
                price: result.fill.price,
                fee: result.fill.fee,
                at: result.fill.at
            });
            if (applied.ok) state.counts.fills += 1;

            /* The trade price is the freshest price there is: the account it
             * just moved is marked with it. */
            account.mark(result.fill.symbol, result.fill.price, result.fill.at);
            account.update(result.order);

            const announced = announce(ORDER_EVENTS.ORDER, { order: result.order, at: result.fill.at });

            return Object.freeze({ ok: true, reason: "fill", order: result.order, mark: null, fill: result.fill, applied, announced });
        }

        /* accepted / rejected / canceled / expired — and a venue repeating
         * itself, which changed nothing and is therefore not announced. */
        account.update(result.order);
        const changed = result.reason !== "confirmed";
        const announced = changed ? announce(ORDER_EVENTS.ORDER, { order: result.order, at: result.order.updatedAt }) : null;

        return Object.freeze({ ok: true, reason: result.reason, order: result.order, mark: null, fill: null, applied: null, announced });
    }

    /* ------------------------------------------------------------
     * Reading the layer
     * ---------------------------------------------------------- */

    function counts() {
        return Object.freeze({ ...state.counts });
    }

    function refusals() {
        return Object.freeze(Object.fromEntries(state.refusals));
    }

    /**
     * Everything this layer did, in one object: the counters, every refusal by
     * code, what the venue saw, and what the account holds. It is the object a
     * dashboard renders and a test asserts on.
     */
    function stats() {
        return Object.freeze({
            ...state.counts,
            refusals: refusals(),
            lastRefusal: state.lastRefusal,
            venue: typeof adapter.counts === "function" ? adapter.counts() : null,
            account: account.stats()
        });
    }

    function snapshot() {
        return Object.freeze({
            profile: profile.account,
            venue: typeof adapter.snapshot === "function" ? adapter.snapshot() : null,
            account: account.snapshot(),
            counts: counts(),
            refusals: refusals(),
            lastRefusal: state.lastRefusal
        });
    }

    return Object.freeze({
        profile,
        adapter,
        account,
        /** The account under its older name, for callers that think of it that way. */
        portfolio: account,
        /** Judge without acting — the dry run behind `handle`. */
        judge,
        handle,
        onVenueEvent,
        counts,
        refusals,
        stats,
        snapshot
    });
}

module.exports = { QUIET_CODES, createEngine };


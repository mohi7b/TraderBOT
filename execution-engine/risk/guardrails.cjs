/* ============================================================
 * File: execution-engine/risk/guardrails.cjs
 * Section: execution-engine/risk
 * Version: 1.0.0
 *
 * Role:
 *   The one place a decision is JUDGED, before it becomes an order.
 *
 *     a signal asks to enter or exit        (bot-engine, core/signal.cjs)
 *       │
 *       ├── a profile says what MAY happen  (risk/profile.cjs)
 *       ├── a portfolio says what DID       (risk/portfolio.cjs)
 *       └── this file says YES — or WHY NOT ──► core/engine.cjs → adapter → venue
 *
 *   `review()` is pure: it reads the signal, the compiled plan, the account and
 *   the venue's mark price, and answers either the approved shape (units, price,
 *   stop, and the ceilings it passed) or the first rule that refused it. It
 *   writes nothing, sends nothing and halts nothing — the engine owns every side
 *   effect, so a refusal can be replayed and audited without moving an account.
 *
 *   The rules run in ONE fixed order (RULE_ORDER): cheapest and most decisive
 *   first. A frame that is not an order at all is refused before a price is
 *   looked for; a duplicate before a size is computed; a rate limit before a
 *   stop. Every refusal names the rule that refused it, so a log reads like the
 *   pipeline that produced it.
 *
 *   Two rules are held above every ceiling:
 *
 *   1. A CLOSE IS NEVER BLOCKED. A close (`close`, `exit long/short/both`) is
 *      reduce-only: it takes risk away, so no ceiling that exists to stop the
 *      account TAKING risk may trap a position — not the allow lists, not a
 *      halt, not a drawdown, not a notional cap, not the open-position count.
 *      What a close still needs is its own identity (action, duplicate),
 *      something real to close (position) and a price (price). A halt must
 *      never be a cage.
 *
 *   2. REALIZED EQUITY IS THE ONLY EQUITY. Equity, daily loss, drawdown and
 *      every percentage taken from them come from risk/portfolio.cjs, which
 *      counts the opening balance and closed trades and never a mark. An open
 *      winner is not buying power, and sizing off one is how a good week ends
 *      in a liquidation.
 *
 *   Where a size comes from: the strategy's intent is one of
 *   `size: "units"` (a number of coins) or `size: "risk_pct"` (a percentage of
 *   equity, converted through the stop distance) — see core/orders.cjs. This
 *   file only decides whether that size is ALLOWED; it never invents one.
 * ============================================================ */

const { canonicalSymbol } = require("../../collector/crypto/common/envelope.cjs");
const {
    INTENT,
    ORDER_SIDE,
    dedupeKeyOf,
    floorTo,
    intentOf,
    isPlainObject,
    isPositive,
    leverageOf,
    notionalOf,
    stopPriceOf,
    unitsFor
} = require("../core/orders.cjs");
const { isRiskProfile } = require("./profile.cjs");
const { MINUTE_MS } = require("./portfolio.cjs");

/**
 * Decimal noise is not a breach: 1% risk computed two ways is 1% risk, not
 * 1.0000000001%. Every ceiling below is compared with this much slack, the same
 * way risk/portfolio.cjs forgives a float in an overfill.
 */
const EPSILON = 1e-9;

/** A mark older than this is not a price any more — it is a memory. */
const MARK_TTL_MS = 5 * MINUTE_MS;

/**
 * The pipeline, in the order it runs. Every rule either passes or refuses, and
 * the refusal names the rule it came from, so this list IS the contract: a test
 * that walks it checks the whole layer, and a new ceiling is inserted here
 * rather than appended somewhere in the body.
 *
 * Rules marked `close: true` still run for a close; the rest are the ceilings
 * the first rule above holds above (`review` skips them when the intent is to
 * close).
 */
const RULE_ORDER = Object.freeze([
    "action",
    "allow-bot",
    "allow-symbol",
    "account-halted",
    "duplicate",
    "rate-limit",
    "position",
    "price",
    "equity",
    "daily-loss",
    "drawdown",
    "sizing",
    "stop",
    "min-notional",
    "max-order-notional",
    "order-risk",
    "position-notional",
    "leverage",
    "open-positions"
]);

/** The rules a close still runs — the identity, the position and the price. */
const CLOSE_RULES = Object.freeze(["action", "allow-bot", "allow-symbol", "account-halted", "duplicate", "rate-limit", "position", "price"]);

/** What a close skips: every ceiling that exists to stop the account taking risk. */
const OPEN_ONLY_RULES = Object.freeze(RULE_ORDER.filter((rule) => !CLOSE_RULES.includes(rule)));

/** Every reason this file refuses a signal, so a caller can test for one. */
const CODES = Object.freeze({
    NO_PROFILE: "no-profile",
    NO_ACCOUNT: "no-account",
    NOT_AN_ORDER: "not-an-order",
    NO_TIME: "no-time",
    BOT_NOT_ALLOWED: "bot-not-allowed",
    SYMBOL_NOT_ALLOWED: "symbol-not-allowed",
    ACCOUNT_HALTED: "account-halted",
    DUPLICATE: "duplicate",
    RATE_LIMIT_MINUTE: "rate-limit-minute",
    RATE_LIMIT_DAY: "rate-limit-day",
    NO_POSITION: "no-position",
    POSITION_MISMATCH: "position-mismatch",
    NO_PRICE: "no-price",
    NO_EQUITY: "no-equity",
    DAILY_LOSS: "daily-loss",
    DRAWDOWN: "drawdown",
    NO_SIZE: "no-size",
    MAX_ORDER_UNITS: "max-order-units",
    NO_STOP: "no-stop",
    MIN_NOTIONAL: "min-notional",
    MAX_ORDER_NOTIONAL: "max-order-notional",
    ORDER_RISK: "order-risk",
    POSITION_NOTIONAL: "position-notional",
    LEVERAGE: "leverage",
    OPEN_POSITIONS: "open-positions"
});

/* ------------------------------------------------------------
 * Small reads
 * ---------------------------------------------------------- */

function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

function refusal(code, rule, reason) {
    return Object.freeze({ ok: false, code, rule, reason, key: null, kind: null, sizing: null });
}

function money(value) {
    return Number.isFinite(value) ? Number(value.toFixed(8)) : null;
}

function percent(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

/**
 * The market rules a size and a price are rounded to.
 *
 * A venue refuses a size finer than its step and a price off its tick, so the
 * rounding has to happen somewhere before the order is sent. The adapter knows
 * the market; a profile may override it for a paper venue; with neither, an
 * order is left exactly as the strategy asked for it.
 */
function marketOf(adapter = null, sizing = null) {
    const venueMarket = isPlainObject(adapter && adapter.market) ? adapter.market : {};

    return Object.freeze({
        stepSize: numeric(sizing && sizing.quantityStep) ?? numeric(venueMarket.stepSize) ?? null,
        tickSize: numeric(sizing && sizing.priceTick) ?? numeric(venueMarket.tickSize) ?? null,
        minNotional: numeric(venueMarket.minNotional) ?? null
    });
}

/**
 * What one unit of the pair costs, and where the number came from.
 *
 * Three places are asked, in order, and the answer says which one answered —
 * because "the strategy's own price" and "the venue's mark price" are very
 * different claims, and an audit has to be able to tell them apart:
 *
 *   1. the signal (an explicit price, or a metric that names one — signal.cjs
 *      already resolved the metric and said so as `priceSource`)
 *   2. the account's last fresh mark for the symbol (portfolio.markOf)
 *   3. the venue itself (adapter.markPrice)
 *
 * Nothing here averages the three, and nothing invents a fourth.
 *
 * @returns {{value:number|null, source:string|null}} source: "signal" | a
 *          metric path | "mark" | "venue" | null
 */
function priceFor(signal, portfolio = null, adapter = null, at = null) {
    const moment = numeric(at);

    if (signal && isPositive(signal.price)) {
        return Object.freeze({ value: signal.price, source: signal.priceSource || "signal" });
    }

    if (portfolio && signal && typeof portfolio.markOf === "function") {
        const mark = portfolio.markOf(signal.symbol);
        const age = mark && moment !== null ? moment - mark.at : null;

        /* A stale mark is a price that is no longer true, and pricing an order
         * off one is how a stop ends up on the wrong side of the market. */
        if (mark && isPositive(mark.price) && (age === null || (age >= 0 && age <= MARK_TTL_MS))) {
            return Object.freeze({ value: mark.price, source: "mark" });
        }
    }

    if (adapter && typeof adapter.markPrice === "function" && signal) {
        let quoted = null;
        try {
            quoted = adapter.markPrice(signal.symbol, moment === null ? undefined : moment);
        } catch (err) {
            /* A venue that cannot answer is not an error, it is no price. */
            quoted = null;
        }

        const value = isPlainObject(quoted) ? numeric(quoted.price) : numeric(quoted);
        if (isPositive(value)) return Object.freeze({ value, source: "venue" });
    }

    return Object.freeze({ value: null, source: null });
}

/** Today's loss as a percentage of equity (0 when today is not a loss). */
function dailyLossPct(equity, dayPnl) {
    if (!isPositive(equity) || !Number.isFinite(dayPnl) || dayPnl >= 0) return 0;
    return (-dayPnl / equity) * 100;
}

/** The side a close order is on: the side that takes the open position away. */
function closeSideOf(position) {
    if (!position || position.units === 0) return null;
    return position.units > 0 ? ORDER_SIDE.SELL : ORDER_SIDE.BUY;
}

/**
 * Judge one decision.
 *
 * @param {object}   options
 * @param {object}   options.signal     a decision (core/signal.cjs readSignal)
 * @param {object}   options.profile    a compiled plan (risk/profile.cjs)
 * @param {object}   options.portfolio  a live account (risk/portfolio.cjs)
 * @param {object}   [options.adapter]  a venue (markPrice, market) — optional
 * @param {number}   [options.at]       the instant of the review (defaults to signal.at)
 * @param {string}   [options.key]      override the decision key (defaults to dedupeKeyOf)
 * @returns {object} frozen verdict: { ok, code, rule, reason, key, kind, … }
 *          `code` is null when the order may be placed; every refusal carries
 *          the rule that made it, so a caller can branch on one or log the other.
 */
function review({ signal = null, profile = null, portfolio = null, adapter = null, at = null, key = null } = {}) {
    if (!isRiskProfile(profile)) {
        return refusal(CODES.NO_PROFILE, RULE_ORDER[0], "a compiled risk profile is required — no plan is no trading");
    }
    if (!portfolio || typeof portfolio.equity !== "function") {
        return refusal(CODES.NO_ACCOUNT, RULE_ORDER[0], "a live portfolio is required — a decision is judged against the account it moves");
    }

    const limits = profile.limits;
    const sizingCfg = profile.sizing || {};
    const action = isPlainObject(signal && signal.action) ? signal.action : null;

    const moment = numeric(at) ?? numeric(signal && signal.at);
    const decisionKey = typeof key === "string" && key ? key : signal ? dedupeKeyOf(signal) : "-";
    const direction = intentOf(action);
    const closing = Boolean(direction && direction.intent === INTENT.CLOSE);
    const kind = closing ? "close" : "open";
    const refuse = (code, rule, reason) => Object.freeze({ ok: false, code, rule, reason, key: decisionKey, kind, sizing: null });

    const bot = signal ? signal.bot : null;
    const symbol = signal ? signal.symbol : null;

    /* ---------- 1. action ---------- */
    if (!direction) {
        return refuse(CODES.NOT_AN_ORDER, "action", `"${(action && action.type) || "nothing"}" is not an order this layer places — an alert is a signal, not a trade`);
    }
    if (moment === null) {
        return refuse(CODES.NO_TIME, "action", "a decision without an instant cannot be priced, rate-limited or deduplicated");
    }

    /* A read, not a rule: what is open is needed to resolve a close's side and
     * to measure the size of what it takes away. The refusal for a close with
     * nothing to close is still made below, where the position rule runs. */
    const open = portfolio.positionOf(bot, symbol);

    /* ---------- 2/3. allow-bot, allow-symbol (a close is exempt) ---------- */
    const allow = profile.allow || {};

    if (!closing) {
        if (Array.isArray(allow.bots) && !allow.bots.includes(bot)) {
            return refuse(CODES.BOT_NOT_ALLOWED, "allow-bot", `bot "${bot}" is not in this account's allow list (${allow.bots.join(", ")})`);
        }

        const wanted = canonicalSymbol(symbol);
        if (Array.isArray(allow.symbols) && !allow.symbols.includes(wanted)) {
            return refuse(CODES.SYMBOL_NOT_ALLOWED, "allow-symbol", `market "${symbol}" is not in this account's allow list (${allow.symbols.join(", ")})`);
        }
    }

    /* ---------- 4. account-halted ---------- */
    if (!closing && portfolio.isHalted()) {
        const halt = portfolio.haltingReason();
        return refuse(CODES.ACCOUNT_HALTED, "account-halted", `the account is halted (${halt && halt.reason}) — a halt is cleared by resume(), never by a new signal`);
    }

    /* ---------- 5. duplicate ---------- */
    if (portfolio.hasSeen(decisionKey)) {
        return refuse(CODES.DUPLICATE, "duplicate", "this decision has already been handled — same bot, market, instant and action");
    }

    /* ---------- 6. rate-limit ---------- */
    if (limits.maxOrdersPerMinute > 0 && portfolio.ordersInWindow(1, moment) >= limits.maxOrdersPerMinute) {
        return refuse(CODES.RATE_LIMIT_MINUTE, "rate-limit", `${limits.maxOrdersPerMinute} orders a minute is this account's ceiling, and it has placed that many`);
    }
    if (limits.maxOrdersPerDay !== null && limits.maxOrdersPerDay !== undefined && portfolio.ordersToday(moment) >= limits.maxOrdersPerDay) {
        return refuse(CODES.RATE_LIMIT_DAY, "rate-limit", `${limits.maxOrdersPerDay} orders a day is this account's ceiling, and it has placed that many`);
    }

    /* ---------- 7. position ---------- */
    if (closing) {
        if (!open) {
            return refuse(CODES.NO_POSITION, "position", `there is nothing open on ${symbol} for bot "${bot}" to close`);
        }
        if (!direction.both) {
            const needed = direction.side === ORDER_SIDE.SELL ? "long" : "short";
            if (open.side !== needed) {
                return refuse(CODES.POSITION_MISMATCH, "position", `the signal says exit ${needed}, but ${symbol} is ${open.side} — a close may only take away what is there`);
            }
        }
    }

    /* ---------- 8. price ---------- */
    const price = priceFor(signal, portfolio, adapter, moment);
    if (!isPositive(price.value)) {
        return refuse(CODES.NO_PRICE, "price", `no price for ${symbol}: the signal carried none, the account holds no fresh mark, and the venue answered none`);
    }

    /* ---------- 9. equity (realized — never a mark) ---------- */
    const equity = portfolio.equity();
    if (!closing && !isPositive(equity)) {
        return refuse(CODES.NO_EQUITY, "equity", `equity is ${money(equity)} — an account with nothing left cannot size a risk`);
    }

    /* ---------- 10. daily-loss ---------- */
    if (!closing) {
        const lossPct = dailyLossPct(equity, portfolio.dayPnl(moment));
        if (lossPct >= limits.maxDailyLossPct) {
            return refuse(CODES.DAILY_LOSS, "daily-loss", `today is down ${percent(lossPct)}% of equity, at this account's ${limits.maxDailyLossPct}% daily stop`);
        }
    }

    /* ---------- 11. drawdown ---------- */
    if (!closing) {
        const drawdown = portfolio.drawdownPct();
        if (drawdown >= limits.maxDrawdownPct) {
            return refuse(CODES.DRAWDOWN, "drawdown", `the account is ${percent(drawdown)}% below its peak equity, at this account's ${limits.maxDrawdownPct}% ceiling`);
        }
    }

    const market = marketOf(adapter, sizingCfg);
    const stopPct = numeric(sizingCfg.stopPct);

    /* ---------- 12. sizing ---------- */
    let sizing;
    let side = direction.side;
    let units;

    if (closing) {
        /* A close closes what is there. The strategy does not get to choose a
         * size on the way out, because a partial exit nobody tracked is a
         * position nobody closed. */
        side = direction.both ? closeSideOf(open) : direction.side;
        const floored = floorTo(open.absUnits, market.stepSize);
        units = isPositive(floored) ? floored : open.absUnits;

        if (!isPositive(units)) return refuse(CODES.NO_SIZE, "sizing", `the open position on ${symbol} is not a size this layer can send`);

        sizing = Object.freeze({ units, riskAmount: null, perUnitRisk: null, stopPct: null });
    } else {
        sizing = unitsFor({ action, equity, price: price.value, stopPct, step: market.stepSize });
        if (!sizing) {
            return refuse(CODES.NO_SIZE, "sizing", `size "${action && action.size}" (${action && action.sizeValue}) produced no units at ${price.value} with a ${stopPct}% stop`);
        }

        units = sizing.units;
        if (limits.maxOrderUnits !== null && limits.maxOrderUnits !== undefined && units > limits.maxOrderUnits) {
            return refuse(CODES.MAX_ORDER_UNITS, "sizing", `${units} units is above this account's ${limits.maxOrderUnits}-unit ceiling — risk-based sizing needs a wider stop, not a bigger order`);
        }
    }

    /* ---------- 13. stop ---------- */
    let stopPrice = null;

    if (!closing) {
        stopPrice = stopPriceOf({ side, price: price.value, stopPct, tick: market.tickSize });
        /* An entry without a stop is not an order: it is a hope with a size. */
        if (!isPositive(stopPrice)) {
            return refuse(CODES.NO_STOP, "stop", `a ${stopPct}% stop on a ${side} of ${symbol} at ${price.value} is not a stop this layer can compute`);
        }
    }

    /* ---------- 14/15. min-notional, max-order-notional ---------- */
    const notional = notionalOf(units, price.value);
    const minNotional = Math.max(numeric(limits.minOrderNotional) || 0, numeric(market.minNotional) || 0);

    if (!closing && minNotional > 0 && notional < minNotional - EPSILON) {
        return refuse(CODES.MIN_NOTIONAL, "min-notional", `an order of ${money(notional)} is below the ${money(minNotional)} this market will accept — a size that small is not a position`);
    }
    if (!closing && notional > limits.maxOrderNotional + EPSILON) {
        return refuse(CODES.MAX_ORDER_NOTIONAL, "max-order-notional", `an order of ${money(notional)} is above this account's ${limits.maxOrderNotional} ceiling — the size is right, the units are not`);
    }

    /* ---------- 16. order-risk: what the stop costs, as % of equity ------ */
    const perUnitRisk = closing ? null : (price.value * stopPct) / 100;
    const riskAmount = closing ? null : sizing.riskAmount ?? units * perUnitRisk;
    const riskPct = closing || !isPositive(equity) ? null : (riskAmount / equity) * 100;

    if (!closing && riskPct !== null && riskPct > limits.maxOrderRiskPct + EPSILON) {
        return refuse(CODES.ORDER_RISK, "order-risk", `this order risks ${percent(riskPct)}% of equity if it is stopped, above this account's ${limits.maxOrderRiskPct}% per order`);
    }

    /* ---------- 17. position-notional ---------- */
    const signed = side === ORDER_SIDE.SELL ? -units : units;
    const resultingUnits = closing ? 0 : open ? open.units + signed : signed;
    const resultingNotional = Math.abs(resultingUnits) * price.value;

    if (!closing && limits.maxPositionNotional !== null && limits.maxPositionNotional !== undefined && resultingNotional > limits.maxPositionNotional + EPSILON) {
        return refuse(CODES.POSITION_NOTIONAL, "position-notional", `${symbol} would hold ${money(resultingNotional)} once this order fills, above this account's ${limits.maxPositionNotional} ceiling`);
    }

    /* ---------- 18. leverage ---------- */
    let exposureAfter = null;
    let leverageAfter = null;

    if (!closing) {
        /* The incoming order's own price is handed to exposure, so a symbol the
         * account has never marked can still be counted. Whatever is then left
         * unpriced is a position whose risk cannot be measured, and leverage
         * that cannot be measured is refused rather than guessed — understating
         * exposure is exactly how an account ends up over its ceiling. */
        const exposure = portfolio.exposure({ [symbol]: price.value });

        if (exposure.unpriced.length) {
            return refuse(CODES.LEVERAGE, "leverage", `leverage cannot be measured: ${exposure.unpriced.length} open position(s) carry no price — this layer refuses to guess what the account is exposed to`);
        }

        /* An order that would REDUCE a position is still counted as if it added:
         * the conservative direction, and the only one that can be judged
         * without knowing how the venue nets. */
        exposureAfter = exposure.total + notional;
        leverageAfter = leverageOf(exposureAfter, equity);

        if (leverageAfter !== null && leverageAfter > limits.maxLeverage + EPSILON) {
            return refuse(CODES.LEVERAGE, "leverage", `${money(exposureAfter)} of exposure on ${money(equity)} of equity is ${percent(leverageAfter)}×, above this account's ${limits.maxLeverage}× ceiling`);
        }
    }

    /* ---------- 19. open-positions ---------- */
    if (!closing && !open && portfolio.positionCount() >= limits.maxOpenPositions) {
        return refuse(CODES.OPEN_POSITIONS, "open-positions", `${portfolio.positionCount()} position(s) are open and this account trades ${limits.maxOpenPositions} at a time — ${symbol} would be one too many`);
    }

    /* ---------- every rule passed: this is the shape that may be sent ------- */
    return Object.freeze({
        ok: true,
        code: null,
        rule: null,
        reason: closing
            ? `close ${units} ${symbol} at ${price.value} — reduce-only, and no ceiling may stand in front of an exit`
            : `${units} ${symbol} ${side} at ${price.value}, stopped ${stopPrice} — every ceiling this account sets is respected`,
        key: decisionKey,
        at: moment,
        kind,
        bot,
        symbol,
        intent: direction.intent,
        both: direction.both,
        side,
        units,
        price: price.value,
        priceSource: price.source,
        stopPrice,
        stopPct: closing ? null : stopPct,
        notional,
        riskAmount,
        riskPct,
        perUnitRisk,
        equity,
        position: open,
        resultingUnits,
        resultingNotional,
        exposureAfter,
        leverage: leverageAfter,
        market,
        sizing: Object.freeze({ ...sizing }),
        /* Which rules ran — a close walks CLOSE_RULES, an entry walks all of
         * RULE_ORDER, and a test can hold either to the contract. */
        rules: closing ? CLOSE_RULES : RULE_ORDER
    });
}

module.exports = {
    CODES,
    RULE_ORDER,
    CLOSE_RULES,
    OPEN_ONLY_RULES,
    EPSILON,
    MARK_TTL_MS,
    marketOf,
    priceFor,
    dailyLossPct,
    closeSideOf,
    review
};

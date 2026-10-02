/* ============================================================
 * File: execution-engine/risk/profile.cjs
 * Section: execution-engine/risk
 * Version: 1.0.0
 *
 * Role:
 *   The risk document of one account — the limits a strategy's intentions are
 *   judged against, and the account they are judged for.
 *
 *     a strategy says WHAT it wants to do     (bot-engine/core/dsl-schema.cjs)
 *     an account says HOW MUCH it may do      (this file)
 *
 *   Nothing here places anything: this file turns a document into a frozen
 *   plan, or into the list of reasons it is not one — the same contract
 *   compileStrategy() keeps, for the same reason. A profile that is refused
 *   does not trade partially, and a profile that compiles cannot be edited by
 *   accident, because the layer's safety depends on numbers nobody may move
 *   while it is running.
 *
 *   Two rules shape every check:
 *
 *   1. NO LIMIT MEANS NO TRADING. A profile must state the three limits that
 *      bound a single order — maxOrderNotional, maxLeverage, maxDrawdownPct —
 *      because a missing ceiling is not "unlimited", it is a bug that only
 *      shows up after the loss. Everything else is a default, taken from the
 *      conservative side, and every default is listed in DEFAULT_LIMITS and
 *      frozen into the plan, so what a plan holds is what it enforced.
 *
 *   2. THE STRATEGY SAYS HOW MUCH IT WILL LOSE, THE ACCOUNT SAYS HOW FAR THE
 *      STOP GOES. `sizing.stopPct` is the account's standing stop distance:
 *      a `risk_pct` action becomes units *through it*, which is what makes
 *      "risk 1%" a measurable number instead of a wish. An account that trades
 *      risk-percent sizing without a stop distance cannot size anything, so the
 *      document must state one.
 * ============================================================ */

const { normalizeBotId } = require("../../bot-engine/topics.cjs");
const { canonicalSymbol } = require("../../collector/crypto/common/envelope.cjs");

/** The document version. A schema change is a new string, not a new meaning. */
const PROFILE_VERSION = "execution-engine/1";

/** The bounds of each limit: what a document may ask for, ever. */
const LIMITS = Object.freeze({
    equity: 1e15,
    maxOrderNotional: 1e15,
    maxPositionNotional: 1e15,
    maxOrderUnits: 1e12,
    maxLeverage: 125,
    maxOrderRiskPct: 100,
    maxDrawdownPct: 100,
    maxDailyLossPct: 100,
    maxOpenPositions: 64,
    maxOrdersPerMinute: 600,
    stopPct: 50,
    currencyLength: 12,
    idLength: 64,
    listLength: 128,
    dayMs: 7 * 86_400_000
});

/**
 * What an account gets when the document does not say. Every one of them is a
 * number a conservative account would have chosen: one position at a time, 2%
 * of equity per order, a 5% daily loss stop, 20 orders a minute.
 */
const DEFAULT_LIMITS = Object.freeze({
    maxOrderUnits: null,
    maxPositionNotional: null,
    maxOrderRiskPct: 2,
    maxDailyLossPct: 5,
    maxOpenPositions: 1,
    maxOrdersPerMinute: 20,
    maxOrdersPerDay: null,
    minOrderNotional: 0,
    maxSlippagePct: null
});

/** What an account gets when the document says nothing about its stops. */
const DEFAULT_SIZING = Object.freeze({
    stopPct: 1,
    quantityStep: null,
    priceTick: null
});

/**
 * What each limit may be: its floor, its ceiling, whether it is a whole
 * number, and whether a document may write `null` to mean "no ceiling here".
 * One table, so a document is refused the same way wherever it is checked.
 */
const LIMIT_RULES = Object.freeze({
    maxOrderNotional: { positive: true, max: LIMITS.maxOrderNotional },
    maxOrderUnits: { positive: true, max: LIMITS.maxOrderUnits, nullable: true },
    maxPositionNotional: { positive: true, max: LIMITS.maxPositionNotional, nullable: true },
    maxLeverage: { positive: true, max: LIMITS.maxLeverage },
    maxOrderRiskPct: { positive: true, max: LIMITS.maxOrderRiskPct },
    maxDrawdownPct: { positive: true, max: LIMITS.maxDrawdownPct },
    maxDailyLossPct: { positive: true, max: LIMITS.maxDailyLossPct },
    maxOpenPositions: { positive: true, max: LIMITS.maxOpenPositions, whole: true },
    maxOrdersPerMinute: { positive: true, max: LIMITS.maxOrdersPerMinute, whole: true },
    maxOrdersPerDay: { positive: true, max: 100_000, whole: true, nullable: true },
    minOrderNotional: { min: 0, max: LIMITS.maxOrderNotional },
    maxSlippagePct: { positive: true, max: 100, nullable: true }
});

/** The three ceilings a profile may not leave out. */
const REQUIRED_LIMITS = Object.freeze(["maxOrderNotional", "maxLeverage", "maxDrawdownPct"]);

const ACCOUNT_FIELDS = Object.freeze(["id", "currency", "equity", "note"]);
const LIMIT_FIELDS = Object.freeze([
    "maxOrderNotional",
    "maxOrderUnits",
    "maxPositionNotional",
    "maxLeverage",
    "maxOrderRiskPct",
    "maxDrawdownPct",
    "maxDailyLossPct",
    "maxOpenPositions",
    "maxOrdersPerMinute",
    "maxOrdersPerDay",
    "minOrderNotional",
    "maxSlippagePct"
]);
const SIZING_FIELDS = Object.freeze(["stopPct", "quantityStep", "priceTick"]);
const ALLOW_FIELDS = Object.freeze(["bots", "symbols"]);
const ROOT_FIELDS = Object.freeze(["version", "name", "account", "limits", "sizing", "allow", "note"]);

const BOT_PATTERN = /^[a-z0-9_-]+$/;
const NAME_LENGTH = 80;

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPercentage(value) {
    return isPositiveNumber(value) && value <= 100;
}

/** A report: every reason a document was refused, in the order they were found. */
function createReport() {
    const errors = [];

    return {
        errors,
        add(code, where, message) {
            errors.push(Object.freeze({ code, where, message }));
            return null;
        },
        ok() {
            return errors.length === 0;
        }
    };
}

/** Refuse a field nobody defined. A typo in a limit is a limit that never applies. */
function refuseUnknownFields(document, allowed, path, report) {
    for (const field of Object.keys(document)) {
        if (!allowed.includes(field)) {
            report.add("unknown-field", `${path}.${field}`, `"${field}" is not something an account states here`);
        }
    }
}

/**
 * The account: who is being protected, and with how much. Required, because
 * every number below is a fraction of equity, and no equity means no
 * percentages.
 */
function validateAccount(document, report) {
    const raw = document.account;

    if (!isPlainObject(raw)) {
        return report.add("missing-account", "$.account", "a risk profile governs one account: { id, equity }");
    }

    refuseUnknownFields(raw, ACCOUNT_FIELDS, "$.account", report);

    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || id.length > LIMITS.idLength) {
        report.add("bad-account-id", "$.account.id", `an account has an id, 1..${LIMITS.idLength} characters`);
    }

    const currency = raw.currency === undefined ? "USDT" : raw.currency;
    const named = typeof currency === "string" && currency.trim().length > 0 && currency.length <= LIMITS.currencyLength;
    if (!named) {
        report.add("bad-currency", "$.account.currency", `currency is a name, 1..${LIMITS.currencyLength} characters`);
    }

    if (!isPositiveNumber(raw.equity) || raw.equity > LIMITS.equity) {
        report.add("bad-equity", "$.account.equity", `equity is a positive number, at most ${LIMITS.equity}`);
        return null;
    }

    return Object.freeze({
        id,
        currency: named ? currency.trim().toUpperCase() : "USDT",
        equity: raw.equity,
        note: typeof raw.note === "string" ? raw.note.slice(0, 200) : null
    });
}

/** Read one limit against its rule, or leave the default in place. */
function readLimit(raw, field, rule, report, limits) {
    const where = `$.limits.${field}`;
    const value = raw[field];

    if (value === undefined) {
        return;
    }

    if (value === null) {
        if (rule.nullable) {
            limits[field] = null;
            return;
        }
        report.add("bad-limit", where, `${field} may not be null — leave it out to keep the default (${DEFAULT_LIMITS[field]})`);
        return;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
        report.add("bad-limit", where, `${field} is a number`);
        return;
    }

    if (rule.whole && !Number.isInteger(value)) {
        report.add("bad-limit", where, `${field} is a whole number`);
        return;
    }

    if (rule.positive && value <= 0) {
        report.add("bad-limit", where, `${field} is greater than zero`);
        return;
    }

    if (rule.min !== undefined && value < rule.min) {
        report.add("bad-limit", where, `${field} is at least ${rule.min}`);
        return;
    }

    if (value > rule.max) {
        report.add("bad-limit", where, `${field} is at most ${rule.max}`);
        return;
    }

    limits[field] = value;
}

/**
 * The limits. The three that bound a single order and the account's life are
 * required; the rest start conservative and are reported by the plan either
 * way, so what a plan holds is exactly what it enforced.
 */
function validateLimits(document, report) {
    const raw = document.limits;

    if (!isPlainObject(raw)) {
        return report.add("missing-limits", "$.limits", "a risk profile states its limits: no limit means no trading");
    }

    refuseUnknownFields(raw, LIMIT_FIELDS, "$.limits", report);

    for (const required of REQUIRED_LIMITS) {
        if (!isPositiveNumber(raw[required])) {
            report.add(
                "missing-limit",
                `$.limits.${required}`,
                `${required} is required — a ceiling left out is not "unlimited", it is a bug that shows up after the loss`
            );
        }
    }

    const limits = { ...DEFAULT_LIMITS };
    for (const field of LIMIT_FIELDS) {
        readLimit(raw, field, LIMIT_RULES[field], report, limits);
    }

    return limits;
}

/**
 * The stops. `stopPct` is the account's standing stop distance: a `risk_pct`
 * action becomes units through it, so an account that sizes by risk without a
 * stop distance would be sizing off a wish.
 */
function validateSizing(document, report) {
    const raw = document.sizing;

    if (!isPlainObject(raw)) {
        return report.add("missing-sizing", "$.sizing", "a risk profile states how far its stops go: { stopPct }");
    }

    refuseUnknownFields(raw, SIZING_FIELDS, "$.sizing", report);

    const stopPct = raw.stopPct === undefined ? DEFAULT_SIZING.stopPct : raw.stopPct;
    if (!isPercentage(stopPct) || stopPct > LIMITS.stopPct) {
        report.add("bad-stop", "$.sizing.stopPct", `stopPct is a percentage above zero, at most ${LIMITS.stopPct}`);
    }

    const quantityStep = raw.quantityStep === undefined ? null : raw.quantityStep;
    if (quantityStep !== null && !isPositiveNumber(quantityStep)) {
        report.add("bad-step", "$.sizing.quantityStep", "quantityStep is a positive number, or null to use the market's");
    }

    const priceTick = raw.priceTick === undefined ? null : raw.priceTick;
    if (priceTick !== null && !isPositiveNumber(priceTick)) {
        report.add("bad-tick", "$.sizing.priceTick", "priceTick is a positive number, or null to use the market's");
    }

    return Object.freeze({
        stopPct: isPercentage(stopPct) && stopPct <= LIMITS.stopPct ? stopPct : DEFAULT_SIZING.stopPct,
        quantityStep: quantityStep !== null && isPositiveNumber(quantityStep) ? quantityStep : null,
        priceTick: priceTick !== null && isPositiveNumber(priceTick) ? priceTick : null
    });
}

/** Read a list of bot ids or symbols, canonicalised so this layer names things one way. */
function readList(value, where, report, normalize) {
    if (value === undefined) {
        return null;
    }

    if (!Array.isArray(value)) {
        return report.add("bad-list", where, "a list of names");
    }

    if (value.length === 0 || value.length > LIMITS.listLength) {
        return report.add("bad-list", where, `between 1 and ${LIMITS.listLength} names`);
    }

    const names = [];
    for (const entry of value) {
        if (typeof entry !== "string") {
            return report.add("bad-list", where, "names are strings");
        }
        const name = normalize(entry);
        if (!name) {
            return report.add("bad-list", where, `"${entry}" is not a name this layer knows`);
        }
        names.push(name);
    }

    return Object.freeze([...new Set(names)]);
}

/** Which bots and which markets this account trades. Absent means "all of them". */
function validateAllow(document, report) {
    const raw = document.allow;

    if (raw === undefined) {
        return Object.freeze({ bots: null, symbols: null });
    }

    if (!isPlainObject(raw)) {
        return report.add("bad-allow", "$.allow", "allow is { bots, symbols } — the bots and markets this account trades");
    }

    refuseUnknownFields(raw, ALLOW_FIELDS, "$.allow", report);

    const bots = readList(raw.bots, "$.allow.bots", report, (entry) => normalizeBotId(entry));
    const symbols = readList(raw.symbols, "$.allow.symbols", report, (entry) => canonicalSymbol(entry));

    return Object.freeze({ bots, symbols });
}

/** One refusal, shaped like every other error this engine returns. */
function refusal(code, where, message) {
    return Object.freeze({ code, where, message });
}

/**
 * Compile a risk document into a frozen plan, or into the reasons it is not
 * one. The same contract compileStrategy() keeps: all or nothing, and every
 * section is read even after the first refusal, so a document comes back with
 * the whole list of things to fix instead of one per round-trip.
 *
 *   compileRiskProfile(doc).plan   the numbers the guardrails run on
 *   compileRiskProfile(doc).errors [{ code, where, message }, ...]
 */
function compileRiskProfile(document, options = {}) {
    const now = typeof options.now === "function" ? options.now : Date.now;

    if (!isPlainObject(document)) {
        return Object.freeze({
            ok: false,
            plan: null,
            errors: Object.freeze([refusal("not-a-document", "$", "a risk profile is an object")])
        });
    }

    const report = createReport();

    if (document.version !== PROFILE_VERSION) {
        report.add("unknown-version", "$.version", `a risk profile states the version it was written for: "${PROFILE_VERSION}"`);
    }

    refuseUnknownFields(document, ROOT_FIELDS, "$", report);

    if (document.name !== undefined && (typeof document.name !== "string" || !document.name.trim() || document.name.length > NAME_LENGTH)) {
        report.add("bad-name", "$.name", `name is 1..${NAME_LENGTH} characters`);
    }

    const account = validateAccount(document, report);
    const limits = validateLimits(document, report);
    const sizing = validateSizing(document, report);
    const allow = validateAllow(document, report);

    if (!report.ok() || account === null || limits === null || sizing === null || allow === null) {
        return Object.freeze({ ok: false, plan: null, errors: Object.freeze(report.errors.slice()) });
    }

    return Object.freeze({
        ok: true,
        plan: Object.freeze({
            version: PROFILE_VERSION,
            name: document.name ? document.name.trim() : account.id,
            account,
            limits: Object.freeze({ ...limits }),
            sizing,
            allow,
            compiledAt: now()
        }),
        errors: Object.freeze([])
    });
}

/** Is this something compileRiskProfile() made? The engine accepts a plan or a document. */
function isRiskProfile(value) {
    return (
        isPlainObject(value) &&
        value.version === PROFILE_VERSION &&
        isPlainObject(value.account) &&
        isPlainObject(value.limits) &&
        isPlainObject(value.sizing)
    );
}

/** One refusal for a signal: the same shape, so a block reads like a bad document. */
function block(code, where, message) {
    return refusal(code, where, message);
}

/** A document that compiles — the shape every example and test starts from. */
const EXAMPLE = Object.freeze({
    version: PROFILE_VERSION,
    name: "paper-main",
    account: { id: "acc-paper-1", currency: "USDT", equity: 10_000 },
    limits: {
        maxOrderNotional: 2_500,
        maxPositionNotional: 5_000,
        maxLeverage: 3,
        maxOrderRiskPct: 1,
        maxDrawdownPct: 20,
        maxDailyLossPct: 5,
        maxOpenPositions: 2,
        maxOrdersPerMinute: 30,
        minOrderNotional: 10
    },
    sizing: { stopPct: 1 },
    allow: { symbols: ["BTCUSDT", "ETHUSDT"] }
});

module.exports = {
    PROFILE_VERSION,
    LIMITS,
    LIMIT_RULES,
    DEFAULT_LIMITS,
    DEFAULT_SIZING,
    REQUIRED_LIMITS,
    ACCOUNT_FIELDS,
    LIMIT_FIELDS,
    SIZING_FIELDS,
    ALLOW_FIELDS,
    ROOT_FIELDS,
    EXAMPLE,
    refusal,
    block,
    createReport,
    validateAccount,
    validateLimits,
    validateSizing,
    validateAllow,
    compileRiskProfile,
    isRiskProfile
};
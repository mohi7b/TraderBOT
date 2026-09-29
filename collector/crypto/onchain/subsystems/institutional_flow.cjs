/* ============================================================
 * File: collector/crypto/onchain/subsystems/institutional_flow.cjs
 * Section: collector/crypto/onchain/subsystems
 * Version: 1.0.0
 *
 * Role:
 *   The institutional doorway: fifteen listed funds that hold the asset, each
 *   measured by two independent providers. One quote can be wrong or stale
 *   without anyone noticing; two quotes that must agree are a measurement.
 *
 *     yahoo/chart/<FUND>    a daily bar and yesterday's close (price + volume)
 *     nasdaq/info/<FUND>    the last sale, the day's move, the listing venue
 *
 *   What this capsule does *not* do, on purpose:
 *
 *     - It never publishes a net flow. A flow would need shares outstanding,
 *       and no key-free source here has it: Yahoo's quoteSummary answers 429
 *       without a crumb and Nasdaq's historical endpoint answers an empty
 *       payload. Every reading therefore carries sharesOutstanding: null,
 *       netFlowUsd: null and a flowReason saying why — a measured price and an
 *       absent flow, instead of an invented one (see README known gaps).
 *
 *     - It never upgrades the provider's word into a classification. Yahoo's
 *       meta says instrumentType "ETF"; that word is published as a word. What
 *       the fund *holds* (underlying) comes from the subject catalog, where a
 *       human put it.
 *
 *   The two providers are asked at different rates — Yahoo's chart is light
 *   and answers in ~200 ms, Nasdaq's quote API is picky and slower — and each
 *   reading carries a `crossCheck` of the other provider's last price with the
 *   gap in basis points and the age of that quote, so a disagreement is
 *   visible rather than averaged away.
 * ============================================================ */

const { numberOrNull, deltaOf, round, createReading } = require("../core/reading.cjs");
const { matchKey } = require("./aggregate.cjs");
const { symbolFor } = require("../core/subject.cjs");

const ID = "institutional_flow";
const TITLE = "Funds: the institutional doorway";

/** The reading types this capsule may emit. */
const EVENT_TYPES = Object.freeze(["etf_quote"]);

/** Yahoo's chart is light (every 5 min); Nasdaq's quote API is asked slower. */
const DEFAULT_SCHEDULES = Object.freeze({ chart: 300_000, info: 900_000 });

/** A quote older than this is still shown, but marked as outside the window. */
const MAX_CROSS_CHECK_AGE_MS = 21_600_000;

/** Why there is no netFlowUsd in an etf_quote reading. */
const NO_FLOW_REASON = "no key-free shares-outstanding source (Yahoo quoteSummary 429, Nasdaq historical empty)";

/**
 * @param {object} options
 * @param {object} options.catalog        the subject catalog (tasks are per fund)
 * @param {object} [options.schedules]    per-endpoint scheduleMs overrides
 * @param {number} [options.maxCrossCheckAgeMs] age after which a cross-check is stale
 */
function createInstitutionalFlow({ catalog, schedules = {}, maxCrossCheckAgeMs = MAX_CROSS_CHECK_AGE_MS } = {}) {
    if (!catalog || typeof catalog.ofKind !== "function") {
        throw new TypeError("institutional_flow needs the subject catalog");
    }
    const schedule = { ...DEFAULT_SCHEDULES, ...schedules };

    /** subjectId → providerId → {price, at}: what each provider said last time. */
    const quotes = new Map();

    /** One task per fund per provider that can speak of it. */
    function tasks() {
        const list = [];
        for (const subject of catalog.ofKind("fund")) {
            const yahoo = symbolFor(subject, "yahoo");
            if (yahoo) {
                list.push({
                    taskId: `yahoo/chart/${subject.id}`,
                    providerId: "yahoo",
                    endpoint: "chart",
                    subjectId: subject.id,
                    params: { symbol: yahoo },
                    scheduleMs: schedule.chart,
                    note: `${subject.id} ${yahoo}: daily bar, previous close, volume`
                });
            }
            const nasdaq = symbolFor(subject, "nasdaq");
            if (nasdaq) {
                list.push({
                    taskId: `nasdaq/info/${subject.id}`,
                    providerId: "nasdaq",
                    endpoint: "info",
                    subjectId: subject.id,
                    params: { symbol: nasdaq, assetClass: "etf" },
                    scheduleMs: schedule.info,
                    note: `${subject.id} ${nasdaq}: last sale, day move, listing venue`
                });
            }
        }
        return list;
    }

    /** The other provider's last word on this fund, and how far it has drifted. */
    function crossCheckOf(subjectId, providerId, price, at) {
        const remembered = quotes.get(subjectId) || {};
        for (const [other, entry] of Object.entries(remembered)) {
            if (other === providerId || !entry) continue;
            const diff = deltaOf(price, entry.price);
            const ageMs = Math.max(0, at - entry.at);
            return Object.freeze({
                provider: other,
                price: entry.price,
                at: entry.at,
                ageMs,
                withinWindow: ageMs <= maxCrossCheckAgeMs,
                diffUsd: diff.delta,
                /* Two sources quoting the same share must agree to a few basis
                 * points; the gap is published, never averaged away. */
                diffBps: diff.pct === null ? null : round(diff.pct * 100, 4)
            });
        }
        return null;
    }

    function remember(subjectId, providerId, price, at) {
        const remembered = quotes.get(subjectId) || {};
        remembered[providerId] = { price, at };
        quotes.set(subjectId, remembered);
    }

    /** The subject a task is about: by id, or by the spelling the provider answered with. */
    function subjectOf(catalogRef, task, rows) {
        if (task && task.subjectId) {
            const byId = catalogRef.find(task.subjectId);
            if (byId) return byId;
        }
        const spelling = rows.length > 0 && typeof rows[0].key === "string" ? matchKey(rows[0].key) : null;
        if (spelling === null) return null;
        return catalogRef.ofKind("fund")
            .find((subject) => Object.values(subject.symbols).some((value) => matchKey(value) === spelling)) || null;
    }

    /** Rows of one provider answer → one reading for one fund. */
    function collect({ task, rows, catalog: catalogRef = catalog, at = Date.now(), receivedAt = null } = {}) {
        const list = Array.isArray(rows) ? rows : [];
        if (!task || !catalogRef || list.length === 0) return [];
        if (task.endpoint !== "chart" && task.endpoint !== "info") return [];

        const subject = subjectOf(catalogRef, task, list);
        const row = list[0];
        if (!subject || !row) return [];

        const fromYahoo = task.endpoint === "chart";
        const providerId = fromYahoo ? "yahoo" : "nasdaq";
        const price = numberOrNull(fromYahoo ? row.price : row.lastSalePrice);
        /* No price, no reading: a fund with an empty answer is unanswered, not 0. */
        if (price === null) return [];

        const prevClose = numberOrNull(row.prevClose);
        const move = deltaOf(price, prevClose);
        const statedChange = numberOrNull(row.dayChange) === null ? numberOrNull(row.netChange) : numberOrNull(row.dayChange);
        const statedPct = numberOrNull(row.changePct);
        const crossCheck = crossCheckOf(subject.id, providerId, price, at);
        remember(subject.id, providerId, price, at);

        return [createReading({
            subject,
            eventType: "etf_quote",
            /* The venue the catalog claims, and the provider's own word in data. */
            exchange: subject.listing || (fromYahoo ? row.exchangeName : row.listing) || null,
            provider: providerId,
            data: {
                price,
                prevClose,
                /* Derived from two quoted prices, so it is rounded to what a
                 * price actually carries: 2 decimals, never 15 digits. */
                dayChangeUsd: round(statedChange === null ? move.delta : statedChange, 6),
                dayChangePct: round(statedPct === null ? move.pct : statedPct, 6),
                /* Nasdaq's info endpoint carries no volume at all: null, not 0. */
                volume: fromYahoo ? numberOrNull(row.volume) : null,
                quoteAt: fromYahoo ? numberOrNull(row.barTime) : at,
                barTime: fromYahoo ? numberOrNull(row.barTime) : null,
                /* The provider's nouns, kept as nouns. */
                instrumentType: fromYahoo ? row.instrumentType || null : null,
                venue: (fromYahoo ? row.fullExchangeName || row.exchangeName : row.listing) || null,
                currency: fromYahoo ? row.currency || null : null,
                fundName: fromYahoo ? null : row.name || null,
                lastTradeWord: fromYahoo ? null : row.lastTradeTimestamp || null,
                dataGranularity: fromYahoo ? row.dataGranularity || null : null,
                /* The gap this module cannot fill without a key, said out loud. */
                sharesOutstanding: null,
                netFlowUsd: null,
                flowReason: NO_FLOW_REASON,
                crossCheck,
                underlying: subject.underlying,
                listing: subject.listing,
                scope: fromYahoo ? "fund-daily-bar" : "fund-last-sale"
            },
            timestamp: fromYahoo && numberOrNull(row.barTime) !== null ? numberOrNull(row.barTime) : at,
            receivedAt
        })];
    }

    function state() {
        const entries = [...quotes.entries()].map(([subjectId, byProvider]) => Object.freeze({
            subjectId,
            providers: Object.freeze(Object.keys(byProvider))
        }));
        return Object.freeze({
            fundsRemembered: entries.length,
            fundsWithTwoQuotes: entries.filter((entry) => entry.providers.length > 1).length,
            quotes: Object.freeze(entries.slice(-10))
        });
    }

    function reset() {
        const cleared = quotes.size;
        quotes.clear();
        return cleared;
    }

    /* A fund quote answers for itself: nothing to discover, no follow-up task. */
    return { id: ID, title: TITLE, eventTypes: EVENT_TYPES, tasks, collect, followUps: () => [], state, reset };
}

module.exports = {
    ID,
    TITLE,
    EVENT_TYPES,
    DEFAULT_SCHEDULES,
    MAX_CROSS_CHECK_AGE_MS,
    NO_FLOW_REASON,
    createInstitutionalFlow
};

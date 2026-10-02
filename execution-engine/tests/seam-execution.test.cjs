/**
 * C1 — Seam: a bot's decision → the plan → the venue → the account → the bus
 * bot-engine/core/egress.cjs                    (makes the decision frame)
 * execution-engine/core/signal.cjs              (what the layer reads)
 * execution-engine/risk/guardrails.cjs          (what it is allowed to do)
 * execution-engine/core/engine.cjs              (the conductor)
 * execution-engine/adapters/base-adapter.cjs    (the venue, network-free)
 * execution-engine/risk/portfolio.cjs           (the account it updates)
 * execution-engine/core/egress.cjs              (order / order_blocked out)
 * ============================================================
 * Phase 3 ends with a bot publishing `execution.signal` on the bus (B1). This
 * test walks the rest of the way — that frame until the venue has answered and
 * the account is up to date — and pins down what each side promises the other:
 *
 *   1. one decision in becomes one order out: a key derived from the signal, an
 *      id derived from that key (kind = intent), a venue id, a fill and a
 *      position, with one announced `order` per change of state and nothing else;
 *   2. what the layer cannot act on is never swallowed: a refusal is announced as
 *      `order_blocked` naming the code and the rule, while `duplicate` /
 *      `not-an-order` / `not-a-signal` are counted and quiet;
 *   3. the ceilings are checked before the venue is ever called, a `close` is
 *      never blocked by any of them, and a halt is not a cage;
 *   4. the same decision twice is the same order — the account's key and the
 *      venue's id both refuse to place a second one;
 *   5. an order's life is followed to the end (partial → filled) and a canceled
 *      order is final: a fill after it is refused, never repaired;
 *   6. the layer never reads its own output back in: an announced order is
 *      `not-a-signal`, quietly, while `isOrderEntry` still reads its shape.
 *
 * Run: node execution-engine/tests/seam-execution.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const { compileRiskProfile, EXAMPLE } = require(path.join(ROOT, "execution-engine", "risk", "profile.cjs"));
const { createAdapter, VENUE_EVENT } = require(path.join(ROOT, "execution-engine", "adapters", "base-adapter.cjs"));
const { createEngine, QUIET_CODES } = require(path.join(ROOT, "execution-engine", "core", "engine.cjs"));
const { readSignal } = require(path.join(ROOT, "execution-engine", "core", "signal.cjs"));
const { clientOrderId, ORDER_STATUS } = require(path.join(ROOT, "execution-engine", "core", "orders.cjs"));
const { CODES, RULE_ORDER, CLOSE_RULES, OPEN_ONLY_RULES } = require(path.join(ROOT, "execution-engine", "risk", "guardrails.cjs"));
const { createPortfolio } = require(path.join(ROOT, "execution-engine", "risk", "portfolio.cjs"));
const { ORDER_EVENTS, isOrderEntry } = require(path.join(ROOT, "execution-engine", "core", "egress.cjs"));
const { executionEnvelope, executionEntry } = require(path.join(ROOT, "bot-engine", "core", "egress.cjs"));

const CLOCK = 1_700_000_000_000;
const BOT = "btc-breakout";
const SYMBOL = "BTCUSDT";
const EQUITY = 10_000;
const ENTER = { type: "enter", side: "long", size: "units", sizeValue: 0.01 };
const CLOSE = { type: "close", side: "both", size: "none" };

const OPEN_KEY = "btc-breakout:btcusdt:1700000000000:enter:long:units:0.01";
const OPEN_ID = "tb-btc-breakout-btcusdt-1700000000000-open";

let clock = CLOCK;
let checks = 0;

const ok = (cond, msg) => {
    assert.ok(cond, `C1: ${msg}`);
    checks++;
};
const same = (actual, expected, msg) => {
    assert.deepStrictEqual(actual, expected, `C1: ${msg}`);
    checks++;
};

/* ------------------------------------------------------------
 * The rig: the same three pieces the runner wires, with the clock
 * taken from the test so a day can turn over instead of being waited for.
 * ---------------------------------------------------------- */
function planFor({ limits = {}, sizing = {}, allow = { bots: [BOT], symbols: [SYMBOL, "ETHUSDT"] } } = {}, { equity = EQUITY } = {}) {
    const out = compileRiskProfile({
        version: EXAMPLE.version,
        name: "paper-main",
        account: { id: "acc-paper-1", currency: "USDT", equity },
        limits: {
            maxOrderNotional: 2_500, maxPositionNotional: 5_000, maxLeverage: 3, maxOrderRiskPct: 1,
            maxDrawdownPct: 20, maxDailyLossPct: 5, maxOpenPositions: 2, maxOrdersPerMinute: 30,
            minOrderNotional: 10, ...limits
        },
        sizing: { stopPct: 1, quantityStep: 0.001, priceTick: 0.1, ...sizing },
        allow
    }, { now: () => clock });

    if (!out.ok) throw new Error(`the test's own profile was refused: ${JSON.stringify(out.errors)}`);
    return out.plan;
}

/** A decision exactly as bot-engine publishes it: an execution entry wrapping a signal. */
function frame(action, { symbol = SYMBOL, at = clock, price = 60_000, bot = BOT } = {}) {
    const data = { action, at };
    if (price !== null) data.price = price;
    return executionEntry(executionEnvelope({ bot, eventType: "signal", name: bot, symbol, data, timestamp: at }));
}

/** An engine on a paper venue, with a tape so what went out can be read back. */
function rig({ planOptions = {}, portfolio = null, adapter = null } = {}) {
    const plan = planFor(planOptions);
    const events = [];
    const venue = adapter || createAdapter({ name: "paper", market: { stepSize: 0.001, tickSize: 0.1, minNotional: 10 }, now: () => clock });
    const engine = createEngine({ profile: plan, adapter: venue, portfolio, now: () => clock, sink: (entry) => events.push(entry) });
    return { plan, venue, engine, events };
}

/* ------------------------------------------------------------
 * A. one decision, all the way out
 * ---------------------------------------------------------- */
function oneDecisionBecomesAFill() {
    const { engine, venue, events } = rig();
    const placed = engine.handle(frame(ENTER));

    ok(placed.ok === true, "a sized, allowed decision is placed");
    ok(placed.code === null && placed.verdict.rule === null, "…with no code and no rule to blame");
    ok(placed.key === OPEN_KEY, "its identity is the signal: bot:symbol:at:type:side:size:sizeValue");
    ok(placed.at === CLOCK && placed.rolled === false, "and it was judged at the instant the signal carried");
    ok(placed.order.status === ORDER_STATUS.OPEN && placed.order.status === "open", "the order is open");
    ok(placed.order.intent === "open" && placed.order.side === "buy", "an `enter long` is an open, and it buys");
    ok(placed.order.clientOrderId === OPEN_ID, "the id is derived from the key with kind = intent (`open`)");
    ok(placed.order.clientOrderId !== clientOrderId({ bot: BOT, symbol: SYMBOL, at: CLOCK }), "…which is not clientOrderId()'s own default kind");
    ok(placed.order.venueOrderId === "paper-000001", "the venue answered with an id of its own");
    ok(placed.order.venueOrderId !== placed.order.clientOrderId, "…distinct from the client's, so an id is never mistaken for a receipt");
    ok(placed.order.type === "market" && placed.order.timeInForce === "gtc", "market, good till canceled, as the plan defaults");
    ok(placed.order.reduceOnly === false, "an entry never reduces");
    ok(placed.order.units === 0.01 && placed.order.price === 60_000 && placed.order.notional === 600, "0.01 @ 60000 is 600 of notional");
    ok(placed.order.stopPrice === 59400, "the 1% stop the plan asked for is on the order");
    ok(placed.order.filledUnits === 0 && placed.order.averagePrice === null, "nothing is filled yet and no average is invented");
    ok(placed.order.signalAt === CLOCK && placed.order.createdAt === CLOCK && placed.order.updatedAt === CLOCK, "the signal's instant travels with the order");

    /* what the layer said on the wire */
    ok(events.length === 1, "one order, one publication");
    const entry = events[0];
    ok(entry.event === ORDER_EVENTS.ORDER && entry.event === "order", "…an `order` event");
    ok(entry.topic === "execution.btc-breakout.btc.order", "on the bot's own topic");
    ok(entry.channel === "execution:btc-breakout:BTCUSDT:order", "and its channel");
    ok(entry.source === "execution" && entry.market === "execution", "marked as this layer's output, on its own axis");
    ok(entry.exchange === BOT && entry.symbol === SYMBOL && entry.asset === "BTC", "addressed back to the bot that asked");
    ok(entry.clientOrderId === OPEN_ID && entry.status === "open", "carrying the id and the new state");
    ok(!("payload" in entry), "the entry has no payload of its own — it lives inside the envelope");
    ok(entry.envelope.meta.sourceType === "execution", "the envelope says execution, which is why this layer never reads it back");
    ok(entry.envelope.meta.provenance.origin === "execution-engine", "with the engine as origin");
    ok(entry.envelope.meta.provenance.bot === BOT && entry.envelope.meta.provenance.decision === OPEN_KEY, "and the decision that produced it");
    ok(entry.envelope.payload.blocked === null && entry.envelope.payload.reason === null, "nothing is blocked and no reason is given");
    ok(entry.envelope.payload.order.units === 0.01 && entry.envelope.payload.notional === 600, "the order travels verbatim in the payload");

    /* the venue's own book */
    ok(venue.orderOf(OPEN_ID) !== null, "the venue holds the order");
    ok(venue.orderOf(OPEN_ID).status === "open" && venue.openOrders().length === 1, "as open, its only one");
    ok(venue.orders().length === 1, "one decision, one order — never two");
    ok(venue.market.stepSize === 0.001 && venue.market.tickSize === 0.1 && venue.market.minNotional === 10, "the market it was given is the market it applies");

    const before = engine.counts();
    ok(before.handled === 1 && before.placed === 1, "handled once, placed once");
    ok(before.blocked === 0 && before.quiet === 0 && before.published === 1 && before.duplicates === 0, "nothing blocked, nothing quiet, one publication");
    same(engine.refusals(), {}, "and nothing to refuse");
    ok(venue.counts().dispatched === 1 && venue.counts().resent === 0, "the venue was called exactly once");
    ok(engine.snapshot().account.openOrderIds.length === 1, "the account mirrors the venue's open book");
    ok(engine.stats().account.equity === EQUITY, "placing an order does not move equity — only a closed trade does");

    /* the fill comes back through the one door */
    const fill = engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: OPEN_ID, filledUnits: 0.01, price: 60_000, fee: 0, at: CLOCK + 1_000 });
    ok(fill.ok === true && fill.reason === "fill", "the venue's fill is accepted");
    ok(fill.order.status === "filled" && fill.order.filledUnits === 0.01, "the order is filled, to the unit");
    ok(fill.fill.units === 0.01 && fill.fill.price === 60_000 && fill.fill.venueOrderId === "paper-000001", "the fill record carries what the venue said");
    ok(fill.applied.ok === true && fill.applied.delta === 0.01, "the account applied it");
    ok(fill.applied.trade.intent === "open" && fill.applied.trade.realized === 0, "a fee-free fill realizes nothing");
    ok(fill.applied.trade.filledUnits === 0.01 && fill.applied.trade.closed === 0, "nothing was closed on the way in");
    ok(fill.applied.position.units === 0.01 && fill.applied.position.side === "long", "and the position is 0.01 long");
    ok(fill.applied.position.averagePrice === 60_000 && fill.applied.position.notional === 600, "at the price it paid");
    ok(fill.announced !== null && fill.announced.status === "filled", "the change of state is announced");

    const position = engine.account.positionOf(BOT, SYMBOL);
    ok(position.units === 0.01 && position.side === "long" && position.averagePrice === 60_000, "the readable position agrees");
    ok(position.stopPrice === 59400 && position.orders.includes(OPEN_ID), "the stop came with the position, which names the order that made it");

    const after = engine.counts();
    ok(after.fills === 1 && after.events === 1 && after.applied === 1, "counted: one fill, one event, one application");
    ok(after.published === 2 && after.placed === 1 && after.blocked === 0 && after.refusedEvents === 0, "two publications, one order, no refusal anywhere");
    ok(engine.account.stats().openOrders === 0, "a filled order is no longer open");
    ok(engine.account.equity() === EQUITY, "and the account is exactly where it started");
    const exposure = engine.account.exposure();
    ok(engine.account.stats().exposure === 600 && exposure.unpriced.length === 0, "with 600 of exposure at the price it paid");
}

/* ------------------------------------------------------------
 * B. the quiet outcomes — counted, never swallowed, never published
 * ---------------------------------------------------------- */
function whatCannotBeActedOnIsQuietButCounted() {
    const { engine, venue, events } = rig();
    const junk = engine.handle({ nope: true });
    const alert = engine.handle(frame({ type: "alert", side: "both", size: "none" }));
    const nothing = engine.handle(null);

    ok(junk.ok === false && junk.code === "not-a-signal", "a frame that is not a decision at all is `not-a-signal`");
    ok(junk.key === null && !junk.order, "…with no identity and no order");
    ok(junk.announced === null && junk.venue === null, "…nothing said on the wire, nothing sent to the venue");
    ok(nothing.ok === false && nothing.code === "not-a-signal", "so is nothing at all");
    ok(alert.ok === false && alert.code === "not-an-order", "an `alert` is a decision this layer cannot act on: `not-an-order`");
    ok(alert.verdict.rule === "action", "…blamed on the action rule, not on the plan");
    ok(alert.announced === null, "…and it is quiet too");

    ok(events.length === 0, "none of the three reached the bus");
    const counts = engine.counts();
    ok(counts.handled === 3 && counts.quiet === 3, "all three were handled and all three were quiet");
    ok(counts.blocked === 0 && counts.published === 0 && counts.placed === 0, "nothing was blocked, published or placed");
    same(engine.refusals(), { "not-a-signal": 2, "not-an-order": 1 }, "each refusal is still counted under its own code");
    ok(QUIET_CODES.includes("duplicate") && QUIET_CODES.includes("not-an-order"), "the quiet codes the layer documents");
    ok(!QUIET_CODES.includes("not-a-signal") && !QUIET_CODES.includes(CODES.NO_PRICE), "a non-decision and a plan refusal are not on that list — the reader and the announce decide");
    const last = engine.stats().lastRefusal;
    ok(last.code === "not-a-signal" && last.where === "quiet" && last.at === CLOCK, "the last refusal records that it was quieted, and when");
    ok(venue.counts().dispatched === 0, "the venue heard nothing");
    ok(engine.account.stats().refused === 1, "the account refused one slot — the alert arrived as a decision, the other two never did");
}

/* ------------------------------------------------------------
 * C. every plan refusal names its code, its rule and the bot it refused
 * ---------------------------------------------------------- */
function everyRefusalIsAnnouncedWithItsRule() {
    const rows = [
        { what: "a bot outside the allow list", entry: () => frame(ENTER, { bot: "eth-dip-buyer" }), code: CODES.BOT_NOT_ALLOWED, rule: "allow-bot" },
        { what: "a market outside the allow list", entry: () => frame(ENTER, { symbol: "SOLUSDT" }), code: CODES.SYMBOL_NOT_ALLOWED, rule: "allow-symbol" },
        { what: "a decision with no price anywhere", entry: () => frame(ENTER, { price: null }), code: CODES.NO_PRICE, rule: "price" },
        { what: "a close with nothing open", entry: () => frame(CLOSE), code: CODES.NO_POSITION, rule: "position" },
        { what: "an entry with no size", entry: () => frame({ type: "enter", side: "long", size: "none" }), code: CODES.NO_SIZE, rule: "sizing" },
        { what: "an exit with nothing to exit", entry: () => frame({ type: "exit", side: "long", size: "units", sizeValue: 0.01 }), code: CODES.NO_POSITION, rule: "position" }
    ];
    const { engine, venue, events } = rig();

    for (const row of rows) {
        const out = engine.handle(row.entry());
        ok(out.ok === false && out.code === row.code, `${row.what} is refused as ${row.code}`);
        ok(out.verdict.rule === row.rule, `${row.what} names the rule that stopped it: ${row.rule}`);
        ok(out.order === null && out.venue === null, `${row.what} builds no order and the venue is never asked`);
        ok(out.announced !== null, `${row.what} is announced, never swallowed`);
        ok(out.announced.event === "order_blocked" && out.announced.status === null, `${row.what} goes out as an order_blocked with no status to report`);
        ok(out.announced.clientOrderId === null, `${row.what} names no order id, because there is no order`);
        const blocked = out.announced.envelope.payload.blocked;
        ok(blocked.code === row.code && blocked.rule === row.rule, `${row.what}: the blocked record carries the code and the rule`);
        ok(typeof blocked.reason === "string" && blocked.reason.length > 0, `${row.what}: and a reason written for a human`);
    }

    ok(events.length === rows.length, "every refusal reached the bus — all six of them");
    ok(events.every((entry) => entry.event === "order_blocked" && entry.status === null), "…each as an order_blocked, none as an order");
    ok(events[0].topic === "execution.eth-dip-buyer.btc.order_blocked", "addressed to the bot that asked");
    ok(events[0].envelope.meta.provenance.bot === "eth-dip-buyer", "even when the bot itself is the problem");
    ok(events[1].channel === "execution:btc-breakout:SOLUSDT:order_blocked", "a refused symbol still names the symbol it was refused on");
    ok(events[2].envelope.payload.order === null, "a refusal carries no order in its payload");

    const counts = engine.counts();
    ok(counts.handled === 6 && counts.blocked === 6 && counts.placed === 0, "six handled, six blocked, none placed");
    ok(counts.published === 6 && counts.quiet === 0 && counts.duplicates === 0, "six published, nothing quiet, nothing deduped");
    same(engine.refusals(), { "bot-not-allowed": 1, "symbol-not-allowed": 1, "no-price": 1, "no-position": 2, "no-size": 1 }, "each refusal counted under its own code");
    ok(engine.stats().lastRefusal.where === "blocked", "the last refusal says it was the plan that stopped it");
    ok(engine.account.stats().refused === 6, "the account refused six decisions, so none can be mistaken for a new one");
    ok(venue.counts().dispatched === 0, "and the venue was never called");
}

/* ------------------------------------------------------------
 * D. the ceilings stop a decision before the venue hears of it
 * ---------------------------------------------------------- */
function theCeilingsStopAnOrderBeforeItIsSent() {
    /* 1. a notional ceiling */
    const big = rig({ planOptions: { limits: { maxOrderNotional: 100 } } });
    const tooBig = big.engine.handle(frame(ENTER));
    ok(tooBig.ok === false && tooBig.code === CODES.MAX_ORDER_NOTIONAL, "600 of notional against a 100 ceiling is refused");
    ok(tooBig.verdict.rule === "max-order-notional", "…by the max-order-notional rule");
    ok(big.venue.counts().dispatched === 0 && big.engine.counts().placed === 0, "…and the venue was never asked");
    ok(big.events.length === 1 && big.events[0].event === "order_blocked", "…only the blocked frame went out");

    /* 2. a per-order risk ceiling, measured off realized equity (0.2 @ 60000 with a 1% stop risks 120 = 1.2%) */
    const risky = rig({ planOptions: { limits: { maxOrderNotional: 50_000, maxPositionNotional: 50_000, maxLeverage: 10, maxOrderRiskPct: 1 } } });
    const overRisk = risky.engine.handle(frame({ type: "enter", side: "long", size: "units", sizeValue: 0.2 }));
    ok(overRisk.ok === false && overRisk.code === CODES.ORDER_RISK, "an order that risks 1.2% of equity against a 1% ceiling is refused");
    ok(overRisk.verdict.rule === "order-risk" && risky.venue.counts().dispatched === 0, "…by the order-risk rule, before the venue");

    /* 3. a leverage ceiling, measured off the exposure the order would leave behind */
    const levered = rig({ planOptions: { limits: { maxOrderNotional: 50_000, maxPositionNotional: 50_000, maxOrderRiskPct: 10, maxLeverage: 2 } } });
    const tooLevered = levered.engine.handle(frame({ type: "enter", side: "long", size: "units", sizeValue: 0.5 }));
    ok(tooLevered.ok === false && tooLevered.code === CODES.LEVERAGE, "30000 of exposure on 10000 of equity is 3× against a 2× ceiling");
    ok(tooLevered.verdict.rule === "leverage" && levered.venue.counts().dispatched === 0, "…by the leverage rule, before the venue");

    /* 4. the venue's floor, kept as the plan's own (0.001 @ 6000 = 6, below the market's 10) */
    const dust = rig();
    const tooSmall = dust.engine.handle(frame({ type: "enter", side: "long", size: "units", sizeValue: 0.001 }, { price: 6_000 }));
    ok(tooSmall.ok === false && tooSmall.code === CODES.MIN_NOTIONAL, "6 of notional is below the market's 10 floor");
    ok(tooSmall.verdict.rule === "min-notional" && dust.venue.counts().dispatched === 0, "…by the min-notional rule, before the venue");

    /* 5. a position ceiling, counted on the account rather than on the plan */
    const occupied = rig({ planOptions: { limits: { maxOpenPositions: 1 } } });
    const eth = occupied.engine.handle(frame(ENTER, { symbol: "ETHUSDT" }));
    ok(eth.ok === true, "the first market opens a position");
    occupied.engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: eth.order.clientOrderId, filledUnits: 0.01, price: 60_000, fee: 0, at: CLOCK + 1_000 });
    ok(occupied.engine.account.stats().positions === 1, "the account now holds one position");
    const second = occupied.engine.handle(frame(ENTER, { symbol: "BTCUSDT" }));
    ok(second.ok === false && second.code === CODES.OPEN_POSITIONS, "a second position against maxOpenPositions 1 is refused");
    ok(second.verdict.rule === "open-positions", "…by the open-positions rule");
    ok(occupied.engine.account.positionOf(BOT, "BTCUSDT") === null, "…and no position was invented on the way to the refusal");
}

/* ------------------------------------------------------------
 * E. a close is never blocked, and a halt is not a cage
 * ---------------------------------------------------------- */
function aCloseIsNeverBlockedAndAHaltIsNotACage() {
    /* One account, two plans: a sane one to open with, a hostile one to close
     * under. The position lives in the account, which is the point. */
    const portfolio = createPortfolio({ plan: planFor(), now: () => clock });
    const opened = rig({ portfolio });
    const entry = opened.engine.handle(frame(ENTER));
    ok(entry.ok === true, "a long is opened on a plan that allows it");
    opened.engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: entry.order.clientOrderId, filledUnits: 0.01, price: 60_000, fee: 0, at: CLOCK + 1_000 });
    ok(portfolio.positionOf(BOT, SYMBOL).units === 0.01, "and it is filled: 0.01 long");

    const hostile = rig({
        portfolio,
        planOptions: {
            limits: {
                maxOrderNotional: 1, maxPositionNotional: 1, maxOrderRiskPct: 0.001, maxLeverage: 0.5,
                maxDailyLossPct: 0.001, maxDrawdownPct: 0.001, maxOpenPositions: 1, maxOrdersPerMinute: 20
            }
        }
    });

    portfolio.halt("daily stop reached", CLOCK + 2_000);
    ok(portfolio.isHalted() === true && portfolio.haltingReason().reason === "daily stop reached", "the account is halted, and says why");

    const halted = hostile.engine.handle(frame(ENTER, { at: CLOCK + 3_000 }));
    ok(halted.ok === false && halted.code === CODES.ACCOUNT_HALTED, "an entry while halted is refused as account-halted");
    ok(halted.verdict.rule === "account-halted" && hostile.venue.counts().dispatched === 0, "…by the halt rule, before any ceiling and before the venue");

    const closed = hostile.engine.handle(frame(CLOSE, { at: CLOCK + 4_000 }));
    ok(closed.ok === true, "a close passes every ceiling an account can set — including a halt");
    same(closed.verdict.rules, CLOSE_RULES, "…because a close walks only the identity, position and price rules");
    ok(OPEN_ONLY_RULES.every((rule) => !closed.verdict.rules.includes(rule)), "…and not one ceiling rule is among them");
    same([...CLOSE_RULES, ...OPEN_ONLY_RULES], RULE_ORDER, "the two lists are the whole pipeline: they partition it, in the order it runs");
    ok(closed.verdict.intent === "close" && closed.order.intent === "close" && closed.order.reduceOnly === true, "the order is a close, and reduce-only");
    ok(closed.order.side === "sell" && closed.order.units === 0.01, "selling exactly what is there");
    const closeId = clientOrderId({ bot: BOT, symbol: SYMBOL, at: CLOCK + 4_000, kind: "close" });
    ok(closed.order.clientOrderId === closeId && closed.order.clientOrderId !== OPEN_ID, "under the close's own id, so it cannot collide with the entry");
    ok(closed.announced !== null && closed.announced.status === "open" && hostile.events.length === 2, "and it is announced like any other order");
    ok(portfolio.isHalted() === true, "the close did not clear the halt — only resume() does");

    portfolio.resume();
    ok(portfolio.isHalted() === false, "resume() clears it");
    const replayed = hostile.engine.handle(frame(ENTER, { at: CLOCK + 3_000 }));
    ok(replayed.ok === false && replayed.code === "duplicate", "the decision refused while halted was remembered: after resume it is a duplicate");
    ok(replayed.announced === null && replayed.verdict.rule === "duplicate", "…quietly, by the duplicate rule");

    const fresh = hostile.engine.handle(frame(ENTER, { at: CLOCK + 5_000 }));
    ok(fresh.ok === false && fresh.code === CODES.MAX_ORDER_NOTIONAL, "a fresh decision is judged on its merits again: no halt, but the ceiling still says no");
    ok(fresh.code !== CODES.ACCOUNT_HALTED, "…so resume() clears the halt and nothing else");
}

/* ------------------------------------------------------------
 * F. the same decision twice is the same order — never two
 * ---------------------------------------------------------- */
function theSameDecisionTwiceIsTheSameOrder() {
    const first = rig();
    const placed = first.engine.handle(frame(ENTER));
    ok(placed.ok === true && first.venue.orders().length === 1, "the first time, the decision becomes one order");

    const again = first.engine.handle(frame(ENTER));
    ok(again.ok === false && again.code === "duplicate", "the same bot, market, instant and action is a duplicate");
    ok(again.verdict.rule === "duplicate" && again.announced === null, "…refused by the duplicate rule, and quietly");
    ok(again.venue === null, "…without the venue being asked a second time");
    ok(first.venue.counts().dispatched === 1 && first.venue.counts().resent === 0, "the venue placed one order and resent nothing");
    ok(first.engine.counts().quiet === 1 && first.engine.counts().published === 1, "one publication, one quiet refusal");
    ok(first.engine.stats().lastRefusal.where === "quiet", "and the refusal is recorded as quiet");
    ok(first.venue.orders().length === 1 && first.venue.orderOf(OPEN_ID).status === "open", "the venue still holds exactly one order, still open");
}

function anOrderTheVenueAlreadyHoldsIsNotSentTwice() {
    const venue = createAdapter({ name: "paper", market: { stepSize: 0.001, tickSize: 0.1, minNotional: 10 }, now: () => clock });
    const first = rig({ adapter: venue });
    const placed = first.engine.handle(frame(ENTER));
    ok(placed.ok === true && venue.orders().length === 1, "an order is placed on the venue");

    /* The second line of defence: the venue itself, handed the id it already holds. */
    const resent = venue.dispatch(venue.orders()[0]);
    ok(resent.ok === true && resent.duplicate === true && resent.reason === "already-dispatched", "a venue already holding the id answers `already-dispatched`");
    ok(resent.order.clientOrderId === OPEN_ID && resent.order.venueOrderId === "paper-000001", "…the order it already has, with the venue id it already gave");
    ok(venue.counts().resent === 1 && venue.counts().dispatched === 1 && venue.orders().length === 1, "…and the wire was not used a second time");

    /* A rebuilt account and engine over the same venue — the order stands, but
     * nothing here remembers placing it. */
    const rebuilt = rig({ adapter: venue });
    const replay = rebuilt.engine.handle(frame(ENTER));
    ok(replay.ok === true && replay.code === null, "a rebuilt account does not call an order the venue already holds a failure");
    ok(replay.reason === "already-dispatched", "…it says what happened");
    ok(replay.venue.duplicate === true && replay.order.clientOrderId === OPEN_ID, "…and names the order the venue kept");
    ok(replay.announced === null, "no second publication: an order that already exists is not announced again");
    ok(rebuilt.engine.counts().duplicates === 1 && rebuilt.engine.counts().placed === 0, "counted as a duplicate, not as a placement");
    ok(rebuilt.engine.stats().lastRefusal.where === "venue", "…and recorded as the venue's refusal");
    ok(rebuilt.engine.account.hasSeen(OPEN_KEY) === true && rebuilt.engine.account.hasSeen(OPEN_ID) === false, "the rebuilt account now knows the decision by its key, not by the order id");
    ok(venue.counts().resent === 2 && venue.orders().length === 1 && rebuilt.events.length === 0, "two resends, still one order, still one decision");
}

/* ------------------------------------------------------------
 * G. an order's life is followed to the end
 * ---------------------------------------------------------- */
function anOrderIsFollowedToTheEnd() {
    const { engine, venue, events } = rig();
    engine.handle(frame(ENTER));

    const half = engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: OPEN_ID, filledUnits: 0.005, price: 60_000, fee: 0.5, at: CLOCK + 1_000 });
    ok(half.ok === true && half.reason === "fill", "a partial fill is accepted");
    ok(half.order.status === ORDER_STATUS.PARTIALLY_FILLED && half.order.status === "partially_filled", "the order is partially filled");
    ok(half.fill.units === 0.005 && half.fill.filledUnits === 0.005 && half.fill.fee === 0.5, "the fill carries the delta, the total and the fee");
    ok(half.order.filledUnits === 0.005 && half.order.averagePrice === 60_000, "0.005 filled at 60000");
    ok(half.applied.position.units === 0.005 && half.applied.position.side === "long", "the position is half open");
    ok(engine.account.stats().fees === 0.5 && engine.account.equity() === EQUITY - 0.5, "a fee is paid the moment it is charged");
    ok(venue.orderOf(OPEN_ID).status === "partially_filled" && venue.openOrders().length === 1, "the venue agrees the order is still alive");

    const rest = engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: OPEN_ID, filledUnits: 0.01, price: 60_100, fee: 0.5, at: CLOCK + 2_000 });
    ok(rest.order.status === "filled" && rest.order.filledUnits === 0.01, "the rest fills the order");
    ok(rest.fill.units === 0.005, "…and the second fill is only the units that were left");
    ok(rest.order.averagePrice === 60_050, "the average is the weighted price of both fills, not the last one");
    ok(engine.account.positionOf(BOT, SYMBOL).averagePrice === 60_050, "the account's position agrees with the order");
    ok(engine.account.stats().fees === 1 && engine.account.stats().fills === 2, "two fills, and the fees they cost");
    ok(engine.account.equity() === EQUITY - 1, "equity is opening + realized − fees, and nothing else");
    ok(engine.counts().fills === 2 && engine.counts().applied === 2, "both fills were applied");
    ok(events.length === 3 && events[1].status === "partially_filled" && events[2].status === "filled", "each change of state went out exactly once");

    const again = engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: OPEN_ID, filledUnits: 0.01, price: 60_100, fee: 0, at: CLOCK + 3_000 });
    ok(again.ok === false && again.reason === "duplicate-fill", "a fill that says nothing new is refused as a duplicate-fill");
    ok(again.applied === null && again.announced === null, "…changing nothing and announcing nothing");
    ok(engine.counts().refusedEvents === 1 && engine.stats().lastRefusal.where === "venue-event", "…and counted as a refused venue event");
    ok(engine.account.positionOf(BOT, SYMBOL).units === 0.01 && engine.account.equity() === EQUITY - 1, "the account did not move");
}

function aFillAfterACancelIsRefusedNotRepaired() {
    const { engine, venue } = rig();
    engine.handle(frame(ENTER));
    engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: OPEN_ID, filledUnits: 0.005, price: 60_000, fee: 0, at: CLOCK + 1_000 });

    const canceled = engine.onVenueEvent({ type: VENUE_EVENT.CANCELED, clientOrderId: OPEN_ID, reason: "canceled by the bot", at: CLOCK + 2_000 });
    ok(canceled.ok === true && canceled.reason === "canceled", "the venue cancels the order");
    ok(canceled.order.status === ORDER_STATUS.CANCELED && canceled.order.status === "canceled", "the order is canceled");
    ok(canceled.order.filledUnits === 0.005, "…keeping what had already filled");
    ok(canceled.announced !== null && canceled.announced.status === "canceled", "…and the cancel is announced");
    ok(venue.orderOf(OPEN_ID).status === "canceled" && venue.openOrders().length === 0, "the venue holds no open order for it");
    ok(venue.counts().canceled === 1, "counted by the venue as a cancel");

    const late = engine.onVenueEvent({ type: VENUE_EVENT.FILL, clientOrderId: OPEN_ID, filledUnits: 0.01, price: 60_000, fee: 0, at: CLOCK + 3_000 });
    ok(late.ok === false && String(late.reason).startsWith("illegal-transition:canceled"), "a fill after a cancel is refused: a canceled order never fills");
    ok(late.applied === null && late.announced === null && late.order !== null, "…nothing is applied, nothing announced, and the order it names is unchanged");
    ok(late.order.status === "canceled" && late.order.filledUnits === 0.005, "…still canceled, still holding only what filled");
    ok(engine.refusals()[`illegal-transition:${ORDER_STATUS.CANCELED}→${ORDER_STATUS.FILLED}`] === 1, "…counted under the transition that was asked for");
    ok(engine.counts().refusedEvents === 1 && engine.counts().fills === 1, "one refused event, one fill ever applied");
    ok(engine.account.positionOf(BOT, SYMBOL).units === 0.005, "the position keeps exactly what filled, and no more");
    ok(venue.counts().ghosts === 0, "the order was never a ghost: the venue knew it all along");
}

/* ------------------------------------------------------------
 * H. this layer never reads its own output back in
 * ---------------------------------------------------------- */
function thisLayerNeverReadsItsOwnOutputBackIn() {
    const { engine, events } = rig();
    engine.handle(frame(ENTER));
    const out = events[0];

    ok(isOrderEntry(out) === true, "the frame this layer published is recognisable as an order event");
    ok(out.envelope.meta.sourceType === "execution" && readSignal(out) === null, "…but an execution frame is not a decision, so it is never read back as a signal");
    const loop = engine.handle(out);
    ok(loop.ok === false && loop.code === "not-a-signal", "…and handing it back in is `not-a-signal`, never an order");
    ok(loop.announced === null && engine.counts().quiet === 1, "…quietly, so a bus that echoes cannot make this layer trade with itself");
    ok(engine.counts().handled === 2 && engine.counts().placed === 1 && events.length === 1, "two entries in, and still one order and one publication");

    const notASignal = executionEnvelope({ bot: BOT, eventType: "news", name: BOT, symbol: SYMBOL, data: { hello: "world" }, timestamp: clock });
    ok(readSignal(notASignal) === null, "a bot frame that is not a `signal` is not a decision either");
    const foreign = engine.handle(notASignal);
    ok(foreign.ok === false && foreign.code === "not-a-signal" && engine.counts().quiet === 2, "…and it is dropped quietly, however it is addressed");
}

/* ------------------------------------------------------------
 * The run
 * ---------------------------------------------------------- */
const SUITES = [
    ["one decision becomes a fill", oneDecisionBecomesAFill],
    ["what cannot be acted on is counted, not swallowed", whatCannotBeActedOnIsQuietButCounted],
    ["every plan refusal is announced with its rule", everyRefusalIsAnnouncedWithItsRule],
    ["the ceilings stop an order before it is sent", theCeilingsStopAnOrderBeforeItIsSent],
    ["a close is never blocked and a halt is not a cage", aCloseIsNeverBlockedAndAHaltIsNotACage],
    ["the same decision twice is the same order", theSameDecisionTwiceIsTheSameOrder],
    ["an order the venue already holds is not sent twice", anOrderTheVenueAlreadyHoldsIsNotSentTwice],
    ["an order is followed to the end", anOrderIsFollowedToTheEnd],
    ["a fill after a cancel is refused, not repaired", aFillAfterACancelIsRefusedNotRepaired],
    ["this layer never reads its own output back in", thisLayerNeverReadsItsOwnOutputBackIn]
];

let failed = 0;

for (const [name, suite] of SUITES) {
    clock = CLOCK;
    const before = checks;

    try {
        suite();
        process.stdout.write(`  ok    ${name}  (${checks - before} checks)\n`);
    } catch (err) {
        failed += 1;
        process.exitCode = 1;
        process.stdout.write(`  FAIL  ${name}\n        ${err && err.message}\n`);
    }
}

if (failed) {
    process.stdout.write(`C1 execution seam: ${failed} of ${SUITES.length} parts failed, ${checks} checks passed\n`);
} else {
    process.stdout.write(`C1 execution seam: ${checks} checks passed\n`);
}

# Execution Engine — from a decision to an order, and back

A strategy says *what it wants to do*; this folder says *whether it may*. It takes one
**decision** off the bus (the `signal` a `bot-engine` publishes), judges it against the
account's plan and its own ledger, hands it to a venue, records what the venue answered,
and announces both outcomes on the same namespace the decision arrived on:

```
bus ──signal──► engine.handle ──► guardrails.review ──► adapter.dispatch ──► portfolio.note ──► bus
                                        │                                                       │
                                        └──► a refusal is announced too (order_blocked)          │
                                                                                                │
venue events ──► engine.onVenueEvent ──► portfolio (fills, marks) ──► account.update ──► bus ────┘
execution.<bot>.<asset>.<event>
```

This layer is a **library, not a service**: nothing here opens a socket, and nothing here
invents a bus. A runner (paper or live) injects the transport — that is the adapter's one
job — and the layer stays testable without a network.

```js
const { createEngine } = require("./execution-engine/core/engine.cjs");
const { compileRiskProfile, EXAMPLE } = require("./execution-engine/risk/profile.cjs");
const { createAdapter } = require("./execution-engine/adapters/base-adapter.cjs");

const plan = compileRiskProfile({ ...EXAMPLE, account: { ...EXAMPLE.account, equity: 10_000 } }).plan;
const venue = createAdapter({ name: "paper", market: { stepSize: 0.001, tickSize: 0.1, minNotional: 10 } });

const engine = createEngine({
    profile: plan,          // a COMPILED plan, not a document
    adapter: venue,         // dispatch + onVenueEvent
    now: () => Date.now(),  // optional; a clock is injected, never read
    sink: (entry) => console.log(entry.topic),
    // bus: [ ...subscribers ], bridge: { sinks }, portfolio: ownAccount
});

engine.handle(busEntry);            // a decision in  → { ok, code, verdict, order, announced, venue }
engine.onVenueEvent(venueEvent);    // the venue back → { ok, reason, applied, fill, announced }
```

`createEngine` throws without a compiled profile and an adapter, and without a live
portfolio it builds its own from the plan's opening equity — **no plan is no trading**.

## Topics

| topic | what it says |
| --- | --- |
| `execution.<bot>.<asset>.order` | an order exists, with the venue's id on it |
| `execution.<bot>.<asset>.order_blocked` | a decision became no order — the code, the rule and the reason |

`<bot>` is the normalised bot id (dashes and underscores kept), `<asset>` is the base asset
of the symbol (`BTCUSDT` → `btc`), and the channel is `execution:<bot>:<symbol>:<event>`
with `market: "execution"`. An order is announced **where the decision was**: same
namespace, same four segments, so a consumer that already routes
`execution.btc-breakout.btc.*` reads orders without learning a second address.

The frame is a collector envelope like every other, with **one difference that matters**:
`meta.sourceType` is `"execution"`, not `"bot"`. `core/signal.cjs` insists on `"bot"`, so
this layer's own output can never be re-read as a fresh decision — the isolation is
enforced by the reader, not by a convention someone has to remember.

Both events carry the **same keys**, so a consumer never has to branch before it can read:

| key | on `order` | on `order_blocked` |
| --- | --- | --- |
| `event`, `at`, `key`, `bot`, `symbol` | the order's | the refused decision's |
| `clientOrderId`, `venueOrderId`, `status`, `units`, `price`, `notional` | the venue's answer | `null` |
| `side`, `intent` | what was sent | what was asked for |
| `order` | the ledger's record | `null` |
| `blocked` | `null` | `{ code, rule, reason }` |
| `reason` | the venue's reason, if any | the rule's reason |

What is announced is **the ledger's view, not the venue's answer**: the payload is built
from `core/orders.cjs`'s `ORDER_FIELDS`, so a consumer reads one shape whether the venue
said `accepted`, `NEW` or `PARTIALLY_FILLED`. A venue's status word never reaches the bus.

## The plan — an account states its own ceilings

`risk/profile.cjs` compiles one document into one frozen plan. A document holds `version`,
`name`, `account`, `limits`, `sizing` and `allow` — nothing else; an unknown field is
refused, because a typo in a limit is a limit that never applies.

```js
const { compileRiskProfile, EXAMPLE } = require("./execution-engine/risk/profile.cjs");

const out = compileRiskProfile({
    version: "execution-engine/1",
    name: "paper-main",
    account: { id: "acc-paper-1", currency: "USDT", equity: 10_000 },
    limits: {
        maxOrderNotional: 2500,      // required — no limit is no trading
        maxLeverage: 3,              // required
        maxDrawdownPct: 20,          // required
        maxOrderRiskPct: 1, maxPositionNotional: 5000, maxDailyLossPct: 5,
        maxOpenPositions: 2, maxOrdersPerMinute: 30, minOrderNotional: 10
    },
    sizing: { stopPct: 1, quantityStep: 0.001, priceTick: 0.1 },
    allow: { bots: ["btc-breakout"], symbols: ["BTCUSDT", "ETHUSDT"] }
});

out.ok;      // false → out.errors: every reason, in the order they were found
out.plan;    // the frozen plan, including every default it applied
```

Two rules shape it:

* **A missing ceiling is a bug, not \"unlimited\".** `maxOrderNotional`, `maxLeverage` and
  `maxDrawdownPct` must be stated by the document; everything else falls back to a
  conservative default (`maxOrderRiskPct: 2`, `maxDailyLossPct: 5`, `maxOpenPositions: 1`,
  `maxOrdersPerMinute: 20`, `stopPct: 1`) which is written into the plan, so what a plan
  holds is what it enforced.
* **The strategy says how much it may lose, the account says how far the stop goes.**
  `sizing.stopPct` is the account's standing stop distance: `size: "risk_pct"` becomes
  units *through it*, which is what makes \"risk 1%\" a measurable number.

## The pipeline — one fixed order, one rule per refusal

`risk/guardrails.cjs`'s `review()` is pure: it reads the signal, the plan, the account and
the venue's mark, and answers either the approved shape (`units`, `price`, `stopPrice`, the
ceilings it passed) or the **first** rule that refused it, by name. Rules run cheapest and
most decisive first — a frame that is not an order is refused before a price is looked for,
a duplicate before a size is computed, a rate limit before a stop:

| # | rule | refuses when | entry only? |
| --- | --- | --- | --- |
| 1 | `action` | the action is not one this layer places (`alert`), or the decision carries no instant (`no-time`) | runs for a close |
| 2 | `allow-bot` | the bot is not on the plan's allow list | entry only |
| 3 | `allow-symbol` | the canonical symbol is not on the allow list | entry only |
| 4 | `account-halted` | the account is halted — `resume()` clears it, never a new signal | entry only |
| 5 | `duplicate` | this decision was already handled (`dedupeKeyOf`: bot, market, instant, action) | runs for a close |
| 6 | `rate-limit` | `maxOrdersPerMinute` (rolling window) or `maxOrdersPerDay` is reached | runs for a close |
| 7 | `position` | a close with nothing open (`no-position`), or a close that names the wrong side (`position-mismatch`) | runs for a close |
| 8 | `price` | no price at all: the signal carried none, the account holds no fresh mark (≤ 5 minutes), the venue answered none | runs for a close |
| 9 | `equity` | realized equity is not positive | entry only |
| 10 | `daily-loss` | today's loss has reached `maxDailyLossPct` of equity | entry only |
| 11 | `drawdown` | equity is `maxDrawdownPct` below its peak | entry only |
| 12 | `sizing` | the size produced no units, or is above `maxOrderUnits` | entry only |
| 13 | `stop` | a stop distance cannot be computed for the entry | entry only |
| 14 | `min-notional` | an order below `max(plan.minOrderNotional, market.minNotional)` | entry only |
| 15 | `max-order-notional` | an order above `maxOrderNotional` | entry only |
| 16 | `order-risk` | the order risks more than `maxOrderRiskPct` of equity if stopped | entry only |
| 17 | `position-notional` | the position after the fill would exceed `maxPositionNotional` | entry only |
| 18 | `leverage` | exposure after ÷ equity above `maxLeverage` — or an open position with no price at all, because leverage that cannot be measured is refused rather than guessed | entry only |
| 19 | `open-positions` | `maxOpenPositions` are already open and this symbol is not among them | entry only |

## The wire back in — `onVenueEvent`, the one door

| venue event | what happens |
| --- | --- |
| `fill` | `account.applyFill(...)` + `account.mark(...)` + `account.update(order)` → announce `order` |
| `accepted`, `rejected`, `canceled`, `expired` | `account.update(order)` → announce `order` |
| `mark` | `account.mark(symbol, price, at)`, counted — nothing to announce |
| the venue repeating itself | `account.update(order)` — not announced, because nothing changed |
| refused by the adapter | counted in `counts.refusedEvents` and `refusals[reason]` — **never announced, never silently dropped** |

The adapter is the only file that knows what a venue is, and it is **network-free**: the
transport is injected. It refuses with a reason, never with a throw:
`not-an-order`, `no-size-after-rounding`, `below-min-notional`, `unknown-event`,
`no-client-order-id`, `unknown-order`, `venue-order-mismatch`, `no-fill-units`,
`no-fill-price`, `duplicate-fill`, `overfill`, `no-mark`.

`venue.counts()` reads `{ dispatched, resent, refused, events, applied, rejected, canceled,
fills, ghosts, marks }`. A **ghost** is a venue event for a `clientOrderId` the venue never
dispatched — counted, never applied.

`engine.counts()` reads `{ handled, placed, blocked, quiet, published, events, applied,
refusedEvents, duplicates, fills, marks }`, `engine.refusals()` counts every refusal by
code, and `engine.stats()` adds `lastRefusal: { code, where, at }`, where `where` is one of
`blocked` | `quiet` | `venue` | `venue-event`. `engine.snapshot()` is the same picture for a
dashboard: the plan's account, the venue's own snapshot, the account's (`equity`, `exposure`,
`positions`, `openOrderIds`, `counts`, `halted`) and the counters above.

## Files

```
core/orders.cjs          the vocabulary: sides, types, statuses, transitions, the ids, the maths
core/signal.cjs          what this layer READS: readSignal, priceOf, PRICE_PATHS
core/egress.cjs          what this layer WRITES: order / order_blocked, topics, channels, the bridge
core/engine.cjs          the conductor: createEngine, QUIET_CODES — the ORDER of the steps, nothing else
risk/profile.cjs         the plan: the compiler, the defaults, isRiskProfile
risk/guardrails.cjs      the policy: review, RULE_ORDER, CODES, CLOSE_RULES
risk/portfolio.cjs       the account, mirrored: positions, orders, marks, equity, the halt
adapters/base-adapter.cjs  the venue contract (paper adapter; transport injected)
tests/seam-execution.test.cjs  C1 — one decision, end to end
tests/run-all.cjs        every test file, one process each
```

## Guarantees worth knowing

* **A close is never blocked.** A close (`close`, `exit long/short/both`) is reduce-only, so
  no ceiling that exists to stop the account *taking* risk may trap a position — not the
  allow lists, not a halt, not a drawdown, not a notional cap, not the open-position count.
  A halt must never be a cage. What a close still needs is its own identity, something real
  to close, and a price.
* **Equity is realized.** Equity, drawdown and sizing count the opening balance and closed
  trades, never a mark; `peakEquity` never moves down. An open winner is not buying power.
* **A refusal is never swallowed.** It is announced as `order_blocked` with the code, the
  rule and the reason. The only quiet outcomes are `duplicate` and `not-an-order`
  (`QUIET_CODES`), plus `not-a-signal` for a frame that was never a decision — and even
  those are counted per code and readable in `stats()`.
* **One signal, one id.** `dedupeKeyOf` is the identity (`bot:symbol:at:type:side:size:sizeValue`)
  and `clientOrderId` is derived from it — never from a counter. The engine names orders
  `…-open` / `…-close`, so the entry and the close of the same decision cannot collide.
* **The same decision twice is the same order.** The engine refuses the replay before the
  venue is asked; if the venue is asked anyway it answers `already-dispatched`, and a rebuilt
  account keeps the order current without placing or announcing it a second time.
* **An order is followed to the end.** A partial fill keeps the order alive; the average
  price is weighted across fills; fees hit equity when they are charged; a duplicate fill is
  refused rather than counted twice; a fill that arrives after a cancel is an illegal
  transition and is refused, not repaired.
* **This layer never reads its own output.** `meta.sourceType` is `"execution"`, and
  `readSignal` insists on `"bot"`, so an order handed back in is `not-a-signal` — quietly.
* **Canonicalisation happens before the rules**: `BTCUSDT`, `BTC-USDT` and `BTC-USDT-SWAP`
  are one market and one allow-list entry.

## Tests

```bash
node execution-engine/tests/run-all.cjs          # every file
node execution-engine/tests/run-all.cjs seam     # only matching names
```

```
C1 seam-execution   one decision, end to end — 224 checks
                    A  a decision becomes a fill (identity, order, announcement, accounting)
                    B  what cannot be acted on is counted, not swallowed
                    C  every plan refusal is announced with its rule and its code
                    D  the ceilings stop an order before it is sent (and leave the venue untouched)
                    E  a close is never blocked and a halt is not a cage
                    F  the same decision twice is the same order / the venue's own duplicate answer
                    G  an order followed to the end — partial fill, fees, a fill after a cancel
                    H  this layer never reads its own output back in
```

Both runners cap the machine the way the analytics engine does: `TEST_HEAP_MB` (default
512) and `TEST_OUT_LINES` (default 60, `0` for all). The two baselines that must stay green:

```bash
node analytics-engine/tests/run-all.cjs    # 14/14 files
node bot-canvas/tests/run-all.cjs          # 1/1 files
```


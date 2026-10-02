# HANDOFF — Execution Engine (Phase 4)

> Single handoff doc for the execution layer, the same way `collector/macro/HANDOFF.md`
> is the single source of truth for the macro backend.
> Companion: `execution-engine/README.md` (public surface + topic reference) — **not written yet**, see §7.
>
> **Purpose:** any new chat must be able to resume Phase 4 from THIS FILE ALONE,
> without reading the previous conversation. Keep it current; it is the state.

## خلاصهٔ فارسی (شروع سریع)

این لایه «فاز ۴» است: یک *تصمیم* (signal) از `bot-engine` می‌گیرد، با
`risk/guardrails.cjs` می‌سنجد، به venue می‌دهد، حساب را به‌روز می‌کند و نتیجه را
به‌صورت `order` یا `order_blocked` روی همان namespace اعلام می‌کند.

- **انجام‌شده:** همهٔ ماژول‌های `execution-engine/**` نوشته و syntax-check شده‌اند.
- **باسلاین سبز (نباید خراب شود):** `analytics` ۱۴/۱۴، `bot-canvas` ۱/۱.
- **باقی‌مانده:** (۱) اجرای probe و هم‌راستاکردن smoke با شکل واقعی داده،
  (۲) تست دائمی `tests/seam-execution.test.cjs` (شناسهٔ **C1**) + `tests/run-all.cjs`،
  (۳) `README.md`، (۴) اجرای suiteها و commit.

## 0. Environment first — BEFORE running anything

The terminal on this box is half-broken; read this or you will lose an hour.

- **Shell integration is dead.** `VSCODE_SHELL_INTEGRATION` is unset, there are duplicate
  `command-shell` processes and stray `sleep 180` waiters. Consequences:
  - a command **does** execute, but the tool cannot observe completion and often reports
    a fake `exit 1`. The **live terminal buffer** is the only reliable output channel.
  - a **new foreground command closes the terminal** the previous one runs in, killing it.
- **Therefore: run long work in the background and read a file, never stdout.**

  ```bash
  cd /home/mohsen/TraderBOT && nohup node /tmp/enprobe.cjs > /tmp/pp.txt 2>&1 & echo PROBE_STARTED
  # …then read /tmp/pp.txt with the file-reading tool, never `cat` it into the terminal.
  ```
- **This box has ~3.9 GB RAM** and the editor's extension host — the process that owns the
  chat — dies with `Reached heap limit` the moment anything heavy runs. Keep output small.
  Both runners already cap this: `TEST_HEAP_MB` (default 512), `TEST_OUT_LINES` (default 60).
- **Heal the terminal** (do this once per session):
  ```bash
  pkill -f 'sleep 180'
  # then: VS Code → "Developer: Reload Window", or "Terminal: Kill All Terminals"
  echo ok          # health check: you should see `ok` in the terminal buffer
  ```

## 1. Status — what exists (Phase 4)

| File | Role |
| --- | --- |
| `core/orders.cjs` | The vocabulary: `ORDER_SIDE/TYPE/STATUS/TIME_IN_FORCE`, `INTENT`, `TRANSITIONS`, `LIMITS`, `slug`, `dedupeKeyOf`, `clientOrderId`, `intentOf`, `isOrderAction`, `floorTo/roundTo/notionalOf/leverageOf/marginFor`, `stopPriceOf`, `unitsFor`, `buildOrder`, `validateOrder`, `isOpen`, `isTerminal`, `transition` |
| `core/signal.cjs` | What the layer READS: `readSignal`, `isSignalEntry`, `priceOf`, `envelopeOf`, `PRICE_PATHS` |
| `core/egress.cjs` | What the layer WRITES: `ORDER_EVENTS`, `orderEnvelope`, `topicForEnvelope`, `orderPayload`, `pickOrder`, `orderChannel`, `orderEntry`, `isOrderEntry`, `createOrderBridge` |
| `core/engine.cjs` | The conductor: `createEngine`, `QUIET_CODES` |
| `risk/profile.cjs` | The plan: the compiler + `isRiskProfile` (see its own export block) |
| `risk/guardrails.cjs` | The policy: `review`, `CODES` — every ceiling and every size lives here |
| `risk/portfolio.cjs` | The account, mirrored: `createPortfolio` |
| `adapters/base-adapter.cjs` | The venue contract; **network-free** — the transport is injected |

All of the above are syntax-checked. Green baselines measured before any Phase-4 test work:

```bash
node analytics-engine/tests/run-all.cjs seam     # 14/14 files
node bot-canvas/tests/run-all.cjs               # 1/1 files
```

There is **no execution-engine test suite yet** — that is §7.2.

## 2. One decision, end to end

```
rollDay → review → dispatch → portfolio.note → publish
              │
              └─► a refusal is announced too (order_blocked)
```

`engine.cjs` owns the ORDER of the steps and nothing else. It does not judge
(`risk/guardrails.cjs` does) and it does not swallow a refusal (it announces
`order_blocked` with the rule that stopped it). The only silent outcomes are the
**quiet codes** — `duplicate`, `not-an-order` and `not-a-signal` — which are still
counted per code in `refusals()`; their first handling is already the record.

The wire back in is the mirror image: `onVenueEvent` is the one door.

| venue event | what happens |
| --- | --- |
| refused by the adapter | `counts.refusedEvents += 1`, `refusals[reason]`, **no announce** |
| a mark | `account.mark(symbol, price, at)`, `counts.marks += 1`, no announce |
| a fill | `account.applyFill(...)`, `account.mark(...)`, `account.update(order)`, `counts.fills += 1`, announce `order` |
| accepted / rejected / canceled / expired | `account.update(order)`, announce `order` |
| `"confirmed"` (venue repeating itself) | `account.update(order)`, **not announced** — nothing changed |

## 3. Public surface (verified against source)

```js
const engine = createEngine({ profile, adapter, portfolio, bridge, bus, sink, sinks,
                              now, orderType, timeInForce });   // all but the first two optional
```

- `profile` must be a compiled plan (`isRiskProfile`), `adapter` must expose
  `dispatch` + `onVenueEvent`, and a live portfolio (`equity()`); otherwise
  `createEngine` throws ("no plan is no trading").
- Returns a frozen `{ profile, adapter, account, portfolio /* = account */, judge,
  handle, onVenueEvent, counts, refusals, stats, snapshot }` — `counts()`,
  `refusals()`, `stats()`, `snapshot()` are **functions**.
- `counts()` keys: `handled, placed, blocked, quiet, published, events, applied,
  refusedEvents, duplicates, fills, marks`.
- `judge(entry, {at})` → `{ ok, code, reason, key, at, rolled, signal, verdict, order }`
  (writes nothing but the day boundary).
- `handle(entry, {at})` → judged + `{ announced, venue }`, with these four branches:

| branch | result |
| --- | --- |
| not a decision | `code: "not-a-signal"`, quiet (announced `null`) |
| refused by the plan | `code: verdict.code`, announced unless `QUIET_CODES` |
| refused by the venue | `ok: false`, `code: placed.reason`, `verdict.rule = "venue"`, `counts.blocked += 1` |
| the venue already holds the id | `reason: "already-dispatched"`, `announced: null`, `account.update` + `account.markSeen`, `counts.duplicates += 1` |
| allowed | `account.note(order, {key, at})`, announce `order`, `counts.placed += 1` |

`QUIET_CODES = ["duplicate", "not-an-order"]` — `not-a-signal` is quiet too, but it is
tested separately in `engine.cjs` (`judged.code === "not-a-signal" || QUIET_CODES.includes(...)`,
line ~278), so a non-decision never waits on the wire either.

## 4. Vocabulary (verified — do not re-guess)

- `INTENT = { OPEN: "open", CLOSE: "close" }`.
- `ORDER_STATUS = { new, open, partially_filled, filled, canceled, rejected, expired }`;
  `TRANSITIONS` is the only place a move is allowed, and
  `transition(order, to, patch)` → `{ ok, order, reason }` (refuses, never repairs:
  a fill after a cancel is *refused*, not applied).
- Actions (`bot-engine/core/dsl-schema.cjs`): `["enter", "exit", "close", "alert"]`,
  sides `["long", "short", "both", "flat"]`, sizes `["none", "risk_pct", "units"]`.
  `intentOf(action)`:

  | action | intent / side |
  | --- | --- |
  | `enter` + `long` | `open` / `buy` |
  | `enter` + `short` | `open` / `sell` |
  | `exit` + `long` | `close` / `sell` |
  | `exit` + `short` | `close` / `buy` |
  | `exit` + `both` | `close` / `both` (`both: true`) |
  | `close` | `close` / `both` (`both: true`) |
  | `alert` | `null` — a signal, not an order |

- `dedupeKeyOf(signal)` = `` `${bot}:${symbol}:${at}:${type}:${side}:${size}:${sizeValue}` ``
  (raw values, **not** slugged — `no-time` / `no-action` / `flat` / `none` / `no-value`
  stand in for what the signal did not carry).
- `clientOrderId({bot, symbol, at, kind})` = `tb-<slug bot>-<slug symbol>-<at>-<kind>`;
  `kind` **defaults to `"entry"`** (`tb-btc-breakout-btcusdt-1000-entry`). The engine does
  not use that default: it stamps the order's **intent**, so an order placed from an
  `enter` signal carries `...-open` and one from `exit`/`close` carries `...-close`
  (probe A: `id = tb-btc-breakout-btcusdt-1700000000000-open`, while
  `clientOrderId({bot,symbol,at})` still answers `...-entry`).
- `risk/guardrails.cjs` `CODES` begins `NO_PROFILE: "no-profile"`, `NO_ACCOUNT: "no-account"`,
  … and `NOT_AN_ORDER: "not-an-order"`. **Read the `CODES` object before asserting on a
  specific code** — it is the authority, not this list.
- `adapters/base-adapter.cjs` reasons seen so far: `already-dispatched` (a duplicate
  dispatch), `confirmed` (the venue repeating a status), `mark`.

## 5. The read side — a minimal decision fixture

```js
{
  meta: {
    sourceType: "bot", eventType: "signal", symbol: "BTCUSDT", exchange: "binance",
    timestamp: 1700000000000, provenance: { bot: "btcbreakout" }
  },
  payload: {
    action: { type: "enter", side: "long", size: "risk_pct", sizeValue: 1 },
    price: 100, at: 1700000000000
  }
}
```

`readSignal` accepts this bare envelope, a bus entry wrapping it, or a
`{ payload: { envelope } }` wrapper — all three are read the same way. It requires:
`meta.sourceType === "bot"` **and** `meta.eventType === "signal"`; a bot (from the
entry's `bot` or `meta.provenance.bot`); a symbol (from the entry's `symbol` or
`meta.symbol`); an `action.type`; an instant (`payload.at` or `meta.timestamp`).
The price is found in `payload.price` → `meta.price` → the freshest metric whose
last path segment is in `PRICE_PATHS`, and the answer says which via `priceSource`.

**Namespace isolation (the seam that matters):** this layer's own output is an
`orderEntry` with keys
`{ event, market, bot, exchange, symbol, asset, clientOrderId, status, order, topic, source, envelope, channel }`
— note there is **no `payload` key** (the payload lives in `envelope.payload`).
`readSignal(orderEntry)` is `null` because `meta.sourceType` is `"execution"`, so
feeding an order back in yields `handle(...).code === "not-a-signal"`, quietly.

## 6. Test conventions — mirror, do not invent

- `execution-engine/tests/seam-execution.test.cjs` — id **C1**; prints exactly
  `C1 execution seam: ${checks} checks passed`; a failing check must set
  `process.exitCode = 1` (that, not a crash, is what "the program exits during the run" means).
- `execution-engine/tests/run-all.cjs` — a copy of the shape of
  `analytics-engine/tests/run-all.cjs`: `spawnSync` one child per `*.test.cjs`,
  `--max-old-space-size=${TEST_HEAP_MB}` (512), output clipped to `TEST_OUT_LINES`
  (60), extra argv = name filters, `process.exit(failed.length ? 1 : 0)`.
- Keep the two baselines green: `node analytics-engine/tests/run-all.cjs seam` (14/14),
  `node bot-canvas/tests/run-all.cjs` (1/1).

## 7. Remaining work (ordered)

1. Run the probe and align the scratch smoke with the REAL shapes:
   ```bash
   cd /home/mohsen/TraderBOT && nohup node /tmp/enprobe.cjs > /tmp/pp.txt 2>&1 &
   ```
   then read `/tmp/pp.txt`. Facts the probe already settled (see §10): the order id is
   **`...-open`**, not `...-entry` (the `-entry` comes only from `clientOrderId()`'s
   default `kind`); an `orderEntry` has **no `payload` key** (the payload sits inside
   `envelope.payload`); and `venue.counts()` is
   `{ dispatched, resent, refused, events, applied, rejected, canceled, fills, ghosts, marks }`.
   `/tmp/enprobe.cjs` itself had a bug in section H — it asked for a profile with
   `maxOpenPositions: 0` and empty `allow` lists, which the compiler refuses
   (`positive: true`, list length 1..128). Fixed in place; re-run writes `/tmp/pp2.txt`.
2. `execution-engine/tests/seam-execution.test.cjs` (C1) + `execution-engine/tests/run-all.cjs`.
3. `execution-engine/README.md` — the topic reference and the run commands, in the
   style of `analytics-engine/README.md`.
4. Run both suites; confirm the egress smoke reaches `ESMOKE PASS`.
5. Commit (`execution-engine/**` plus this file).

## 8. Golden rules — never break these

- **`close` / `exit` is never blocked.** An exit must always be able to leave a position.
- **Equity is realized.** Equity, drawdown and sizing use closed trades only; an open
  winner is not buying power. `peakEquity` never moves down.
- **A refusal is never swallowed.** It is announced as `order_blocked` with the rule
  that stopped it; only `duplicate` / `not-an-order` / `not-a-signal` are quiet, and
  even they are counted.
- **Do not edit phase-2 `bot-engine/topics.cjs`** — it is the shared address book.
- **The adapter stays network-free**; the transport is injected.
- **One signal, one id**: `dedupeKeyOf` is the identity, `clientOrderId` is derived
  from it — never from a counter.

## 9. Scratch files (outside the repo, safe to lose)

| Path | What it is |
| --- | --- |
| `/tmp/enprobe.cjs` | the probe (sections A–J: order lifecycle, refusals, ceilings, replay, cancel-final, close-never-blocked, rollover, namespace isolation) |
| `/tmp/pp.txt`, `/tmp/pp2.txt` | the probe's output — run 1 (A–G, then the section-H crash) and run 2 (clean, A–J, ends at `done`); read these, never re-derive by guessing |
| `/tmp/ensmoke.cjs` | the scratch smoke harness — real assertions belong in `tests/seam-execution.test.cjs` |

## 10. Probe results — the shapes to assert (real output, 2026-10-02)

Run 1: `/tmp/pp.txt` (sections A–G, then the section-H crash). Run 2 (after the fix):
`/tmp/pp2.txt`. Section labels in the probe: A one decision end to end, B quiet vs
announced, C allow/price/position/size refusals, D ceilings, E replay, F fill life,
G cancel is final, H close is never blocked, I day rollover, J namespace isolation.

**A — one decision, all the way out.** `handle(enter long, units 0.01, @60000, equity 10000)`:

- key `` btc-breakout:btcusdt:1700000000000:enter:long:units:0.01 ``
- id `tb-btc-breakout-btcusdt-1700000000000-open` (kind = intent `open`)
- order: status `open`, side `buy`, intent `open`, type `market`, timeInForce `gtc`,
  reduceOnly `false`, units `0.01`, price `60000`, stopPrice `59400` (`stopPct` 1%),
  notional `600`, venueOrderId `paper-000001`
- the announced entry: `event "order"`, `topic execution.btc-breakout.btc.order`,
  `channel execution:btc-breakout:BTCUSDT:order`, `source`/`market` `execution`,
  `exchange btc-breakout`, `symbol BTCUSDT`, `asset BTC`, and the 13 keys named in §5.
  `meta.sourceType` is `"execution"`, `meta.provenance` is
  `{ origin: "execution-engine", stage: "execution-engine", bot, decision: <key> }`.
  `envelope.payload` keys: `["event","at","key","bot","symbol","clientOrderId",
  "venueOrderId","status","side","intent","units","price","notional","order","blocked","reason"]`.
- `Object.keys(engine).sort()` = `["account","adapter","counts","handle","judge",
  "onVenueEvent","portfolio","profile","refusals","snapshot","stats"]`.
- `counts()` after it: `handled 1, placed 1, blocked 0, quiet 0, published 1`,
  the rest 0. `venue.counts()`: `dispatched 1`, the rest 0.

**B — quiet vs announced.** `not-a-signal` (an order/foreign envelope) and
`not-an-order` (an `alert`, `rule: "action"`) are **quiet**: `counts.quiet = 3`,
`published = 0`, nothing on the wire. `refusals()` is a count map **plus a `last`
record**: `{ "not-a-signal": 2, "not-an-order": 1, last: { code, where, at } }`
(`where: "quiet"` for a quiet one); an unused map prints as `{}`.

**C — everyday refusals (announced, `blocked` +1, `published` +1 each).** Every one
lands as an `order_blocked` entry whose `envelope.payload.blocked` is
`{ code, rule, reason }`:

| code | rule |
| --- | --- |
| `bot-not-allowed` | `allow-bot` |
| `symbol-not-allowed` | `allow-symbol` |
| `no-price` | `price` |
| `no-position` | `position` (also for an `exit` with nothing to exit) |
| `no-size` | `sizing` |

**D — ceilings.** `max-order-notional`, `min-notional`, `position-notional`,
`order-risk` (each code == its rule name here). An exactly-at-the-ceiling order is
allowed (`ok: true, units 0.01`); a size that rounds to zero through `quantityStep`
comes back as `no-size` with `units: null`.

**E — replay.** The identical frame again →
`{ ok: false, code: "duplicate", id: null, announced: null }`: no venue call, nothing
published. The same action 30s later is a **new** order
(`...-1700000030000-open`, `venueOrderId paper-000002`) because `at` is part of the key.

**F — a fill's life.** `onVenueEvent(FILL)` → `reason: "fill"`; a partial fill leaves
the order `partially_filled` with `filledUnits 0.004`; the fill record is
`{ clientOrderId, venueOrderId, bot, symbol, side, units, filledUnits, price, fee, at }`;
`applied` is `{ ok, reason, delta, gross, realized, trade, position }` where `trade` is
`{ clientOrderId, bot, symbol, side, intent, delta, filledUnits, price, fee, gross,
realized, closed, flipped, at }` and `position` is
`{ bot, symbol, units, absUnits, side, averagePrice, notional, stopPrice, openedAt,
updatedAt, orders[] }`. Fees and realized PnL count from the first unit
(0.004 @60010 → fee `0.02`, realized `-0.02`).

**G — a canceled order is final.** cancel → `reason: "canceled"`; then a fill is
refused as `illegal-transition:canceled→filled`, an accept as `...→open`, an expiry as
`...→expired`, while a repeated status is `{ ok: true, reason: "confirmed",
announced: null }`. The three refusals land in `counts.refusedEvents` and in
`refusals()` under their full `illegal-transition:<from>→<to>` names: a terminal order
is **refused, never repaired**.

**H — close is never blocked.** The rig's account holds a filled position
`{ bot, symbol, units 0.01, absUnits 0.01, side "long", averagePrice 60000, notional 600,
stopPrice 59400, openedAt/updatedAt 1700000000500, orders: ["<the open id>"] }`. A second
engine is then built on that same account with a profile that locks everything down —
`maxOrderNotional 1`, `maxPositionNotional 1`, `maxLeverage 0.01`, `maxOpenPositions 1`,
so the 600-notional order is 600× over the ceiling:

- the `close` signal is **allowed**: `{ intent "close", side "sell", units 0.01,
  reduceOnly true, status "open" }`, announced with
  `id tb-btc-breakout-btcusdt-1700000000000-close` and `blocked: null`.
- the identical `enter` frame came back `{ ok: false, code: "duplicate", rule: "duplicate" }`:
  **dedupe runs before the ceilings**, and it is quiet. So H proves the close passes a
  hostile profile but does *not* prove a ceiling blocks an entry — for that, C1 must send
  the entry at a **new `at`** (the key includes `at`), e.g. `clock + 1000`, so the refusal
  is `max-order-notional` rather than `duplicate`.

**I — the day boundary.** `rolled` is `false` for two frames 60s apart and `true` for one
86 400 000 ms later; each is a distinct order (`...-1700000000000-open`,
`...-1700000030000-open`, `...-1700086400000000-open`) and all three are placed.
`rolled: true` is the account's UTC day turning over (`dayPnl` resets) — not a refusal.

**J — an order is not a decision.** For the announced order entry: `isOrderEntry === true`,
keys are the 13 of §5, `readSignal(orderEntry) === null`, and
`handle(orderEntry)` → `{ ok: false, code: "not-a-signal" }`, quiet
(`handled 2, placed 1, quiet 1`, `refusals { "not-a-signal": 1 }`). A `bot-engine` envelope
with `eventType: "order"` is *also* `isOrderEntry === true` — that predicate reads the
event/shape, while `readSignal` is what enforces the namespace on the way in.

Run 2 ended with `## done {"exit":0}`: every section, A through J, passes.

## 11. Resume prompt — paste this into a new chat

```text
[RESUME] TraderBOT — Phase 4 (execution-engine). Read these files before anything else:
  1) execution-engine/HANDOFF.md            <- state, remaining work, golden rules, real shapes
  2) analytics-engine/tests/run-all.cjs     <- the runner to mirror
  3) execution-engine/core/engine.cjs, core/egress.cjs, core/signal.cjs, core/orders.cjs,
     risk/profile.cjs, risk/guardrails.cjs, risk/portfolio.cjs, adapters/base-adapter.cjs

Environment: the VS Code shell integration on this box is broken, so an exit code is
unreliable and a new foreground command kills the one before it.
  - run long work in the background:
      cd /home/mohsen/TraderBOT && nohup node /tmp/enprobe.cjs > /tmp/pp3.txt 2>&1 &
  - read the result with the file-reading tool, never by cat-ing it into the terminal
  - big terminal output kills the editor with "Reached heap limit"
    (runners cap it: TEST_HEAP_MB 512, TEST_OUT_LINES 60)
  - health check: pkill -f 'sleep 180'  then  echo ok   (you should see `ok`)

Work from HANDOFF §7: (1) /tmp/pp2.txt is the clean A-J probe output - read it, do not re-derive
shapes; (2) write execution-engine/tests/seam-execution.test.cjs (id C1) and
execution-engine/tests/run-all.cjs; (3) execution-engine/README.md; (4) run the suites
(analytics 14/14 and bot-canvas 1/1 must stay green) and commit — execution-engine/ is
untracked (`?? execution-engine/`).

Rules: close/exit is never blocked; equity/drawdown/sizing are realized-only; a refusal is
never swallowed (only duplicate / not-an-order / not-a-signal are quiet); never edit
bot-engine/topics.cjs; the adapter stays network-free.
```


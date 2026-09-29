# Analytics Engine — from envelopes to topics

Everything the collector publishes (realtime, derivatives, six-market liquidity) travels
on the Realtime event bus as one standard envelope. This folder turns those envelopes
into readings a subscriber can consume without knowing any collector internals:

```
collector envelope ──► Router ──► module call ──► reading ──► egress ──► bus + sinks
analytics.<assetClass>.<asset>.<event>
```

## The path, end to end (seam A6 + A8 + A9 + A10 + A11 + A12)

```bash
# 1. someone publishes envelopes on the bus
node collector/crypto/realtime/server.cjs            # realtime + derivatives
node collector/liquidity_6markets/server.cjs --bus   # the six markets
node collector/crypto/onchain/server.cjs --bus       # the chain + institutions

# 2. the engine consumes them and writes one NDJSON line per reading
node analytics-engine/server.cjs --bus
node analytics-engine/server.cjs --bus --out data/analytics/analytics.ndjson
node analytics-engine/server.cjs --bus --once        # attach, report, exit
```

`analytics-engine/server.cjs` takes the bus from the running realtime service (the same
way `collector/liquidity_6markets/server.cjs` takes it) — it never invents one. Without a
bus it reports the routes and modules it knows and stops, so a misconfiguration is visible
instead of silent.

The engine's own readings travel on that same bus, on their own axis
(`analytics:<assetClass>:<symbol>:<event>`, `market = "analytics"`). They are never fed
back in: `core/egress.cjs` marks every frame as `sourceType: "analytics"` and
`engine.attach()` skips those, so the process can run next to the collectors forever.

## Topics

| topic | what it answers | produced from |
| --- | --- | --- |
| `analytics.<class>.<asset>.cvd` | who is buying/selling (trades) | realtime trades |
| `analytics.<class>.<asset>.orderbook_imbalance` | book pressure | realtime depth |
| `analytics.<class>.<asset>.liquidation_heatmap` | where positions were forced out | liquidation prints |
| `analytics.<class>.<asset>.open_interest` / `.oi_weighted_funding` / `.positioning` | derivatives positioning | derivatives collector |
| `analytics.<class>.<asset>.cross_exchange_spread` / `.funding_carry` | venue dislocations | any priced update |
| `analytics.<class>.<asset>.price_reading` | what the asset is worth, per venue | six-market `ticker` frames |
| `analytics.<class>.<asset>.liquidity_flow` | how liquid it is, and where | six-market `ticker` frames |
| `analytics.<class>.<asset>.candle` | the last bar a venue handed over (one event per bar) | a bar inside a `ticker` frame |
| `analytics.<class>.<asset>.indicators_<timeframe>` | RSI, ATR, the SMA/EMA ladders, MACD, Bollinger and both VWAPs on one closed bar | a venue `candle`, or the bar a six-market `ticker` carries |
| `analytics.<class>.<asset>.price_action_<timeframe>` | the swings, breaks, gaps, order blocks and swept levels on one closed bar, each pointing back at the bar it came from | a venue `candle`, or the bar a six-market `ticker` carries |
| `analytics.<class>.<asset>.macro_correlation_<timeframe>` | how much this series and the macro anchor of its market moved together, over the bars both answered | a venue `candle`, or the bar a six-market `ticker` carries |
| `analytics.<class>.<subject>.relative_strength_<timeframe>` | how the subject did against the benchmark of its own market, over the same shared bars (a comparison, never a share) | a venue `candle`, or the bar a six-market `ticker` carries |
| `analytics.<class>.<asset>.market_leverage_risk` | how much leverage the four measurements that show it can account for — and which of them were missing | `open_interest`, `funding`, `long_short_ratio`, `liquidation` |
| `analytics.<class>.<subject>.onchain_flow` | what an on-chain subject holds, how it moved, which of its signals are present and fresh | the six on-chain events (`exchange_reserves`, `network_metrics`, `whale_transfer`, `stablecoin_supply`, `lending_rate`, `etf_quote`) |

The asset segment is the **base asset** of the symbol the reading carried, never a venue
spelling: `XAUUSD → analytics.commodities.xau.…`, `^GSPC → analytics.indices.spx.…`,
`BTC-USDT-SWAP → analytics.crypto.btc.…`.

An on-chain **subject** is the thing the collector's reading is about, and it can be an
institution rather than a coin: `BTC` and `USDT` are assets, `BINANCE` is a holder and
`IBIT` is a fund — so their topic names the holder/fund, and the coin a fund holds travels
inside the reading (`subject.underlying: "BTC"`). The topic asset is the subject id exactly
as the collector spells it (the engine's frame says so in `provenance.topicAsset`), because
pair arithmetic would read the fund `TETH` as `T/ETH` (`analytics.crypto.t`).

## Modules (nine, one instance each)

| module | holds | answers |
| --- | --- | --- |
| `delta-flow` | trades + books per venue | CVD, pressure |
| `liquidations` | liquidation prints | heatmap |
| `arbitrage` | venue prices + funding | cross-venue spread, funding carry |
| `derivatives` | OI, funding, positioning | per-venue derivative state |
| `liquidity` | the last sample of every venue, per asset | price reading, flow, candles |
| `onchain` | the last answer of every on-chain subject | coverage, gauge, agreement, verbatim report |
| `indicators` | closed bars per (symbol, timeframe) | RSI, ATR, SMA/EMA ladders, MACD, Bollinger, VWAP |
| `price_action` | the same closed bars | swings, breaks, fair-value gaps, order blocks, swept levels |
| `cross_market` | the same closed bars, and the market each series belongs to | macro correlation, relative strength, leverage risk |

### What the on-chain module does, and does not, do

Every arrival becomes one reading (`onchain_flow`) for its subject:

* **`reported`** — the collector's own numbers, verbatim, with the provider and the scope
  it labelled them with (`scope`, `provider`, `at`, `ageMs`).
* **`gauge`** — the subject's headline number for this event type (`reservesUsd`,
  `circulatingUsd`, `apyWeightedByTvl`, `price`, `whaleValueBtc`, or the metric's own field),
  plus how it moved since the sighting of the *same provider and the same field* before it:
  `previous`, `previousAt`, `previousRef` (the earlier block hash or metric), `change`,
  `changePct`, `sinceMs`. First sighting → `null`, not 0.
* **`agreement`** — when two providers carry the same gauge (yahoo and nasdaq on one fund)
  they are listed and compared (spread, spread percentage, window, threshold); nothing is
  averaged and no third number is invented. One provider alone → `null`.
* **`coverage`** — `seen` / `missing` / `stale` plus a `sources` entry per event type
  (provider, metric(s), scope, value, age, freshness window). Freshness is measured against
  the collector's documented cadence for that signal (×1.5 = one missed round), so a
  60-second mempool queue and a four-hour lending rate are never judged by one clock.
* **`stale`** — an old signal is *named* stale, never dropped from the coverage.

Nothing is summed: not across subjects, not across sightings. A whale reading stays a
sample (`sampledTransactions`/`blockTransactions`/`coverage`) with the collector's own
`evidence` flags (`direction: false`, `blockComplete`) carried in `evidence.collector` —
the engine adds no direction, no net flow and no estimate. A fund's missing shares
outstanding stays `null` with the collector's `flowReason` next to it.

### What the indicator layer does, and does not, do

One closed bar in (a venue `candle`, or the bar a six-market `ticker` carries), **one reading
per served timeframe** out — `indicators_1m`, `indicators_5m`, … on a topic of their own,
because RSI on 1m and RSI on 1d are two different answers:

* **One ring per (symbol, timeframe)**, bounded (`maxBars`), never rewritten: a bar older
  than the newest is counted (`late`), one already held is counted (`duplicate`) and neither
  is allowed to change a number an earlier reading was computed on.
* **Nothing is read off a half-built bar.** Without the venue's `isClosed` word the module
  settles it against its own clock — the bar's close time — and an unfinished bar is counted
  (`open`), never averaged.
* **Coarser timeframes are built here** when the feed is the base interval (UTC-aligned
  buckets, every source bar accounted for): an aggregated bar says `source: "aggregated"`
  and `builtFrom`, a bucket missing a source bar is dropped and counted (`partial`), never
  padded.
* **A rung the ring cannot fill is `null`**, and a window with no movement has no RSI at all —
  tulind's `NaN` becomes `null`, never a made-up `50`. A bar the venue sent no volume for
  weighs nothing in either VWAP and is counted (`volumeComplete`), so an average never
  pretends to be weighted when it is not.
* **The reading carries its own evidence**: the bar (`openTime`, `closeTime`, OHLCV), the
  periods it was computed with (`params`), the series behind it (`series`: bars, capacity,
  gaps, dropped) and `barAge` — so a consumer can tell a fresh reading from a replayed series
  without trusting its own clock.
* **Publication is edge-triggered**, so there is nothing to throttle: a frame that closed no
  new bar of a timeframe publishes nothing. A frame with no interval word (the realtime
  candle event drops the venue's) is counted `unknownInterval` and publishes nothing — the
  module never imagines a timeframe, which is why the counters, not the engine, are where
  that shows up.

### What the cross-market layer does, and does not, do

The same closed bars, read two series at a time. It answers `macro_correlation_<tf>` (this
series against the macro anchor of its market), `relative_strength_<tf>` (this series against
the benchmark of its market) and `market_leverage_risk` (a composition of the derivatives and
liquidation readings other modules already made):

* **One coefficient, one window.** The two series are aligned by the bar's own open time,
  never by arrival order, and the reading names the first and the last bar it was measured
  over. A move is only read when it is exactly one interval long: a window with a hole in it
  yields no return for the pair that would span the hole (`gaps`), because a two-day move is
  not a daily move.
* **Pairwise-complete.** A bar only one side answered for is dropped and counted (`missing`),
  never carried over from its neighbour and never filled with a zero.
* **Both sides must answer for the newest bar** (`unaligned` otherwise): correlating a fresh
  window against a stale one is the one mistake that looks like a finding.
* **Too few pairs, or a window with no movement, is no coefficient at all**: `null` and a
  counter (`insufficient`, `flat`) — never `0`, which would claim "no relationship" where the
  truth is "no measurement".
* **`relative_strength` is not dominance.** It compares two price series over the same bars; it
  measures no share of anything, and no BTC.D / USDT.D is computed here because no total was
  ever measured. The payload says so itself (`dominance: false`), with the two windows and the
  spread both in percentage points and as a ratio.
* **A market is learned from the frames, never assumed.** Each series keeps the market its
  frame named (`crypto`, `forex`, `commodities`, `indices`, `bonds`, `realestatecredit`) and
  follows that market's anchor chain and benchmark; a frame that named no market — or one this
  layer does not read — is read against the default chain, and the reading names which anchor
  answered. A series seen later under a second market keeps the market it was filed under
  (`remapped` counts the disagreement).
* **`market_leverage_risk` is a composition, and says what it was made of.** Funding (distance
  from zero, either direction), open interest (how fast the position is being built), positioning
  (distance from balance, so 2:1 and 1:2 are the same one-sidedness) and the washout the
  liquidation prints left are each scored between 0 and their weight, full at their threshold and
  empty at zero, never extrapolated past it. The reading carries every part with the value it
  came in as, names `present` and `missing`, and reports `max` — the scale the parts that
  answered could reach. The band is read off `score ÷ max`, so a market judged on two parts is
  never presented as one judged on four; nothing measurable at all is no reading (`unmeasured`).
* **Publication is edge-triggered per reading**: one correlation and one relative reading per
  closed bar of a timeframe, and the leverage state is throttled because four different inputs
  answer the same question.

## Files

```
engine.cjs              the only file that wires router ⇄ modules ⇄ egress
topics.cjs              the topic namespace (analytics.<class>.<asset>.<event>)
core/router.cjs         the routing table: eventType → module method → readings
core/egress.cjs         analytics envelopes, topics, channels, the bus/sink bridge
core/math.cjs           finite/null numeric vocabulary (never NaN, never a fake 0)
modules/*               one module per analytical view (no bus, no envelope)
server.cjs              the runnable consumer (bus in, NDJSON out)
```

## Guarantees worth knowing

* A reading that cannot be computed is not published (`data` resolves to `null`).
* A missing number is `null`, never `0` — a venue with no book has no spread.
* Two measurements are never blended: what a collector measured travels under `reported`,
  what the engine computed from its own samples under `engine` — or, in the on-chain
  reading, under `gauge` / `providers` / `agreement` / `coverage` — with `evidence` flags.
* Throttling is per reading *and per symbol*, so two venues reporting one market in the
  same window share one reading (the next window refreshes it and includes both).
* Canonicalisation happens in the router, so `BTCUSDT`, `BTC-USDT` and `BTC-USDT-SWAP`
  are one bucket and one topic.

## Tests

```bash
node analytics-engine/tests/run-all.cjs          # every file
node analytics-engine/tests/run-all.cjs seam     # only matching names
```

```
A0 symbols   symbol normalisation (base asset, canonical pair)
A1 topics    topic namespace + parsing
A2 egress    analytics envelopes, channels, sinks
A3 router    routing table contract + canonical buckets
A4 engine    ingestion, throttling, publication, feedback guard
A5 seam      derivatives collector → bus → engine
A6 seam      six markets → bus → engine (price_reading / liquidity_flow / candle)
A7 server    the runnable consumer: flags, honest bus resolution, streaming
A8 seam      on-chain collector → bus → engine (onchain_flow, all six events)
A9 seam      bars → bus → engine (indicators_<timeframe>, numbers checked against tulind)
A10 seam     bars → bus → engine (price_action_<timeframe>: swings, breaks, gaps, blocks, sweeps)
A11 seam     order flow + bars in one engine (cvd, pressure, heatmap next to the bar layers)
A12 seam     two series → bus → engine (macro_correlation_<tf>, relative_strength_<tf>, market_leverage_risk)
```

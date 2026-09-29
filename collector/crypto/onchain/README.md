# On-chain & Institutional Flow — `collector/crypto/onchain`

Sub-phase 2.3 of the collector. Where the realtime collector watches venues
and the liquidity collector watches markets, this one watches the **chain
itself and the institutions around it**, and publishes everything on the
`onchain` bus axis with the standard envelope
(`sourceType: "onchain"`, `marketType: null`).

```
onchain:crypto:BTC:network_metrics        mempool depth, block timing, supply
onchain:crypto:BINANCE:exchange_reserves  proof-of-reserves flows, per holder
onchain:crypto:USDT:stablecoin_supply     supply + 1d/1w/1m deltas, per chain
onchain:crypto:USDT:lending_rate          what the dollars are paid to stay
onchain:crypto:IBIT:etf_quote             listed funds, quoted by two providers
```

Every provider here is **key-free**. Nothing in this module needs an API key,
which is why `providerReadiness()` is expected to say "all seven ready".

---

## 1. The four capsules

| capsule | answers | event types | providers |
| --- | --- | --- | --- |
| `whale_tracker` | where the coins are, and what moved | `exchange_reserves`, `whale_transfer`, `network_metrics` | defillama, mempool, blockchain-info |
| `stablecoin_flow` | how many dollars sit on-chain, on which chains | `stablecoin_supply` | defillama-stablecoins |
| `lending_rates` | what those dollars are paid to sit | `lending_rate` | defillama-yields |
| `institutional_flow` | the listed funds that hold the asset | `etf_quote` | yahoo, nasdaq |

One capsule owns one answer: a task belongs to exactly one capsule, so a
single provider answer can never become two contradictory readings.

## 2. The seven providers

| provider | endpoint | cadence | what it answers with |
| --- | --- | --- | --- |
| `defillama` | `/cexs` | 10 min | 88 exchanges: `currentTvl`, `cleanAssetsTvl`, `inflows_24h/1w/1m` |
| `defillama-stablecoins` | `/stablecoins` | 15 min | 427 pegged assets: supply + `circulatingPrevDay/Week/Month` + per-chain split |
| `defillama-yields` | `/pools` | 4 h | 17,153 pools, 11.8 MB — only `stablecoin: true` rows are kept |
| `mempool` | `/api/mempool`, `/api/v1/blocks`, `/api/block/<hash>/txs` | 60 s / 60 s / on demand | queue depth, fee floor–ceiling, block list, a block's transfers |
| `blockchain-info` | `/charts/total-bitcoins`, `/charts/estimated-transaction-volume-usd` | 15 min | daily series (BTC in circulation, USD value moved) |
| `yahoo` | `/v8/finance/chart/<FUND>` | 5 min | daily bar, previous close, volume, `instrumentType` |
| `nasdaq` | `/api/quote/<FUND>/info` | 15 min | last sale, day change, listing venue, company name |

Two clocks are kept apart, and this is deliberate:

- `scheduleMs` — how often **we ask** (a task-level decision, declared by
  the capsule that owns the task)
- `cadenceMs` — how long an **answer stays meaningful** (a property of the
  data: a fund's daily volume is a daily fact)

The polling loop (`core/orchestrator.cjs`) then runs one *poll*: every task
whose own schedule has elapsed, grouped by provider (one provider is never
asked twice at once, because `maxRps` belongs to the provider), followed by
the on-demand work the answers revealed.

### On-demand work is discovered, never guessed

`mempool/blocks` names blocks; each block that has not been scanned becomes
an on-demand task (`scheduleMs: 0`, `onDemand: true`) for
`mempool/block-transactions/<hash>`. Those run inside the same poll, bounded
by `maxFollowUps` (8), and are never due on their own. A block is scanned
once — a transfer that happened once must not be counted twice.

### Failure is contained

A failed task is reported (`{taskId, reason}`), never thrown; it is retried
with exponential backoff (30 s → 15 min) while every other task keeps
reporting. A poll always returns a report.

---

## 3. Run it

```bash
node collector/crypto/onchain/server.cjs --polls 1                    # one full poll, NDJSON out
node collector/crypto/onchain/server.cjs --providers mempool --polls 5
node collector/crypto/onchain/server.cjs --groups chains,holders --interval 60000
node collector/crypto/onchain/server.cjs --tasks mempool/blocks --polls 1
node collector/crypto/onchain/server.cjs --bus                        # also publish on the Realtime bus
```

Every reading is written as one NDJSON line — the same envelope that would
travel on the bus — so a run is inspectable with no bus and no key:

```bash
node collector/crypto/onchain/server.cjs --providers mempool --polls 1 --out /tmp/onchain.ndjson
node -e "const fs=require('fs');for(const l of fs.readFileSync('/tmp/onchain.ndjson','utf8').trim().split('\n')){const r=JSON.parse(l);if(r.kind==='entry')console.log(r.market,r.symbol,r.event,r.envelope.meta.eventType)}"
```

The first line says what the catalog covers and which providers are ready,
every `entry` line is one envelope, the last line says what the run did.

`--bus` takes the bus from the running realtime service
(`collector/crypto/realtime` → `getService().runtime.bus`). Without it the
collector still works — it just does not pretend the bus is there.

## 4. Tests

```bash
node --test collector/crypto/onchain/tests/
```

No network: `tests/fixtures.cjs` carries upstream payloads in the shape each
provider actually answers with, plus a fake client that routes by URL. 27
tests cover the catalog contract, the four capsules, the whole polling loop
(plan → poll → follow-up → backoff → reset), the CLI's flags and the bus
seam (an `onchain:` envelope really landing on the realtime bus, which is
what `--bus` does).

## 5. Programmatic use

```js
const onchain = require("./collector/crypto/onchain/index.cjs");
const collector = onchain.createCollector({ bus, sink: (entry) => console.log(entry.market, entry.symbol, entry.event) });

collector.status();                // subjects, tasks, capsules, readiness, refusals
collector.plan();                  // the tasks that will be asked, and what cannot be
await collector.pollOnce();        // one poll → a report (never a rejection)
await collector.run({ polls: 3 }); // poll on a cadence until stopped or aborted
collector.reset();                 // forget the schedule, keep the capsules' memory
```

`index.cjs` is the public surface: `createCollector`, `createOrchestrator`,
`createFeedClient`, `createProviderRegistry`, `createSubjectCatalog`,
`defaultCatalog`, `createSubsystems`, `createOnchainBridge`,
`createReadingPublisher`, the reading arithmetic (`createReading`, `usdOf`,
`deltaOf`, `shareOf`, `satsToBtc`…), the subject vocabulary
(`canonicalSubjectId`, `provenanceOf`, `symbolFor`…), the provider config
sheet and `providerReadiness()`.

---

## 6. What was verified live

Every provider in `config/providers.cjs` was reached from this machine
before it was written down, and the whole module was run end-to-end
(2026-09-27, one poll, no bus, no key):

```
tasks per poll: 37 (37 scheduled, 0 on demand), refusals: 0
run 1 (before the TETH rename): due 37, tasks 38, rows 3571, readings 60, published 60, failed 1
run 2 (after  the TETH rename): due 37, tasks 38, rows 3573, readings 62, published 62, failed 0
```

- 62 envelopes on `onchain.*` in one poll: 11 `exchange_reserves`,
  4 `network_metrics`, 1 `whale_transfer`, 8 `stablecoin_supply`,
  8 `lending_rate`, 30 `etf_quote` — every task asked, no refusal.
- The whale scan came from a real block: `mempool/blocks` named the tip,
  the follow-up read that block's transfers and published one
  `whale_transfer` with `sampledTransactions` next to `blockTransactions`.
- The mempool reading reported the live queue (77,534 transactions
  / 41.9 MB at the time of writing) with the fee floor and ceiling the
  histogram carries.
- 11 tracked holders of 88 listed: `KRAKEN` was simply absent from the
  live `/cexs` answer, and the reading says `trackedHolders: 11`,
  `listedHolders: 88` instead of hiding the hole.
- Run 1 failed one task, honestly: `yahoo/chart/CETH: HTTP 404`. The fund
  was renamed **CETH → TETH**; the catalog now asks for `TETH`, which both
  providers answer (`nasdaq` → "21Shares Ethereum ETF", Cboe/BATS) — and
  run 2 is clean. A 404 is how a renamed ticker announces itself.

### Deliberately not used

| source | why not |
| --- | --- |
| `farside.co.uk` (the usual ETF-flow table) | answers 403 behind Cloudflare |
| Yahoo `v7/finance/quote` | 401 Unauthorized |
| Yahoo `v10/finance/quoteSummary` | 429 without a crumb |
| Nasdaq `historical` | 200 with `{"data":null}` — an empty answer, not a flat day |
| Blockchair | blacklists the calling IP after a handful of queries |

## 7. Known gaps (said out loud in the data)

- **No ETF net flow.** A flow needs shares outstanding; no key-free source
  here has it. Every `etf_quote` therefore carries `sharesOutstanding: null`,
  `netFlowUsd: null` and `flowReason` naming the two endpoints that refused.
  A price is measured; a flow is not invented.
- **`/txs` is a sample, not a block.** mempool.space answered 25 of 4,117
  transactions in the block we checked, so a whale reading publishes
  `sampledTransactions`, `blockTransactions`, `coverage` and a
  `whaleValueShare` computed over the *sample*, and
  `evidence.direction: false` because no key-free source labels an address
  as an exchange.
- **Holders, not per-asset reserves.** DefiLlama reports a holder's total
  reserves without an asset split, so a holder reading claims no
  single-asset number; the subject is the holder.
- **One chain.** Only Bitcoin has an honest key-free block/transfer feed
  here, which is why `chains` holds exactly one subject: a chain listed is a
  promise that a real number follows.
- **Stablecoin supply is issuer-reported.** `circulating` is DefiLlama's
  aggregate of what issuers publish; the deltas are theirs, the poll delta
  is ours.
- **A fund's price is a share price.** It is not a bitcoin price, which is
  why the frame keeps the fund as the symbol and the underlying in
  provenance.

## 8. Files

```
collector/crypto/onchain/
├── index.cjs                     public surface
├── server.cjs                    runnable entry (NDJSON, --bus optional)
├── README.md
├── config/providers.cjs          endpoints, budgets, cadences, readiness
├── core/
│   ├── subject.cjs               the four subject kinds + provenance
│   ├── reading.cjs               the arithmetic, and "missing" defined
│   ├── feed-client.cjs           one rate-limited, retrying GET
│   ├── bus-bridge.cjs            reading → envelope → onchain:* bus entry
│   └── orchestrator.cjs          plan, poll, follow-ups, backoff, status
├── providers/                    seven adapters (defillama, yields,
│                                 stablecoins, mempool, blockchain-info,
│                                 yahoo, nasdaq) + registry
├── subjects/                     chains, holders, stablecoins, funds + catalog
├── subsystems/                   the four capsules + aggregate + index
└── tests/                        fixtures, catalog, subsystems,
                                  orchestrator, server
```

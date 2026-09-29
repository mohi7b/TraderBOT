# RADI — Technical Roadmap

> 6 architecture pillars · 17 phases · Q4 2026 → Q4 2029
>
> **Languages:** en · fa · ar · tr · de — identical structure in every language.
>
> **Source of truth:** `src/content/roadmap/*.json` · regenerate with `npm run roadmap:build`.

## Table of contents

- [English — English](#en)
- [Persian (Farsi) — فارسی](#fa)
- [Arabic — العربية](#ar)
- [Turkish — Türkçe](#tr)
- [German — Deutsch](#de)

---
<a id="en"></a>

## English

**Language:** English (`en`, ltr)

### RADI — Technical Roadmap

*6 architecture pillars · 17 phases · Q4 2026 → Q4 2029*

This document is the phase-by-phase roadmap for the Financial Data Intelligence Platform. It follows the approved architecture exactly as specified: six pillars — Data Lake, Chart Engine (WASM + WebGL), Bot Builder (Node-Based), AI Engine, Token Economy and Marketplace. Every deliverable below belongs to one of the named components; no additional architecture component is introduced and no component is simplified or omitted.

**Program principles**

- No new architecture components: only the components of the approved architecture appear in this roadmap.
- Bottom-up build order: each pillar consumes the verified output of the pillar before it.
- Every phase ends with measurable acceptance gates instead of demos.
- All six pillars share one data contract: raw 1-minute canonical series plus canonical events.
- Every phase ships in all five whitepaper languages: English, Persian, Arabic, Turkish and German.

### Timeline overview

| Architecture pillars | Components | Phases | Estimated timeline |
|---|---|---|---|
| Pillar 1 — Data Lake | Fetcher Engine (multi-source), Normalizer Engine | Phase 1 — Multi-Source Ingestion & Canonical Normalization | Q4 2026 |
| Pillar 1 — Data Lake | Weighting Engine, Noise Filter Engine | Phase 2 — Weighting & Noise Filtering | Q1 2027 |
| Pillar 1 — Data Lake | TSDB (Time-Series Database), Data Quality Monitor | Phase 3 — Time-Series Storage & Data Quality Monitoring | Q1 – Q2 2027 |
| Pillar 2 — Chart Engine (WASM + WebGL) | GPU accelerated rendering, High-frequency rendering pipeline | Phase 4 — Rendering Core: WASM, GPU Acceleration & High-Frequency Pipeline | Q2 – Q3 2027 |
| Pillar 2 — Chart Engine (WASM + WebGL) | Multi-layer charting, Custom shaders | Phase 5 — Multi-Layer Charting & Custom Shaders | Q3 – Q4 2027 |
| Pillar 2 — Chart Engine (WASM + WebGL) | Indicator engine, Event overlays | Phase 6 — Indicator Engine & Event Overlays | Q4 2027 – Q1 2028 |
| Pillar 3 — Bot Builder (Node-Based) | Node graph editor, Node interpreter | Phase 7 — Node Graph Editor & Node Interpreter | Q1 – Q2 2028 |
| Pillar 3 — Bot Builder (Node-Based) | Strategy compiler, Backtesting engine | Phase 8 — Strategy Compiler & Backtesting Engine | Q2 – Q3 2028 |
| Pillar 3 — Bot Builder (Node-Based) | Live trading executor, Risk management module | Phase 9 — Live Trading Executor & Risk Management Module | Q3 – Q4 2028 |
| Pillar 4 — AI Engine | Signal generation, Pattern detection | Phase 10 — Signal Generation & Pattern Detection | Q4 2028 – Q1 2029 |
| Pillar 4 — AI Engine | Market regime classifier | Phase 11 — Market Regime Classifier | Q1 – Q2 2029 |
| Pillar 4 — AI Engine | Reinforcement learning module, Model training pipeline | Phase 12 — Reinforcement Learning Module & Model Training Pipeline | Q2 – Q3 2029 |
| Pillar 5 — Token Economy | Utility model, Staking system | Phase 13 — Utility Model & Staking System | Q1 – Q2 2029 |
| Pillar 5 — Token Economy | Reward distribution, Burn mechanism | Phase 14 — Reward Distribution & Burn Mechanism | Q3 2029 |
| Pillar 5 — Token Economy | Governance model | Phase 15 — Governance Model | Q4 2029 |
| Pillar 6 — Marketplace | Strategy marketplace, Indicator marketplace | Phase 16 — Strategy Marketplace & Indicator Marketplace | Q2 – Q3 2029 |
| Pillar 6 — Marketplace | AI model marketplace, Creator economy | Phase 17 — AI Model Marketplace & Creator Economy | Q4 2029 |

### Pillar 1 — Data Lake

The Data Lake produces one canonical, replayable stream of market and macro data: multi-source collection, normalization, weighting, noise removal, time-series storage and continuous quality monitoring.

**Components:** Fetcher Engine (multi-source) · Normalizer Engine · Weighting Engine · Noise Filter Engine · TSDB (Time-Series Database) · Data Quality Monitor

#### Phase 1 — Multi-Source Ingestion & Canonical Normalization

- **Description:** Bring the Fetcher Engine live across every venue and macro feed, and force every raw payload through the Normalizer Engine so downstream pillars consume one canonical, provenance-tagged event stream instead of raw exchange payloads.
- **Components:** Fetcher Engine (multi-source) · Normalizer Engine
- **Deliverables:**
  - Fetcher Engine (multi-source) connectors for spot, futures, order book, trades, funding, open interest, liquidations, macro and on-chain feeds.
  - Per-source scheduler with rate-limit governor, adaptive retry, gap detection and historical backfill.
  - Normalizer Engine canonical envelope: source, venue, symbol, timestamp, sequence, payload and quality flags.
  - Canonical symbol/venue registry with precision and scale rules, UTC alignment and 1-minute bucketing of raw candles.
  - Immutable raw archive of every fetched payload with checksums, so any canonical stream can be re-derived from scratch.
- **Technical milestones:**
  - At least 25 live source connectors, each covered by a contract test against a recorded fixture.
  - Ingest latency p95 below 500 ms from venue timestamp to published canonical event.
  - Zero-loss replay: re-fetching any 24-hour window reproduces a byte-identical canonical stream.
  - 100% of canonical events carry source provenance and quality flags.
  - Sustained ingest of at least 50,000 events/s in staging with p95 CPU utilisation below 70%.
- **Estimated timeline:** Q4 2026

#### Phase 2 — Weighting & Noise Filtering

- **Description:** Turn parallel sources into one trustable price of truth: the Weighting Engine scores every source and observation, while the Noise Filter Engine removes structural noise — spikes, stale quotes, wash trades and bad ticks — before anything is persisted.
- **Components:** Weighting Engine · Noise Filter Engine
- **Deliverables:**
  - Weighting Engine: source trust tiers, dynamic weights, recency decay, cross-source dispersion penalty and a confidence score per observation.
  - Noise Filter Engine: outlier and spike detection, stale-quote suppression, wash-trade detection, bad-tick quarantine and an explicit gap-handling policy.
  - Per-asset-class denoise profiles (crypto spot and futures, macro releases, on-chain metrics) with versioned configuration.
  - Replayable weight and filter configuration, so any historical window can be reprocessed under a new profile.
  - Weight and confidence introspection output attached to every published canonical event.
- **Technical milestones:**
  - Confidence score present on 100% of canonical events, with weight provenance traceable to source, tier and rule version.
  - Noise recall of at least 95% with precision of at least 98% on a labelled anomaly corpus, plus a published confusion matrix.
  - Reprocessing 90 days of history under a changed profile completes in under 30 minutes.
  - Deterministic output: identical inputs and profile version always produce identical weights.
  - Filter false-positive rate on clean market data at most 0.1% measured on a held-out week.
- **Estimated timeline:** Q1 2027

#### Phase 3 — Time-Series Storage & Data Quality Monitoring

- **Description:** Persist the canonical stream in the TSDB with explicit retention and downsampling policies, and keep it honest with the Data Quality Monitor, which scores every source and symbol and quarantines bad data automatically.
- **Components:** TSDB (Time-Series Database) · Data Quality Monitor
- **Deliverables:**
  - TSDB: columnar time-series storage for the raw 1-minute canonical series and canonical events, partitioned by symbol, venue and time.
  - Compression, retention tiers, downsampling and materialised views for multi-year query workloads.
  - High-cardinality indexing and a query API consumed by the Chart Engine, the Bot Builder and the AI Engine.
  - Data Quality Monitor: completeness, freshness, accuracy and consistency scores per source, symbol and timeframe.
  - Quality alerting, lineage tracing, automatic quarantine, self-healing re-fetch and a public quality dashboard.
- **Technical milestones:**
  - At least 10x on-disk compression versus raw JSON payloads.
  - Query latency p95 below 150 ms for a 30-day 1-minute range on a single symbol.
  - Freshness SLA: p95 below 2 s from canonical event to queryable series, verified continuously.
  - Hourly quality score published for 100% of tracked symbols with data-incident MTTR under 30 minutes.
  - Automatic quarantine isolates at most 0.01% of records, each with a fully auditable decision trail.
- **Estimated timeline:** Q1 – Q2 2027

### Pillar 2 — Chart Engine (WASM + WebGL)

GPU accelerated rendering, multi-layer charting, custom shaders, an indicator engine, event overlays and a high-frequency rendering pipeline — all running on one shared WASM + WebGL core.

**Components:** GPU accelerated rendering · Multi-layer charting · Custom shaders · Indicator engine · Event overlays · High-frequency rendering pipeline

#### Phase 4 — Rendering Core: WASM, GPU Acceleration & High-Frequency Pipeline

- **Description:** Build the performance foundation of the Chart Engine: a WASM compute core for parsing, aggregation and layout, a GPU accelerated rendering layer on WebGL, and a high-frequency rendering pipeline able to absorb tens of thousands of ticks per second.
- **Components:** GPU accelerated rendering · High-frequency rendering pipeline
- **Deliverables:**
  - WASM compute core (compiled from Rust) for parsing, aggregation, index building and viewport layout.
  - GPU accelerated rendering layer on WebGL with instanced draw calls, texture atlasing and buffer pooling.
  - High-frequency rendering pipeline: ring buffers, dirty-region updates, worker offloading and frame pacing.
  - Level-of-detail and culling system that keeps the frame budget stable at any zoom level.
  - Benchmark harness with reproducible scenes, a memory ceiling and frame-time regression tracking.
- **Technical milestones:**
  - 60 fps sustained with at least 1,000,000 visible points on a mid-tier GPU.
  - Ingest of at least 10,000 ticks/s with zero dropped frames.
  - p99 frame time at most 8 ms, WASM compute step at most 2 ms, WASM-to-JS boundary under 0.2 ms per frame.
  - Cold start (WASM load plus first paint) under 500 ms on the benchmark scene.
  - Peak memory at most 300 MB for a 30-day 1-minute session.
- **Estimated timeline:** Q2 – Q3 2027

#### Phase 5 — Multi-Layer Charting & Custom Shaders

- **Description:** Compose the visual language of the platform: independent, individually toggleable layers composited by the engine, and a custom shader system that renders every visual primitive on the GPU.
- **Components:** Multi-layer charting · Custom shaders
- **Deliverables:**
  - Multi-layer charting: price, volume, order-book depth, liquidation heatmap, funding and open-interest layers, plus macro overlays.
  - Layer manager with z-order, compositing, lazy initialisation, off-screen layers and per-layer state persistence.
  - Custom shaders in GLSL for candlesticks, gradient volume, heatmaps, glow lines and crosshair primitives.
  - Shader registry with hot reload, versioning and a graceful fallback path when a shader fails to compile.
  - Layer and shader presets that can be saved, shared and restored inside the Bot Builder viewer.
- **Technical milestones:**
  - At least 12 independent layers composited simultaneously at 60 fps.
  - Shader compile under 50 ms; hot reload without reloading the chart or losing viewport state.
  - Combined cost of all enabled layers at most 2 ms per frame at reference zoom.
  - Fallback renderer produces the same layout geometry within 1 px tolerance.
  - Visual regression suite of at least 50 golden frames passing on CI GPUs.
- **Estimated timeline:** Q3 – Q4 2027

#### Phase 6 — Indicator Engine & Event Overlays

- **Description:** Compute indicators incrementally in WASM so charts and strategies share one implementation, and overlay events coming from the Data Lake so market context is visible on the same canvas.
- **Components:** Indicator engine · Event overlays
- **Deliverables:**
  - Indicator engine: incremental and streaming computation in WASM with O(1) update per tick.
  - Indicator registry with parameter schemas, warm-up handling and a public API for custom indicators.
  - Numeric parity layer guaranteeing identical indicator output between the Chart Engine and the Bot Builder.
  - Event overlays fed by Data Lake events: macro releases, funding flips, liquidations, listings and de-listings.
  - Annotation layer with timeline markers, clustering at low zoom, filters and persisted user annotations.
- **Technical milestones:**
  - At least 60 built-in indicators, each updating within 0.1 ms per tick.
  - 100% parity between chart and backtest indicator values with relative error at most 1e-9.
  - At least 100,000 overlaid events rendered with clustering at 60 fps.
  - Deterministic warm-up: indicator values independent of how much history is loaded.
  - Annotation create, update and delete round-trips with zero loss across sessions.
- **Estimated timeline:** Q4 2027 – Q1 2028

### Pillar 3 — Bot Builder (Node-Based)

A typed node graph editor, a deterministic node interpreter, a strategy compiler, a backtesting engine, a live trading executor and a risk management module — one artefact from idea to live orders.

**Components:** Node graph editor · Node interpreter · Strategy compiler · Backtesting engine · Live trading executor · Risk management module

#### Phase 7 — Node Graph Editor & Node Interpreter

- **Description:** Deliver the authoring surface of the Bot Builder: a typed node graph editor and a deterministic interpreter that executes any graph safely inside a sandbox.
- **Components:** Node graph editor · Node interpreter
- **Deliverables:**
  - Node graph editor: canvas with node palette, typed ports, live validation, undo/redo, groups, comments and a minimap.
  - Graph serialisation to a versioned AST/JSON document with copy/paste, subgraph extraction and diffable saves.
  - Node interpreter: topological scheduler, streaming and event-driven nodes, stateful nodes and backpressure control.
  - Bounded-memory ring buffers, deterministic seeding and sandboxed execution with no network and no filesystem access.
  - Hot reload of edited subgraphs against a running interpretation session.
- **Technical milestones:**
  - At least 150 core nodes shipped with typed signatures and documentation.
  - Open and edit a 2,000-node graph at 60 fps with a validation pass under 100 ms.
  - Bit-identical outputs when replaying the same graph over the same input stream.
  - Sandbox escape test suite passes with zero findings.
  - Steady-state interpreter memory under 512 MB for a 2,000-node graph.
- **Estimated timeline:** Q1 – Q2 2028

#### Phase 8 — Strategy Compiler & Backtesting Engine

- **Description:** Compile graphs into an optimised execution plan and prove them against history: the Strategy compiler produces signed artefacts, and the Backtesting engine replays them with realistic microstructure, fees and latency.
- **Components:** Strategy compiler · Backtesting engine
- **Deliverables:**
  - Strategy compiler: graph to IR to optimised execution plan, with constant folding, dead-node elimination and branch parallelisation.
  - Strategy versioning, artefact signing and a diffable strategy history.
  - Backtesting engine: event-driven replay at tick and bar resolution with multi-asset portfolio accounting.
  - Realistic cost model: fees, slippage, funding, borrow, latency and partial-fill simulation.
  - Walk-forward analysis, parameter sweeps, Monte Carlo resampling and the full metrics suite (Sharpe, Sortino, Calmar, profit factor, max drawdown, win rate).
- **Technical milestones:**
  - Compiled artefact at least 5x faster than the interpreted graph on the reference workload.
  - Look-ahead leakage test suite passes 100% and every result records its data-boundary proof.
  - One year of 1-minute data across 50 symbols backtested in under 5 minutes on the parallel runner.
  - 1,000 parameter combinations evaluated in under 30 minutes with reproducible ordering.
  - Two runs of the same configuration and seed are byte-identical.
- **Estimated timeline:** Q2 – Q3 2028

#### Phase 9 — Live Trading Executor & Risk Management Module

- **Description:** Promote compiled strategies to live trading through a reconciliation-safe executor, and gate every order through the Risk management module before it reaches a venue.
- **Components:** Live trading executor · Risk management module
- **Deliverables:**
  - Live trading executor: order router, OMS state machine, idempotent client order IDs and venue reconciliation.
  - Paper to live promotion using the same compiled artefact that was backtested and verified.
  - Connection resilience: reconnect, failover, replay-safe resubmission and a global kill switch.
  - Risk management module: pre-trade checks, position, exposure and leverage limits, per-strategy risk budget and drawdown circuit breakers.
  - Margin and liquidation monitoring plus a complete audit trail of every risk decision.
- **Technical milestones:**
  - Order-intent parity of at least 99.9% between paper and live over 30 consecutive days.
  - Order acknowledgement p95 under 100 ms including the venue round-trip.
  - Zero duplicate orders across 100 forced reconnect scenarios.
  - Kill switch actuation under 1 s and end-of-day reconciliation drift of zero for 60 consecutive days.
  - Risk checks p99 under 5 ms and 100% of orders carrying a stored risk decision record.
- **Estimated timeline:** Q3 – Q4 2028

### Pillar 4 — AI Engine

Signal generation, pattern detection, a market regime classifier, a reinforcement learning module and a model training pipeline — from raw series to reproducible, risk-bounded decisions.

**Components:** Signal generation · Pattern detection · Market regime classifier · Reinforcement learning module · Model training pipeline

#### Phase 10 — Signal Generation & Pattern Detection

- **Description:** Turn the Data Lake into decisions: produce calibrated, versioned signals and detect the patterns — chart, candlestick and microstructure — that explain them.
- **Components:** Signal generation · Pattern detection
- **Deliverables:**
  - Signal generation: feature layer over the TSDB with calibrated probabilities and confidence intervals.
  - Signal bus with versioned metadata, TTL, ownership and direct wiring into Bot Builder graphs.
  - Drift monitoring per signal covering feature drift, label drift and calibration decay, with alerting.
  - Pattern detection: geometric chart patterns, candlestick patterns and microstructure patterns (iceberg, spoofing, absorption).
  - Labelled pattern corpus with published precision and recall reporting per pattern family.
- **Technical milestones:**
  - At least 20 production signals, each beating its own random-shuffle control on held-out data.
  - Pattern precision of at least 0.75 and recall of at least 0.70 on the labelled corpus.
  - Signal latency p95 under 50 ms after the triggering bar or event becomes available.
  - Drift alarm raised within 1 hour of a detected distribution shift.
  - 100% of signals reproducible from the model registry by version.
- **Estimated timeline:** Q4 2028 – Q1 2029

#### Phase 11 — Market Regime Classifier

- **Description:** Label the market state in real time so signals, strategies and risk limits can adapt: per-asset and cross-asset regimes with confidence, hysteresis and full history.
- **Components:** Market regime classifier
- **Deliverables:**
  - Regime taxonomy: trend up and down, range, high and low volatility, thin and deep liquidity, risk-on and risk-off, per asset and cross-asset.
  - Online change-point detection with a confidence score per state.
  - Hysteresis and minimum dwell-time rules that prevent regime flapping.
  - Regime history store with full replay and point-in-time reconstruction, free of revision bias.
  - Regime-aware routing consumed by the AI Engine and by Bot Builder risk budgeting.
- **Technical milestones:**
  - Regime accuracy of at least 0.80 on held-out periods with expected calibration error at most 0.05.
  - Median detection delay under 15 bars with a false-switch rate below 5%.
  - Per-asset regime updated every bar at p95 under 20 ms.
  - Five-year regime history classified and reproducible from the TSDB.
  - Measured regime-conditional improvement documented for every production signal.
- **Estimated timeline:** Q1 – Q2 2029

#### Phase 12 — Reinforcement Learning Module & Model Training Pipeline

- **Description:** Close the loop: train policies inside a simulator built on the Backtesting engine, respect Risk management constraints by construction, and ship models through a governed training pipeline.
- **Components:** Reinforcement learning module · Model training pipeline
- **Deliverables:**
  - Reinforcement learning module: environment derived from the Backtesting engine with a gym-style API.
  - Reward shaping aligned to the limits enforced by the Risk management module.
  - Offline and imitation pre-training plus online fine-tuning, with the policy exported as an artefact usable inside Bot Builder graphs.
  - Model training pipeline: dataset versioning and lineage, feature-store snapshots, orchestration and GPU scheduling.
  - Experiment tracking, hyper-parameter search, model registry, evaluation gates, canary release and rollback.
- **Technical milestones:**
  - RL policies beat the strongest tuned manual strategy on at least 3 of 5 held-out markets under identical risk limits.
  - Simulator throughput of at least 1,000,000 environment steps per minute.
  - Any training run reproducible from a single manifest file.
  - Zero model releases without an approved evaluation-gate record, and rollback under 5 minutes.
  - Training to registry to deployable artefact in under 1 hour for a small model.
- **Estimated timeline:** Q2 – Q3 2029

### Pillar 5 — Token Economy

A utility model with sink and source accounting, a staking system with lock tiers, epoch-based reward distribution, an on-chain verifiable burn mechanism and a governance model that controls the parameters of all of them.

**Components:** Utility model · Staking system · Reward distribution · Burn mechanism · Governance model

#### Phase 13 — Utility Model & Staking System

- **Description:** Define what the token is for and how commitment is priced: a complete utility map with sink and source accounting, and a staking system with lock tiers, weighting and slashing hooks.
- **Components:** Utility model · Staking system
- **Deliverables:**
  - Utility model: token utility map covering trading fees, subscriptions, marketplace payments, compute and inference credits, API quota and tier access.
  - Sink and source accounting, a tier table, the pricing model and an anti-abuse rulebook.
  - Treasury policy and vesting schedule with published unlock transparency.
  - Staking system: stake and unstake with lock tiers, time- and amount-weighted voting power and reward accrual.
  - Slashing hooks for marketplace violations, emergency pause and externally audited contracts.
- **Technical milestones:**
  - Full utility flows exercised end-to-end on testnet: fees, subscriptions, credits and quota.
  - At least 3 contracts audited with zero open critical or high findings.
  - Stake and unstake gas at most 120,000, with reward-accrual and slashing invariant tests passing 100%.
  - Invariant and fuzz suite executes at least 10,000 runs with no violated invariant.
  - Economic parameter table peer-reviewed and published in all five whitepaper languages.
- **Estimated timeline:** Q1 – Q2 2029

#### Phase 14 — Reward Distribution & Burn Mechanism

- **Description:** Pay for contribution and make supply policy explicit: epoch-based, contribution-weighted rewards with verifiable claims, and an on-chain verifiable burn mechanism tied to platform fees.
- **Components:** Reward distribution · Burn mechanism
- **Deliverables:**
  - Reward distribution: epoch accrual, snapshot accounting and Merkle-based claims.
  - Contribution weighting across data quality, strategies, indicators, models and compute contribution.
  - Anti-farming and sybil resistance, reward vesting and gas-efficient batch claiming.
  - Public reward dashboards with per-epoch reproducibility from snapshots.
  - Burn mechanism: fee-burn schedule, verifiable burn address, treasury buyback and burn policy, burn cap and emergency halt.
- **Technical milestones:**
  - Zero missed reward epochs over 3 consecutive months of operation.
  - Reward computation independently reproducible from snapshots and published weights.
  - 100% of burns verifiable on-chain against a public ledger.
  - At least 95% of simulated farming clusters detected by the anti-sybil rules.
  - Burn rate and reward weights changeable only through the governance-controlled parameter registry.
- **Estimated timeline:** Q3 2029

#### Phase 15 — Governance Model

- **Description:** Hand the parameters of the economy to the people who use it: a full proposal lifecycle, stake-weighted and time-locked voting, delegation and timelocked on-chain execution.
- **Components:** Governance model
- **Deliverables:**
  - Governance model with a complete proposal lifecycle: forum draft, on-chain proposal, vote, timelock and execution.
  - Stake-weighted, time-locked voting power with delegation support.
  - Quorum and approval thresholds plus the governance-controlled parameter registry for fees, burn rate, reward weights and listings.
  - Timelock and multi-signature emergency procedures with published playbooks.
  - Governance documentation, proposal templates and public voting history.
- **Technical milestones:**
  - Full lifecycle executed at least 20 times on testnet, including 2 parameter changes and 1 emergency-pause drill.
  - Timelock of at least 48 hours enforced on-chain and not bypassable by any single key.
  - 100% of governance actions produce an auditable on-chain record.
  - Delegate and voting-power accounting verified by an external audit with zero high findings.
  - Governance documentation published in all five whitepaper languages.
- **Estimated timeline:** Q4 2029

### Pillar 6 — Marketplace

Strategy marketplace, indicator marketplace, AI model marketplace and a creator economy — where the output of the previous five pillars becomes a licensed, paid, verifiable product.

**Components:** Strategy marketplace · Indicator marketplace · AI model marketplace · Creator economy

#### Phase 16 — Strategy Marketplace & Indicator Marketplace

- **Description:** Open the platform output to third parties: strategies listed with machine-verified performance, and indicators distributed as sandboxed WASM packages for the Indicator engine.
- **Components:** Strategy marketplace · Indicator marketplace
- **Deliverables:**
  - Strategy marketplace: listings, metadata, licensing and subscription or copy models.
  - Machine-verified performance for every listing, produced by the Backtesting engine with a no-lookahead attestation.
  - Sandboxed execution of purchased strategies on live data, with ratings, reviews and a dispute and refund flow.
  - Indicator marketplace: WASM indicator packages for the Indicator engine with schema and version constraints.
  - Sandbox resource limits (CPU, memory, no network), license terms and automated revenue splits.
- **Technical milestones:**
  - Publish to verify to list pipeline fully automated in under 24 hours per listing.
  - At least 90% of live listings carry machine-verified metrics; unverified listings are visibly flagged.
  - Sandbox escape and resource-abuse test suites pass with zero findings.
  - License issuance and creator payout reconciliation complete with zero mismatches over 3 months.
  - Marketplace load-tested to 1,000 concurrent listings with p95 page response under 300 ms.
- **Estimated timeline:** Q2 – Q3 2029

#### Phase 17 — AI Model Marketplace & Creator Economy

- **Description:** Complete the ecosystem: models published with evaluation evidence and metered inference, and a creator economy that pays contributors for durable performance.
- **Components:** AI model marketplace · Creator economy
- **Deliverables:**
  - AI model marketplace: model cards, evaluation scorecards and held-out benchmark results.
  - Hosted, metered inference with latency tiers and transparent per-call accounting.
  - Drift- and decay-driven delisting policy with automatic review triggers.
  - Creator economy: creator profiles, verification, reputation from live performance and usage, royalties and tiered revenue share.
  - Creator analytics, a creator SDK and token payout rails with tax and reporting exports.
- **Technical milestones:**
  - Hosted inference p95 under 200 ms with 100% metering accuracy against the ledger.
  - Every model card carries a signed evaluation-gate record before it can be listed.
  - Automatic drift review fires within 24 hours of a decay threshold breach.
  - Unified creator reputation computed for 100% of listings from live and review data.
  - Creator SDK published with documentation in all five whitepaper languages.
- **Estimated timeline:** Q4 2029

### RADI Ecosystem — Tokenomics

Distribution structure, release models and the economic role of every token. Figures describe the planned model.

#### Row 1 — Token Structure

##### Pre-Supply Token — 1% of total supply · 100 million tokens

- **Release Model:** Progress-based unlock (development milestones)
- **Value Multiplier:** ×10 compared to the main token
- **Purpose:** Reward early contributors and bootstrap ecosystem growth
- **Economic Role:** High-value, scarce token powering the startup's initial momentum

##### Total Supply — 1% pre-supply + 99% main token · 100 billion total tokens

- **Release Model:** Locked until economic activation
- **Value Ratio:** ×10 pre-supply token + ×1 main token
- **Purpose:** Full transparency in distribution structure
- **Economic Role:** Foundation of the entire ecosystem and source of long-term circulation

##### Main Token — 99% of total supply · 99 billion tokens

- **Release Model:** Utility-driven and revenue-based unlock
- **Value Multiplier:** ×1 main token
- **Purpose:** Balanced growth between token value and platform utility
- **Economic Role:** Primary asset for payments, tools, automation, and user interactions

#### Row 2 — Platform Economy

##### Economic Engine — Consumption-driven + revenue-driven model · Gradual increase of circulating tokens

- **Release Model:** Scales with platform revenue and user expansion
- **Consumption Flow:** AI Engine, Bot Builder, Marketplace
- **Purpose:** Build a sustainable revenue ecosystem
- **Economic Role:** Convert user activity into real token value

##### Utility — Payments for intelligent trading and AI-powered services · User-to-service transaction layer

- **Release Model:** Direct token purchase for service access
- **Use Cases:** Model execution, bot creation, tool purchases, data APIs
- **Purpose:** Establish real and continuous token consumption
- **Economic Role:** Activate all platform modules through token usage

##### Staking — Dynamic APR + token freeze for premium services · Value-driven policy mechanism

- **Release Model:** Allocation of a portion of unlocked tokens into staking pools
- **Reward Model:** Access to platform services and exclusive features
- **Purpose:** Increase network stability and reduce circulating supply
- **Economic Role:** Long-term incentive mechanism strengthening token value

##### Current stage: Development-based pre-supply

| Token | Total supply | Released to date | Released | Value multiplier |
|---|---|---|---|---|
| Pre-supply token | 100,000,000 | 1,000,000 | 1% | ×10 |
| Main token | 99,000,000,000 | 0 | 0% | ×1 |

**1 pre-supply token = 10 main tokens**

- Tokens in this stage: 1,000,000
- Released to date: 100,000
- Value per unit: ×10 versus the main token

**Buy Samara token** — Purchase through the official RADI wallet or partner exchanges.

### Dependencies & critical path

| Phases | Description |
|---|---|
| Phase 1 → Phase 2 | The Weighting Engine needs canonical, normalized events before it can score anything. |
| Phase 2 → Phase 3 | The TSDB stores weighted and denoised observations, not raw payloads. |
| Phase 3 → Phase 4 | The rendering core reads canonical series from the TSDB. |
| Phase 3 → Phase 6 | Event overlay layers are fed by canonical events published by the Data Lake. |
| Phase 3 → Phase 9 | Risk checks are calibrated against Data Lake quality and confidence scores. |
| Phase 4 → Phase 5 | Every layer and shader sits on top of the GPU rendering core. |
| Phase 5 → Phase 6 | Indicators and event overlays plug into the layer manager. |
| Phase 6 → Phase 7 | Graph nodes consume the same indicator implementation the chart renders. |
| Phase 7 → Phase 8 | The compiler and backtester consume serialized node graphs. |
| Phase 8 → Phase 9 | The live executor replays the same compiled artefact that was backtested. |
| Phase 8 → Phase 10 | Signals are validated on the backtesting engine before release. |
| Phase 9 → Phase 12 | RL policies respect the same risk limits as live trading. |
| Phase 9 → Phase 13 | Token utility is priced against real trading fees and measured usage. |
| Phase 10 → Phase 11 | Regime features are derived from the signal feature layer. |
| Phase 11 → Phase 12 | Regime state is an input to reward shaping in the RL module. |
| Phase 12 → Phase 17 | AI model listings are gated by the evaluation gates of the model training pipeline. |
| Phase 13 → Phase 14 | Rewards and burns settle on the utility and staking accounting. |
| Phase 13 → Phase 16 | Marketplace payments and license fees settle in the token economy. |
| Phase 14 → Phase 15 | Governance controls the parameters owned by reward distribution and burn. |
| Phase 14 → Phase 17 | Creator payouts settle through reward distribution and burn policy accounting. |
| Phase 6 → Phase 16 | Indicator marketplace packages target the indicator engine. |
| Phase 8 → Phase 16 | Strategy listings are verified end to end by the backtesting engine. |
| Phase 16 → Phase 17 | The creator economy extends the marketplace that already lists strategies and indicators. |

**Critical path:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11 → Phase 12 → Phase 17

### Pillar exit criteria

- **Pillar 1 — Data Lake**
  - Any historical window can be re-derived byte-identically from the raw archive under the active weight and filter profile.
  - A quality score is published for every tracked symbol and every quarantined record is traceable end to end.
- **Pillar 2 — Chart Engine (WASM + WebGL)**
  - The full layer stack renders at 60 fps while the indicator engine stays in numeric parity with the Bot Builder.
  - Every event published by the Data Lake is renderable as an overlay on the same canvas.
- **Pillar 3 — Bot Builder (Node-Based)**
  - The same compiled strategy artefact is used for backtest, paper and live, with no re-authoring.
  - No order reaches a venue without a stored risk decision record from the Risk management module.
- **Pillar 4 — AI Engine**
  - Every shipped signal, model and policy is reproducible from the registry and passes its evaluation gate under live risk limits.
  - Every signal and model is monitored for drift with an automatic review path.
- **Pillar 5 — Token Economy**
  - Utility, staking, rewards, burn and governance are all live on-chain with audited contracts and no privileged bypass.
  - Every economic parameter is changeable only through the governance-controlled parameter registry.
- **Pillar 6 — Marketplace**
  - Third parties publish strategies, indicators and models that are verified, sandboxed, licensed and paid automatically.
  - Every listing carries machine-verified evidence before it can be sold.

### Program exit criteria

- All six pillars run together end-to-end on one canonical data contract, from ingestion to marketplace settlement.
- Every component of the architecture is live, monitored, audited where it touches funds, and reproducible from a registry or a versioned artefact.
- The full roadmap document exists in five languages with identical structure and identical numbers.

---

<a id="fa"></a>

## Persian (Farsi) — فارسی

**زبان:** فارسی (`fa`, rtl)

### RADI — Technical Roadmap

*۶ ستون معماری · ۱۷ فاز · Q4 2026 → Q4 2029*

این سند، نقشهٔ راه فازبهفاز پلتفرم هوش دادهٔ مالی است و دقیقاً از معماری مصوب پیروی می‌کند: شش ستون — دریاچهٔ داده (Data Lake)، موتور چارت (Chart Engine, WASM + WebGL)، سازندهٔ ربات نودی (Bot Builder, Node-Based)، موتور هوش مصنوعی (AI Engine)، اقتصاد توکن (Token Economy) و بازارگاه (Marketplace). هر تحویل‌دادنی زیر به یکی از کامپوننت‌های نام‌برده‌شده تعلق دارد؛ هیچ کامپوننت معماری جدیدی اضافه نشده و هیچ کامپوننتی ساده‌سازی یا حذف نشده است.

**اصول برنامه**

- ممنوعیت افزودن کامپوننت معماری جدید: در این نقشهٔ راه تنها کامپوننت‌های معماری مصوب ظاهر می‌شوند.
- ساخت از پایین به بالا: هر ستون خروجیِ تأییدشدهٔ ستون پیش از خود را مصرف می‌کند.
- هر فاز با دروازه‌های پذیرش قابل‌اندازه‌گیری تمام می‌شود، نه با دمو.
- هر شش ستون یک قرارداد دادهٔ مشترک دارند: سری خام کانونی یک‌دقیقه‌ای به‌همراه رویدادهای کانونی.
- هر فاز در هر پنج زبان وایت‌پیپر منتشر می‌شود: انگلیسی، فارسی، عربی، ترکی و آلمانی.

### نمای کلی زمان‌بندی

| ستون‌های معماری | کامپوننت‌ها | فازها | زمان‌بندی تخمینی |
|---|---|---|---|
| ستون ۱ — دریاچهٔ داده (Data Lake) | موتور جمع‌آوری چندمنبعی (Fetcher Engine), موتور نرمال‌سازی (Normalizer Engine) | فاز ۱ — جمع‌آوری چندمنبعی و نرمال‌سازی کانونی | Q4 2026 |
| ستون ۱ — دریاچهٔ داده (Data Lake) | موتور وزن‌دهی (Weighting Engine), موتور فیلتر نویز (Noise Filter Engine) | فاز ۲ — وزن‌دهی و فیلتر نویز | Q1 2027 |
| ستون ۱ — دریاچهٔ داده (Data Lake) | پایگاه دادهٔ سری‌زمانی (TSDB), پایشگر کیفیت داده (Data Quality Monitor) | فاز ۳ — ذخیرهٔ سری‌زمانی و پایش کیفیت داده | Q1 – Q2 2027 |
| ستون ۲ — موتور چارت (Chart Engine, WASM + WebGL) | رندر شتاب‌گرفته با GPU, خط لولهٔ رندر پرتکرار | فاز ۴ — هستهٔ رندر: WASM، شتاب GPU و خط لولهٔ پرتکرار | Q2 – Q3 2027 |
| ستون ۲ — موتور چارت (Chart Engine, WASM + WebGL) | چارت‌سازی چندلایه, شیدرهای سفارشی | فاز ۵ — چارت‌سازی چندلایه و شیدرهای سفارشی | Q3 – Q4 2027 |
| ستون ۲ — موتور چارت (Chart Engine, WASM + WebGL) | موتور اندیکاتور, لایه‌های رویداد (Event Overlays) | فاز ۶ — موتور اندیکاتور و لایه‌های رویداد | Q4 2027 – Q1 2028 |
| ستون ۳ — سازندهٔ ربات نودی (Bot Builder, Node-Based) | ویرایشگر گراف نودی, مفسر نود | فاز ۷ — ویرایشگر گراف نودی و مفسر نود | Q1 – Q2 2028 |
| ستون ۳ — سازندهٔ ربات نودی (Bot Builder, Node-Based) | کامپایلر استراتژی, موتور بک‌تست | فاز ۸ — کامپایلر استراتژی و موتور بک‌تست | Q2 – Q3 2028 |
| ستون ۳ — سازندهٔ ربات نودی (Bot Builder, Node-Based) | مجری معاملات زنده, ماژول مدیریت ریسک | فاز ۹ — مجری معاملات زنده و ماژول مدیریت ریسک | Q3 – Q4 2028 |
| ستون ۴ — موتور هوش مصنوعی (AI Engine) | تولید سیگنال, تشخیص الگو | فاز ۱۰ — تولید سیگنال و تشخیص الگو | Q4 2028 – Q1 2029 |
| ستون ۴ — موتور هوش مصنوعی (AI Engine) | طبقه‌بند رژیم بازار | فاز ۱۱ — طبقه‌بند رژیم بازار | Q1 – Q2 2029 |
| ستون ۴ — موتور هوش مصنوعی (AI Engine) | ماژول یادگیری تقویتی, خط لولهٔ آموزش مدل | فاز ۱۲ — ماژول یادگیری تقویتی و خط لولهٔ آموزش مدل | Q2 – Q3 2029 |
| ستون ۵ — اقتصاد توکن (Token Economy) | مدل کاربرد (Utility Model), سیستم استیکینگ | فاز ۱۳ — مدل کاربرد و سیستم استیکینگ | Q1 – Q2 2029 |
| ستون ۵ — اقتصاد توکن (Token Economy) | توزیع پاداش, سازوکار سوزاندن (Burn) | فاز ۱۴ — توزیع پاداش و سازوکار سوزاندن | Q3 2029 |
| ستون ۵ — اقتصاد توکن (Token Economy) | مدل حاکمیتی | فاز ۱۵ — مدل حاکمیتی | Q4 2029 |
| ستون ۶ — بازارگاه (Marketplace) | بازارگاه استراتژی, بازارگاه اندیکاتور | فاز ۱۶ — بازارگاه استراتژی و بازارگاه اندیکاتور | Q2 – Q3 2029 |
| ستون ۶ — بازارگاه (Marketplace) | بازارگاه مدل هوش مصنوعی, اقتصاد سازندگان (Creator Economy) | فاز ۱۷ — بازارگاه مدل هوش مصنوعی و اقتصاد سازندگان | Q4 2029 |

### ستون ۱ — دریاچهٔ داده (Data Lake)

دریاچهٔ داده یک نوار دادهٔ کانونی و قابل بازپخش از دادهٔ بازار و ماکرو می‌سازد: جمع‌آوری چندمنبعی، نرمال‌سازی، وزن‌دهی، حذف نویز، ذخیرهٔ سری‌زمانی و پایش پیوستهٔ کیفیت.

**کامپوننت‌ها:** موتور جمع‌آوری چندمنبعی (Fetcher Engine) · موتور نرمال‌سازی (Normalizer Engine) · موتور وزن‌دهی (Weighting Engine) · موتور فیلتر نویز (Noise Filter Engine) · پایگاه دادهٔ سری‌زمانی (TSDB) · پایشگر کیفیت داده (Data Quality Monitor)

#### فاز ۱ — جمع‌آوری چندمنبعی و نرمال‌سازی کانونی

- **توضیحات:** موتور جمع‌آوری (Fetcher Engine) را روی همهٔ صرافی‌ها و فیدهای ماکرو راه‌اندازی می‌کنیم و هر پیام خام را از موتور نرمال‌سازی (Normalizer Engine) عبور می‌دهیم تا ستون‌های بعدی تنها یک نوار رویداد کانونی با شناسهٔ منبع مصرف کنند، نه پیام‌های خام صرافی‌ها.
- **کامپوننت‌ها:** موتور جمع‌آوری چندمنبعی (Fetcher Engine) · موتور نرمال‌سازی (Normalizer Engine)
- **تحویل‌دادنی‌ها:**
  - کانکتورهای موتور جمع‌آوری چندمنبعی برای اسپات، فیوچرز، دفتر سفارش، معاملات، فاندینگ، Open Interest، لیکوییدیشن‌ها، فیدهای ماکرو و آن‌چین.
  - زمان‌بند به‌ازای هر منبع با محدودکنندهٔ نرخ، تلاش مجدد تطبیقی، تشخیص شکاف و بازیابی تاریخی (backfill).
  - قالب کانونی موتور نرمال‌سازی: منبع، صرافی، نماد، زمان، توالی، دادهٔ خام و پرچم‌های کیفیت.
  - رجیستری کانونی نماد و صرافی با قواعد دقت و مقیاس، هم‌ترازی UTC و سطربندی یک‌دقیقه‌ای کندل خام.
  - آرشیو تغییرناپذیر پیام‌های خام همراه با checksum، به‌گونه‌ای که هر نوار کانونی از صفر بازتولیدشدنی باشد.
- **نقاط عطف فنی:**
  - حداقل ۲۵ کانکتور فعال؛ هر کانکتور با یک تست قراردادی (contract test) روی fixture ضبط‌شده پوشش داده می‌شود.
  - تأخیر جمع‌آوری p95 کمتر از ۵۰۰ میلی‌ثانیه از زمان صرافی تا انتشار رویداد کانونی.
  - بازپخش بدون افت: جمع‌آوری مجدد هر پنجرهٔ ۲۴ ساعته، نوار کانونی بایت‌به‌بایت یکسان تولید می‌کند.
  - ۱۰۰٪ رویدادهای کانونی دارای شناسهٔ منبع (provenance) و پرچم‌های کیفیت هستند.
  - توان پایدار حداقل ۵۰٬۰۰۰ رویداد در ثانیه در محیط staging با p95 مصرف CPU زیر ۷۰٪.
- **زمان‌بندی تخمینی:** Q4 2026

#### فاز ۲ — وزن‌دهی و فیلتر نویز

- **توضیحات:** منابع موازی را به یک قیمت مرجع قابل اعتماد تبدیل می‌کنیم: موتور وزن‌دهی (Weighting Engine) هر منبع و هر دیده‌بانی را امتیاز می‌دهد و موتور فیلتر نویز (Noise Filter Engine) پیش از هر ذخیره‌سازی، نویز ساختاری — اسپایک، کوت کهنه، معاملات شست‌وشویی و تیک معیوب — را حذف می‌کند.
- **کامپوننت‌ها:** موتور وزن‌دهی (Weighting Engine) · موتور فیلتر نویز (Noise Filter Engine)
- **تحویل‌دادنی‌ها:**
  - موتور وزن‌دهی: لایه‌بندی اعتماد منابع، وزن‌های پویا، کاهش وزن با قدمت، جریمهٔ پراکندگی بین‌منبعی و امتیاز اطمینان برای هر دیده‌بانی.
  - موتور فیلتر نویز: تشخیص داده‌پرتی و اسپایک، سرکوب کوت کهنه، تشخیص معاملات شست‌وشویی، قرنطینهٔ تیک معیوب و سیاست صریح برای شکاف‌ها.
  - پروفایل‌های حذف نویز به‌ازای کلاس دارایی (کریپتو اسپات و فیوچرز، انتشار داده‌های ماکرو، متریک‌های آن‌چین) با تنظیمات نسخه‌دار.
  - تنظیمات قابل بازپخش وزن و فیلتر، تا هر پنجرهٔ تاریخی با پروفایل جدید بازپردازش شود.
  - خروجی شناسایی وزن و اطمینان که به هر رویداد کانونی منتشرشده پیوست می‌شود.
- **نقاط عطف فنی:**
  - امتیاز اطمینان روی ۱۰۰٪ رویدادهای کانونی؛ قابلیت ردیابی منشأ وزن تا (منبع، لایه، نسخهٔ قاعده).
  - Recall نویز حداقل ۹۵٪ با Precision حداقل ۹۸٪ روی پیکرهٔ برچسب‌خوردهٔ ناهنجاری، همراه با ماتریس درهم‌ریختگی منتشرشده.
  - بازپردازش ۹۰ روز تاریخ با پروفایل تغییرکرده در کمتر از ۳۰ دقیقه.
  - خروجی قطعی (deterministic): ورودی و نسخهٔ پروفایل یکسان همیشه وزن یکسان تولید می‌کند.
  - نرخ مثبت کاذب فیلتر روی دادهٔ پاک بازار حداکثر ۰.۱٪، اندازه‌گیری‌شده روی یک هفتهٔ کنارگذاشته‌شده.
- **زمان‌بندی تخمینی:** Q1 2027

#### فاز ۳ — ذخیرهٔ سری‌زمانی و پایش کیفیت داده

- **توضیحات:** نوار کانونی را با سیاست نگهداری و کاهش نمونه در TSDB ذخیره می‌کنیم و با پایشگر کیفیت داده (Data Quality Monitor) صحت آن را تضمین می‌کنیم؛ پایشگری که هر منبع و نماد را امتیاز می‌دهد و دادهٔ معیوب را خودکار قرنطینه می‌کند.
- **کامپوننت‌ها:** پایگاه دادهٔ سری‌زمانی (TSDB) · پایشگر کیفیت داده (Data Quality Monitor)
- **تحویل‌دادنی‌ها:**
  - پایگاه دادهٔ سری‌زمانی: ذخیرهٔ ستونی برای سری خام کانونی یک‌دقیقه‌ای و رویدادهای کانونی، پارتیشن‌بندی‌شده بر اساس نماد، صرافی و زمان.
  - فشرده‌سازی، لایه‌های نگهداری، کاهش نمونه و viewهای مادی‌سازی‌شده برای کوئری‌های چندساله.
  - ایندکس‌گذاری با کاردینالیتی بالا و API کوئری که موتور چارت، سازندهٔ ربات و موتور هوش مصنوعی از آن استفاده می‌کنند.
  - پایشگر کیفیت داده: امتیاز کامل‌بودن، تازگی، دقت و سازگاری به‌ازای هر منبع، نماد و تایم‌فریم.
  - هشدار کیفیت، ردیابی Lineage، قرنطینهٔ خودکار، جمع‌آوری مجدد خودترمیم و داشبورد عمومی کیفیت.
- **نقاط عطف فنی:**
  - فشرده‌سازی حداقل ۱۰ برابری روی دیسک در مقایسه با پیام خام JSON.
  - تأخیر کوئری p95 کمتر از ۱۵۰ میلی‌ثانیه برای بازهٔ ۳۰ روزهٔ یک‌دقیقه‌ای روی یک نماد.
  - SLA تازگی: p95 کمتر از ۲ ثانیه از رویداد کانونی تا سری قابل کوئری، با راستی‌آزمایی پیوسته.
  - انتشار ساعتی امتیاز کیفیت برای ۱۰۰٪ نمادهای پایش‌شده، با MTTR رخدادهای داده کمتر از ۳۰ دقیقه.
  - قرنطینهٔ خودکار حداکثر ۰.۰۱٪ رکوردها را جدا می‌کند و مسیر تصمیم هر مورد ۱۰۰٪ قابل حسابرسی است.
- **زمان‌بندی تخمینی:** Q1 – Q2 2027

### ستون ۲ — موتور چارت (Chart Engine, WASM + WebGL)

رندر شتاب‌گرفته با GPU، چارت‌سازی چندلایه، شیدرهای سفارشی، موتور اندیکاتور، لایه‌های رویداد و خط لولهٔ رندر پرتکرار — همه روی یک هستهٔ مشترک WASM + WebGL.

**کامپوننت‌ها:** رندر شتاب‌گرفته با GPU · چارت‌سازی چندلایه · شیدرهای سفارشی · موتور اندیکاتور · لایه‌های رویداد (Event Overlays) · خط لولهٔ رندر پرتکرار

#### فاز ۴ — هستهٔ رندر: WASM، شتاب GPU و خط لولهٔ پرتکرار

- **توضیحات:** پایهٔ کارایی موتور چارت را می‌سازیم: هستهٔ محاسباتی WASM برای تجزیه، تجمیع و چیدمان، لایهٔ رندر شتاب‌گرفته با GPU روی WebGL، و خط لولهٔ رندر پرتکرار که توان جذب ده‌ها هزار تیک در ثانیه را دارد.
- **کامپوننت‌ها:** رندر شتاب‌گرفته با GPU · خط لولهٔ رندر پرتکرار
- **تحویل‌دادنی‌ها:**
  - هستهٔ محاسباتی WASM (کامپایل‌شده از Rust) برای تجزیه، تجمیع، ساخت ایندکس و چیدمان viewport.
  - لایهٔ رندر شتاب‌گرفته با GPU روی WebGL با فراخوانی‌های instanced، اطلس بافت و استخر بافر.
  - خط لولهٔ رندر پرتکرار: بافرهای حلقه‌ای، به‌روزرسانی ناحیهٔ آلوده (dirty-region)، انتقال کار به Worker و تنظیم نرخ فریم.
  - سیستم سطح جزئیات (LOD) و culling که بودجهٔ فریم را در هر سطح زوم پایدار نگه می‌دارد.
  - بستر بنچمارک با صحنه‌های بازتولیدپذیر، سقف حافظه و ردیابی رگرسیون زمان فریم.
- **نقاط عطف فنی:**
  - ۶۰ فریم بر ثانیه پایدار با حداقل ۱٬۰۰۰٬۰۰۰ نقطهٔ قابل‌نمایش روی یک GPU میان‌رده.
  - جذب حداقل ۱۰٬۰۰۰ تیک در ثانیه بدون افت فریم.
  - زمان فریم p99 حداکثر ۸ میلی‌ثانیه، گام محاسباتی WASM حداکثر ۲ میلی‌ثانیه، مرز WASM به JS کمتر از ۰.۲ میلی‌ثانیه در هر فریم.
  - شروع سرد (بارگذاری WASM + نخستین رسم) کمتر از ۵۰۰ میلی‌ثانیه در صحنهٔ بنچمارک.
  - حافظهٔ اوج حداکثر ۳۰۰ مگابایت برای یک نشست ۳۰ روزهٔ یک‌دقیقه‌ای.
- **زمان‌بندی تخمینی:** Q2 – Q3 2027

#### فاز ۵ — چارت‌سازی چندلایه و شیدرهای سفارشی

- **توضیحات:** زبان بصری پلتفرم را می‌سازیم: لایه‌های مستقل و قابل خاموش و روشن‌کردن که موتور آن‌ها را ترکیب می‌کند، و سیستم شیدر سفارشی که هر عنصر بصری را روی GPU رندر می‌کند.
- **کامپوننت‌ها:** چارت‌سازی چندلایه · شیدرهای سفارشی
- **تحویل‌دادنی‌ها:**
  - چارت‌سازی چندلایه: لایه‌های قیمت، حجم، عمق دفتر سفارش، نقشهٔ حرارتی لیکوییدیشن، فاندینگ و Open Interest، به‌همراه لایه‌های ماکرو.
  - مدیر لایه با z-order، ترکیب (compositing)، مقدارگذاری تنبل، لایه‌های off-screen و ذخیرهٔ وضعیت هر لایه.
  - شیدرهای سفارشی GLSL برای کندل‌استیک، حجم گرادیانی، نقشهٔ حرارتی، خطوط درخشان و عناصر کراس‌هیر.
  - رجیستری شیدر با hot reload، نسخه‌بندی و مسیر جانشین (fallback) درست هنگام شکست کامپایل شیدر.
  - پیش‌تنظیم‌های لایه و شیدر که قابل ذخیره، اشتراک‌گذاری و بازیابی در نمایشگر سازندهٔ ربات هستند.
- **نقاط عطف فنی:**
  - ترکیب همزمان حداقل ۱۲ لایهٔ مستقل با ۶۰ فریم بر ثانیه.
  - کامپایل شیدر کمتر از ۵۰ میلی‌ثانیه؛ hot reload بدون بارگذاری مجدد چارت و بدون از دست دادن وضعیت viewport.
  - هزینهٔ کل لایه‌های فعال حداکثر ۲ میلی‌ثانیه در هر فریم در زوم مرجع.
  - مسیر جانشین همان هندسهٔ چیدمان را با تلورانس حداکثر ۱ پیکسل تولید می‌کند.
  - مجموعهٔ رگرسیون بصری با حداقل ۵۰ فریم طلایی که روی GPUهای CI پاس می‌شود.
- **زمان‌بندی تخمینی:** Q3 – Q4 2027

#### فاز ۶ — موتور اندیکاتور و لایه‌های رویداد

- **توضیحات:** اندیکاتورها را به‌صورت افزایشی در WASM محاسبه می‌کنیم تا چارت و استراتژی یک پیاده‌سازی مشترک داشته باشند، و رویدادهای دریاچهٔ داده را روی همان بوم نمایش می‌دهیم تا زمینهٔ بازار دیده شود.
- **کامپوننت‌ها:** موتور اندیکاتور · لایه‌های رویداد (Event Overlays)
- **تحویل‌دادنی‌ها:**
  - موتور اندیکاتور: محاسبهٔ افزایشی و جریانی در WASM با به‌روزرسانی O(1) در هر تیک.
  - رجیستری اندیکاتور با شمای پارامتر، مدیریت warm-up و API عمومی برای اندیکاتورهای سفارشی.
  - لایهٔ هم‌ارزی عددی که تضمین می‌کند خروجی اندیکاتور در موتور چارت و سازندهٔ ربات یکسان است.
  - لایه‌های رویداد تغذیه‌شده از رویدادهای دریاچهٔ داده: انتشار داده‌های ماکرو، تغییر فاندینگ، لیکوییدیشن‌ها، عرضه و حذف نمادها.
  - لایهٔ حاشیه‌نویسی با نشانگرهای زمانی، خوشه‌بندی در زوم پایین، فیلترها و ذخیرهٔ حاشیه‌نویسی کاربر.
- **نقاط عطف فنی:**
  - حداقل ۶۰ اندیکاتور داخلی که هرکدام در حداکثر ۰.۱ میلی‌ثانیه در هر تیک به‌روزرسانی می‌شوند.
  - هم‌ارزی ۱۰۰٪ بین مقادیر اندیکاتور در چارت و بک‌تست با خطای نسبی حداکثر ۱e-9.
  - نمایش حداقل ۱۰۰٬۰۰۰ رویداد لایه‌ای با خوشه‌بندی و ۶۰ فریم بر ثانیه.
  - warm-up قطعی: مقادیر اندیکاتور مستقل از مقدار تاریخی است که بارگذاری می‌شود.
  - چرخهٔ ایجاد، ویرایش و حذف حاشیه‌نویسی بدون هیچ افت در نشست‌های متوالی.
- **زمان‌بندی تخمینی:** Q4 2027 – Q1 2028

### ستون ۳ — سازندهٔ ربات نودی (Bot Builder, Node-Based)

ویرایشگر گراف نودی تایپ‌دار، مفسر نود قطعی، کامپایلر استراتژی، موتور بک‌تست، مجری معاملات زنده و ماژول مدیریت ریسک — یک آرتیفکت واحد از ایده تا سفارش زنده.

**کامپوننت‌ها:** ویرایشگر گراف نودی · مفسر نود · کامپایلر استراتژی · موتور بک‌تست · مجری معاملات زنده · ماژول مدیریت ریسک

#### فاز ۷ — ویرایشگر گراف نودی و مفسر نود

- **توضیحات:** سطح نویسندگی سازندهٔ ربات را تحویل می‌دهیم: ویرایشگر گراف نودی با تایپ مشخص و مفسری قطعی که هر گراف را به‌صورت امن درون sandbox اجرا می‌کند.
- **کامپوننت‌ها:** ویرایشگر گراف نودی · مفسر نود
- **تحویل‌دادنی‌ها:**
  - ویرایشگر گراف نودی: بوم با پالت نود، پورت‌های تایپ‌دار، اعتبارسنجی زنده، undo/redo، گروه‌ها، کامنت‌ها و minimap.
  - سریال‌سازی گراف به سند AST/JSON نسخه‌دار، با copy/paste، استخراج زیرگراف و ذخیره‌های قابل diff.
  - مفسر نود: زمان‌بند توپولوژیک، نودهای جریانی و رویدادمحور، نودهای stateful و کنترل backpressure.
  - بافرهای حلقه‌ای با حافظهٔ کران‌دار، seed قطعی و اجرای sandbox شده بدون دسترسی به شبکه و فایل‌سیستم.
  - hot reload زیرگراف‌های ویرایش‌شده روی یک نشست اجرای فعال.
- **نقاط عطف فنی:**
  - حداقل ۱۵۰ نود هسته با امضای تایپ‌دار و مستندات.
  - باز و ویرایش کردن یک گراف ۲٬۰۰۰ نودی با ۶۰ فریم بر ثانیه و اعتبارسنجی زیر ۱۰۰ میلی‌ثانیه.
  - خروجی بیت‌به‌بیت یکسان هنگام بازپخش یک گراف روی یک نوار ورودی یکسان.
  - مجموعهٔ تست فرار از sandbox با صفر یافته پاس می‌شود.
  - حافظهٔ پایدار مفسر کمتر از ۵۱۲ مگابایت برای یک گراف ۲٬۰۰۰ نودی.
- **زمان‌بندی تخمینی:** Q1 – Q2 2028

#### فاز ۸ — کامپایلر استراتژی و موتور بک‌تست

- **توضیحات:** گراف‌ها را به برنامهٔ اجرایی بهینه‌شده کامپایل می‌کنیم و در برابر تاریخ می‌آزماییم: کامپایلر استراتژی آرتیفکت‌های امضاشده تولید می‌کند و موتور بک‌تست آن‌ها را با ریزساختار، کارمزد و تأخیر واقع‌گرایانه بازپخش می‌کند.
- **کامپوننت‌ها:** کامپایلر استراتژی · موتور بک‌تست
- **تحویل‌دادنی‌ها:**
  - کامپایلر استراتژی: گراف به IR به برنامهٔ اجرایی بهینه، با constant folding، حذف نود مرده و موازی‌سازی شاخه‌ها.
  - نسخه‌بندی استراتژی، امضای آرتیفکت و تاریخچهٔ قابل diff استراتژی.
  - موتور بک‌تست: بازپخش رویدادمحور در دقت تیک و کندل با حسابداری پورتفوی چنددارایی.
  - مدل هزینهٔ واقع‌گرایانه: کارمزد، اسلیپیج، فاندینگ، استقراض، تأخیر و شبیه‌سازی پر شدن جزئی سفارش.
  - تحلیل walk-forward، جست‌وجوی پارامتری، بازنمونه‌گیری مونت‌کارلو و مجموعهٔ کامل متریک‌ها (شارپ، سورتینو، کالمار، Profit Factor، حداکثر افت، نرخ برد).
- **نقاط عطف فنی:**
  - آرتیفکت کامپایل‌شده حداقل ۵ برابر سریع‌تر از گراف تفسیرشده روی بار کاری مرجع.
  - مجموعهٔ تست نشت اطلاعات آینده ۱۰۰٪ پاس می‌شود؛ هر نتیجه سند مرز دادهٔ خود را ثبت می‌کند.
  - یک سال دادهٔ یک‌دقیقه‌ای روی ۵۰ نماد در کمتر از ۵ دقیقه با اجراکنندهٔ موازی بک‌تست می‌شود.
  - ارزیابی ۱٬۰۰۰ ترکیب پارامتر در کمتر از ۳۰ دقیقه با ترتیب بازتولیدپذیر.
  - دو اجرای یک پیکربندی و seed یکسان، بیت‌به‌بیت یکسان هستند.
- **زمان‌بندی تخمینی:** Q2 – Q3 2028

#### فاز ۹ — مجری معاملات زنده و ماژول مدیریت ریسک

- **توضیحات:** استراتژی‌های کامپایل‌شده را از طریق مجری سازگارساز و ایمن به معاملات زنده ارتقا می‌دهیم و هر سفارش را پیش از رسیدن به صرافی از ماژول مدیریت ریسک عبور می‌دهیم.
- **کامپوننت‌ها:** مجری معاملات زنده · ماژول مدیریت ریسک
- **تحویل‌دادنی‌ها:**
  - مجری معاملات زنده: مسیریاب سفارش، ماشین حالت OMS، شناسه‌های سفارش idempotent و سازگارسازی با صرافی.
  - ارتقای paper به live با همان آرتیفکت کامپایل‌شده‌ای که بک‌تست و تأیید شده است.
  - تاب‌آوری اتصال: اتصال مجدد، failover، ارسال مجدد ایمن برای بازپخش و kill switch سراسری.
  - ماژول مدیریت ریسک: بررسی‌های پیش از معامله، محدودیت موقعیت، اکسپوژر و اهرم، بودجهٔ ریسک هر استراتژی و قطع‌کننده‌های مدار افت سرمایه.
  - پایش مارجین و لیکوییدیشن، به‌همراه رد کامل حسابرسی هر تصمیم ریسک.
- **نقاط عطف فنی:**
  - هم‌ارزی قصد سفارش حداقل ۹۹.۹٪ بین paper و live در ۳۰ روز متوالی.
  - تأیید سفارش p95 کمتر از ۱۰۰ میلی‌ثانیه با احتساب رفت‌وبرگشت صرافی.
  - صفر سفارش تکراری در ۱۰۰ سناریوی اتصال مجدد اجباری.
  - فعال‌سازی kill switch کمتر از ۱ ثانیه و انحراف سازگارسازی پایان روز صفر برای ۶۰ روز متوالی.
  - بررسی‌های ریسک p99 کمتر از ۵ میلی‌ثانیه و ۱۰۰٪ سفارش‌ها دارای رکورد تصمیم ریسک ذخیره‌شده.
- **زمان‌بندی تخمینی:** Q3 – Q4 2028

### ستون ۴ — موتور هوش مصنوعی (AI Engine)

تولید سیگنال، تشخیص الگو، طبقه‌بند رژیم بازار، ماژول یادگیری تقویتی و خط لولهٔ آموزش مدل — از سری خام تا تصمیم‌های بازتولیدپذیر و کران‌دار از نظر ریسک.

**کامپوننت‌ها:** تولید سیگنال · تشخیص الگو · طبقه‌بند رژیم بازار · ماژول یادگیری تقویتی · خط لولهٔ آموزش مدل

#### فاز ۱۰ — تولید سیگنال و تشخیص الگو

- **توضیحات:** دریاچهٔ داده را به تصمیم تبدیل می‌کنیم: سیگنال‌های کالیبره‌شده و نسخه‌دار تولید می‌شوند و الگوهایی که آن سیگنال‌ها را توضیح می‌دهند — چارت، کندل و ریزساختار — تشخیص داده می‌شوند.
- **کامپوننت‌ها:** تولید سیگنال · تشخیص الگو
- **تحویل‌دادنی‌ها:**
  - تولید سیگنال: لایهٔ ویژگی روی TSDB با احتمالات کالیبره‌شده و بازه‌های اطمینان.
  - باس سیگنال با متادیتای نسخه‌دار، TTL، مالکیت و اتصال مستقیم به گراف‌های سازندهٔ ربات.
  - پایش Drift به‌ازای هر سیگنال، شامل Drift ویژگی، Drift برچسب و افت کالیبراسیون، همراه با هشدار.
  - تشخیص الگو: الگوهای هندسی چارت، الگوهای کندل‌استیک و الگوهای ریزساختار (iceberg، spoofing، absorption).
  - پیکرهٔ الگوی برچسب‌خورده با گزارش Precision و Recall منتشرشده به‌ازای هر خانوادهٔ الگو.
- **نقاط عطف فنی:**
  - حداقل ۲۰ سیگنال تولیدی که هرکدام گروه کنترل تصادفی خود را روی دادهٔ کنارگذاشته‌شده شکست می‌دهد.
  - Precision الگو حداقل ۰.۷۵ و Recall حداقل ۰.۷۰ روی پیکرهٔ برچسب‌خورده.
  - تأخیر سیگنال p95 کمتر از ۵۰ میلی‌ثانیه پس از فراهم شدن کندل یا رویداد محرک.
  - هشدار Drift حداکثر ۱ ساعت پس از تشخیص تغییر توزیع.
  - ۱۰۰٪ سیگنال‌ها از روی رجیستری مدل با نسخه، بازتولیدپذیر هستند.
- **زمان‌بندی تخمینی:** Q4 2028 – Q1 2029

#### فاز ۱۱ — طبقه‌بند رژیم بازار

- **توضیحات:** وضعیت بازار را در زمان واقعی برچسب می‌زنیم تا سیگنال‌ها، استراتژی‌ها و محدودیت‌های ریسک بتوانند تطبیق پیدا کنند: رژیم‌ها به‌ازای هر دارایی و بین‌دارایی با اطمینان، هیسترزیس و تاریخ کامل.
- **کامپوننت‌ها:** طبقه‌بند رژیم بازار
- **تحویل‌دادنی‌ها:**
  - طبقه‌بندی رژیم: روند صعودی و نزولی، رنج، نوسان بالا و پایین، نقدشوندگی کم و زیاد، ریسک‌پذیری و ریسک‌گریزی، به‌ازای هر دارایی و بین‌دارایی.
  - تشخیص نقطهٔ تغییر برخط همراه با امتیاز اطمینان برای هر حالت.
  - قواعد هیسترزیس و حداقل زمان ماندگاری که از لرزش رژیم جلوگیری می‌کند.
  - مخزن تاریخ رژیم با بازپخش کامل و بازسازی نقطه‌ای در زمان، بدون سوگیری بازنگری.
  - مسیریابی آگاه از رژیم که موتور هوش مصنوعی و بودجه‌بندی ریسک سازندهٔ ربات مصرف می‌کنند.
- **نقاط عطف فنی:**
  - دقت رژیم حداقل ۰.۸۰ روی دوره‌های کنارگذاشته‌شده با خطای کالیبراسیون مورد انتظار حداکثر ۰.۰۵.
  - میانهٔ تأخیر تشخیص کمتر از ۱۵ کندل با نرخ سوئیچ اشتباه کمتر از ۵٪.
  - به‌روزرسانی رژیم هر دارایی در هر کندل با p95 کمتر از ۲۰ میلی‌ثانیه.
  - تاریخ پنج‌سالهٔ رژیم، طبقه‌بندی‌شده و از TSDB بازتولیدپذیر.
  - بهبود عملکرد مشروط به رژیم، اندازه‌گیری‌شده و مستند برای هر سیگنال تولیدی.
- **زمان‌بندی تخمینی:** Q1 – Q2 2029

#### فاز ۱۲ — ماژول یادگیری تقویتی و خط لولهٔ آموزش مدل

- **توضیحات:** حلقه را می‌بندیم: سیاست‌ها را در شبیه‌سازی‌ای که روی موتور بک‌تست ساخته شده آموزش می‌دهیم، محدودیت‌های ماژول مدیریت ریسک را از پیش رعایت می‌کنیم و مدل‌ها را از طریق یک خط لولهٔ آموزش حاکمیت‌شده منتشر می‌کنیم.
- **کامپوننت‌ها:** ماژول یادگیری تقویتی · خط لولهٔ آموزش مدل
- **تحویل‌دادنی‌ها:**
  - ماژول یادگیری تقویتی: محیطی برگرفته از موتور بک‌تست با API سبک gym.
  - شکل‌دهی پاداش هم‌تراز با محدودیت‌هایی که ماژول مدیریت ریسک اعمال می‌کند.
  - پیش‌آموزش آفلاین و تقلیدی به‌همراه تنظیم دقیق برخط، با خروجی‌گرفتن سیاست به‌صورت آرتیفکتی که در گراف‌های سازندهٔ ربات قابل استفاده است.
  - خط لولهٔ آموزش مدل: نسخه‌بندی و Lineage دیتاست، اسنپ‌شات Feature Store، ارکستراسیون و زمان‌بندی GPU.
  - ردیابی آزمایش‌ها، جست‌وجوی فراپارامتر، رجیستری مدل، دروازه‌های ارزیابی، انتشار canary و بازگردانی.
- **نقاط عطف فنی:**
  - سیاست‌های RL روی حداقل ۳ از ۵ بازار کنارگذاشته‌شده، بهترین استراتژی دستی تنظیم‌شده را با محدودیت‌های ریسک یکسان شکست می‌دهند.
  - توان شبیه‌ساز حداقل ۱٬۰۰۰٬۰۰۰ گام محیط در دقیقه.
  - هر اجرای آموزش از روی یک فایل manifest واحد بازتولیدپذیر است.
  - صفر انتشار مدل بدون رکورد دروازهٔ ارزیابی تأییدشده؛ بازگردانی کمتر از ۵ دقیقه.
  - مسیر آموزش → رجیستری → آرتیفکت قابل استقرار در کمتر از ۱ ساعت برای یک مدل کوچک.
- **زمان‌بندی تخمینی:** Q2 – Q3 2029

### ستون ۵ — اقتصاد توکن (Token Economy)

مدل کاربرد با حسابداری sink و source، سیستم استیکینگ با لایه‌های قفل، توزیع پاداش دوره‌ای، سازوکار سوزاندن قابل راستی‌آزمایی روی زنجیر و مدل حاکمیتی که پارامترهای همهٔ این‌ها را کنترل می‌کند.

**کامپوننت‌ها:** مدل کاربرد (Utility Model) · سیستم استیکینگ · توزیع پاداش · سازوکار سوزاندن (Burn) · مدل حاکمیتی

#### فاز ۱۳ — مدل کاربرد و سیستم استیکینگ

- **توضیحات:** تعریف می‌کنیم توکن برای چه چیزی است و تعهد چگونه قیمت‌گذاری می‌شود: یک نقشهٔ کامل کاربرد با حسابداری sink و source، و یک سیستم استیکینگ با لایه‌های قفل، وزن‌دهی و قلاب‌های slashing.
- **کامپوننت‌ها:** مدل کاربرد (Utility Model) · سیستم استیکینگ
- **تحویل‌دادنی‌ها:**
  - مدل کاربرد: نقشهٔ کاربرد توکن شامل کارمزد معاملات، اشتراک‌ها، پرداخت‌های بازارگاه، اعتبار محاسبات و استنتاج، سهمیهٔ API و دسترسی سطح‌بندی‌شده.
  - حسابداری sink و source، جدول سطوح، مدل قیمت‌گذاری و کتاب قواعد ضدسوءاستفاده.
  - سیاست خزانه‌داری و زمان‌بندی vesting با شفافیت منتشرشدهٔ آزادسازی.
  - سیستم استیکینگ: استیک و آن‌استیک با لایه‌های قفل، قدرت رأی وزنی بر زمان و مقدار و تعلق پاداش.
  - قلاب‌های slashing برای تخلف در بازارگاه، توقف اضطراری و قراردادهای حسابرسی‌شدهٔ بیرونی.
- **نقاط عطف فنی:**
  - اجرای کامل جریان‌های کاربرد روی testnet: کارمزد، اشتراک، اعتبار و سهمیه.
  - حداقل ۳ قرارداد حسابرسی‌شده با صفر یافتهٔ بحرانی یا بالا باز.
  - گس استیک و آن‌استیک حداکثر ۱۲۰٬۰۰۰، با تست‌های تغییرناپذیر تعلق پاداش و slashing که ۱۰۰٪ پاس می‌شوند.
  - مجموعهٔ تست invariant و fuzz حداقل ۱۰٬۰۰۰ اجرا بدون نقض هیچ تغییرناپذیر.
  - جدول پارامترهای اقتصادی بازبینی همتا و در هر پنج زبان وایت‌پیپر منتشر شده است.
- **زمان‌بندی تخمینی:** Q1 – Q2 2029

#### فاز ۱۴ — توزیع پاداش و سازوکار سوزاندن

- **توضیحات:** برای مشارکت پاداش می‌پردازیم و سیاست عرضه را صریح می‌کنیم: پاداش‌های دوره‌ای و وزن‌ترب‌شده با ادعای قابل تأیید، و سازوکار سوزاندنی که روی زنجیر قابل راستی‌آزمایی و متصل به کارمزد پلتفرم است.
- **کامپوننت‌ها:** توزیع پاداش · سازوکار سوزاندن (Burn)
- **تحویل‌دادنی‌ها:**
  - توزیع پاداش: تعلق دوره‌ای، حسابداری اسنپ‌شات و ادعای مبتنی بر Merkle.
  - وزن‌دهی مشارکت در کیفیت داده، استراتژی‌ها، اندیکاتورها، مدل‌ها و مشارکت محاسباتی.
  - مقاومت در برابر فارمینگ و sybil، vesting پاداش و ادعای دسته‌ای گس‌کارآمد.
  - داشبوردهای عمومی پاداش با بازتولیدپذیری هر دوره از روی اسنپ‌شات‌ها.
  - سازوکار سوزاندن: زمان‌بندی سوزاندن کارمزد، آدرس سوزاندن قابل راستی‌آزمایی، سیاست بازخرید و سوزاندن خزانه‌داری، سقف سوزاندن و توقف اضطراری.
- **نقاط عطف فنی:**
  - صفر دورهٔ پاداش از دست‌رفته در ۳ ماه عملیات متوالی.
  - محاسبهٔ پاداش به‌صورت مستقل از روی اسنپ‌شات‌ها و وزن‌های منتشرشده بازتولیدپذیر است.
  - ۱۰۰٪ سوزاندن‌ها روی زنجیر و در برابر دفتر عمومی قابل راستی‌آزمایی.
  - حداقل ۹۵٪ از خوشه‌های فارمینگ شبیه‌سازی‌شده توسط قواعد ضد sybil شناسایی می‌شوند.
  - نرخ سوزاندن و وزن‌های پاداش فقط از طریق رجیستری پارامتر تحت کنترل حاکمیت قابل تغییرند.
- **زمان‌بندی تخمینی:** Q3 2029

#### فاز ۱۵ — مدل حاکمیتی

- **توضیحات:** پارامترهای اقتصاد را به دست کاربرانش می‌سپاریم: چرخهٔ کامل پیشنهاد، رأی‌گیری وزنی بر استیک و قفل‌شده در زمان، تفویض اختیار و اجرای زمان‌قفل‌شده روی زنجیر.
- **کامپوننت‌ها:** مدل حاکمیتی
- **تحویل‌دادنی‌ها:**
  - مدل حاکمیتی با چرخهٔ کامل پیشنهاد: پیش‌نویس در انجمن، پیشنهاد روی زنجیر، رأی‌گیری، تایم‌لوک و اجرا.
  - قدرت رأی وزنی بر استیک و قفل‌شده در زمان همراه با پشتیبانی از تفویض اختیار.
  - آستانه‌های حد نصاب و تأیید، به‌همراه رجیستری پارامتر تحت کنترل حاکمیت برای کارمزد، نرخ سوزاندن، وزن‌های پاداش و لیستینگ‌ها.
  - تایم‌لوک و رویه‌های اضطراری چندامضایی همراه با playbook منتشرشده.
  - مستندات حاکمیت، قالب‌های پیشنهاد و تاریخ عمومی رأی‌گیری.
- **نقاط عطف فنی:**
  - اجرای کامل چرخه حداقل ۲۰ بار روی testnet، شامل ۲ تغییر پارامتر و ۱ تمرین توقف اضطراری.
  - تایم‌لوک حداقل ۴۸ ساعته، اجراشده روی زنجیر و غیرقابل دورزدن با یک کلید واحد.
  - ۱۰۰٪ اقدامات حاکمیتی رکورد قابل حسابرسی روی زنجیر تولید می‌کنند.
  - حسابداری تفویض اختیار و قدرت رأی توسط حسابرسی بیرونی با صفر یافتهٔ بالا تأیید شده است.
  - مستندات حاکمیت در هر پنج زبان وایت‌پیپر منتشر شده است.
- **زمان‌بندی تخمینی:** Q4 2029

### ستون ۶ — بازارگاه (Marketplace)

بازارگاه استراتژی، بازارگاه اندیکاتور، بازارگاه مدل هوش مصنوعی و اقتصاد سازندگان — جایی که خروجی پنج ستون پیشین به محصولی دارای مجوز، پرداخت‌شده و قابل تأیید تبدیل می‌شود.

**کامپوننت‌ها:** بازارگاه استراتژی · بازارگاه اندیکاتور · بازارگاه مدل هوش مصنوعی · اقتصاد سازندگان (Creator Economy)

#### فاز ۱۶ — بازارگاه استراتژی و بازارگاه اندیکاتور

- **توضیحات:** خروجی پلتفرم را به اشخاص ثالث باز می‌کنیم: استراتژی‌ها با عملکرد تأییدشدهٔ ماشینی عرضه می‌شوند و اندیکاتورها به‌صورت بسته‌های WASM سندباکس‌شده برای موتور اندیکاتور توزیع می‌شوند.
- **کامپوننت‌ها:** بازارگاه استراتژی · بازارگاه اندیکاتور
- **تحویل‌دادنی‌ها:**
  - بازارگاه استراتژی: لیستینگ‌ها، متادیتا، مدل‌های مجوز و اشتراک یا کپی.
  - عملکرد تأییدشدهٔ ماشینی برای هر لیستینگ، تولیدشده توسط موتور بک‌تست با گواهی عدم نگاه به آینده (no-lookahead).
  - اجرای سندباکس‌شدهٔ استراتژی‌های خریداری‌شده روی دادهٔ زنده، با امتیاز، نظرات و فرایند اختلاف و بازپرداخت.
  - بازارگاه اندیکاتور: بسته‌های اندیکاتور WASM برای موتور اندیکاتور با محدودیت‌های شمای ورودی و نسخه.
  - محدودیت منابع سندباکس (CPU، حافظه، بدون شبکه)، شرایط مجوز و تقسیم درآمد خودکار.
- **نقاط عطف فنی:**
  - خط لولهٔ انتشار به تأیید به لیستینگ، کاملاً خودکار در کمتر از ۲۴ ساعت برای هر لیستینگ.
  - حداقل ۹۰٪ لیستینگ‌های فعال دارای متریک‌های تأییدشدهٔ ماشینی هستند؛ لیستینگ‌های تأییدنشده به‌صورت آشکار علامت‌گذاری می‌شوند.
  - مجموعه‌های تست فرار از سندباکس و سوءاستفاده از منابع با صفر یافته پاس می‌شوند.
  - صدور مجوز و سازگارسازی پرداخت سازندگان در ۳ ماه با صفر ناهمخوانی.
  - بازارگاه برای ۱٬۰۰۰ لیستینگ همزمان تست بار شده با پاسخ صفحهٔ p95 کمتر از ۳۰۰ میلی‌ثانیه.
- **زمان‌بندی تخمینی:** Q2 – Q3 2029

#### فاز ۱۷ — بازارگاه مدل هوش مصنوعی و اقتصاد سازندگان

- **توضیحات:** اکوسیستم را کامل می‌کنیم: مدل‌ها با شواهد ارزیابی و استنتاج سهم‌تر منتشر می‌شوند و اقتصاد سازندگان به مشارکت‌کنندگان برای عملکرد پایدار پاداش می‌دهد.
- **کامپوننت‌ها:** بازارگاه مدل هوش مصنوعی · اقتصاد سازندگان (Creator Economy)
- **تحویل‌دادنی‌ها:**
  - بازارگاه مدل هوش مصنوعی: کارت مدل، کارنامهٔ ارزیابی و نتایج بنچمارک روی دادهٔ کنارگذاشته‌شده.
  - استنتاج میزبانی‌شده و سهم‌تر با لایه‌های تأخیر و حسابداری شفاف به‌ازای هر فراخوانی.
  - سیاست حذف از فهرست بر اساس Drift و افت، با محرک‌های بازبینی خودکار.
  - اقتصاد سازندگان: پروفایل سازنده، احراز هویت، اعتبار برآمده از عملکرد زنده و میزان استفاده، حق امتیاز و تقسیم درآمد لایه‌ای.
  - تحلیل سازنده، SDK سازنده و ریل‌های پرداخت توکنی با خروجی مالیات و گزارش‌گیری.
- **نقاط عطف فنی:**
  - استنتاج میزبانی‌شده p95 کمتر از ۲۰۰ میلی‌ثانیه با ۱۰۰٪ دقت سهم‌تری در برابر دفتر کل.
  - هر کارت مدل پیش از امکان لیستینگ، رکورد دروازهٔ ارزیابی امضاشده دارد.
  - بازبینی خودکار Drift حداکثر ۲۴ ساعت پس از عبور از آستانهٔ افت فعال می‌شود.
  - اعتبار یکنواخت سازنده برای ۱۰۰٪ لیستینگ‌ها از دادهٔ زنده و نظرات محاسبه می‌شود.
  - SDK سازنده با مستندات در هر پنج زبان وایت‌پیپر منتشر می‌شود.
- **زمان‌بندی تخمینی:** Q4 2029

### RADI Ecosystem — Tokenomics

Distribution structure, release models and the economic role of every token. Figures describe the planned model.

#### Row 1 — Token Structure

##### Pre-Supply Token — 1% of total supply · 100 million tokens

- **Release Model:** Progress-based unlock (development milestones)
- **Value Multiplier:** ×10 compared to the main token
- **Purpose:** Reward early contributors and bootstrap ecosystem growth
- **Economic Role:** High-value, scarce token powering the startup's initial momentum

##### Total Supply — 1% pre-supply + 99% main token · 100 billion total tokens

- **Release Model:** Locked until economic activation
- **Value Ratio:** ×10 pre-supply token + ×1 main token
- **Purpose:** Full transparency in distribution structure
- **Economic Role:** Foundation of the entire ecosystem and source of long-term circulation

##### Main Token — 99% of total supply · 99 billion tokens

- **Release Model:** Utility-driven and revenue-based unlock
- **Value Multiplier:** ×1 main token
- **Purpose:** Balanced growth between token value and platform utility
- **Economic Role:** Primary asset for payments, tools, automation, and user interactions

#### Row 2 — Platform Economy

##### Economic Engine — Consumption-driven + revenue-driven model · Gradual increase of circulating tokens

- **Release Model:** Scales with platform revenue and user expansion
- **Consumption Flow:** AI Engine, Bot Builder, Marketplace
- **Purpose:** Build a sustainable revenue ecosystem
- **Economic Role:** Convert user activity into real token value

##### Utility — Payments for intelligent trading and AI-powered services · User-to-service transaction layer

- **Release Model:** Direct token purchase for service access
- **Use Cases:** Model execution, bot creation, tool purchases, data APIs
- **Purpose:** Establish real and continuous token consumption
- **Economic Role:** Activate all platform modules through token usage

##### Staking — Dynamic APR + token freeze for premium services · Value-driven policy mechanism

- **Release Model:** Allocation of a portion of unlocked tokens into staking pools
- **Reward Model:** Access to platform services and exclusive features
- **Purpose:** Increase network stability and reduce circulating supply
- **Economic Role:** Long-term incentive mechanism strengthening token value

##### Current stage: Development-based pre-supply

| Token | Total supply | Released to date | Released | Value multiplier |
|---|---|---|---|---|
| Pre-supply token | 100,000,000 | 1,000,000 | 1% | ×10 |
| Main token | 99,000,000,000 | 0 | 0% | ×1 |

**1 pre-supply token = 10 main tokens**

- Tokens in this stage: 1,000,000
- Released to date: 100,000
- Value per unit: ×10 versus the main token

**Buy Samara token** — Purchase through the official RADI wallet or partner exchanges.

### وابستگی‌ها و مسیر بحرانی

| فازها | توضیحات |
|---|---|
| فاز 1 → فاز 2 | موتور وزن‌دهی پیش از امتیازدهی به رویدادهای کانونی و نرمال‌شده نیاز دارد. |
| فاز 2 → فاز 3 | TSDB دیده‌بانی‌های وزن‌دار و بدون نویز را ذخیره می‌کند، نه پیام خام. |
| فاز 3 → فاز 4 | هستهٔ رندر سری‌های کانونی را از TSDB می‌خواند. |
| فاز 3 → فاز 6 | لایه‌های رویداد از رویدادهای کانونی منتشرشدهٔ دریاچهٔ داده تغذیه می‌شوند. |
| فاز 3 → فاز 9 | بررسی‌های ریسک بر پایهٔ امتیازهای کیفیت و اطمینان دریاچهٔ داده کالیبره می‌شوند. |
| فاز 4 → فاز 5 | هر لایه و شیدر روی هستهٔ رندر GPU می‌نشیند. |
| فاز 5 → فاز 6 | اندیکاتورها و لایه‌های رویداد به مدیر لایه وصل می‌شوند. |
| فاز 6 → فاز 7 | نودهای گراف همان پیاده‌سازی اندیکاتور را مصرف می‌کنند که چارت رندر می‌کند. |
| فاز 7 → فاز 8 | کامپایلر و بک‌تست گراف‌های نودی سریال‌شده را مصرف می‌کنند. |
| فاز 8 → فاز 9 | مجری زنده همان آرتیفکت کامپایل‌شده‌ای را بازپخش می‌کند که بک‌تست شده است. |
| فاز 8 → فاز 10 | سیگنال‌ها پیش از انتشار روی موتور بک‌تست اعتبارسنجی می‌شوند. |
| فاز 9 → فاز 12 | سیاست‌های RL همان محدودیت‌های ریسک معاملات زنده را رعایت می‌کنند. |
| فاز 9 → فاز 13 | کاربرد توکن در برابر کارمزد واقعی معاملات و مصرف اندازه‌گیری‌شده قیمت‌گذاری می‌شود. |
| فاز 10 → فاز 11 | ویژگی‌های رژیم از لایهٔ ویژگی سیگنال استخراج می‌شوند. |
| فاز 11 → فاز 12 | وضعیت رژیم ورودی شکل‌دهی پاداش در ماژول RL است. |
| فاز 12 → فاز 17 | لیستینگ مدل‌های هوش مصنوعی با دروازه‌های ارزیابی خط لولهٔ آموزش مدل کنترل می‌شود. |
| فاز 13 → فاز 14 | پاداش‌ها و سوزاندن‌ها روی حسابداری کاربرد و استیکینگ تسویه می‌شوند. |
| فاز 13 → فاز 16 | پرداخت‌های بازارگاه و کارمزد مجوز در اقتصاد توکن تسویه می‌شوند. |
| فاز 14 → فاز 15 | حاکمیت پارامترهایی را کنترل می‌کند که در اختیار توزیع پاداش و سوزاندن است. |
| فاز 14 → فاز 17 | پرداخت به سازندگان از طریق توزیع پاداش و حسابداری سیاست سوزاندن تسویه می‌شود. |
| فاز 6 → فاز 16 | بسته‌های بازارگاه اندیکاتور برای موتور اندیکاتور هدف‌گذاری می‌شوند. |
| فاز 8 → فاز 16 | لیستینگ‌های استراتژی به‌صورت سرتاسری توسط موتور بک‌تست تأیید می‌شوند. |
| فاز 16 → فاز 17 | اقتصاد سازندگان همان بازارگاهی را گسترش می‌دهد که استراتژی و اندیکاتور را فهرست می‌کند. |

**مسیر بحرانی:** فاز 1 → فاز 2 → فاز 3 → فاز 4 → فاز 5 → فاز 6 → فاز 7 → فاز 8 → فاز 9 → فاز 10 → فاز 11 → فاز 12 → فاز 17

### معیارهای خروج هر ستون

- **ستون ۱ — دریاچهٔ داده (Data Lake)**
  - هر پنجرهٔ تاریخی می‌تواند بایت‌به‌بایت از آرشیو خام و با پروفایل فعال وزن و فیلتر بازتولید شود.
  - امتیاز کیفیت برای هر نماد پایش‌شده منتشر می‌شود و هر رکورد قرنطینه‌شده سرتاسری قابل ردیابی است.
- **ستون ۲ — موتور چارت (Chart Engine, WASM + WebGL)**
  - کل پشتهٔ لایه‌ها با ۶۰ فریم بر ثانیه رندر می‌شود و موتور اندیکاتور هم‌ارزی عددی خود را با سازندهٔ ربات حفظ می‌کند.
  - هر رویدادی که دریاچهٔ داده منتشر می‌کند، به‌صورت لایه روی همان بوم قابل نمایش است.
- **ستون ۳ — سازندهٔ ربات نودی (Bot Builder, Node-Based)**
  - همان آرتیفکت کامپایل‌شدهٔ استراتژی برای بک‌تست، paper و live استفاده می‌شود، بدون بازنویسی مجدد.
  - هیچ سفارشی بدون رکورد تصمیم ریسک ذخیره‌شده از ماژول مدیریت ریسک به صرافی نمی‌رسد.
- **ستون ۴ — موتور هوش مصنوعی (AI Engine)**
  - هر سیگنال، مدل و سیاست منتشرشده از رجیستری بازتولیدپذیر است و دروازهٔ ارزیابی خود را با محدودیت‌های ریسک زنده پاس می‌کند.
  - هر سیگنال و مدل از نظر Drift پایش می‌شود و مسیر بازبینی خودکار دارد.
- **ستون ۵ — اقتصاد توکن (Token Economy)**
  - کاربرد، استیکینگ، پاداش، سوزاندن و حاکمیت همه روی زنجیر فعال‌اند، با قراردادهای حسابرسی‌شده و بدون دورزدن ویژه.
  - هر پارامتر اقتصادی فقط از طریق رجیستری پارامتر تحت کنترل حاکمیت قابل تغییر است.
- **ستون ۶ — بازارگاه (Marketplace)**
  - اشخاص ثالث استراتژی، اندیکاتور و مدل منتشر می‌کنند که تأیید، سندباکس، مجوز و پرداخت خودکار دارند.
  - هر لیستینگ پیش از فروش، شواهد تأییدشدهٔ ماشینی دارد.

### معیارهای خروج برنامه

- هر شش ستون به‌صورت سرتاسری روی یک قرارداد دادهٔ کانونی کار می‌کنند؛ از جمع‌آوری داده تا تسویهٔ بازارگاه.
- هر کامپوننت معماری زنده، پایش‌شده، در بخش‌های مرتبط با دارایی حسابرسی‌شده و از روی یک رجیستری یا آرتیفکت نسخه‌دار بازتولیدپذیر است.
- کل سند نقشهٔ راه در پنج زبان با ساختار یکسان و اعداد یکسان موجود است.

---

<a id="ar"></a>

## Arabic — العربية

**اللغة:** العربية (`ar`, rtl)

### RADI — Technical Roadmap

*6 ركائز معمارية · 17 مرحلة · Q4 2026 → Q4 2029*

هذا المستند هو خارطة طريق مرحلية لمنصة ذكاء البيانات المالية، ويتبع المعمارية المعتمدة حرفيًا: ست ركائز — بحيرة البيانات (Data Lake)، ومحرك الرسوم البيانية (Chart Engine, WASM + WebGL)، ومنشئ الروبوتات المعتمد على العُقد (Bot Builder, Node-Based)، ومحرك الذكاء الاصطناعي (AI Engine)، واقتصاد الرمز (Token Economy)، والسوق (Marketplace). كل مُخرَج أدناه ينتمي إلى أحد المكوّنات المسمّاة؛ ولا يُضاف أي مكوّن معماري جديد ولا يُبسَّط أو يُحذف أي مكوّن.

**مبادئ البرنامج**

- لا مكوّنات معمارية جديدة: لا تظهر في خارطة الطريق إلا مكوّنات المعمارية المعتمدة.
- ترتيب البناء من الأسفل إلى الأعلى: كل ركيزة تستهلك المخرجات المتحقَّق منها في الركيزة السابقة.
- كل مرحلة تُختتم بوابات قبول قابلة للقياس، لا بعروض توضيحية.
- الركائز الست تشترك في عقد بيانات واحد: سلاسل قانونية خام بدقة دقيقة واحدة إضافة إلى الأحداث القانونية.
- كل مرحلة تُنشر بخمس لغات في الورقة البيضاء: الإنجليزية والفارسية والعربية والتركية والألمانية.

### نظرة عامة على الجدول الزمني

| الركائز المعمارية | المكوّنات | المراحل | الجدول الزمني المتوقع |
|---|---|---|---|
| الركيزة 1 — بحيرة البيانات (Data Lake) | محرك الجلب متعدد المصادر (Fetcher Engine), محرك التطبيع (Normalizer Engine) | المرحلة 1 — الجمع متعدد المصادر والتطبيع القانوني | Q4 2026 |
| الركيزة 1 — بحيرة البيانات (Data Lake) | محرك الترجيح (Weighting Engine), محرك ترشيح الضوضاء (Noise Filter Engine) | المرحلة 2 — الترجيح وترشيح الضوضاء | Q1 2027 |
| الركيزة 1 — بحيرة البيانات (Data Lake) | قاعدة بيانات السلاسل الزمنية (TSDB), مراقب جودة البيانات (Data Quality Monitor) | المرحلة 3 — تخزين السلاسل الزمنية ومراقبة جودة البيانات | Q1 – Q2 2027 |
| الركيزة 2 — محرك الرسوم البيانية (Chart Engine, WASM + WebGL) | عرض مُسرَّع بواسطة GPU, خط أنابيب عرض عالي التردد | المرحلة 4 — نواة العرض: WASM وتسريع GPU وخط الأنابيب عالي التردد | Q2 – Q3 2027 |
| الركيزة 2 — محرك الرسوم البيانية (Chart Engine, WASM + WebGL) | رسم بياني متعدد الطبقات, شيدرات مخصصة | المرحلة 5 — الرسم متعدد الطبقات والشيدرات المخصصة | Q3 – Q4 2027 |
| الركيزة 2 — محرك الرسوم البيانية (Chart Engine, WASM + WebGL) | محرك المؤشرات, طبقات الأحداث | المرحلة 6 — محرك المؤشرات وطبقات الأحداث | Q4 2027 – Q1 2028 |
| الركيزة 3 — منشئ الروبوتات المعتمد على العُقد (Bot Builder, Node-Based) | محرر مخطط العُقد, مفسّر العُقد | المرحلة 7 — محرر مخطط العُقد ومفسّر العُقد | Q1 – Q2 2028 |
| الركيزة 3 — منشئ الروبوتات المعتمد على العُقد (Bot Builder, Node-Based) | مُصرِّف الاستراتيجية, محرك الاختبار الرجعي | المرحلة 8 — مُصرِّف الاستراتيجية ومحرك الاختبار الرجعي | Q2 – Q3 2028 |
| الركيزة 3 — منشئ الروبوتات المعتمد على العُقد (Bot Builder, Node-Based) | منفّذ التداول الحي, وحدة إدارة المخاطر | المرحلة 9 — منفّذ التداول الحي ووحدة إدارة المخاطر | Q3 – Q4 2028 |
| الركيزة 4 — محرك الذكاء الاصطناعي (AI Engine) | توليد الإشارات, اكتشاف الأنماط | المرحلة 10 — توليد الإشارات واكتشاف الأنماط | Q4 2028 – Q1 2029 |
| الركيزة 4 — محرك الذكاء الاصطناعي (AI Engine) | مصنّف أنظمة السوق | المرحلة 11 — مصنّف أنظمة السوق | Q1 – Q2 2029 |
| الركيزة 4 — محرك الذكاء الاصطناعي (AI Engine) | وحدة التعلم المعزز, خط أنابيب تدريب النماذج | المرحلة 12 — وحدة التعلم المعزز وخط أنابيب تدريب النماذج | Q2 – Q3 2029 |
| الركيزة 5 — اقتصاد الرمز (Token Economy) | نموذج المنفعة, نظام الستيكينغ | المرحلة 13 — نموذج المنفعة ونظام الستيكينغ | Q1 – Q2 2029 |
| الركيزة 5 — اقتصاد الرمز (Token Economy) | توزيع المكافآت, آلية الحرق | المرحلة 14 — توزيع المكافآت وآلية الحرق | Q3 2029 |
| الركيزة 5 — اقتصاد الرمز (Token Economy) | نموذج الحوكمة | المرحلة 15 — نموذج الحوكمة | Q4 2029 |
| الركيزة 6 — السوق (Marketplace) | سوق الاستراتيجيات, سوق المؤشرات | المرحلة 16 — سوق الاستراتيجيات وسوق المؤشرات | Q2 – Q3 2029 |
| الركيزة 6 — السوق (Marketplace) | سوق نماذج الذكاء الاصطناعي, اقتصاد المبدعين | المرحلة 17 — سوق نماذج الذكاء الاصطناعي واقتصاد المبدعين | Q4 2029 |

### الركيزة 1 — بحيرة البيانات (Data Lake)

تُنتج بحيرة البيانات نهرًا قانونيًا واحدًا قابلًا لإعادة التشغيل من بيانات السوق والماكرو: جمع متعدد المصادر، وتطبيع، وترجيح، وإزالة الضوضاء، وتخزين سلاسل زمنية، ومراقبة جودة مستمرة.

**المكوّنات:** محرك الجلب متعدد المصادر (Fetcher Engine) · محرك التطبيع (Normalizer Engine) · محرك الترجيح (Weighting Engine) · محرك ترشيح الضوضاء (Noise Filter Engine) · قاعدة بيانات السلاسل الزمنية (TSDB) · مراقب جودة البيانات (Data Quality Monitor)

#### المرحلة 1 — الجمع متعدد المصادر والتطبيع القانوني

- **الوصف:** نُشغّل محرك الجلب (Fetcher Engine) على كل المنصات وتغذيات الماكرو، ونمرّر كل حمولة خام عبر محرك التطبيع (Normalizer Engine) لتحصل الركائز التالية على نهر أحداث قانوني واحد يحمل مصدره، بدلًا من الحمولات الخام.
- **المكوّنات:** محرك الجلب متعدد المصادر (Fetcher Engine) · محرك التطبيع (Normalizer Engine)
- **المخرجات:**
  - موصلات محرك الجلب متعدد المصادر للسبوت والعقود الآجلة ودفتر الأوامر والصفقات والتمويل والفائدة المفتوحة والتصفيات وتغذيات الماكرو وعلى السلسلة.
  - مُجدول لكل مصدر مع محدّد معدل، وإعادة محاولة تكيفية، وكشف الفجوات، وإعادة التعبئة التاريخية.
  - مغلّف قانوني في محرك التطبيع: المصدر، المنصة، الرمز، الطابع الزمني، التسلسل، الحمولة وعلامات الجودة.
  - سجل قانوني للأرقام والمنصات مع قواعد الدقة والمقياس، ومواءمة UTC، وتجميع الشموع الخام في دقائق.
  - أرشيف خام غير قابل للتغيير لكل حمولة مجلوبة مع بصمات تحقق، بحيث يمكن إعادة اشتقاق أي نهر قانوني من الصفر.
- **المعالم التقنية:**
  - ما لا يقل عن 25 موصلًا حيًا، كل واحد منها مغطى باختبار تعاقدي على عيّنة مسجّلة.
  - زمن الجلب p95 أقل من 500 ميلي ثانية من طابع المنصة حتى نشر الحدث القانوني.
  - إعادة تشغيل بلا فقدان: إعادة جلب أي نافذة 24 ساعة تُنتج نهرًا قانونيًا مطابقًا بايت ببايت.
  - 100% من الأحداث القانونية تحمل مصدرها وعلامات الجودة.
  - استيعاب مستدام لا يقل عن 50,000 حدث/ثانية في بيئة الاختبار مع استخدام CPU p95 أقل من 70%.
- **الجدول الزمني المتوقع:** Q4 2026

#### المرحلة 2 — الترجيح وترشيح الضوضاء

- **الوصف:** نحوّل المصادر المتوازية إلى سعر مرجعي واحد موثوق: يمنح محرك الترجيح (Weighting Engine) درجة لكل مصدر ومشاهدة، ويزيل محرك ترشيح الضوضاء (Noise Filter Engine) الضوضاء البنيوية — القفزات، والأسعار الراكدة، وصفقات الغسل، والتيكات المعطوبة — قبل أي تخزين.
- **المكوّنات:** محرك الترجيح (Weighting Engine) · محرك ترشيح الضوضاء (Noise Filter Engine)
- **المخرجات:**
  - محرك الترجيح: طبقات ثقة للمصادر، وأوزان ديناميكية، وتلاشٍ زمني، وعقوبة تباين بين المصادر، ودرجة ثقة لكل مشاهدة.
  - محرك ترشيح الضوضاء: كشف الشواذ والقفزات، وإسكات الأسعار الراكدة، وكشف صفقات الغسل، وحجر التيكات المعطوبة، وسياسة صريحة للفجوات.
  - ملفات ترشيح لكل فئة أصول (سبوت وعقود كريبتو، إصدارات الماكرو، مؤشرات على السلسلة) بإعدادات مُصدَّرة.
  - إعدادات أوزان وترشيح قابلة لإعادة التشغيل، بحيث تُعالَج أي نافذة تاريخية من جديد بملف جديد.
  - مخرَج تشخيصي للأوزان والثقة يُرفق بكل حدث قانوني منشور.
- **المعالم التقنية:**
  - درجة الثقة موجودة على 100% من الأحداث القانونية، مع إمكانية تتبع الوزن إلى (المصدر، الطبقة، إصدار القاعدة).
  - استدعاء الضوضاء 95% على الأقل بدقة 98% على الأقل على مجموعة شواذ موسومة، مع نشر مصفوفة الالتباس.
  - إعادة معالجة 90 يومًا من التاريخ بملف متغير تكتمل في أقل من 30 دقيقة.
  - مخرَج حتمي: المدخلات وإصدار الملف المتطابقة تُنتج أوزانًا متطابقة دائمًا.
  - معدل الإيجابيات الكاذبة للمرشح على بيانات سوق نظيفة لا يزيد على 0.1% مقيسًا على أسبوع محجوز.
- **الجدول الزمني المتوقع:** Q1 2027

#### المرحلة 3 — تخزين السلاسل الزمنية ومراقبة جودة البيانات

- **الوصف:** نخزّن النهر القانوني في قاعدة بيانات السلاسل الزمنية (TSDB) بسياسات استبقاء وتخفيض عيّنات واضحة، ونحفظ أمانته عبر مراقب جودة البيانات (Data Quality Monitor) الذي يقيّم كل مصدر ورمز ويعزل البيانات السيئة تلقائيًا.
- **المكوّنات:** قاعدة بيانات السلاسل الزمنية (TSDB) · مراقب جودة البيانات (Data Quality Monitor)
- **المخرجات:**
  - قاعدة بيانات السلاسل الزمنية: تخزين عمودي للسلاسل القانونية الخام بدقة دقيقة واحدة والأحداث القانونية، مقسَّم حسب الرمز والمنصة والوقت.
  - ضغط وطبقات استبقاء وتخفيض عيّنات وواجهات مادية لأحمال استعلام متعددة السنوات.
  - فهرسة عالية التنوع وواجهة استعلام تستهلكها محرك الرسوم البيانية ومنشئ الروبوتات ومحرك الذكاء الاصطناعي.
  - مراقب جودة البيانات: درجات الاكتمال والحداثة والدقة والاتساق لكل مصدر ورمز وإطار زمني.
  - تنبيهات الجودة، وتتبع النسب، والحجر التلقائي، وإعادة الجلب ذاتية الإصلاح، ولوحة جودة عامة.
- **المعالم التقنية:**
  - ضغط على القرص لا يقل عن 10 أضعاف مقارنة بحمولات JSON الخام.
  - زمن استجابة الاستعلام p95 أقل من 150 ميلي ثانية لمدى 30 يومًا بدقة دقيقة واحدة لرمز واحد.
  - اتفاقية حداثة: p95 أقل من 2 ثانية من الحدث القانوني إلى سلسلة قابلة للاستعلام، بتحقق مستمر.
  - نشر درجة الجودة كل ساعة لـ 100% من الرموز المتابعة، مع زمن إصلاح حوادث البيانات أقل من 30 دقيقة.
  - الحجر التلقائي يعزل 0.01% كحد أقصى من السجلات، مع مسار قرار قابل للتدقيق بنسبة 100%.
- **الجدول الزمني المتوقع:** Q1 – Q2 2027

### الركيزة 2 — محرك الرسوم البيانية (Chart Engine, WASM + WebGL)

عرض مُسرَّع بواسطة GPU، ورسم متعدد الطبقات، وشيدرات مخصصة، ومحرك مؤشرات، وطبقات أحداث، وخط أنابيب عرض عالي التردد — كل ذلك على نواة مشتركة من WASM + WebGL.

**المكوّنات:** عرض مُسرَّع بواسطة GPU · رسم بياني متعدد الطبقات · شيدرات مخصصة · محرك المؤشرات · طبقات الأحداث · خط أنابيب عرض عالي التردد

#### المرحلة 4 — نواة العرض: WASM وتسريع GPU وخط الأنابيب عالي التردد

- **الوصف:** نبني أساس أداء محرك الرسوم البيانية: نواة حسابية بـ WASM للتحليل والتجميع والتخطيط، وطبقة عرض مُسرَّعة بواسطة GPU فوق WebGL، وخط أنابيب عرض عالي التردد قادر على استيعاب عشرات آلاف التيكات في الثانية.
- **المكوّنات:** عرض مُسرَّع بواسطة GPU · خط أنابيب عرض عالي التردد
- **المخرجات:**
  - نواة حسابية بـ WASM (مُصرَّفة من Rust) للتحليل والتجميع وبناء الفهارس وتخطيط منفذ العرض.
  - طبقة عرض مُسرَّعة بواسطة GPU على WebGL مع نداءات رسم instanced وأطالس نسيج ومجمع مخازن.
  - خط أنابيب عرض عالي التردد: مخازن حلقية، وتحديث المناطق المتغيرة، ونقل العمل إلى الوحدات العاملة، وضبط إيقاع الإطارات.
  - نظام مستوى التفصيل (LOD) والاستبعاد (culling) الذي يحافظ على ميزانية الإطار في كل مستويات التقريب.
  - منصة قياس أداء بمشاهد قابلة للتكرار وسقف ذاكرة وتتبع انحدار زمن الإطار.
- **المعالم التقنية:**
  - 60 إطارًا في الثانية بشكل مستمر مع 1,000,000 نقطة مرئية على الأقل على GPU متوسط الفئة.
  - استيعاب 10,000 تيك في الثانية على الأقل بلا إسقاط إطارات.
  - زمن الإطار p99 لا يزيد على 8 ميلي ثانية، وخطوة حساب WASM لا تزيد على 2 ميلي ثانية، وحد WASM إلى JS أقل من 0.2 ميلي ثانية لكل إطار.
  - بدء بارد (تحميل WASM وأول رسم) أقل من 500 ميلي ثانية في مشهد القياس.
  - ذروة الذاكرة لا تزيد على 300 ميغابايت لجلسة 30 يومًا بدقة دقيقة واحدة.
- **الجدول الزمني المتوقع:** Q2 – Q3 2027

#### المرحلة 5 — الرسم متعدد الطبقات والشيدرات المخصصة

- **الوصف:** نبني اللغة البصرية للمنصة: طبقات مستقلة قابلة للتشغيل والإطفاء يركّبها المحرك، ونظام شيدرات مخصص يرسم كل عنصر بصري على GPU.
- **المكوّنات:** رسم بياني متعدد الطبقات · شيدرات مخصصة
- **المخرجات:**
  - رسم بياني متعدد الطبقات: طبقات السعر والحجم وعمق دفتر الأوامر والخريطة الحرارية للتصفيات والتمويل والفائدة المفتوحة، إضافة إلى طبقات الماكرو.
  - مدير طبقات بترتيب z وتركيب وتهيئة كسولة وطبقات خارج الشاشة وحفظ حالة كل طبقة.
  - شيدرات مخصصة بلغة GLSL للشموع والحجم المتدرج والخرائط الحرارية والخطوط المتوهجة وعناصر المؤشر المتقاطع.
  - سجل شيدرات مع إعادة تحميل فورية ونسخ احتياطية ومسار بديل لطيف عند فشل تصريف شيدر.
  - إعدادات مسبقة للطبقات والشيدرات قابلة للحفظ والمشاركة والاسترجاع في عارض منشئ الروبوتات.
- **المعالم التقنية:**
  - تركيب 12 طبقة مستقلة على الأقل في الوقت نفسه بـ 60 إطارًا في الثانية.
  - تصريف الشيدر أقل من 50 ميلي ثانية، وإعادة تحميل فورية بلا إعادة تحميل الرسم وبلا فقدان حالة منفذ العرض.
  - التكلفة المجمعة لكل الطبقات المفعّلة لا تزيد على 2 ميلي ثانية لكل إطار عند التقريب المرجعي.
  - المسار البديل ينتج هندسة التخطيط نفسها بفارق لا يزيد على 1 بكسل.
  - مجموعة اختبارات الانحدار البصري بأكثر من 50 إطارًا مرجعيًا تنجح على وحدات GPU في خادم التكامل المستمر.
- **الجدول الزمني المتوقع:** Q3 – Q4 2027

#### المرحلة 6 — محرك المؤشرات وطبقات الأحداث

- **الوصف:** نحسب المؤشرات بشكل تزايدي في WASM ليتشارك الرسم البياني والاستراتيجيات تنفيذًا واحدًا، ونعرض أحداث بحيرة البيانات على اللوحة نفسها ليكون سياق السوق مرئيًا.
- **المكوّنات:** محرك المؤشرات · طبقات الأحداث
- **المخرجات:**
  - محرك المؤشرات: حساب تزايدي وتدفقي في WASM بتحديث O(1) لكل تيك.
  - سجل مؤشرات بمخططات معاملات ومعالجة التسخين وواجهة عامة للمؤشرات المخصصة.
  - طبقة تكافؤ عددي تضمن تطابق خرج المؤشر بين محرك الرسوم البيانية ومنشئ الروبوتات.
  - طبقات أحداث مغذّاة من أحداث بحيرة البيانات: إصدارات الماكرو وتحولات التمويل والتصفيات والإدراج وإلغاء الإدراج.
  - طبقة تعليقات بعلامات زمنية وتجميع عند التقريب البعيد وفلاتر وسجل تعليقات محفوظ للمستخدم.
- **المعالم التقنية:**
  - 60 مؤشرًا مدمجًا على الأقل، كل واحد يُحدَّث في 0.1 ميلي ثانية أو أقل لكل تيك.
  - تكافؤ 100% بين قيم المؤشر في الرسم والاختبار الرجعي بخطأ نسبي لا يزيد على 1e-9.
  - عرض ما لا يقل عن 100,000 حدث مُطبَّق مع التجميع بـ 60 إطارًا في الثانية.
  - تسخين حتمي: قيم المؤشر مستقلة عن مقدار التاريخ المحمّل.
  - دورة إنشاء التعليقات وتحديثها وحذفها بلا أي فقدان عبر الجلسات.
- **الجدول الزمني المتوقع:** Q4 2027 – Q1 2028

### الركيزة 3 — منشئ الروبوتات المعتمد على العُقد (Bot Builder, Node-Based)

محرر مخطط عُقد محدد الأنواع، ومفسّر عُقد حتمي، ومُصرِّف استراتيجية، ومحرك اختبار رجعي، ومنفّذ تداول حي، ووحدة إدارة مخاطر — مخرَج واحد من الفكرة إلى الأوامر الحية.

**المكوّنات:** محرر مخطط العُقد · مفسّر العُقد · مُصرِّف الاستراتيجية · محرك الاختبار الرجعي · منفّذ التداول الحي · وحدة إدارة المخاطر

#### المرحلة 7 — محرر مخطط العُقد ومفسّر العُقد

- **الوصف:** نُقدّم سطح التأليف في منشئ الروبوتات: محرر مخطط عُقد بأنواع محددة ومفسّر حتمي ينفّذ أي مخطط بأمان داخل صندوق رملي.
- **المكوّنات:** محرر مخطط العُقد · مفسّر العُقد
- **المخرجات:**
  - محرر مخطط العُقد: لوحة مع مكتبة عُقد ومنافذ محددة الأنواع وتحقق حي وتراجع وإعادة ومجموعات وتعليقات وخريطة مصغرة.
  - تسلسل المخطط إلى مستند AST/JSON مُصدَّر، مع نسخ ولصق واستخراج مخططات فرعية وحفظ قابل للمقارنة.
  - مفسّر العُقد: مُجدول طوبولوجي، وعُقد تدفقية ومدفوعة بالأحداث، وعُقد ذات حالة، وتحكم في الضغط الرجعي.
  - مخازن حلقية بذاكرة محدودة، وبذور حتمية، وتنفيذ معزول بلا شبكة وبلا نظام ملفات.
  - إعادة تحميل فورية للمخططات الفرعية المعدّلة على جلسة تنفيذ قائمة.
- **المعالم التقنية:**
  - 150 عقدة أساسية على الأقل بمعاملات محددة الأنواع ووثائق.
  - فتح وتحرير مخطط من 2,000 عقدة بـ 60 إطارًا في الثانية وتمرير التحقق في أقل من 100 ميلي ثانية.
  - مخرجات متطابقة بايت ببايت عند إعادة تشغيل المخطط نفسه على النهر نفسه.
  - مجموعة اختبارات الهروب من الصندوق الرملي تنجح بصفر نتائج.
  - ذاكرة المفسّر المستقرة أقل من 512 ميغابايت لمخطط من 2,000 عقدة.
- **الجدول الزمني المتوقع:** Q1 – Q2 2028

#### المرحلة 8 — مُصرِّف الاستراتيجية ومحرك الاختبار الرجعي

- **الوصف:** نُصرِّف المخططات إلى خطة تنفيذ مُحسَّنة ونثبتها مقابل التاريخ: مُصرِّف الاستراتيجية ينتج مخرجات موقّعة، ومحرك الاختبار الرجعي يعيد تشغيلها برسوم وانزلاق وزمن تأخير واقعي.
- **المكوّنات:** مُصرِّف الاستراتيجية · محرك الاختبار الرجعي
- **المخرجات:**
  - مُصرِّف الاستراتيجية: مخطط إلى تمثيل وسيط إلى خطة تنفيذ مُحسَّنة، مع طيّ الثوابت وحذف العُقد الميتة وتوازي الفروع.
  - نسخ الاستراتيجيات وتوقيع المخرجات وتاريخ استراتيجيات قابل للمقارنة.
  - محرك الاختبار الرجعي: إعادة تشغيل مدفوعة بالأحداث بدقة التيك أو الشمعة مع محاسبة محفظة متعددة الأصول.
  - نموذج تكلفة واقعي: رسوم وانزلاق وتمويل واستقراض وتأخير ومحاكاة التنفيذ الجزئي.
  - تحليل السير المتقدم، ومسح المعاملات، وإعادة أخذ عينات مونت كارلو، ومجموعة المقاييس الكاملة (شارب، سورتينو، كالمار، معامل الربح، أقصى تراجع، نسبة الصفقات الرابحة).
- **المعالم التقنية:**
  - المخرَج المُصرَّف أسرع 5 أضعاف على الأقل من المخطط المفسَّر على حمل العمل المرجعي.
  - مجموعة اختبارات تسرّب المعلومات المستقبلية تنجح 100%؛ وكل نتيجة تُسجّل دليل حدود بياناتها.
  - اختبار سنة من بيانات الدقيقة الواحدة لـ 50 رمزًا في أقل من 5 دقائق على منفّذ متوازٍ.
  - تقييم 1,000 تركيبة معاملات في أقل من 30 دقيقة بترتيب قابل للتكرار.
  - تشغيلان للإعداد والبذرة نفسها متطابقان بايت ببايت.
- **الجدول الزمني المتوقع:** Q2 – Q3 2028

#### المرحلة 9 — منفّذ التداول الحي ووحدة إدارة المخاطر

- **الوصف:** نرفع الاستراتيجيات المُصرَّفة إلى التداول الحي عبر منفّذ آمن للمطابقة، ونمرّر كل أمر عبر وحدة إدارة المخاطر قبل وصوله إلى المنصة.
- **المكوّنات:** منفّذ التداول الحي · وحدة إدارة المخاطر
- **المخرجات:**
  - منفّذ التداول الحي: موجّه أوامر، وآلة حالات لنظام إدارة الأوامر، ومعرّفات أوامر غير مكررة، ومطابقة مع المنصة.
  - ترقية التشغيل الورقي إلى الحي بالمخرَج المُصرَّف نفسه الذي خضع للاختبار الرجعي والتحقق.
  - مرونة الاتصال: إعادة اتصال وتجاوز فشل وإعادة إرسال آمنة ومفتاح إيقاف شامل.
  - وحدة إدارة المخاطر: فحوصات قبل التداول، وحدود المركز والتعرّض والرفع، وميزانية مخاطر لكل استراتيجية، وقواطع لدوائر التراجع.
  - مراقبة الهامش والتصفية، إضافة إلى مسار تدقيق كامل لكل قرار مخاطر.
- **المعالم التقنية:**
  - تكافؤ نية الأوامر 99.9% على الأقل بين الورق والحي على مدى 30 يومًا متتاليًا.
  - إقرار الأمر p95 أقل من 100 ميلي ثانية بما يشمل رحلة الذهاب والإياب إلى المنصة.
  - صفر أوامر مكررة في 100 سيناريو إعادة اتصال قسري.
  - تفعيل مفتاح الإيقاف في أقل من ثانية، وانحراف مطابقة نهاية اليوم صفر خلال 60 يومًا متتاليًا.
  - فحوصات المخاطر p99 أقل من 5 ميلي ثوانٍ و100% من الأوامر تحمل سجل قرار مخاطر مخزّنًا.
- **الجدول الزمني المتوقع:** Q3 – Q4 2028

### الركيزة 4 — محرك الذكاء الاصطناعي (AI Engine)

توليد الإشارات، واكتشاف الأنماط، ومصنّف أنظمة السوق، ووحدة التعلم المعزز، وخط أنابيب تدريب النماذج — من السلاسل الخام إلى قرارات قابلة للتكرار ومحدودة بالمخاطر.

**المكوّنات:** توليد الإشارات · اكتشاف الأنماط · مصنّف أنظمة السوق · وحدة التعلم المعزز · خط أنابيب تدريب النماذج

#### المرحلة 10 — توليد الإشارات واكتشاف الأنماط

- **الوصف:** نحوّل بحيرة البيانات إلى قرارات: إشارات معايَرة ومُصدَّرة، واكتشاف للأنماط التي تفسّرها، من أنماط الرسوم والشموع إلى أنماط البنية الدقيقة.
- **المكوّنات:** توليد الإشارات · اكتشاف الأنماط
- **المخرجات:**
  - توليد الإشارات: طبقة خصائص فوق قاعدة بيانات السلاسل الزمنية باحتمالات معايَرة وفواصل ثقة.
  - ناقل إشارات ببيانات وصفية مُصدَّرة ومدة صلاحية وملكية وربط مباشر بمخططات منشئ الروبوتات.
  - مراقبة الانحراف لكل إشارة، وتشمل انحراف الخصائص وانحراف الوسوم وتدهور المعايرة، مع التنبيه.
  - اكتشاف الأنماط: أنماط الرسوم الهندسية، وأنماط الشموع، وأنماط البنية الدقيقة (الجبل الجليدي، والتضليل، والامتصاص).
  - مجموعة أنماط موسومة مع تقارير دقة واستدعاء منشورة لكل عائلة أنماط.
- **المعالم التقنية:**
  - 20 إشارة إنتاجية على الأقل، وكل واحدة تتغلب على مجموعة التحكم العشوائية الخاصة بها على بيانات محجوزة.
  - دقة الأنماط 0.75 على الأقل واستدعاؤها 0.70 على الأقل على المجموعة الموسومة.
  - زمن الإشارة p95 أقل من 50 ميلي ثانية بعد توفر الشمعة أو الحدث المُشعل.
  - تنبيه الانحراف يُرفع خلال ساعة واحدة من اكتشاف تغيّر التوزيع.
  - 100% من الإشارات قابلة لإعادة الإنتاج من سجل النماذج بإصدارها.
- **الجدول الزمني المتوقع:** Q4 2028 – Q1 2029

#### المرحلة 11 — مصنّف أنظمة السوق

- **الوصف:** نوسم حالة السوق في الزمن الحقيقي ليتمكن كل من الإشارات والاستراتيجيات وحدود المخاطر من التكيّف: أنظمة لكل أصل وعبر الأصول مع ثقة وتثبيط وتاريخ كامل.
- **المكوّنات:** مصنّف أنظمة السوق
- **المخرجات:**
  - تصنيف الأنظمة: صعود الاتجاه وهبوطه، والتذبذب العرضي، والتقلب المرتفع والمنخفض، والسيولة الضعيفة والعميقة، وتفضيل المخاطرة والنفور منها، لكل أصل وعبر الأصول.
  - كشف نقاط التغير على الخط مع درجات ثقة لكل حالة.
  - قواعد التثبيط والحد الأدنى لمدة البقاء لمنع اهتزاز التصنيف.
  - مخزن تاريخ الأنظمة مع إعادة تشغيل كاملة وإعادة بناء نقطية زمنية بلا انحياز مراجعة.
  - توجيه واعٍ بالنظام يستهلكه محرك الذكاء الاصطناعي وموازنة المخاطر في منشئ الروبوتات.
- **المعالم التقنية:**
  - دقة النظام 0.80 على الأقل على فترات محجوزة بخطأ معايرة متوقع لا يزيد على 0.05.
  - وسيط تأخر الكشف أقل من 15 شمعة بمعدل تبديل خاطئ أقل من 5%.
  - تحديث نظام كل أصل في كل شمعة بـ p95 أقل من 20 ميلي ثانية.
  - تاريخ خمس سنوات من الأنظمة مصنَّف وقابل لإعادة الإنتاج من قاعدة السلاسل الزمنية.
  - قياس وتوثيق التحسن المشروط بالنظام لكل إشارة إنتاجية.
- **الجدول الزمني المتوقع:** Q1 – Q2 2029

#### المرحلة 12 — وحدة التعلم المعزز وخط أنابيب تدريب النماذج

- **الوصف:** نغلق الحلقة: ندرّب السياسات داخل محاكٍ مبني على محرك الاختبار الرجعي، ونحترم قيود وحدة إدارة المخاطر بالتصميم، ونُطلق النماذج عبر خط أنابيب تدريب محوكم.
- **المكوّنات:** وحدة التعلم المعزز · خط أنابيب تدريب النماذج
- **المخرجات:**
  - وحدة التعلم المعزز: بيئة مستمدة من محرك الاختبار الرجعي بواجهة على نمط gym.
  - تشكيل مكافأة متوافق مع الحدود التي تفرضها وحدة إدارة المخاطر.
  - تدريب مسبق خارج الخط أو بالتقليد، مع ضبط دقيق على الخط، وتصدير السياسة كمخرَج قابل للاستخدام داخل مخططات منشئ الروبوتات.
  - خط أنابيب تدريب النماذج: نسخ مجموعات البيانات ونسبها، ولقطات مخزن الخصائص، والتنسيق وجدولة GPU.
  - تتبع التجارب، والبحث في المعاملات الفائقة، وسجل النماذج، وبوابات التقييم، والإطلاق التجريبي والتراجع.
- **المعالم التقنية:**
  - سياسات التعلم المعزز تتغلب على أفضل استراتيجية يدوية مضبوطة في 3 من 5 أسواق محجوزة تحت حدود مخاطر متطابقة.
  - إنتاجية المحاكي 1,000,000 خطوة بيئة في الدقيقة على الأقل.
  - أي تشغيل تدريب قابل لإعادة الإنتاج من ملف بيان واحد.
  - صفر إصدار نموذج بلا سجل بوابة تقييم معتمد، والتراجع في أقل من 5 دقائق.
  - المسار من التدريب إلى السجل إلى مخرَج قابل للنشر في أقل من ساعة لنموذج صغير.
- **الجدول الزمني المتوقع:** Q2 – Q3 2029

### الركيزة 5 — اقتصاد الرمز (Token Economy)

نموذج منفعة بمحاسبة المصادر والمصارف، ونظام ستيكينغ بطبقات قفل، وتوزيع مكافآت دوري، وآلية حرق قابلة للتحقق على السلسلة، ونموذج حوكمة يتحكم في معاملاتها جميعًا.

**المكوّنات:** نموذج المنفعة · نظام الستيكينغ · توزيع المكافآت · آلية الحرق · نموذج الحوكمة

#### المرحلة 13 — نموذج المنفعة ونظام الستيكينغ

- **الوصف:** نُحدّد الغرض من الرمز وكيف تُسعَّر الالتزامات: خريطة منفعة كاملة بمحاسبة المصادر والمصارف، ونظام ستيكينغ بطبقات قفل وترجيح وخطافات للخصم.
- **المكوّنات:** نموذج المنفعة · نظام الستيكينغ
- **المخرجات:**
  - نموذج المنفعة: خريطة استخدام الرمز تشمل رسوم التداول والاشتراكات ومدفوعات السوق واعتمادات الحوسبة والاستدلال وحصة الواجهة البرمجية والوصول حسب الطبقة.
  - محاسبة المصادر والمصارف وجدول الطبقات ونموذج التسعير وكتيب قواعد مقاومة إساءة الاستخدام.
  - سياسة الخزينة وجدول الاستحقاق مع شفافية منشورة لفك القفل.
  - نظام الستيكينغ: حجز وفك الحجز بطبقات قفل، وقوة تصويت موزونة بالزمن والمقدار، واستحقاق المكافآت.
  - خطافات خصم لمخالفات السوق، وإيقاف طارئ، وعقود مدقَّقة خارجيًا.
- **المعالم التقنية:**
  - تشغيل مسارات المنفعة كاملة على شبكة الاختبار: الرسوم والاشتراكات والاعتمادات والحصة.
  - 3 عقود مدقَّقة على الأقل مع صفر نتائج حرجة أو عالية مفتوحة.
  - تكلفة غاز الحجز وفك الحجز 120,000 كحد أقصى، مع نجاح اختبارات ثوابت استحقاق المكافآت والخصم بنسبة 100%.
  - مجموعة اختبارات الثوابت والعشوائية تنفّذ 10,000 دورة على الأقل بلا خرق أي ثابت.
  - جدول المعاملات الاقتصادية مُراجَع من النظراء ومنشور بخمس لغات.
- **الجدول الزمني المتوقع:** Q1 – Q2 2029

#### المرحلة 14 — توزيع المكافآت وآلية الحرق

- **الوصف:** ندفع مقابل المساهمة ونجعل سياسة العرض صريحة: مكافآت دورية موزونة بالمساهمة مع مطالبات قابلة للتحقق، وآلية حرق قابلة للتحقق على السلسلة ومرتبطة برسوم المنصة.
- **المكوّنات:** توزيع المكافآت · آلية الحرق
- **المخرجات:**
  - توزيع المكافآت: استحقاق دوري ومحاسبة لقطات ومطالبات قائمة على Merkle.
  - ترجيح المساهمة عبر جودة البيانات والاستراتيجيات والمؤشرات والنماذج والمساهمة الحاسوبية.
  - مقاومة التلاعب والحسابات المتعددة، واستحقاق زمني للمكافآت، ومطالبة جماعية موفّرة للغاز.
  - لوحات مكافآت عامة بإمكانية إعادة الإنتاج لكل دورة من اللقطات.
  - آلية الحرق: جدول حرق الرسوم، وعنوان حرق قابل للتحقق، وسياسة شراء وحرق من الخزينة، وسقف للحرق، وإيقاف طارئ.
- **المعالم التقنية:**
  - صفر دورة مكافآت فائتة خلال 3 أشهر تشغيل متتالية.
  - حساب المكافآت قابل لإعادة الإنتاج باستقلال من اللقطات والأوزان المنشورة.
  - 100% من عمليات الحرق قابلة للتحقق على السلسلة مقابل سجل عام.
  - كشف 95% على الأقل من عناقيد التلاعب المحاكاة بقواعد مقاومة الحسابات المتعددة.
  - معدل الحرق وأوزان المكافآت قابلة للتغيير فقط عبر سجل المعاملات المحكوم بالحوكمة.
- **الجدول الزمني المتوقع:** Q3 2029

#### المرحلة 15 — نموذج الحوكمة

- **الوصف:** نُسلّم معاملات الاقتصاد إلى مستخدميه: دورة مقترح كاملة، وتصويت موزون بالحجز ومقفل زمنيًا، وتفويض، وتنفيذ على السلسلة بعد قفل زمني.
- **المكوّنات:** نموذج الحوكمة
- **المخرجات:**
  - نموذج حوكمة بدورة مقترح كاملة: مسودة في المنتدى، فمقترح على السلسلة، فتصويت، فقفل زمني، فتنفيذ.
  - قوة تصويت موزونة بالحجز ومقفلة زمنيًا مع دعم التفويض.
  - حدود النصاب والموافقة، مع سجل المعاملات المحكوم بالحوكمة للرسوم ومعدل الحرق وأوزان المكافآت والإدراج.
  - قفل زمني وإجراءات طوارئ متعددة التواقيع مع أدلة تشغيل منشورة.
  - وثائق الحوكمة وقوالب المقترحات وسجل تصويت عام.
- **المعالم التقنية:**
  - تنفيذ الدورة الكاملة 20 مرة على الأقل على شبكة الاختبار، بما يشمل تغييرين للمعاملات وتدريبًا على الإيقاف الطارئ.
  - قفل زمني 48 ساعة على الأقل مُنفَّذ على السلسلة ولا يمكن تجاوزه بمفتاح واحد.
  - 100% من إجراءات الحوكمة تُنتج سجلًا قابلًا للتدقيق على السلسلة.
  - التحقق من محاسبة التفويض وقوة التصويت عبر تدقيق خارجي بصفر نتائج عالية.
  - وثائق الحوكمة منشورة بخمس اللغات.
- **الجدول الزمني المتوقع:** Q4 2029

### الركيزة 6 — السوق (Marketplace)

سوق الاستراتيجيات، وسوق المؤشرات، وسوق نماذج الذكاء الاصطناعي، واقتصاد المبدعين — حيث يتحول خرج الركائز الخمس السابقة إلى منتجات مرخّصة ومدفوعة وقابلة للتحقق.

**المكوّنات:** سوق الاستراتيجيات · سوق المؤشرات · سوق نماذج الذكاء الاصطناعي · اقتصاد المبدعين

#### المرحلة 16 — سوق الاستراتيجيات وسوق المؤشرات

- **الوصف:** نفتح مخرجات المنصة إلى الغير: تُدرج الاستراتيجيات بأداء مُتحقَّق منه آليًا، وتُوزَّع المؤشرات كحزم WASM معزولة لمحرك المؤشرات.
- **المكوّنات:** سوق الاستراتيجيات · سوق المؤشرات
- **المخرجات:**
  - سوق الاستراتيجيات: إدراجات وبيانات وصفية ونماذج ترخيص واشتراك أو نسخ.
  - أداء مُتحقَّق منه آليًا لكل إدراج، ينتجه محرك الاختبار الرجعي مع شهادة عدم النظر إلى المستقبل.
  - تشغيل معزول للاستراتيجيات المُشتراة على بيانات حية، مع تقييمات ومراجعات ومسار للنزاعات والاسترداد.
  - سوق المؤشرات: حزم مؤشرات WASM لمحرك المؤشرات مع قيود على المخطط والإصدار.
  - حدود موارد الصندوق الرملي (المعالج والذاكرة وبلا شبكة)، وشروط الترخيص، وتقسيم الإيرادات الآلي.
- **المعالم التقنية:**
  - خط الأنابيب من النشر إلى التحقق إلى الإدراج مؤتمت بالكامل في أقل من 24 ساعة للإدراج الواحد.
  - 90% على الأقل من الإدراجات الحية تحمل مقاييس مُتحقَّقًا منها آليًا، والإدراجات غير المتحقَّقة تُوسم بوضوح.
  - مجموعتا اختبارات الهروب من الصندوق وإساءة استخدام الموارد تنجحان بصفر نتائج.
  - إصدار التراخيص ومواءمة مدفوعات المبدعين تكتمل بصفر اختلافات خلال 3 أشهر.
  - السوق مختبر تحت حمل 1,000 إدراج متزامن مع زمن استجابة p95 أقل من 300 ميلي ثانية.
- **الجدول الزمني المتوقع:** Q2 – Q3 2029

#### المرحلة 17 — سوق نماذج الذكاء الاصطناعي واقتصاد المبدعين

- **الوصف:** نُكمل المنظومة: تُنشر النماذج مع أدلة تقييم واستدلال مقيس، واقتصاد المبدعين يدفع للمساهمين مقابل الأداء المستدام.
- **المكوّنات:** سوق نماذج الذكاء الاصطناعي · اقتصاد المبدعين
- **المخرجات:**
  - سوق نماذج الذكاء الاصطناعي: بطاقات النماذج وبطاقات تقييم ونتائج معيارية على بيانات محجوزة.
  - استدلال مُستضاف ومقيس بطبقات زمن وصول ومحاسبة شفافة لكل نداء.
  - سياسة إزالة من الإدراج بناء على الانحراف والتدهور مع محفزات مراجعة آلية.
  - اقتصاد المبدعين: ملفات المبدعين والتحقق والسمعة المستمدة من الأداء الحي والاستخدام والإتاوات وتقسيم الإيرادات المتدرج.
  - تحليلات المبدعين وواجهة تطوير للمبدعين ومسارات دفع بالرمز مع صادرات ضريبية وتقارير.
- **المعالم التقنية:**
  - الاستدلال المستضاف p95 أقل من 200 ميلي ثانية بدقة قياس 100% مقابل السجل.
  - كل بطاقة نموذج تحمل سجل بوابة تقييم موقّعًا قبل إمكان الإدراج.
  - مراجعة الانحراف التلقائية تُفعَّل خلال 24 ساعة من تجاوز حد التدهور.
  - سمعة موحّدة للمبدعين محسوبة لـ 100% من الإدراجات من بيانات الأداء الحية والمراجعات.
  - واجهة تطوير المبدعين منشورة مع وثائق بخمس اللغات.
- **الجدول الزمني المتوقع:** Q4 2029

### RADI Ecosystem — Tokenomics

Distribution structure, release models and the economic role of every token. Figures describe the planned model.

#### Row 1 — Token Structure

##### Pre-Supply Token — 1% of total supply · 100 million tokens

- **Release Model:** Progress-based unlock (development milestones)
- **Value Multiplier:** ×10 compared to the main token
- **Purpose:** Reward early contributors and bootstrap ecosystem growth
- **Economic Role:** High-value, scarce token powering the startup's initial momentum

##### Total Supply — 1% pre-supply + 99% main token · 100 billion total tokens

- **Release Model:** Locked until economic activation
- **Value Ratio:** ×10 pre-supply token + ×1 main token
- **Purpose:** Full transparency in distribution structure
- **Economic Role:** Foundation of the entire ecosystem and source of long-term circulation

##### Main Token — 99% of total supply · 99 billion tokens

- **Release Model:** Utility-driven and revenue-based unlock
- **Value Multiplier:** ×1 main token
- **Purpose:** Balanced growth between token value and platform utility
- **Economic Role:** Primary asset for payments, tools, automation, and user interactions

#### Row 2 — Platform Economy

##### Economic Engine — Consumption-driven + revenue-driven model · Gradual increase of circulating tokens

- **Release Model:** Scales with platform revenue and user expansion
- **Consumption Flow:** AI Engine, Bot Builder, Marketplace
- **Purpose:** Build a sustainable revenue ecosystem
- **Economic Role:** Convert user activity into real token value

##### Utility — Payments for intelligent trading and AI-powered services · User-to-service transaction layer

- **Release Model:** Direct token purchase for service access
- **Use Cases:** Model execution, bot creation, tool purchases, data APIs
- **Purpose:** Establish real and continuous token consumption
- **Economic Role:** Activate all platform modules through token usage

##### Staking — Dynamic APR + token freeze for premium services · Value-driven policy mechanism

- **Release Model:** Allocation of a portion of unlocked tokens into staking pools
- **Reward Model:** Access to platform services and exclusive features
- **Purpose:** Increase network stability and reduce circulating supply
- **Economic Role:** Long-term incentive mechanism strengthening token value

##### Current stage: Development-based pre-supply

| Token | Total supply | Released to date | Released | Value multiplier |
|---|---|---|---|---|
| Pre-supply token | 100,000,000 | 1,000,000 | 1% | ×10 |
| Main token | 99,000,000,000 | 0 | 0% | ×1 |

**1 pre-supply token = 10 main tokens**

- Tokens in this stage: 1,000,000
- Released to date: 100,000
- Value per unit: ×10 versus the main token

**Buy Samara token** — Purchase through the official RADI wallet or partner exchanges.

### الاعتماديات والمسار الحرج

| المراحل | الوصف |
|---|---|
| المرحلة 1 → المرحلة 2 | يحتاج محرك الترجيح إلى أحداث قانونية مطبَّعة قبل أن يقيّم أي شيء. |
| المرحلة 2 → المرحلة 3 | تخزّن قاعدة السلاسل الزمنية مشاهدات موزونة ومنزوعة الضوضاء، لا حمولات خام. |
| المرحلة 3 → المرحلة 4 | تقرأ نواة العرض السلاسل القانونية من قاعدة السلاسل الزمنية. |
| المرحلة 3 → المرحلة 6 | تتغذى طبقات الأحداث من الأحداث القانونية التي تنشرها بحيرة البيانات. |
| المرحلة 3 → المرحلة 9 | تُعاير فحوصات المخاطر على درجات الجودة والثقة في بحيرة البيانات. |
| المرحلة 4 → المرحلة 5 | كل طبقة وشيدر يبنيان على نواة العرض بالـ GPU. |
| المرحلة 5 → المرحلة 6 | تتصل المؤشرات وطبقات الأحداث بمدير الطبقات. |
| المرحلة 6 → المرحلة 7 | تستهلك عُقد المخطط التنفيذ نفسه للمؤشر الذي يرسمه الرسم البياني. |
| المرحلة 7 → المرحلة 8 | يستهلك المُصرِّف ومحرك الاختبار مخططات العُقد المتسلسلة. |
| المرحلة 8 → المرحلة 9 | يعيد المنفّذ الحي تشغيل المخرَج المُصرَّف نفسه الذي خضع للاختبار الرجعي. |
| المرحلة 8 → المرحلة 10 | تُتحقَّق الإشارات على محرك الاختبار الرجعي قبل الإصدار. |
| المرحلة 9 → المرحلة 12 | تحترم سياسات التعلم المعزز حدود المخاطر نفسها في التداول الحي. |
| المرحلة 9 → المرحلة 13 | تُسعَّر منفعة الرمز مقابل رسوم التداول الفعلية والاستخدام المقيس. |
| المرحلة 10 → المرحلة 11 | تُشتق خصائص النظام من طبقة خصائص الإشارات. |
| المرحلة 11 → المرحلة 12 | حالة النظام مدخل لتشكيل المكافأة في وحدة التعلم المعزز. |
| المرحلة 12 → المرحلة 17 | إدراج نماذج الذكاء الاصطناعي محكوم ببوابات تقييم خط أنابيب التدريب. |
| المرحلة 13 → المرحلة 14 | تُسوَّى المكافآت وعمليات الحرق على محاسبة المنفعة والستيكينغ. |
| المرحلة 13 → المرحلة 16 | تُسوَّى مدفوعات السوق ورسوم الترخيص في اقتصاد الرمز. |
| المرحلة 14 → المرحلة 15 | تتحكم الحوكمة في المعاملات التي تملكها توزيع المكافآت وآلية الحرق. |
| المرحلة 14 → المرحلة 17 | تُسوَّى مدفوعات المبدعين عبر توزيع المكافآت ومحاسبة سياسة الحرق. |
| المرحلة 6 → المرحلة 16 | حزم سوق المؤشرات تستهدف محرك المؤشرات. |
| المرحلة 8 → المرحلة 16 | يُتحقَّق من إدراجات الاستراتيجيات من البداية إلى النهاية بواسطة محرك الاختبار الرجعي. |
| المرحلة 16 → المرحلة 17 | يوسّع اقتصاد المبدعين السوق الذي يدرج الاستراتيجيات والمؤشرات بالفعل. |

**المسار الحرج:** المرحلة 1 → المرحلة 2 → المرحلة 3 → المرحلة 4 → المرحلة 5 → المرحلة 6 → المرحلة 7 → المرحلة 8 → المرحلة 9 → المرحلة 10 → المرحلة 11 → المرحلة 12 → المرحلة 17

### معايير خروج كل ركيزة

- **الركيزة 1 — بحيرة البيانات (Data Lake)**
  - يمكن إعادة اشتقاق أي نافذة تاريخية بايت ببايت من الأرشيف الخام تحت ملف الترجيح والترشيح النشط.
  - تُنشر درجة جودة لكل رمز متابع، وكل سجل محجور قابل للتتبع من البداية إلى النهاية.
- **الركيزة 2 — محرك الرسوم البيانية (Chart Engine, WASM + WebGL)**
  - تُرسم كل الطبقات بـ 60 إطارًا في الثانية مع بقاء محرك المؤشرات في تكافؤ عددي مع منشئ الروبوتات.
  - كل حدث تنشره بحيرة البيانات قابل للعرض كطبقة على اللوحة نفسها.
- **الركيزة 3 — منشئ الروبوتات المعتمد على العُقد (Bot Builder, Node-Based)**
  - يُستخدم المخرَج المُصرَّف نفسه للاستراتيجية في الاختبار الرجعي والورق والحي، بلا إعادة تأليف.
  - لا يصل أي أمر إلى المنصة دون سجل قرار مخاطر مخزّن من وحدة إدارة المخاطر.
- **الركيزة 4 — محرك الذكاء الاصطناعي (AI Engine)**
  - كل إشارة ونموذج وسياسة مُصدَّرة قابلة لإعادة الإنتاج من السجل وتجتاز بوابة تقييمها تحت حدود المخاطر الحية.
  - كل إشارة ونموذج مراقَب من حيث الانحراف مع مسار مراجعة آلي.
- **الركيزة 5 — اقتصاد الرمز (Token Economy)**
  - المنفعة والستيكينغ والمكافآت والحرق والحوكمة كلها حية على السلسلة بعقود مدقَّقة وبلا تجاوزات مميزة.
  - كل معامل اقتصادي قابل للتغيير فقط عبر سجل المعاملات المحكوم بالحوكمة.
- **الركيزة 6 — السوق (Marketplace)**
  - ينشر الغير استراتيجيات ومؤشرات ونماذج مُتحقَّقًا منها ومعزولة ومرخّصة ومدفوعة آليًا.
  - كل إدراج يحمل دليلًا مُتحقَّقًا منه آليًا قبل أن يكون قابلًا للبيع.

### معايير خروج البرنامج

- الركائز الست تعمل معًا من البداية إلى النهاية على عقد بيانات قانوني واحد، من الجمع حتى تسوية السوق.
- كل مكوّن معماري يعمل ومراقَب ومُدقَّق حيثما يمس الأموال، وقابل لإعادة الإنتاج من سجل أو مخرَج مُصدَّر.
- المستند الكامل موجود بخمس لغات ببنية متطابقة وأرقام متطابقة.

---

<a id="tr"></a>

## Turkish — Türkçe

**Dil:** Türkçe (`tr`, ltr)

### RADI — Technical Roadmap

*6 mimari sütun · 17 faz · Q4 2026 → Q4 2029*

Bu belge, Finansal Veri Zekâsı Platformu için faz faz yol haritasıdır ve onaylanmış mimariyi tam olarak takip eder: altı sütun — Veri Gölü (Data Lake), Grafik Motoru (Chart Engine, WASM + WebGL), Düğüm Tabanlı Bot Oluşturucu (Bot Builder, Node-Based), Yapay Zekâ Motoru (AI Engine), Token Ekonomisi (Token Economy) ve Pazar Yeri (Marketplace). Aşağıdaki her teslimat, adı geçen bileşenlerden birine aittir; yeni bir mimari bileşen eklenmez ve hiçbir bileşen basitleştirilmez ya da atlanmaz.

**Program ilkeleri**

- Yeni mimari bileşen yok: bu yol haritasında yalnızca onaylanmış mimarinin bileşenleri yer alır.
- Aşağıdan yukarıya inşa sırası: her sütun, kendinden önceki sütunun doğrulanmış çıktısını tüketir.
- Her faz, demo yerine ölçülebilir kabul kapılarıyla kapanır.
- Altı sütunun tamamı tek bir veri sözleşmesini paylaşır: ham 1 dakikalık kanonik seriler ve kanonik olaylar.
- Her faz, whitepaper'ın beş dilinde yayınlanır: İngilizce, Farsça, Arapça, Türkçe ve Almanca.

### Zaman çizelgesi özeti

| Mimari sütunlar | Bileşenler | Fazlar | Tahmini zaman çizelgesi |
|---|---|---|---|
| 1. Sütun — Veri Gölü (Data Lake) | Çok Kaynaklı Toplayıcı Motoru (Fetcher Engine), Normalleştirme Motoru (Normalizer Engine) | Faz 1 — Çok Kaynaklı Veri Toplama ve Kanonik Normalleştirme | Q4 2026 |
| 1. Sütun — Veri Gölü (Data Lake) | Ağırlıklandırma Motoru (Weighting Engine), Gürültü Filtreleme Motoru (Noise Filter Engine) | Faz 2 — Ağırlıklandırma ve Gürültü Filtreleme | Q1 2027 |
| 1. Sütun — Veri Gölü (Data Lake) | Zaman Serisi Veritabanı (TSDB), Veri Kalitesi İzleyicisi (Data Quality Monitor) | Faz 3 — Zaman Serisi Depolama ve Veri Kalitesi İzleme | Q1 – Q2 2027 |
| 2. Sütun — Grafik Motoru (Chart Engine, WASM + WebGL) | GPU hızlandırmalı render, Yüksek frekanslı render hattı | Faz 4 — Render Çekirdeği: WASM, GPU Hızlandırma ve Yüksek Frekanslı Hat | Q2 – Q3 2027 |
| 2. Sütun — Grafik Motoru (Chart Engine, WASM + WebGL) | Çok katmanlı grafikleme, Özel gölgelendiriciler | Faz 5 — Çok Katmanlı Grafikleme ve Özel Gölgelendiriciler | Q3 – Q4 2027 |
| 2. Sütun — Grafik Motoru (Chart Engine, WASM + WebGL) | Gösterge motoru, Olay katmanları | Faz 6 — Gösterge Motoru ve Olay Katmanları | Q4 2027 – Q1 2028 |
| 3. Sütun — Düğüm Tabanlı Bot Oluşturucu (Bot Builder, Node-Based) | Düğüm grafiği editörü, Düğüm yorumlayıcısı | Faz 7 — Düğüm Grafiği Editörü ve Düğüm Yorumlayıcısı | Q1 – Q2 2028 |
| 3. Sütun — Düğüm Tabanlı Bot Oluşturucu (Bot Builder, Node-Based) | Strateji derleyicisi, Geri test motoru | Faz 8 — Strateji Derleyicisi ve Geri Test Motoru | Q2 – Q3 2028 |
| 3. Sütun — Düğüm Tabanlı Bot Oluşturucu (Bot Builder, Node-Based) | Canlı işlem yürütücüsü, Risk yönetimi modülü | Faz 9 — Canlı İşlem Yürütücüsü ve Risk Yönetimi Modülü | Q3 – Q4 2028 |
| 4. Sütun — Yapay Zekâ Motoru (AI Engine) | Sinyal üretimi, Desen tespiti | Faz 10 — Sinyal Üretimi ve Desen Tespiti | Q4 2028 – Q1 2029 |
| 4. Sütun — Yapay Zekâ Motoru (AI Engine) | Piyasa rejimi sınıflandırıcısı | Faz 11 — Piyasa Rejimi Sınıflandırıcısı | Q1 – Q2 2029 |
| 4. Sütun — Yapay Zekâ Motoru (AI Engine) | Pekiştirmeli öğrenme modülü, Model eğitim hattı | Faz 12 — Pekiştirmeli Öğrenme Modülü ve Model Eğitim Hattı | Q2 – Q3 2029 |
| 5. Sütun — Token Ekonomisi (Token Economy) | Fayda modeli, Staking sistemi | Faz 13 — Fayda Modeli ve Staking Sistemi | Q1 – Q2 2029 |
| 5. Sütun — Token Ekonomisi (Token Economy) | Ödül dağıtımı, Yakma mekanizması | Faz 14 — Ödül Dağıtımı ve Yakma Mekanizması | Q3 2029 |
| 5. Sütun — Token Ekonomisi (Token Economy) | Yönetişim modeli | Faz 15 — Yönetişim Modeli | Q4 2029 |
| 6. Sütun — Pazar Yeri (Marketplace) | Strateji pazar yeri, Gösterge pazar yeri | Faz 16 — Strateji Pazar Yeri ve Gösterge Pazar Yeri | Q2 – Q3 2029 |
| 6. Sütun — Pazar Yeri (Marketplace) | Yapay zekâ modeli pazar yeri, Üretici ekonomisi | Faz 17 — Yapay Zekâ Modeli Pazar Yeri ve Üretici Ekonomisi | Q4 2029 |

### 1. Sütun — Veri Gölü (Data Lake)

Veri Gölü, piyasa ve makro verisinin tek ve yeniden oynatılabilir kanonik akışını üretir: çok kaynaklı toplama, normalleştirme, ağırlıklandırma, gürültü temizliği, zaman serisi depolama ve sürekli kalite izleme.

**Bileşenler:** Çok Kaynaklı Toplayıcı Motoru (Fetcher Engine) · Normalleştirme Motoru (Normalizer Engine) · Ağırlıklandırma Motoru (Weighting Engine) · Gürültü Filtreleme Motoru (Noise Filter Engine) · Zaman Serisi Veritabanı (TSDB) · Veri Kalitesi İzleyicisi (Data Quality Monitor)

#### Faz 1 — Çok Kaynaklı Veri Toplama ve Kanonik Normalleştirme

- **Açıklama:** Toplayıcı Motoru'nu (Fetcher Engine) tüm borsalarda ve makro beslemelerde devreye alıyoruz ve her ham yükü Normalleştirme Motoru'ndan (Normalizer Engine) geçiriyoruz; böylece sonraki sütunlar ham borsa yükleri yerine kaynağı işaretlenmiş tek bir kanonik olay akışı tüketir.
- **Bileşenler:** Çok Kaynaklı Toplayıcı Motoru (Fetcher Engine) · Normalleştirme Motoru (Normalizer Engine)
- **Teslimatlar:**
  - Spot, vadeli, emir defteri, işlemler, fonlama, açık pozisyon, tasfiyeler, makro ve zincir üstü beslemeler için çok kaynaklı Toplayıcı Motoru bağlayıcıları.
  - Kaynak başına zamanlayıcı; hız sınırı yöneticisi, uyarlanabilir yeniden deneme, boşluk tespiti ve tarihsel geri doldurma.
  - Normalleştirme Motoru kanonik zarfı: kaynak, borsa, sembol, zaman damgası, sıra numarası, yük ve kalite bayrakları.
  - Hassasiyet ve ölçek kuralları, UTC hizalaması ve ham mumların 1 dakikalık gruplanması ile kanonik sembol ve borsa kayıt defteri.
  - Her toplanan yükün sağlama toplamlarıyla birlikte değiştirilemez ham arşivi; böylece her kanonik akış sıfırdan yeniden türetilebilir.
- **Teknik kilometre taşları:**
  - En az 25 canlı kaynak bağlayıcısı; her biri kaydedilmiş bir fixture üzerinde sözleşme testi ile kapsanır.
  - Borsa zaman damgasından yayımlanan kanonik olaya kadar alım gecikmesi p95 500 ms altında.
  - Kayıpsız yeniden oynatma: herhangi bir 24 saatlik pencerenin yeniden toplanması bayt bayt aynı kanonik akışı üretir.
  - Kanonik olayların %100'ü kaynak izi ve kalite bayrakları taşır.
  - Staging ortamında p95 CPU kullanımı %70 altında, en az 50.000 olay/sn sürdürülebilir alım.
- **Tahmini zaman çizelgesi:** Q4 2026

#### Faz 2 — Ağırlıklandırma ve Gürültü Filtreleme

- **Açıklama:** Paralel kaynakları tek ve güvenilir bir referans fiyata çeviriyoruz: Ağırlıklandırma Motoru her kaynağı ve gözlemi puanlar, Gürültü Filtreleme Motoru ise kayıt öncesinde yapısal gürültüyü — sıçramalar, bayat kotasyonlar, yıkama işlemleri ve bozuk tikler — temizler.
- **Bileşenler:** Ağırlıklandırma Motoru (Weighting Engine) · Gürültü Filtreleme Motoru (Noise Filter Engine)
- **Teslimatlar:**
  - Ağırlıklandırma Motoru: kaynak güven katmanları, dinamik ağırlıklar, güncellik azalması, kaynaklar arası sapma cezası ve gözlem başına güven skoru.
  - Gürültü Filtreleme Motoru: aykırı değer ve sıçrama tespiti, bayat kotasyon bastırma, yıkama işlemi tespiti, bozuk tik karantinası ve açık boşluk politikası.
  - Varlık sınıfı başına gürültü profilleri (kripto spot ve vadeli, makro açıklamaları, zincir üstü metrikler) ve sürümlenmiş yapılandırma.
  - Ağırlık ve filtre yapılandırmasının yeniden oynatılabilir olması; her tarihsel pencere yeni bir profille yeniden işlenebilir.
  - Yayımlanan her kanonik olaya eklenen ağırlık ve güven inceleme çıktısı.
- **Teknik kilometre taşları:**
  - Kanonik olayların %100'ünde güven skoru bulunur; ağırlık izi kaynak, katman ve kural sürümüne kadar izlenebilir.
  - Etiketli anomali korpusunda en az %95 gürültü yakalama ve en az %98 kesinlik; karışıklık matrisi yayımlanır.
  - Değiştirilmiş profille 90 günlük geçmişin yeniden işlenmesi 30 dakikadan kısa sürer.
  - Deterministik çıktı: aynı girdiler ve aynı profil sürümü her zaman aynı ağırlıkları üretir.
  - Temiz piyasa verisinde filtre yanlış pozitif oranı en fazla %0,1; ayrılmış bir haftada ölçülür.
- **Tahmini zaman çizelgesi:** Q1 2027

#### Faz 3 — Zaman Serisi Depolama ve Veri Kalitesi İzleme

- **Açıklama:** Kanonik akışı açık saklama ve örnekleme indirme politikalarıyla Zaman Serisi Veritabanı'nda (TSDB) kalıcı hâle getiriyoruz; güvenilirliğini ise her kaynağı ve sembolü puanlayıp bozuk veriyi otomatik karantinaya alan Veri Kalitesi İzleyicisi (Data Quality Monitor) sağlar.
- **Bileşenler:** Zaman Serisi Veritabanı (TSDB) · Veri Kalitesi İzleyicisi (Data Quality Monitor)
- **Teslimatlar:**
  - TSDB: ham 1 dakikalık kanonik seri ve kanonik olaylar için sembol, borsa ve zamana göre bölümlenmiş kolonlu zaman serisi depolama.
  - Çok yıllı sorgu iş yükleri için sıkıştırma, saklama katmanları, örnekleme indirme ve materyalize görünümler.
  - Yüksek kardinaliteli indeksleme ve Grafik Motoru, Bot Oluşturucu ile Yapay Zekâ Motoru'nun tükettiği sorgu API'si.
  - Veri Kalitesi İzleyicisi: kaynak, sembol ve zaman dilimi başına tamlık, güncellik, doğruluk ve tutarlılık skorları.
  - Kalite uyarıları, soy kütüğü izleme, otomatik karantina, kendini onaran yeniden toplama ve genel kalite panosu.
- **Teknik kilometre taşları:**
  - Ham JSON yüklere kıyasla disk üzerinde en az 10 kat sıkıştırma.
  - Tek bir sembolde 30 günlük 1 dakikalık aralık için sorgu gecikmesi p95 150 ms altında.
  - Güncellik SLA'sı: kanonik olaydan sorgulanabilir seriye p95 2 saniye altında ve sürekli doğrulanır.
  - İzlenen sembollerin %100'ü için saatlik kalite skoru yayımlanır; veri olayı MTTR'ı 30 dakikanın altında.
  - Otomatik karantina kayıtların en fazla %0,01'ini izole eder ve her karar tam olarak denetlenebilir bir ize sahiptir.
- **Tahmini zaman çizelgesi:** Q1 – Q2 2027

### 2. Sütun — Grafik Motoru (Chart Engine, WASM + WebGL)

GPU hızlandırmalı render, çok katmanlı grafikleme, özel gölgelendiriciler, gösterge motoru, olay katmanları ve yüksek frekanslı render hattı — tümü tek bir ortak WASM + WebGL çekirdeği üzerinde.

**Bileşenler:** GPU hızlandırmalı render · Çok katmanlı grafikleme · Özel gölgelendiriciler · Gösterge motoru · Olay katmanları · Yüksek frekanslı render hattı

#### Faz 4 — Render Çekirdeği: WASM, GPU Hızlandırma ve Yüksek Frekanslı Hat

- **Açıklama:** Grafik Motoru'nun performans temelini kuruyoruz: ayrıştırma, toplama ve yerleşim için bir WASM hesaplama çekirdeği, WebGL üzerinde GPU hızlandırmalı render katmanı ve saniyede on binlerce tiki emebilen yüksek frekanslı render hattı.
- **Bileşenler:** GPU hızlandırmalı render · Yüksek frekanslı render hattı
- **Teslimatlar:**
  - Ayrıştırma, toplama, indeks kurma ve viewport yerleşimi için WASM hesaplama çekirdeği (Rust'tan derlenmiş).
  - WebGL üzerinde instanced çizim çağrıları, doku atlası ve tampon havuzu ile GPU hızlandırmalı render katmanı.
  - Yüksek frekanslı render hattı: halka tamponlar, kirli bölge güncellemeleri, işçi iş parçacıklarına devretme ve kare zamanlaması.
  - Her yakınlaştırma seviyesinde kare bütçesini sabit tutan ayrıntı seviyesi (LOD) ve eleme (culling) sistemi.
  - Yeniden üretilebilir sahneler, bellek tavanı ve kare süresi regresyon takibi içeren kıyaslama altyapısı.
- **Teknik kilometre taşları:**
  - Orta segment bir GPU'da en az 1.000.000 görünür nokta ile sürdürülebilir 60 fps.
  - Kare kaybı olmadan en az 10.000 tik/sn alım.
  - p99 kare süresi en fazla 8 ms, WASM hesaplama adımı en fazla 2 ms, WASM-JS sınırı kare başına 0,2 ms altında.
  - Kıyaslama sahnesinde soğuk başlangıç (WASM yükleme ve ilk çizim) 500 ms altında.
  - 30 günlük 1 dakikalık oturum için en yüksek bellek kullanımı en fazla 300 MB.
- **Tahmini zaman çizelgesi:** Q2 – Q3 2027

#### Faz 5 — Çok Katmanlı Grafikleme ve Özel Gölgelendiriciler

- **Açıklama:** Platformun görsel dilini kuruyoruz: motorun bir araya getirdiği, bağımsız olarak açılıp kapatılabilen katmanlar ve her görsel öğeyi GPU'da çizen özel gölgelendirici sistemi.
- **Bileşenler:** Çok katmanlı grafikleme · Özel gölgelendiriciler
- **Teslimatlar:**
  - Çok katmanlı grafikleme: fiyat, hacim, emir defteri derinliği, tasfiye ısı haritası, fonlama ve açık pozisyon katmanları ile makro katmanlar.
  - z-sırası, birleştirme, tembel başlatma, ekran dışı katmanlar ve katman durumu kalıcılığı olan katman yöneticisi.
  - Mum çubukları, gradyan hacim, ısı haritaları, parlayan çizgiler ve crosshair öğeleri için GLSL özel gölgelendiriciler.
  - Sıcak yeniden yükleme, sürümleme ve bir gölgelendirici derlenemediğinde düzgün yedek yol sunan gölgelendirici kayıt defteri.
  - Bot Oluşturucu görüntüleyicisinde kaydedilebilen, paylaşılabilen ve geri yüklenebilen katman ve gölgelendirici ön ayarları.
- **Teknik kilometre taşları:**
  - En az 12 bağımsız katmanın aynı anda 60 fps ile birleştirilmesi.
  - Gölgelendirici derlemesi 50 ms altında; grafiği yeniden yüklemeden ve viewport durumunu kaybetmeden sıcak yeniden yükleme.
  - Etkin tüm katmanların toplam maliyeti referans yakınlaştırmada kare başına en fazla 2 ms.
  - Yedek render yolu aynı yerleşim geometrisini 1 piksel toleransla üretir.
  - CI GPU'larında geçen en az 50 altın kareden oluşan görsel regresyon paketi.
- **Tahmini zaman çizelgesi:** Q3 – Q4 2027

#### Faz 6 — Gösterge Motoru ve Olay Katmanları

- **Açıklama:** Göstergeleri WASM içinde artımlı hesaplıyoruz; böylece grafik ve stratejiler tek bir uygulamayı paylaşır. Veri Gölü'nden gelen olayları da aynı tuvalde göstererek piyasa bağlamını görünür kılıyoruz.
- **Bileşenler:** Gösterge motoru · Olay katmanları
- **Teslimatlar:**
  - Gösterge motoru: WASM içinde tik başına O(1) güncellemeli artımlı ve akışkan hesaplama.
  - Parametre şemaları, warm-up yönetimi ve özel göstergeler için genel API içeren gösterge kayıt defteri.
  - Grafik Motoru ile Bot Oluşturucu arasında aynı gösterge çıktısını garanti eden sayısal eşlik katmanı.
  - Veri Gölü olaylarıyla beslenen olay katmanları: makro açıklamaları, fonlama dönüşleri, tasfiyeler, listeleme ve listeden çıkarma.
  - Zaman çizelgesi işaretleri, uzak yakınlaştırmada kümeleme, filtreler ve kalıcı kullanıcı notları içeren açıklama katmanı.
- **Teknik kilometre taşları:**
  - En az 60 yerleşik gösterge; her biri tik başına 0,1 ms içinde güncellenir.
  - Grafik ve geri test gösterge değerleri arasında %100 eşlik, göreli hata en fazla 1e-9.
  - En az 100.000 olay katmanının kümeleme ile 60 fps'de çizilmesi.
  - Deterministik warm-up: gösterge değerleri yüklenen geçmiş miktarından bağımsız.
  - Açıklama oluşturma, güncelleme ve silme işlemlerinin oturumlar arasında kayıpsız çalışması.
- **Tahmini zaman çizelgesi:** Q4 2027 – Q1 2028

### 3. Sütun — Düğüm Tabanlı Bot Oluşturucu (Bot Builder, Node-Based)

Tipli düğüm grafiği editörü, deterministik düğüm yorumlayıcısı, strateji derleyicisi, geri test motoru, canlı işlem yürütücüsü ve risk yönetimi modülü — fikirden canlı emre tek bir artefakt.

**Bileşenler:** Düğüm grafiği editörü · Düğüm yorumlayıcısı · Strateji derleyicisi · Geri test motoru · Canlı işlem yürütücüsü · Risk yönetimi modülü

#### Faz 7 — Düğüm Grafiği Editörü ve Düğüm Yorumlayıcısı

- **Açıklama:** Bot Oluşturucu'nun yazım yüzeyini teslim ediyoruz: tipli bir düğüm grafiği editörü ve her grafiği sanal alan içinde güvenle yürüten deterministik bir yorumlayıcı.
- **Bileşenler:** Düğüm grafiği editörü · Düğüm yorumlayıcısı
- **Teslimatlar:**
  - Düğüm grafiği editörü: düğüm paleti, tipli portlar, canlı doğrulama, geri al ve yinele, gruplar, yorumlar ve minimap içeren tuval.
  - Grafiğin sürümlenmiş AST/JSON belgesine serileştirilmesi; kopyala ve yapıştır, alt grafik çıkarma ve diff alınabilir kayıtlar.
  - Düğüm yorumlayıcısı: topolojik zamanlayıcı, akışkan ve olay güdümlü düğümler, durum tutan düğümler ve geri basınç kontrolü.
  - Sınırlı bellekli halka tamponlar, deterministik tohumlama ve ağ ile dosya sistemine erişimi olmayan sanal alan yürütmesi.
  - Düzenlenen alt grafiklerin çalışan bir yorumlama oturumunda sıcak yeniden yüklenmesi.
- **Teknik kilometre taşları:**
  - Tipli imzalar ve dokümantasyonla birlikte en az 150 çekirdek düğüm.
  - 2.000 düğümlü bir grafiği 60 fps'de açma ve düzenleme; doğrulama geçişi 100 ms altında.
  - Aynı grafiği aynı girdi akışında yeniden oynatırken bayt bayt aynı çıktı.
  - Sanal alandan kaçış test paketi sıfır bulguyla geçer.
  - 2.000 düğümlü bir grafik için kararlı durum yorumlayıcı belleği 512 MB altında.
- **Tahmini zaman çizelgesi:** Q1 – Q2 2028

#### Faz 8 — Strateji Derleyicisi ve Geri Test Motoru

- **Açıklama:** Grafikleri optimize edilmiş bir yürütme planına derliyor ve tarihe karşı kanıtlıyoruz: Strateji derleyicisi imzalı artefaktlar üretir, Geri test motoru bunları gerçekçi mikro yapı, komisyon ve gecikmeyle yeniden oynatır.
- **Bileşenler:** Strateji derleyicisi · Geri test motoru
- **Teslimatlar:**
  - Strateji derleyicisi: grafikten ara temsile ve optimize edilmiş yürütme planına; sabit katlama, ölü düğüm eleme ve dal paralelleştirme.
  - Strateji sürümleme, artefakt imzalama ve diff alınabilir strateji geçmişi.
  - Geri test motoru: tik ve bar çözünürlüğünde olay güdümlü yeniden oynatma ve çok varlıklı portföy muhasebesi.
  - Gerçekçi maliyet modeli: komisyon, kayma, fonlama, borçlanma, gecikme ve kısmi gerçekleşme simülasyonu.
  - Yürüyen pencere analizi, parametre taraması, Monte Carlo yeniden örnekleme ve tam metrik seti (Sharpe, Sortino, Calmar, kâr faktörü, maksimum düşüş, kazanma oranı).
- **Teknik kilometre taşları:**
  - Derlenmiş artefakt, referans iş yükünde yorumlanan grafikten en az 5 kat hızlı.
  - İleriye bakma sızıntısı test paketi %100 geçer; her sonuç veri sınırı kanıtını kaydeder.
  - 50 sembolde bir yıllık 1 dakikalık veri, paralel koşucuda 5 dakikadan kısa sürede geri test edilir.
  - 1.000 parametre kombinasyonu 30 dakikadan kısa sürede ve yeniden üretilebilir sırayla değerlendirilir.
  - Aynı yapılandırma ve tohumla iki çalıştırma bayt bayt aynıdır.
- **Tahmini zaman çizelgesi:** Q2 – Q3 2028

#### Faz 9 — Canlı İşlem Yürütücüsü ve Risk Yönetimi Modülü

- **Açıklama:** Derlenmiş stratejileri mutabakata dayanıklı bir yürütücü üzerinden canlı işleme alıyoruz ve her emri borsaya ulaşmadan önce Risk yönetimi modülünden geçiriyoruz.
- **Bileşenler:** Canlı işlem yürütücüsü · Risk yönetimi modülü
- **Teslimatlar:**
  - Canlı işlem yürütücüsü: emir yönlendirici, OMS durum makinesi, idempotent istemci emir kimlikleri ve borsa mutabakatı.
  - Geri test edilip doğrulanan aynı derlenmiş artefakt ile kâğıt işlemden canlıya geçiş.
  - Bağlantı dayanıklılığı: yeniden bağlanma, yedek geçiş, yeniden oynatmaya güvenli yeniden gönderim ve küresel acil durdurma anahtarı.
  - Risk yönetimi modülü: işlem öncesi kontroller, pozisyon, maruziyet ve kaldıraç limitleri, strateji başına risk bütçesi ve düşüş devre kesicileri.
  - Teminat ve tasfiye izleme; her risk kararının eksiksiz denetim kaydı.
- **Teknik kilometre taşları:**
  - 30 gün boyunca kâğıt ve canlı arasında en az %99,9 emir niyeti eşliği.
  - Borsa gidiş dönüşü dahil emir onayı p95 100 ms altında.
  - 100 zorunlu yeniden bağlanma senaryosunda sıfır mükerrer emir.
  - Acil durdurma anahtarı 1 saniyenin altında devreye girer; 60 gün boyunca gün sonu mutabakat farkı sıfır.
  - Risk kontrolleri p99 5 ms altında ve emirlerin %100'ü kayıtlı bir risk kararı taşır.
- **Tahmini zaman çizelgesi:** Q3 – Q4 2028

### 4. Sütun — Yapay Zekâ Motoru (AI Engine)

Sinyal üretimi, desen tespiti, piyasa rejimi sınıflandırıcısı, pekiştirmeli öğrenme modülü ve model eğitim hattı — ham serilerden yeniden üretilebilir ve riskle sınırlanmış kararlara.

**Bileşenler:** Sinyal üretimi · Desen tespiti · Piyasa rejimi sınıflandırıcısı · Pekiştirmeli öğrenme modülü · Model eğitim hattı

#### Faz 10 — Sinyal Üretimi ve Desen Tespiti

- **Açıklama:** Veri Gölü'nü karara dönüştürüyoruz: kalibre edilmiş ve sürümlenmiş sinyaller üretiyor, bu sinyalleri açıklayan desenleri — grafik, mum ve mikro yapı — tespit ediyoruz.
- **Bileşenler:** Sinyal üretimi · Desen tespiti
- **Teslimatlar:**
  - Sinyal üretimi: TSDB üzerinde kalibre edilmiş olasılıklar ve güven aralıklarıyla özellik katmanı.
  - Sürümlenmiş meta veri, TTL, sahiplik ve Bot Oluşturucu grafiklerine doğrudan bağlama içeren sinyal veri yolu.
  - Sinyal başına sürüklenme izleme: özellik sürüklenmesi, etiket sürüklenmesi ve kalibrasyon bozulması, uyarı ile birlikte.
  - Desen tespiti: geometrik grafik desenleri, mum desenleri ve mikro yapı desenleri (iceberg, spoofing, absorption).
  - Desen ailesi başına yayımlanan kesinlik ve yakalama raporlarıyla etiketli desen korpusu.
- **Teknik kilometre taşları:**
  - En az 20 üretim sinyali; her biri ayrılmış veride kendi rastgele karıştırma kontrolünü geçer.
  - Etiketli korpusta en az 0,75 desen kesinliği ve en az 0,70 yakalama.
  - Tetikleyici bar veya olay hazır olduktan sonra sinyal gecikmesi p95 50 ms altında.
  - Saptanan dağılım kaymasından sonra 1 saat içinde sürüklenme alarmı.
  - Sinyallerin %100'ü sürümüyle birlikte model kayıt defterinden yeniden üretilebilir.
- **Tahmini zaman çizelgesi:** Q4 2028 – Q1 2029

#### Faz 11 — Piyasa Rejimi Sınıflandırıcısı

- **Açıklama:** Piyasa durumunu gerçek zamanlı etiketliyoruz; böylece sinyaller, stratejiler ve risk limitleri uyum sağlayabilir: varlık başına ve varlıklar arası rejimler ile güven, histerezis ve tam geçmiş.
- **Bileşenler:** Piyasa rejimi sınıflandırıcısı
- **Teslimatlar:**
  - Rejim taksonomisi: yukarı ve aşağı trend, yatay aralık, yüksek ve düşük volatilite, sığ ve derin likidite, risk iştahı ve riskten kaçınma; varlık başına ve varlıklar arası.
  - Durum başına güven skoru içeren çevrimiçi değişim noktası tespiti.
  - Rejim titremesini önleyen histerezis ve minimum kalma süresi kuralları.
  - Tam yeniden oynatma ve noktasal zaman geri kurulumu sunan, revizyon yanlılığı içermeyen rejim geçmişi deposu.
  - Yapay Zekâ Motoru ve Bot Oluşturucu risk bütçelemesinin tükettiği rejim duyarlı yönlendirme.
- **Teknik kilometre taşları:**
  - Ayrılmış dönemlerde en az 0,80 rejim doğruluğu ve en fazla 0,05 beklenen kalibrasyon hatası.
  - Yanlış anahtar değiştirme oranı %5'in altında ve medyan tespit gecikmesi 15 barın altında.
  - Varlık başına rejim her barda p95 20 ms altında güncellenir.
  - Beş yıllık rejim geçmişi sınıflandırılmış ve TSDB'den yeniden üretilebilir.
  - Rejime koşullu performans artışı her üretim sinyali için ölçülüp belgelenir.
- **Tahmini zaman çizelgesi:** Q1 – Q2 2029

#### Faz 12 — Pekiştirmeli Öğrenme Modülü ve Model Eğitim Hattı

- **Açıklama:** Döngüyü kapatıyoruz: politikaları Geri test motoru üzerine kurulu bir simülatörde eğitiyoruz, Risk yönetimi modülünün sınırlarına tasarım gereği uyuyoruz ve modelleri yönetişimli bir eğitim hattından yayınlıyoruz.
- **Bileşenler:** Pekiştirmeli öğrenme modülü · Model eğitim hattı
- **Teslimatlar:**
  - Pekiştirmeli öğrenme modülü: Geri test motorundan türetilen ve gym tarzı API sunan ortam.
  - Risk yönetimi modülünün uyguladığı limitlerle uyumlu ödül şekillendirme.
  - Çevrimdışı ve taklit tabanlı ön eğitim ile çevrimiçi ince ayar; politikanın Bot Oluşturucu grafiklerinde kullanılabilir bir artefakt olarak dışa aktarımı.
  - Model eğitim hattı: veri kümesi sürümleme ve soy kütüğü, özellik deposu anlık görüntüleri, orkestrasyon ve GPU zamanlaması.
  - Deney takibi, hiper parametre araması, model kayıt defteri, değerlendirme kapıları, kanarya sürümü ve geri alma.
- **Teknik kilometre taşları:**
  - RL politikaları, aynı risk limitleri altında 5 ayrılmış piyasanın en az 3'ünde en iyi ayarlanmış manuel stratejiyi geçer.
  - Simülatör verimi dakikada en az 1.000.000 ortam adımı.
  - Herhangi bir eğitim çalışması tek bir manifest dosyasından yeniden üretilebilir.
  - Onaylı değerlendirme kapısı kaydı olmadan sıfır model sürümü; geri alma 5 dakikanın altında.
  - Küçük bir model için eğitimden kayıt defterine ve dağıtılabilir artefakta geçiş 1 saatten kısa.
- **Tahmini zaman çizelgesi:** Q2 – Q3 2029

### 5. Sütun — Token Ekonomisi (Token Economy)

Kaynak ve gider muhasebesi olan bir fayda modeli, kilit katmanlı bir staking sistemi, dönem bazlı ödül dağıtımı, zincir üzerinde doğrulanabilir yakma mekanizması ve tüm bunların parametrelerini kontrol eden bir yönetişim modeli.

**Bileşenler:** Fayda modeli · Staking sistemi · Ödül dağıtımı · Yakma mekanizması · Yönetişim modeli

#### Faz 13 — Fayda Modeli ve Staking Sistemi

- **Açıklama:** Token'ın ne için olduğunu ve taahhüdün nasıl fiyatlandığını tanımlıyoruz: kaynak ve gider muhasebesi olan eksiksiz bir fayda haritası ile kilit katmanı, ağırlıklandırma ve slashing kancaları olan bir staking sistemi.
- **Bileşenler:** Fayda modeli · Staking sistemi
- **Teslimatlar:**
  - Fayda modeli: işlem komisyonları, abonelikler, pazar yeri ödemeleri, hesaplama ve çıkarım kredileri, API kotası ve katman erişimini kapsayan token fayda haritası.
  - Kaynak ve gider muhasebesi, katman tablosu, fiyatlama modeli ve kötüye kullanımı önleme kural kitabı.
  - Hazine politikası ve kilitleme takvimi, yayımlanmış açılış şeffaflığıyla.
  - Staking sistemi: kilit katmanlarıyla stake ve unstake, zaman ve miktar ağırlıklı oy gücü ve ödül tahakkuku.
  - Pazar yeri ihlalleri için slashing kancaları, acil durdurma ve dış denetimden geçmiş sözleşmeler.
- **Teknik kilometre taşları:**
  - Testnet'te uçtan uca çalışan tam fayda akışları: komisyon, abonelik, kredi ve kota.
  - En az 3 sözleşme denetlenmiş ve açık kritik veya yüksek bulgu yok.
  - Stake ve unstake gazı en fazla 120.000; ödül tahakkuku ve slashing değişmezlik testleri %100 geçer.
  - Değişmezlik ve fuzz paketi en az 10.000 çalıştırma yapar ve hiçbir değişmezlik ihlal edilmez.
  - Ekonomik parametre tablosu hakem değerlendirmesinden geçmiş ve beş dilde yayımlanmıştır.
- **Tahmini zaman çizelgesi:** Q1 – Q2 2029

#### Faz 14 — Ödül Dağıtımı ve Yakma Mekanizması

- **Açıklama:** Katkıyı ödüllendiriyor ve arz politikasını açık hâle getiriyoruz: doğrulanabilir talepli, dönem bazlı ve katkı ağırlıklı ödüller ile platform komisyonlarına bağlı, zincir üzerinde doğrulanabilir bir yakma mekanizması.
- **Bileşenler:** Ödül dağıtımı · Yakma mekanizması
- **Teslimatlar:**
  - Ödül dağıtımı: dönem tahakkuku, anlık görüntü muhasebesi ve Merkle tabanlı talepler.
  - Veri kalitesi, stratejiler, göstergeler, modeller ve hesaplama katkısı üzerinden katkı ağırlıklandırması.
  - Çiftçiliğe ve sybil saldırılarına direnç, ödül kilitlemesi ve gaz verimli toplu talep.
  - Anlık görüntülerden dönem başına yeniden üretilebilir genel ödül panoları.
  - Yakma mekanizması: komisyon yakma takvimi, doğrulanabilir yakma adresi, hazine geri alım ve yakma politikası, yakma üst sınırı ve acil durdurma.
- **Teknik kilometre taşları:**
  - 3 ay boyunca kesintisiz operasyonda kaçırılan ödül dönemi sıfır.
  - Ödül hesaplaması anlık görüntülerden ve yayımlanan ağırlıklardan bağımsız olarak yeniden üretilebilir.
  - Yakmaların %100'ü zincir üzerinde genel bir kayda karşı doğrulanabilir.
  - Simüle edilmiş çiftçilik kümelerinin en az %95'i sybil karşıtı kurallarla tespit edilir.
  - Yakma oranı ve ödül ağırlıkları yalnızca yönetişim kontrollü parametre kayıt defteri üzerinden değiştirilebilir.
- **Tahmini zaman çizelgesi:** Q3 2029

#### Faz 15 — Yönetişim Modeli

- **Açıklama:** Ekonominin parametrelerini onu kullananlara devrediyoruz: tam bir öneri yaşam döngüsü, stake ağırlıklı ve zaman kilitli oylama, delegasyon ve zaman kilitli zincir üstü yürütme.
- **Bileşenler:** Yönetişim modeli
- **Teslimatlar:**
  - Eksiksiz öneri yaşam döngüsüne sahip yönetişim modeli: forum taslağı, zincir üstü öneri, oylama, zaman kilidi ve yürütme.
  - Delegasyon destekli, stake ağırlıklı ve zaman kilitli oy gücü.
  - Nisap ve onay eşikleri ile komisyon, yakma oranı, ödül ağırlıkları ve listelemeler için yönetişim kontrollü parametre kayıt defteri.
  - Yayımlanmış oyun kitaplarıyla zaman kilidi ve çok imzalı acil durum prosedürleri.
  - Yönetişim dokümantasyonu, öneri şablonları ve genel oylama geçmişi.
- **Teknik kilometre taşları:**
  - Testnet'te tam yaşam döngüsü en az 20 kez yürütüldü; bunların içinde 2 parametre değişikliği ve 1 acil durdurma tatbikatı var.
  - En az 48 saatlik zaman kilidi zincir üzerinde uygulanır ve tek bir anahtarla atlatılamaz.
  - Yönetişim eylemlerinin %100'ü denetlenebilir bir zincir üstü kayıt üretir.
  - Delege ve oy gücü muhasebesi, sıfır yüksek bulguyla dış denetimden geçmiştir.
  - Yönetişim dokümantasyonu beş dilde yayımlanmıştır.
- **Tahmini zaman çizelgesi:** Q4 2029

### 6. Sütun — Pazar Yeri (Marketplace)

Strateji pazar yeri, gösterge pazar yeri, yapay zekâ modeli pazar yeri ve üretici ekonomisi — önceki beş sütunun çıktısının lisanslı, ödemesi yapılmış ve doğrulanabilir bir ürüne dönüştüğü yer.

**Bileşenler:** Strateji pazar yeri · Gösterge pazar yeri · Yapay zekâ modeli pazar yeri · Üretici ekonomisi

#### Faz 16 — Strateji Pazar Yeri ve Gösterge Pazar Yeri

- **Açıklama:** Platformun çıktısını üçüncü taraflara açıyoruz: stratejiler makine tarafından doğrulanmış performansla listelenir, göstergeler ise Gösterge motoru için sanal alanlı WASM paketleri olarak dağıtılır.
- **Bileşenler:** Strateji pazar yeri · Gösterge pazar yeri
- **Teslimatlar:**
  - Strateji pazar yeri: listelemeler, meta veri, lisanslama ve abonelik ya da kopya modelleri.
  - Her listeleme için, Geri test motorunun ileriye bakmama beyanıyla ürettiği makine tarafından doğrulanmış performans.
  - Satın alınan stratejilerin canlı veri üzerinde sanal alanda çalıştırılması; puanlama, inceleme ve itiraz ile iade akışı.
  - Gösterge pazar yeri: Gösterge motoru için şema ve sürüm kısıtları olan WASM gösterge paketleri.
  - Sanal alan kaynak limitleri (CPU, bellek, ağ yok), lisans şartları ve otomatik gelir paylaşımı.
- **Teknik kilometre taşları:**
  - Yayınla, doğrula, listele hattı listeleme başına 24 saatten kısa sürede tam otomatik.
  - Canlı listelemelerin en az %90'ı makine tarafından doğrulanmış metrikler taşır; doğrulanmamış listelemeler görünür şekilde işaretlenir.
  - Sanal alandan kaçış ve kaynak kötüye kullanımı test paketleri sıfır bulguyla geçer.
  - Lisanslama ve üretici ödeme mutabakatı 3 ay boyunca sıfır uyuşmazlıkla tamamlanır.
  - Pazar yeri 1.000 eşzamanlı listeleme ile yük testinden geçer; sayfa yanıtı p95 300 ms altında.
- **Tahmini zaman çizelgesi:** Q2 – Q3 2029

#### Faz 17 — Yapay Zekâ Modeli Pazar Yeri ve Üretici Ekonomisi

- **Açıklama:** Ekosistemi tamamlıyoruz: modeller değerlendirme kanıtları ve ölçümlü çıkarımla yayınlanır, üretici ekonomisi ise kalıcı performans için katkı sağlayanlara ödeme yapar.
- **Bileşenler:** Yapay zekâ modeli pazar yeri · Üretici ekonomisi
- **Teslimatlar:**
  - Yapay zekâ modeli pazar yeri: model kartları, değerlendirme karneleri ve ayrılmış veri üzerinde kıyaslama sonuçları.
  - Gecikme katmanları ve her çağrı için şeffaf muhasebe ile barındırılan ve ölçümlenen çıkarım.
  - Otomatik inceleme tetikleyicileriyle sürüklenme ve bozulma kaynaklı listeden çıkarma politikası.
  - Üretici ekonomisi: üretici profilleri, doğrulama, canlı performans ve kullanımdan gelen itibar, telif ve katmanlı gelir paylaşımı.
  - Üretici analitikleri, bir üretici SDK'sı ve vergi ile raporlama çıktıları olan token ödeme rayları.
- **Teknik kilometre taşları:**
  - Barındırılan çıkarım p95 200 ms altında ve kayda karşı %100 ölçüm doğruluğu.
  - Her model kartı listelenmeden önce imzalı bir değerlendirme kapısı kaydı taşır.
  - Otomatik sürüklenme incelemesi, bozulma eşiği aşıldıktan sonra 24 saat içinde tetiklenir.
  - Birleşik üretici itibarı, listelemelerin %100'ü için canlı ve inceleme verisinden hesaplanır.
  - Üretici SDK'sı beş dilde dokümantasyonla yayımlanır.
- **Tahmini zaman çizelgesi:** Q4 2029

### RADI Ecosystem — Tokenomics

Distribution structure, release models and the economic role of every token. Figures describe the planned model.

#### Row 1 — Token Structure

##### Pre-Supply Token — 1% of total supply · 100 million tokens

- **Release Model:** Progress-based unlock (development milestones)
- **Value Multiplier:** ×10 compared to the main token
- **Purpose:** Reward early contributors and bootstrap ecosystem growth
- **Economic Role:** High-value, scarce token powering the startup's initial momentum

##### Total Supply — 1% pre-supply + 99% main token · 100 billion total tokens

- **Release Model:** Locked until economic activation
- **Value Ratio:** ×10 pre-supply token + ×1 main token
- **Purpose:** Full transparency in distribution structure
- **Economic Role:** Foundation of the entire ecosystem and source of long-term circulation

##### Main Token — 99% of total supply · 99 billion tokens

- **Release Model:** Utility-driven and revenue-based unlock
- **Value Multiplier:** ×1 main token
- **Purpose:** Balanced growth between token value and platform utility
- **Economic Role:** Primary asset for payments, tools, automation, and user interactions

#### Row 2 — Platform Economy

##### Economic Engine — Consumption-driven + revenue-driven model · Gradual increase of circulating tokens

- **Release Model:** Scales with platform revenue and user expansion
- **Consumption Flow:** AI Engine, Bot Builder, Marketplace
- **Purpose:** Build a sustainable revenue ecosystem
- **Economic Role:** Convert user activity into real token value

##### Utility — Payments for intelligent trading and AI-powered services · User-to-service transaction layer

- **Release Model:** Direct token purchase for service access
- **Use Cases:** Model execution, bot creation, tool purchases, data APIs
- **Purpose:** Establish real and continuous token consumption
- **Economic Role:** Activate all platform modules through token usage

##### Staking — Dynamic APR + token freeze for premium services · Value-driven policy mechanism

- **Release Model:** Allocation of a portion of unlocked tokens into staking pools
- **Reward Model:** Access to platform services and exclusive features
- **Purpose:** Increase network stability and reduce circulating supply
- **Economic Role:** Long-term incentive mechanism strengthening token value

##### Current stage: Development-based pre-supply

| Token | Total supply | Released to date | Released | Value multiplier |
|---|---|---|---|---|
| Pre-supply token | 100,000,000 | 1,000,000 | 1% | ×10 |
| Main token | 99,000,000,000 | 0 | 0% | ×1 |

**1 pre-supply token = 10 main tokens**

- Tokens in this stage: 1,000,000
- Released to date: 100,000
- Value per unit: ×10 versus the main token

**Buy Samara token** — Purchase through the official RADI wallet or partner exchanges.

### Bağımlılıklar ve kritik yol

| Fazlar | Açıklama |
|---|---|
| Faz 1 → Faz 2 | Ağırlıklandırma Motoru puanlama yapmadan önce kanonik ve normalleştirilmiş olaylara ihtiyaç duyar. |
| Faz 2 → Faz 3 | TSDB ham yükleri değil, ağırlıklandırılmış ve gürültüden arındırılmış gözlemleri saklar. |
| Faz 3 → Faz 4 | Render çekirdeği kanonik serileri TSDB'den okur. |
| Faz 3 → Faz 6 | Olay katmanları, Veri Gölü'nün yayımladığı kanonik olaylarla beslenir. |
| Faz 3 → Faz 9 | Risk kontrolleri, Veri Gölü kalite ve güven skorlarına göre kalibre edilir. |
| Faz 4 → Faz 5 | Her katman ve gölgelendirici GPU render çekirdeğinin üzerine oturur. |
| Faz 5 → Faz 6 | Göstergeler ve olay katmanları katman yöneticisine bağlanır. |
| Faz 6 → Faz 7 | Grafik düğümleri, grafiğin çizdiği gösterge uygulamasının aynısını tüketir. |
| Faz 7 → Faz 8 | Derleyici ve geri test aracı serileştirilmiş düğüm grafiklerini tüketir. |
| Faz 8 → Faz 9 | Canlı yürütücü, geri test edilen aynı derlenmiş artefaktı yeniden oynatır. |
| Faz 8 → Faz 10 | Sinyaller sürümden önce geri test motorunda doğrulanır. |
| Faz 9 → Faz 12 | RL politikaları canlı işlemle aynı risk limitlerine uyar. |
| Faz 9 → Faz 13 | Token faydası gerçek işlem komisyonlarına ve ölçülen kullanıma göre fiyatlanır. |
| Faz 10 → Faz 11 | Rejim özellikleri sinyal özellik katmanından türetilir. |
| Faz 11 → Faz 12 | Rejim durumu, RL modülündeki ödül şekillendirmenin girdisidir. |
| Faz 12 → Faz 17 | Yapay zekâ modeli listelemeleri, eğitim hattının değerlendirme kapılarıyla kontrol edilir. |
| Faz 13 → Faz 14 | Ödüller ve yakmalar fayda ve staking muhasebesi üzerinden kapanır. |
| Faz 13 → Faz 16 | Pazar yeri ödemeleri ve lisans ücretleri token ekonomisinde kapanır. |
| Faz 14 → Faz 15 | Yönetişim, ödül dağıtımı ve yakmanın sahip olduğu parametreleri kontrol eder. |
| Faz 14 → Faz 17 | Üretici ödemeleri, ödül dağıtımı ve yakma politikası muhasebesi üzerinden kapanır. |
| Faz 6 → Faz 16 | Gösterge pazar yeri paketleri Gösterge motorunu hedefler. |
| Faz 8 → Faz 16 | Strateji listelemeleri uçtan uca Geri test motoru tarafından doğrulanır. |
| Faz 16 → Faz 17 | Üretici ekonomisi, strateji ve göstergeleri listeleyen pazar yerini genişletir. |

**Kritik yol:** Faz 1 → Faz 2 → Faz 3 → Faz 4 → Faz 5 → Faz 6 → Faz 7 → Faz 8 → Faz 9 → Faz 10 → Faz 11 → Faz 12 → Faz 17

### Sütun çıkış kriterleri

- **1. Sütun — Veri Gölü (Data Lake)**
  - Her tarihsel pencere, aktif ağırlık ve filtre profili altında ham arşivden bayt bayt yeniden türetilebilir.
  - Her izlenen sembol için kalite skoru yayımlanır ve karantinaya alınan her kayıt uçtan uca izlenebilir.
- **2. Sütun — Grafik Motoru (Chart Engine, WASM + WebGL)**
  - Gösterge motoru Bot Oluşturucu ile sayısal eşliğini korurken tüm katman yığını 60 fps'de çizilir.
  - Veri Gölü'nün yayımladığı her olay aynı tuvalde bir katman olarak gösterilebilir.
- **3. Sütun — Düğüm Tabanlı Bot Oluşturucu (Bot Builder, Node-Based)**
  - Aynı derlenmiş strateji artefaktı geri test, kâğıt ve canlı için kullanılır; yeniden yazım gerekmez.
  - Hiçbir emir, Risk yönetimi modülünden kayıtlı bir risk kararı olmadan borsaya ulaşmaz.
- **4. Sütun — Yapay Zekâ Motoru (AI Engine)**
  - Yayınlanan her sinyal, model ve politika kayıt defterinden yeniden üretilebilir ve canlı risk limitleri altında değerlendirme kapısını geçer.
  - Her sinyal ve model otomatik bir inceleme yoluyla sürüklenme açısından izlenir.
- **5. Sütun — Token Ekonomisi (Token Economy)**
  - Fayda, staking, ödüller, yakma ve yönetişim denetlenmiş sözleşmelerle ve imtiyazlı atlatma olmadan zincir üzerinde canlıdır.
  - Her ekonomik parametre yalnızca yönetişim kontrollü parametre kayıt defteri üzerinden değiştirilebilir.
- **6. Sütun — Pazar Yeri (Marketplace)**
  - Üçüncü taraflar doğrulanmış, sanal alanlı, lisanslı ve otomatik ödenen strateji, gösterge ve modeller yayınlar.
  - Her listeleme satılmadan önce makine tarafından doğrulanmış kanıt taşır.

### Program çıkış kriterleri

- Altı sütun, tek bir kanonik veri sözleşmesi üzerinde uçtan uca birlikte çalışır: veri toplamadan pazar yeri mutabakatına kadar.
- Mimarinin her bileşeni canlıdır, izlenir, fonlara dokunduğu yerlerde denetlenir ve bir kayıt defterinden ya da sürümlenmiş bir artefakttan yeniden üretilebilir.
- Yol haritasının tamamı beş dilde, aynı yapıda ve aynı sayılarla mevcuttur.

---

<a id="de"></a>

## German — Deutsch

**Sprache:** Deutsch (`de`, ltr)

### RADI — Technical Roadmap

*6 Architektur-Säulen · 17 Phasen · Q4 2026 → Q4 2029*

Dieses Dokument ist die phasenweise Roadmap für die Plattform für finanzielle Datenintelligenz und folgt exakt der freigegebenen Architektur: sechs Säulen — Data Lake, Chart Engine (WASM + WebGL), Bot Builder (Node-Based), AI Engine, Token Economy und Marketplace. Jedes unten genannte Lieferergebnis gehört zu einer der benannten Komponenten; es wird keine zusätzliche Architekturkomponente eingeführt und keine Komponente vereinfacht oder weggelassen.

**Programmprinzipien**

- Keine neuen Architekturkomponenten: In dieser Roadmap erscheinen ausschließlich die Komponenten der freigegebenen Architektur.
- Aufbau von unten nach oben: Jede Säule konsumiert das verifizierte Ergebnis der vorherigen Säule.
- Jede Phase endet mit messbaren Abnahmekriterien statt mit Demos.
- Alle sechs Säulen teilen einen Datenvertrag: rohe kanonische 1-Minuten-Serien plus kanonische Events.
- Jede Phase erscheint in allen fünf Whitepaper-Sprachen: Englisch, Persisch, Arabisch, Türkisch und Deutsch.

### Zeitplan-Übersicht

| Architektur-Säulen | Komponenten | Phasen | Geschätzter Zeitplan |
|---|---|---|---|
| Säule 1 — Data Lake | Fetcher-Engine (Multi-Source), Normalizer-Engine | Phase 1 — Multi-Source-Erfassung und kanonische Normalisierung | Q4 2026 |
| Säule 1 — Data Lake | Weighting-Engine, Noise-Filter-Engine | Phase 2 — Gewichtung und Rauschfilterung | Q1 2027 |
| Säule 1 — Data Lake | TSDB (Zeitreihendatenbank), Data-Quality-Monitor | Phase 3 — Zeitreihenspeicherung und Datenqualitätsüberwachung | Q1 – Q2 2027 |
| Säule 2 — Chart-Engine (WASM + WebGL) | GPU-beschleunigtes Rendering, Hochfrequente Rendering-Pipeline | Phase 4 — Rendering-Kern: WASM, GPU-Beschleunigung und hochfrequente Pipeline | Q2 – Q3 2027 |
| Säule 2 — Chart-Engine (WASM + WebGL) | Mehrschichtiges Charting, Benutzerdefinierte Shader | Phase 5 — Mehrschichtiges Charting und benutzerdefinierte Shader | Q3 – Q4 2027 |
| Säule 2 — Chart-Engine (WASM + WebGL) | Indikator-Engine, Event-Overlays | Phase 6 — Indikator-Engine und Event-Overlays | Q4 2027 – Q1 2028 |
| Säule 3 — Bot-Builder (Node-Based) | Node-Graph-Editor, Node-Interpreter | Phase 7 — Node-Graph-Editor und Node-Interpreter | Q1 – Q2 2028 |
| Säule 3 — Bot-Builder (Node-Based) | Strategie-Compiler, Backtesting-Engine | Phase 8 — Strategie-Compiler und Backtesting-Engine | Q2 – Q3 2028 |
| Säule 3 — Bot-Builder (Node-Based) | Live-Trading-Executor, Risikomanagement-Modul | Phase 9 — Live-Trading-Executor und Risikomanagement-Modul | Q3 – Q4 2028 |
| Säule 4 — KI-Engine | Signalgenerierung, Mustererkennung | Phase 10 — Signalgenerierung und Mustererkennung | Q4 2028 – Q1 2029 |
| Säule 4 — KI-Engine | Marktregime-Klassifikator | Phase 11 — Marktregime-Klassifikator | Q1 – Q2 2029 |
| Säule 4 — KI-Engine | Reinforcement-Learning-Modul, Modell-Trainings-Pipeline | Phase 12 — Reinforcement-Learning-Modul und Modell-Trainings-Pipeline | Q2 – Q3 2029 |
| Säule 5 — Token-Ökonomie | Utility-Modell, Staking-System | Phase 13 — Utility-Modell und Staking-System | Q1 – Q2 2029 |
| Säule 5 — Token-Ökonomie | Belohnungsverteilung, Burn-Mechanismus | Phase 14 — Belohnungsverteilung und Burn-Mechanismus | Q3 2029 |
| Säule 5 — Token-Ökonomie | Governance-Modell | Phase 15 — Governance-Modell | Q4 2029 |
| Säule 6 — Marktplatz | Strategie-Marktplatz, Indikator-Marktplatz | Phase 16 — Strategie-Marktplatz und Indikator-Marktplatz | Q2 – Q3 2029 |
| Säule 6 — Marktplatz | KI-Modell-Marktplatz, Creator-Ökonomie | Phase 17 — KI-Modell-Marktplatz und Creator-Ökonomie | Q4 2029 |

### Säule 1 — Data Lake

Der Data Lake erzeugt einen einzigen, reproduzierbaren kanonischen Strom aus Markt- und Makrodaten: Multi-Source-Erfassung, Normalisierung, Gewichtung, Rauschunterdrückung, Zeitreihenspeicherung und kontinuierliche Qualitätsüberwachung.

**Komponenten:** Fetcher-Engine (Multi-Source) · Normalizer-Engine · Weighting-Engine · Noise-Filter-Engine · TSDB (Zeitreihendatenbank) · Data-Quality-Monitor

#### Phase 1 — Multi-Source-Erfassung und kanonische Normalisierung

- **Beschreibung:** Wir bringen die Fetcher-Engine auf allen Handelsplätzen und Makro-Feeds live und leiten jede Roh-Payload durch die Normalizer-Engine, sodass nachfolgende Säulen einen einzigen kanonischen, herkunftsgekennzeichneten Ereignisstrom konsumieren statt roher Börsen-Payloads.
- **Komponenten:** Fetcher-Engine (Multi-Source) · Normalizer-Engine
- **Lieferergebnisse:**
  - Fetcher-Engine-Konnektoren (Multi-Source) für Spot, Futures, Orderbuch, Trades, Funding, Open Interest, Liquidationen, Makro- und On-Chain-Feeds.
  - Scheduler pro Quelle mit Rate-Limit-Governor, adaptivem Retry, Lückenerkennung und historischem Backfill.
  - Kanonischer Envelope der Normalizer-Engine: Quelle, Handelsplatz, Symbol, Zeitstempel, Sequenz, Payload und Qualitätsflags.
  - Kanonisches Symbol- und Handelsplatz-Register mit Präzisions- und Skalierungsregeln, UTC-Ausrichtung und 1-Minuten-Bucketing der Rohkerzen.
  - Unveränderliches Roharchiv jeder abgerufenen Payload mit Prüfsummen, sodass jeder kanonische Strom von Grund auf neu ableitbar ist.
- **Technische Meilensteine:**
  - Mindestens 25 Live-Konnektoren, jeweils durch einen Vertragstest gegen eine aufgezeichnete Fixture abgesichert.
  - Ingest-Latenz p95 unter 500 ms vom Börsen-Zeitstempel bis zum veröffentlichten kanonischen Ereignis.
  - Verlustfreie Wiederholung: erneutes Abrufen eines beliebigen 24-Stunden-Fensters erzeugt einen byte-identischen kanonischen Strom.
  - 100% der kanonischen Ereignisse tragen Herkunft und Qualitätsflags.
  - Dauerhaft mindestens 50.000 Ereignisse/s im Staging bei p95-CPU-Auslastung unter 70%.
- **Geschätzter Zeitplan:** Q4 2026

#### Phase 2 — Gewichtung und Rauschfilterung

- **Beschreibung:** Wir verwandeln parallele Quellen in einen belastbaren Referenzpreis: Die Weighting-Engine bewertet jede Quelle und jede Beobachtung, die Noise-Filter-Engine entfernt strukturelles Rauschen — Spikes, veraltete Quotes, Wash-Trades und fehlerhafte Ticks — bevor etwas persistiert wird.
- **Komponenten:** Weighting-Engine · Noise-Filter-Engine
- **Lieferergebnisse:**
  - Weighting-Engine: Vertrauensstufen je Quelle, dynamische Gewichte, Aktualitätsabfall, Streuungsstrafe zwischen Quellen und ein Konfidenzwert je Beobachtung.
  - Noise-Filter-Engine: Ausreißer- und Spike-Erkennung, Unterdrückung veralteter Quotes, Wash-Trade-Erkennung, Quarantäne fehlerhafter Ticks und eine explizite Lückenpolitik.
  - Denoise-Profile je Anlageklasse (Krypto Spot und Futures, Makro-Veröffentlichungen, On-Chain-Metriken) mit versionierter Konfiguration.
  - Wiederholbare Gewichts- und Filterkonfiguration, sodass jedes historische Fenster unter einem neuen Profil neu verarbeitet werden kann.
  - Gewichts- und Konfidenz-Introspektion, die jedem veröffentlichten kanonischen Ereignis beigefügt wird.
- **Technische Meilensteine:**
  - Konfidenzwert auf 100% der kanonischen Ereignisse; Gewichtsherkunft bis Quelle, Stufe und Regelversion nachvollziehbar.
  - Rausch-Recall von mindestens 95% bei Precision von mindestens 98% auf einem gelabelten Anomalie-Korpus, inklusive veröffentlichter Konfusionsmatrix.
  - Neuverarbeitung von 90 Tagen Historie unter geändertem Profil in unter 30 Minuten.
  - Deterministische Ausgabe: identische Eingaben und Profilversion erzeugen immer identische Gewichte.
  - Falsch-Positiv-Rate des Filters auf sauberen Marktdaten höchstens 0,1%, gemessen an einer zurückgehaltenen Woche.
- **Geschätzter Zeitplan:** Q1 2027

#### Phase 3 — Zeitreihenspeicherung und Datenqualitätsüberwachung

- **Beschreibung:** Wir persistieren den kanonischen Strom mit klaren Aufbewahrungs- und Downsampling-Regeln in der TSDB und halten ihn mit dem Data-Quality-Monitor ehrlich: Er bewertet jede Quelle und jedes Symbol und quarantäniert schlechte Daten automatisch.
- **Komponenten:** TSDB (Zeitreihendatenbank) · Data-Quality-Monitor
- **Lieferergebnisse:**
  - TSDB: kolumnarer Zeitreihenspeicher für die rohe kanonische 1-Minuten-Serie und kanonische Ereignisse, partitioniert nach Symbol, Handelsplatz und Zeit.
  - Kompression, Aufbewahrungsstufen, Downsampling und materialisierte Views für mehrjährige Query-Lasten.
  - Hochkardinale Indexierung und eine Query-API, die Chart-Engine, Bot-Builder und KI-Engine konsumieren.
  - Data-Quality-Monitor: Vollständigkeits-, Aktualitäts-, Genauigkeits- und Konsistenzwerte je Quelle, Symbol und Zeitrahmen.
  - Qualitäts-Alarmierung, Lineage-Tracing, automatische Quarantäne, selbstheilender Re-Fetch und ein öffentliches Qualitätsdashboard.
- **Technische Meilensteine:**
  - Mindestens 10-fache Kompression auf der Platte gegenüber rohen JSON-Payloads.
  - Query-Latenz p95 unter 150 ms für einen 30-Tage-Bereich mit 1-Minuten-Auflösung bei einem Symbol.
  - Freshness-SLA: p95 unter 2 s vom kanonischen Ereignis bis zur abfragbaren Serie, kontinuierlich verifiziert.
  - Stündlicher Qualitätswert für 100% der erfassten Symbole; MTTR bei Datenvorfällen unter 30 Minuten.
  - Automatische Quarantäne isoliert höchstens 0,01% der Datensätze, jeweils mit vollständig auditierbarem Entscheidungspfad.
- **Geschätzter Zeitplan:** Q1 – Q2 2027

### Säule 2 — Chart-Engine (WASM + WebGL)

GPU-beschleunigtes Rendering, mehrschichtiges Charting, benutzerdefinierte Shader, Indikator-Engine, Event-Overlays und eine hochfrequente Rendering-Pipeline — alles auf einem gemeinsamen WASM-+-WebGL-Kern.

**Komponenten:** GPU-beschleunigtes Rendering · Mehrschichtiges Charting · Benutzerdefinierte Shader · Indikator-Engine · Event-Overlays · Hochfrequente Rendering-Pipeline

#### Phase 4 — Rendering-Kern: WASM, GPU-Beschleunigung und hochfrequente Pipeline

- **Beschreibung:** Wir bauen das Leistungsfundament der Chart-Engine: einen WASM-Rechenkern für Parsing, Aggregation und Layout, eine GPU-beschleunigte Rendering-Schicht auf WebGL und eine hochfrequente Rendering-Pipeline, die zehntausende Ticks pro Sekunde aufnimmt.
- **Komponenten:** GPU-beschleunigtes Rendering · Hochfrequente Rendering-Pipeline
- **Lieferergebnisse:**
  - WASM-Rechenkern (aus Rust kompiliert) für Parsing, Aggregation, Indexaufbau und Viewport-Layout.
  - GPU-beschleunigte Rendering-Schicht auf WebGL mit instanzierten Draw-Calls, Texture-Atlas und Buffer-Pooling.
  - Hochfrequente Rendering-Pipeline: Ringpuffer, Dirty-Region-Updates, Auslagerung in Worker und Frame-Pacing.
  - Level-of-Detail- und Culling-System, das das Frame-Budget in jeder Zoomstufe stabil hält.
  - Benchmark-Harness mit reproduzierbaren Szenen, Speicherobergrenze und Regressionstracking der Frame-Zeiten.
- **Technische Meilensteine:**
  - Dauerhaft 60 fps mit mindestens 1.000.000 sichtbaren Punkten auf einer GPU der Mittelklasse.
  - Aufnahme von mindestens 10.000 Ticks/s ohne einen einzigen verworfenen Frame.
  - p99-Frame-Zeit höchstens 8 ms, WASM-Rechenschritt höchstens 2 ms, WASM-zu-JS-Grenze unter 0,2 ms pro Frame.
  - Kaltstart (WASM-Laden plus erster Paint) unter 500 ms in der Benchmark-Szene.
  - Spitzenspeicher höchstens 300 MB für eine 30-Tage-Sitzung mit 1-Minuten-Auflösung.
- **Geschätzter Zeitplan:** Q2 – Q3 2027

#### Phase 5 — Mehrschichtiges Charting und benutzerdefinierte Shader

- **Beschreibung:** Wir definieren die visuelle Sprache der Plattform: unabhängige, einzeln schaltbare Layer, die die Engine komponiert, und ein Shader-System, das jede visuelle Primitive auf der GPU rendert.
- **Komponenten:** Mehrschichtiges Charting · Benutzerdefinierte Shader
- **Lieferergebnisse:**
  - Mehrschichtiges Charting: Preis-, Volumen-, Orderbuch-Tiefen-, Liquidations-Heatmap-, Funding- und Open-Interest-Layer plus Makro-Overlays.
  - Layer-Manager mit z-Ordnung, Compositing, Lazy-Initialisierung, Off-Screen-Layern und Persistenz des Layer-Zustands.
  - Benutzerdefinierte Shader in GLSL für Candlesticks, Gradient-Volumen, Heatmaps, Glow-Linien und Crosshair-Primitiven.
  - Shader-Registry mit Hot Reload, Versionierung und einem sauberen Fallback-Pfad, wenn ein Shader nicht kompiliert.
  - Layer- und Shader-Presets, die gespeichert, geteilt und im Bot-Builder-Viewer wiederhergestellt werden können.
- **Technische Meilensteine:**
  - Mindestens 12 unabhängige Layer gleichzeitig mit 60 fps komponiert.
  - Shader-Kompilierung unter 50 ms; Hot Reload ohne Neuladen des Charts und ohne Verlust des Viewport-Zustands.
  - Gesamtkosten aller aktiven Layer höchstens 2 ms pro Frame bei Referenz-Zoom.
  - Fallback-Renderer erzeugt dieselbe Layout-Geometrie mit höchstens 1 px Abweichung.
  - Visuelle Regressions-Suite mit mindestens 50 Golden Frames, die auf CI-GPUs besteht.
- **Geschätzter Zeitplan:** Q3 – Q4 2027

#### Phase 6 — Indikator-Engine und Event-Overlays

- **Beschreibung:** Wir berechnen Indikatoren inkrementell in WASM, damit Charts und Strategien eine Implementierung teilen, und legen Ereignisse aus dem Data Lake darüber, damit Marktkontext auf derselben Fläche sichtbar ist.
- **Komponenten:** Indikator-Engine · Event-Overlays
- **Lieferergebnisse:**
  - Indikator-Engine: inkrementelle und streamende Berechnung in WASM mit O(1)-Update pro Tick.
  - Indikator-Registry mit Parameterschemata, Warm-up-Behandlung und öffentlicher API für eigene Indikatoren.
  - Numerische Paritäts-Schicht, die identische Indikatorwerte in Chart-Engine und Bot-Builder garantiert.
  - Event-Overlays gespeist aus Data-Lake-Ereignissen: Makro-Veröffentlichungen, Funding-Wechsel, Liquidationen, Listings und Delistings.
  - Annotationsebene mit Zeitachsen-Markern, Clustering bei weitem Zoom, Filtern und persistierten Nutzerannotationen.
- **Technische Meilensteine:**
  - Mindestens 60 eingebaute Indikatoren, jeder mit Aktualisierung in höchstens 0,1 ms pro Tick.
  - 100% Parität zwischen Chart- und Backtest-Indikatorwerten bei relativer Abweichung höchstens 1e-9.
  - Mindestens 100.000 überlagerte Ereignisse mit Clustering bei 60 fps gerendert.
  - Deterministisches Warm-up: Indikatorwerte unabhängig davon, wie viel Historie geladen ist.
  - Annotationen anlegen, ändern und löschen ohne Verlust über Sitzungen hinweg.
- **Geschätzter Zeitplan:** Q4 2027 – Q1 2028

### Säule 3 — Bot-Builder (Node-Based)

Ein typisierter Node-Graph-Editor, ein deterministischer Node-Interpreter, ein Strategie-Compiler, eine Backtesting-Engine, ein Live-Trading-Executor und ein Risikomanagement-Modul — ein Artefakt von der Idee bis zur Live-Order.

**Komponenten:** Node-Graph-Editor · Node-Interpreter · Strategie-Compiler · Backtesting-Engine · Live-Trading-Executor · Risikomanagement-Modul

#### Phase 7 — Node-Graph-Editor und Node-Interpreter

- **Beschreibung:** Wir liefern die Autorenoberfläche des Bot-Builders: einen typisierten Node-Graph-Editor und einen deterministischen Interpreter, der jeden Graphen sicher in einer Sandbox ausführt.
- **Komponenten:** Node-Graph-Editor · Node-Interpreter
- **Lieferergebnisse:**
  - Node-Graph-Editor: Canvas mit Node-Palette, typisierten Ports, Live-Validierung, Undo und Redo, Gruppen, Kommentaren und Minimap.
  - Serialisierung des Graphen in ein versioniertes AST/JSON-Dokument mit Copy und Paste, Subgraph-Extraktion und diffbaren Speicherständen.
  - Node-Interpreter: topologischer Scheduler, streamende und eventgetriebene Nodes, zustandsbehaftete Nodes und Backpressure-Kontrolle.
  - Speicherbegrenzte Ringpuffer, deterministisches Seeding und Sandbox-Ausführung ohne Netzwerk- und Dateisystemzugriff.
  - Hot Reload bearbeiteter Subgraphen gegen eine laufende Interpretationssitzung.
- **Technische Meilensteine:**
  - Mindestens 150 Kern-Nodes mit typisierten Signaturen und Dokumentation.
  - Einen 2.000-Node-Graphen mit 60 fps öffnen und bearbeiten; Validierungslauf unter 100 ms.
  - Byte-identische Ausgaben beim erneuten Abspielen desselben Graphen über denselben Eingabestrom.
  - Sandbox-Escape-Testsuite besteht mit null Befunden.
  - Speicher des Interpreters im Dauerbetrieb unter 512 MB für einen 2.000-Node-Graphen.
- **Geschätzter Zeitplan:** Q1 – Q2 2028

#### Phase 8 — Strategie-Compiler und Backtesting-Engine

- **Beschreibung:** Wir kompilieren Graphen in einen optimierten Ausführungsplan und beweisen sie gegen die Historie: Der Strategie-Compiler erzeugt signierte Artefakte, die Backtesting-Engine spielt sie mit realistischer Mikrostruktur, Gebühren und Latenz ab.
- **Komponenten:** Strategie-Compiler · Backtesting-Engine
- **Lieferergebnisse:**
  - Strategie-Compiler: Graph zu IR zu optimiertem Ausführungsplan mit Constant Folding, Dead-Node-Elimination und Parallelisierung von Zweigen.
  - Strategie-Versionierung, Artefakt-Signierung und diffbare Strategiehistorie.
  - Backtesting-Engine: eventgetriebenes Replay auf Tick- und Bar-Auflösung mit Multi-Asset-Portfolio-Buchhaltung.
  - Realistisches Kostenmodell: Gebühren, Slippage, Funding, Borrow, Latenz und Teilfüllungssimulation.
  - Walk-Forward-Analyse, Parametersweeps, Monte-Carlo-Resampling und die vollständige Metriksuite (Sharpe, Sortino, Calmar, Profit Factor, maximaler Drawdown, Trefferquote).
- **Technische Meilensteine:**
  - Kompiliertes Artefakt mindestens 5x schneller als der interpretierte Graph auf der Referenzlast.
  - Look-ahead-Leakage-Testsuite besteht zu 100%; jedes Ergebnis protokolliert seinen Datengrenznachweis.
  - Ein Jahr 1-Minuten-Daten über 50 Symbole in unter 5 Minuten auf dem parallelen Runner backgetestet.
  - 1.000 Parameterkombinationen in unter 30 Minuten mit reproduzierbarer Reihenfolge ausgewertet.
  - Zwei Läufe derselben Konfiguration und desselben Seeds sind byte-identisch.
- **Geschätzter Zeitplan:** Q2 – Q3 2028

#### Phase 9 — Live-Trading-Executor und Risikomanagement-Modul

- **Beschreibung:** Wir befördern kompilierte Strategien über einen abgleichsicheren Executor in den Livehandel und leiten jede Order durch das Risikomanagement-Modul, bevor sie einen Handelsplatz erreicht.
- **Komponenten:** Live-Trading-Executor · Risikomanagement-Modul
- **Lieferergebnisse:**
  - Live-Trading-Executor: Order-Router, OMS-Zustandsmaschine, idempotente Client-Order-IDs und Abgleich mit dem Handelsplatz.
  - Beförderung von Paper zu Live mit demselben kompilierten Artefakt, das backgetestet und verifiziert wurde.
  - Verbindungsresilienz: Reconnect, Failover, replay-sichere Wiederholung und ein globaler Kill Switch.
  - Risikomanagement-Modul: Pre-Trade-Checks, Positions-, Exposure- und Hebelgrenzen, Risikobudget pro Strategie und Drawdown-Circuit-Breaker.
  - Margin- und Liquidationsüberwachung plus ein vollständiger Audit-Trail jeder Risikoentscheidung.
- **Technische Meilensteine:**
  - Order-Intent-Parität von mindestens 99,9% zwischen Paper und Live über 30 aufeinanderfolgende Tage.
  - Order-Bestätigung p95 unter 100 ms inklusive Round-Trip zum Handelsplatz.
  - Null doppelte Orders in 100 erzwungenen Reconnect-Szenarien.
  - Kill-Switch-Auslösung unter 1 s und Abweichung beim End-of-Day-Abgleich von null über 60 aufeinanderfolgende Tage.
  - Risiko-Checks p99 unter 5 ms und 100% der Orders mit gespeichertem Risikoentscheidungs-Datensatz.
- **Geschätzter Zeitplan:** Q3 – Q4 2028

### Säule 4 — KI-Engine

Signalgenerierung, Mustererkennung, ein Marktregime-Klassifikator, ein Reinforcement-Learning-Modul und eine Modell-Trainings-Pipeline — von Rohserien zu reproduzierbaren, risikobegrenzten Entscheidungen.

**Komponenten:** Signalgenerierung · Mustererkennung · Marktregime-Klassifikator · Reinforcement-Learning-Modul · Modell-Trainings-Pipeline

#### Phase 10 — Signalgenerierung und Mustererkennung

- **Beschreibung:** Wir verwandeln den Data Lake in Entscheidungen: kalibrierte, versionierte Signale und die Erkennung der Muster — Chart-, Candlestick- und Mikrostrukturmuster —, die sie erklären.
- **Komponenten:** Signalgenerierung · Mustererkennung
- **Lieferergebnisse:**
  - Signalgenerierung: Feature-Schicht über der TSDB mit kalibrierten Wahrscheinlichkeiten und Konfidenzintervallen.
  - Signal-Bus mit versionierten Metadaten, TTL, Ownership und direkter Anbindung an Bot-Builder-Graphen.
  - Drift-Überwachung pro Signal inklusive Feature-Drift, Label-Drift und Kalibrierungsverfall mit Alarmierung.
  - Mustererkennung: geometrische Chartmuster, Candlestick-Muster und Mikrostrukturmuster (Iceberg, Spoofing, Absorption).
  - Gelabelter Musterkorpus mit veröffentlichtem Precision- und Recall-Reporting pro Musterfamilie.
- **Technische Meilensteine:**
  - Mindestens 20 Produktionssignale, jedes schlägt seine eigene Random-Shuffle-Kontrolle auf zurückgehaltenen Daten.
  - Muster-Precision von mindestens 0,75 und Recall von mindestens 0,70 auf dem gelabelten Korpus.
  - Signal-Latenz p95 unter 50 ms, nachdem der auslösende Bar oder das Ereignis verfügbar ist.
  - Drift-Alarm innerhalb von 1 Stunde nach erkannter Verteilungsverschiebung.
  - 100% der Signale reproduzierbar aus dem Modellregister per Version.
- **Geschätzter Zeitplan:** Q4 2028 – Q1 2029

#### Phase 11 — Marktregime-Klassifikator

- **Beschreibung:** Wir labeln den Marktzustand in Echtzeit, damit Signale, Strategien und Risikolimits sich anpassen können: Regime pro Asset und über Assets hinweg, mit Konfidenz, Hysterese und vollständiger Historie.
- **Komponenten:** Marktregime-Klassifikator
- **Lieferergebnisse:**
  - Regime-Taxonomie: Aufwärts- und Abwärtstrend, Range, hohe und niedrige Volatilität, dünne und tiefe Liquidität, Risk-on und Risk-off, pro Asset und über Assets hinweg.
  - Online-Change-Point-Erkennung mit einem Konfidenzwert pro Zustand.
  - Hysterese- und Mindestverweildauer-Regeln, die Regime-Flapping verhindern.
  - Regime-Historien-Store mit vollständigem Replay und Point-in-Time-Rekonstruktion ohne Revisionsbias.
  - Regimebewusstes Routing, das die KI-Engine und die Risikobudgetierung des Bot-Builders konsumieren.
- **Technische Meilensteine:**
  - Regime-Genauigkeit von mindestens 0,80 auf zurückgehaltenen Perioden bei erwartetem Kalibrierungsfehler höchstens 0,05.
  - Median der Erkennungsverzögerung unter 15 Bars bei einer Falschwechsel-Rate unter 5%.
  - Regime pro Asset wird bei jedem Bar mit p95 unter 20 ms aktualisiert.
  - Fünfjährige Regime-Historie klassifiziert und aus der TSDB reproduzierbar.
  - Gemessene regimebedingte Verbesserung für jedes Produktionssignal dokumentiert.
- **Geschätzter Zeitplan:** Q1 – Q2 2029

#### Phase 12 — Reinforcement-Learning-Modul und Modell-Trainings-Pipeline

- **Beschreibung:** Wir schließen den Kreis: Wir trainieren Policies in einem Simulator auf Basis der Backtesting-Engine, respektieren die Grenzen des Risikomanagement-Moduls per Konstruktion und liefern Modelle über eine governance-gesteuerte Trainings-Pipeline aus.
- **Komponenten:** Reinforcement-Learning-Modul · Modell-Trainings-Pipeline
- **Lieferergebnisse:**
  - Reinforcement-Learning-Modul: Umgebung abgeleitet von der Backtesting-Engine mit gym-artiger API.
  - Reward-Shaping im Einklang mit den Grenzen, die das Risikomanagement-Modul durchsetzt.
  - Offline- und Imitations-Vortraining plus Online-Fine-Tuning, mit Export der Policy als Artefakt für Bot-Builder-Graphen.
  - Modell-Trainings-Pipeline: Dataset-Versionierung und Lineage, Feature-Store-Snapshots, Orchestrierung und GPU-Scheduling.
  - Experiment-Tracking, Hyperparameter-Suche, Modellregister, Evaluierungs-Gates, Canary-Release und Rollback.
- **Technische Meilensteine:**
  - RL-Policies schlagen die stärkste getunte manuelle Strategie in mindestens 3 von 5 zurückgehaltenen Märkten unter identischen Risikolimits.
  - Simulator-Durchsatz von mindestens 1.000.000 Umgebungsschritten pro Minute.
  - Jeder Trainingslauf ist aus einer einzigen Manifest-Datei reproduzierbar.
  - Null Modell-Releases ohne genehmigten Evaluierungs-Gate-Datensatz und Rollback unter 5 Minuten.
  - Von Training über Register zum deploybaren Artefakt in unter 1 Stunde für ein kleines Modell.
- **Geschätzter Zeitplan:** Q2 – Q3 2029

### Säule 5 — Token-Ökonomie

Ein Utility-Modell mit Sink- und Source-Buchhaltung, ein Staking-System mit Lock-Stufen, epochale Belohnungsverteilung, ein on-chain verifizierbarer Burn-Mechanismus und ein Governance-Modell, das die Parameter all dessen steuert.

**Komponenten:** Utility-Modell · Staking-System · Belohnungsverteilung · Burn-Mechanismus · Governance-Modell

#### Phase 13 — Utility-Modell und Staking-System

- **Beschreibung:** Wir definieren, wofür der Token steht und wie Commitment bepreist wird: eine vollständige Utility-Map mit Sink- und Source-Buchhaltung sowie ein Staking-System mit Lock-Stufen, Gewichtung und Slashing-Hooks.
- **Komponenten:** Utility-Modell · Staking-System
- **Lieferergebnisse:**
  - Utility-Modell: Token-Utility-Map für Handelsgebühren, Abonnements, Marketplace-Zahlungen, Compute- und Inferenz-Credits, API-Kontingent und Stufenzugang.
  - Sink- und Source-Buchhaltung, Stufentabelle, Preismodell und ein Regelwerk gegen Missbrauch.
  - Treasury-Politik und Vesting-Zeitplan mit veröffentlichter Unlock-Transparenz.
  - Staking-System: Stake und Unstake mit Lock-Stufen, zeit- und betragsgewichtete Stimmkraft und Belohnungsakkrual.
  - Slashing-Hooks für Marketplace-Verstöße, Emergency Pause und extern auditierte Verträge.
- **Technische Meilensteine:**
  - Vollständige Utility-Flows Ende-zu-Ende im Testnet: Gebühren, Abonnements, Credits und Kontingent.
  - Mindestens 3 auditierte Verträge mit null offenen kritischen oder hohen Befunden.
  - Stake- und Unstake-Gas höchstens 120.000; Invariantentests für Belohnungsakkrual und Slashing bestehen zu 100%.
  - Invarianten- und Fuzz-Suite führt mindestens 10.000 Durchläufe ohne verletzte Invariante aus.
  - Ökonomische Parametertabelle peer-reviewed und in allen fünf Whitepaper-Sprachen veröffentlicht.
- **Geschätzter Zeitplan:** Q1 – Q2 2029

#### Phase 14 — Belohnungsverteilung und Burn-Mechanismus

- **Beschreibung:** Wir bezahlen Beitrag und machen die Angebotspolitik explizit: epochale, beitragsgewichtete Belohnungen mit verifizierbaren Ansprüchen und ein on-chain verifizierbarer Burn-Mechanismus, der an Plattformgebühren gekoppelt ist.
- **Komponenten:** Belohnungsverteilung · Burn-Mechanismus
- **Lieferergebnisse:**
  - Belohnungsverteilung: epochale Akkrual, Snapshot-Buchhaltung und Merkle-basierte Ansprüche.
  - Beitragsgewichtung über Datenqualität, Strategien, Indikatoren, Modelle und Compute-Beitrag.
  - Anti-Farming- und Sybil-Resistenz, Belohnungs-Vesting und gas-effiziente Batch-Ansprüche.
  - Öffentliche Belohnungs-Dashboards mit Reproduzierbarkeit pro Epoche aus Snapshots.
  - Burn-Mechanismus: Fee-Burn-Zeitplan, verifizierbare Burn-Adresse, Treasury-Buyback- und Burn-Politik, Burn-Obergrenze und Emergency Halt.
- **Technische Meilensteine:**
  - Null verpasste Belohnungsepochen über 3 aufeinanderfolgende Betriebsmonate.
  - Belohnungsberechnung unabhängig reproduzierbar aus Snapshots und veröffentlichten Gewichten.
  - 100% der Burns on-chain gegen ein öffentliches Ledger verifizierbar.
  - Mindestens 95% der simulierten Farming-Cluster werden von den Anti-Sybil-Regeln erkannt.
  - Burn-Rate und Belohnungsgewichte nur über das governance-kontrollierte Parameterregister änderbar.
- **Geschätzter Zeitplan:** Q3 2029

#### Phase 15 — Governance-Modell

- **Beschreibung:** Wir übergeben die Parameter der Ökonomie an ihre Nutzer: ein vollständiger Proposal-Lebenszyklus, stake-gewichtete und zeitverriegelte Abstimmung, Delegation und zeitverriegelte On-Chain-Ausführung.
- **Komponenten:** Governance-Modell
- **Lieferergebnisse:**
  - Governance-Modell mit vollständigem Proposal-Lebenszyklus: Forum-Entwurf, On-Chain-Proposal, Abstimmung, Timelock und Ausführung.
  - Stake-gewichtete, zeitverriegelte Stimmkraft mit Delegationsunterstützung.
  - Quorum- und Zustimmungsschwellen plus das governance-kontrollierte Parameterregister für Gebühren, Burn-Rate, Belohnungsgewichte und Listings.
  - Timelock- und Multisignatur-Notfallverfahren mit veröffentlichten Playbooks.
  - Governance-Dokumentation, Proposal-Vorlagen und öffentliche Abstimmungshistorie.
- **Technische Meilensteine:**
  - Vollständiger Lebenszyklus mindestens 20-mal im Testnet ausgeführt, inklusive 2 Parameteränderungen und 1 Emergency-Pause-Übung.
  - Timelock von mindestens 48 Stunden on-chain erzwungen und durch keinen einzelnen Schlüssel umgehbar.
  - 100% der Governance-Aktionen erzeugen einen auditierbaren On-Chain-Datensatz.
  - Delegate- und Stimmkraft-Buchhaltung durch ein externes Audit mit null hohen Befunden bestätigt.
  - Governance-Dokumentation in allen fünf Whitepaper-Sprachen veröffentlicht.
- **Geschätzter Zeitplan:** Q4 2029

### Säule 6 — Marktplatz

Strategie-Marktplatz, Indikator-Marktplatz, KI-Modell-Marktplatz und eine Creator-Ökonomie — hier wird die Ausgabe der fünf vorherigen Säulen zu einem lizenzierten, bezahlten und verifizierbaren Produkt.

**Komponenten:** Strategie-Marktplatz · Indikator-Marktplatz · KI-Modell-Marktplatz · Creator-Ökonomie

#### Phase 16 — Strategie-Marktplatz und Indikator-Marktplatz

- **Beschreibung:** Wir öffnen die Plattformausgabe für Dritte: Strategien werden mit maschinell verifizierter Performance gelistet, Indikatoren als sandboxed WASM-Pakete für die Indikator-Engine verteilt.
- **Komponenten:** Strategie-Marktplatz · Indikator-Marktplatz
- **Lieferergebnisse:**
  - Strategie-Marktplatz: Listings, Metadaten, Lizenzierung sowie Abo- oder Kopiermodelle.
  - Maschinell verifizierte Performance für jedes Listing, erzeugt von der Backtesting-Engine mit einer No-Lookahead-Attestierung.
  - Sandbox-Ausführung gekaufter Strategien auf Live-Daten mit Bewertungen, Reviews sowie Streit- und Erstattungsprozess.
  - Indikator-Marktplatz: WASM-Indikatorpakete für die Indikator-Engine mit Schema- und Versionsvorgaben.
  - Sandbox-Ressourcengrenzen (CPU, Speicher, kein Netzwerk), Lizenzbedingungen und automatisiertes Umsatz-Splitting.
- **Technische Meilensteine:**
  - Pipeline von Veröffentlichung über Verifikation bis Listing vollständig automatisiert in unter 24 Stunden pro Listing.
  - Mindestens 90% der Live-Listings tragen maschinell verifizierte Kennzahlen; unverifizierte Listings werden sichtbar markiert.
  - Sandbox-Escape- und Ressourcenmissbrauchs-Testsuiten bestehen mit null Befunden.
  - Lizenzausgabe und Creator-Auszahlungsabgleich über 3 Monate mit null Abweichungen.
  - Marktplatz lastgetestet auf 1.000 gleichzeitige Listings mit p95-Seitenantwort unter 300 ms.
- **Geschätzter Zeitplan:** Q2 – Q3 2029

#### Phase 17 — KI-Modell-Marktplatz und Creator-Ökonomie

- **Beschreibung:** Wir vervollständigen das Ökosystem: Modelle werden mit Evaluierungsnachweisen und gemessener Inferenz veröffentlicht, und eine Creator-Ökonomie entlohnt Beitragende für dauerhafte Performance.
- **Komponenten:** KI-Modell-Marktplatz · Creator-Ökonomie
- **Lieferergebnisse:**
  - KI-Modell-Marktplatz: Modellkarten, Evaluierungs-Scorecards und Benchmark-Ergebnisse auf zurückgehaltenen Daten.
  - Gehostete, gemessene Inferenz mit Latenzstufen und transparenter Abrechnung pro Aufruf.
  - Drift- und Verfalls-basierte Delisting-Politik mit automatischen Review-Auslösern.
  - Creator-Ökonomie: Creator-Profile, Verifikation, Reputation aus Live-Performance und Nutzung, Royalties und gestaffelter Umsatzanteil.
  - Creator-Analytics, ein Creator-SDK und Token-Auszahlungswege mit Steuer- und Reporting-Exporten.
- **Technische Meilensteine:**
  - Gehostete Inferenz p95 unter 200 ms bei 100% Messgenauigkeit gegenüber dem Ledger.
  - Jede Modellkarte trägt einen signierten Evaluierungs-Gate-Datensatz, bevor sie gelistet werden kann.
  - Automatisches Drift-Review wird innerhalb von 24 Stunden nach Überschreiten einer Verfallsschwelle ausgelöst.
  - Einheitliche Creator-Reputation wird für 100% der Listings aus Live- und Review-Daten berechnet.
  - Creator-SDK mit Dokumentation in allen fünf Whitepaper-Sprachen veröffentlicht.
- **Geschätzter Zeitplan:** Q4 2029

### RADI Ecosystem — Tokenomics

Distribution structure, release models and the economic role of every token. Figures describe the planned model.

#### Row 1 — Token Structure

##### Pre-Supply Token — 1% of total supply · 100 million tokens

- **Release Model:** Progress-based unlock (development milestones)
- **Value Multiplier:** ×10 compared to the main token
- **Purpose:** Reward early contributors and bootstrap ecosystem growth
- **Economic Role:** High-value, scarce token powering the startup's initial momentum

##### Total Supply — 1% pre-supply + 99% main token · 100 billion total tokens

- **Release Model:** Locked until economic activation
- **Value Ratio:** ×10 pre-supply token + ×1 main token
- **Purpose:** Full transparency in distribution structure
- **Economic Role:** Foundation of the entire ecosystem and source of long-term circulation

##### Main Token — 99% of total supply · 99 billion tokens

- **Release Model:** Utility-driven and revenue-based unlock
- **Value Multiplier:** ×1 main token
- **Purpose:** Balanced growth between token value and platform utility
- **Economic Role:** Primary asset for payments, tools, automation, and user interactions

#### Row 2 — Platform Economy

##### Economic Engine — Consumption-driven + revenue-driven model · Gradual increase of circulating tokens

- **Release Model:** Scales with platform revenue and user expansion
- **Consumption Flow:** AI Engine, Bot Builder, Marketplace
- **Purpose:** Build a sustainable revenue ecosystem
- **Economic Role:** Convert user activity into real token value

##### Utility — Payments for intelligent trading and AI-powered services · User-to-service transaction layer

- **Release Model:** Direct token purchase for service access
- **Use Cases:** Model execution, bot creation, tool purchases, data APIs
- **Purpose:** Establish real and continuous token consumption
- **Economic Role:** Activate all platform modules through token usage

##### Staking — Dynamic APR + token freeze for premium services · Value-driven policy mechanism

- **Release Model:** Allocation of a portion of unlocked tokens into staking pools
- **Reward Model:** Access to platform services and exclusive features
- **Purpose:** Increase network stability and reduce circulating supply
- **Economic Role:** Long-term incentive mechanism strengthening token value

##### Current stage: Development-based pre-supply

| Token | Total supply | Released to date | Released | Value multiplier |
|---|---|---|---|---|
| Pre-supply token | 100,000,000 | 1,000,000 | 1% | ×10 |
| Main token | 99,000,000,000 | 0 | 0% | ×1 |

**1 pre-supply token = 10 main tokens**

- Tokens in this stage: 1,000,000
- Released to date: 100,000
- Value per unit: ×10 versus the main token

**Buy Samara token** — Purchase through the official RADI wallet or partner exchanges.

### Abhängigkeiten & kritischer Pfad

| Phasen | Beschreibung |
|---|---|
| Phase 1 → Phase 2 | Die Weighting-Engine braucht kanonische, normalisierte Ereignisse, bevor sie bewerten kann. |
| Phase 2 → Phase 3 | Die TSDB speichert gewichtete und entrauschte Beobachtungen, keine Roh-Payloads. |
| Phase 3 → Phase 4 | Der Rendering-Kern liest kanonische Serien aus der TSDB. |
| Phase 3 → Phase 6 | Event-Overlay-Layer werden aus kanonischen Ereignissen des Data Lake gespeist. |
| Phase 3 → Phase 9 | Risiko-Checks werden gegen Qualitäts- und Konfidenzwerte des Data Lake kalibriert. |
| Phase 4 → Phase 5 | Jeder Layer und Shader setzt auf dem GPU-Rendering-Kern auf. |
| Phase 5 → Phase 6 | Indikatoren und Event-Overlays docken am Layer-Manager an. |
| Phase 6 → Phase 7 | Graph-Nodes nutzen dieselbe Indikator-Implementierung, die das Chart rendert. |
| Phase 7 → Phase 8 | Compiler und Backtester konsumieren serialisierte Node-Graphen. |
| Phase 8 → Phase 9 | Der Live-Executor spielt dasselbe kompilierte Artefakt ab, das backgetestet wurde. |
| Phase 8 → Phase 10 | Signale werden vor dem Release auf der Backtesting-Engine validiert. |
| Phase 9 → Phase 12 | RL-Policies respektieren dieselben Risikolimits wie der Livehandel. |
| Phase 9 → Phase 13 | Die Token-Utility wird gegen echte Handelsgebühren und gemessene Nutzung bepreist. |
| Phase 10 → Phase 11 | Regime-Features werden aus der Signal-Feature-Schicht abgeleitet. |
| Phase 11 → Phase 12 | Der Regime-Zustand ist ein Input für das Reward-Shaping im RL-Modul. |
| Phase 12 → Phase 17 | KI-Modell-Listings werden durch die Evaluierungs-Gates der Trainings-Pipeline kontrolliert. |
| Phase 13 → Phase 14 | Belohnungen und Burns werden über die Utility- und Staking-Buchhaltung abgewickelt. |
| Phase 13 → Phase 16 | Marketplace-Zahlungen und Lizenzgebühren werden in der Token-Ökonomie abgewickelt. |
| Phase 14 → Phase 15 | Governance kontrolliert die Parameter, die Belohnungsverteilung und Burn besitzen. |
| Phase 14 → Phase 17 | Creator-Auszahlungen werden über Belohnungsverteilung und Burn-Politik-Buchhaltung abgewickelt. |
| Phase 6 → Phase 16 | Pakete des Indikator-Marktplatzes zielen auf die Indikator-Engine. |
| Phase 8 → Phase 16 | Strategie-Listings werden durchgängig von der Backtesting-Engine verifiziert. |
| Phase 16 → Phase 17 | Die Creator-Ökonomie erweitert den Marktplatz, der bereits Strategien und Indikatoren listet. |

**Kritischer Pfad:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11 → Phase 12 → Phase 17

### Exit-Kriterien der Säulen

- **Säule 1 — Data Lake**
  - Jedes historische Fenster ist unter dem aktiven Gewichts- und Filterprofil byte-identisch aus dem Roharchiv ableitbar.
  - Für jedes erfasste Symbol wird ein Qualitätswert veröffentlicht und jeder quarantänisierte Datensatz ist durchgängig nachvollziehbar.
- **Säule 2 — Chart-Engine (WASM + WebGL)**
  - Der gesamte Layer-Stack rendert mit 60 fps, während die Indikator-Engine in numerischer Parität zum Bot-Builder bleibt.
  - Jedes vom Data Lake veröffentlichte Ereignis ist als Overlay auf derselben Fläche darstellbar.
- **Säule 3 — Bot-Builder (Node-Based)**
  - Dasselbe kompilierte Strategie-Artefakt wird für Backtest, Paper und Live genutzt, ohne Neuautorisierung.
  - Keine Order erreicht einen Handelsplatz ohne gespeicherten Risikoentscheidungs-Datensatz aus dem Risikomanagement-Modul.
- **Säule 4 — KI-Engine**
  - Jedes ausgelieferte Signal und Modell und jede Policy ist aus dem Register reproduzierbar und besteht ihr Evaluierungs-Gate unter Live-Risikolimits.
  - Jedes Signal und Modell wird mit automatischem Review-Pfad auf Drift überwacht.
- **Säule 5 — Token-Ökonomie**
  - Utility, Staking, Belohnungen, Burn und Governance sind on-chain live, mit auditierten Verträgen und ohne privilegierte Umgehung.
  - Jeder ökonomische Parameter ist nur über das governance-kontrollierte Parameterregister änderbar.
- **Säule 6 — Marktplatz**
  - Dritte veröffentlichen Strategien, Indikatoren und Modelle, die verifiziert, sandboxed, lizenziert und automatisch bezahlt werden.
  - Jedes Listing trägt maschinell verifizierte Nachweise, bevor es verkauft werden kann.

### Exit-Kriterien des Programms

- Alle sechs Säulen arbeiten durchgängig auf einem kanonischen Datenvertrag zusammen — von der Erfassung bis zur Marketplace-Abrechnung.
- Jede Komponente der Architektur ist live, überwacht, im Umgang mit Geldern auditiert und aus einem Register oder einem versionierten Artefakt reproduzierbar.
- Das vollständige Roadmap-Dokument existiert in fünf Sprachen mit identischer Struktur und identischen Zahlen.

---

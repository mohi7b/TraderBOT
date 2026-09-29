/* ============================================================
 * File: analytics-engine/engine.cjs
 * Section: analytics-engine
 * Version: 1.0.0
 *
 * Role:
 *   The orchestrator of the analytical layer. It is the ONLY file that
 *   knows how the nine modules are wired together:
 *
 *     collector envelope ──► Router ──► module call
 *                                    └► reading ──► egress ──► bus/sinks
 *
 *   Nothing else subscribes, throttles or publishes. A module never
 *   knows an envelope exists; the router never knows a bus exists
 *   (see core/router.cjs and core/egress.cjs headers).
 *
 *   Input — any of the three producer shapes:
 *     ingest(envelope)          collector envelope (realtime/derivatives/liquidity)
 *     ingestPacket(packet)      realtime market packet
 *     ingestBusEntry(entry)     event-bus entry (or an analytics entry)
 *     attach(bus)               subscribe every bus tap into the engine
 *
 *   One instance serves every asset class: a six-market liquidity reading
 *   carries its own assetClass (forex, commodities, indices, bonds,
 *   realestatecredit, crypto) and keeps it through publication, so the
 *   engine never relabels a gold quote as crypto.
 *
 *   Output — analytics envelopes on analytics.<assetClass>.<asset>.<event>,
 *   published to the bus (channel analytics:<assetClass>:<symbol>:<event>)
 *   and/or handed to sinks.
 *
 *   Publication policy (throttle, force, feedback guard) lives here, in
 *   one place, so a consumer can reason about the event rate from a
 *   single table: ROUTE throttle defaults, overridable per eventType via
 *   `publishThrottleMs`.
 * ============================================================ */

const { Router } = require("./core/router.cjs");
const { createAnalyticsBridge, analyticsEnvelope } = require("./core/egress.cjs");
const { DeltaFlow } = require("./modules/delta-flow/index.cjs");
const { LiquidationHeatmap } = require("./modules/liquidations/index.cjs");
const { CrossExchangeArbitrage } = require("./modules/arbitrage/index.cjs");
const { DerivativesAnalytics } = require("./modules/derivatives/index.cjs");
const { LiquidityAnalytics } = require("./modules/liquidity/index.cjs");
const { OnchainAnalytics } = require("./modules/onchain/index.cjs");
const { IndicatorAnalytics } = require("./modules/indicators/index.cjs");
const { PriceActionAnalytics } = require("./modules/price_action/index.cjs");
const { CrossMarketAnalytics } = require("./modules/cross_market/index.cjs");
const {
    ASSET_CLASS,
    SOURCE_TYPE,
    isEnvelope,
    fromMarketPacket,
    fromBusEntry,
    baseAssetOf,
    canonicalSymbol
} = require("../collector/crypto/common/envelope.cjs");

const MAX_LOG = 50;
const MAX_PUBLISHED = 500;

class AnalyticsEngine {
    /**
     * @param {object}  [options]
     * @param {object}  [options.bus]              EventBus-compatible sink ({publish})
     * @param {object}  [options.router]           custom Router (default: default routes)
     * @param {Function} [options.sink]            extra receiver of published entries
     * @param {Function[]} [options.sinks]         extra receivers
     * @param {Function} [options.onInvalid]       (errors, envelope) => void
     * @param {string}  [options.assetClass]       default "crypto"
     * @param {Function} [options.now]             clock (tests inject a fake)
     * @param {object}  [options.publishThrottleMs] { eventType: ms } overrides
     * @param {object}  [options.deltaFlow]        module options
     * @param {object}  [options.liquidations]     module options
     * @param {object}  [options.arbitrage]        module options
     * @param {object}  [options.derivatives]      module options
     * @param {object}  [options.liquidity]        module options (six markets)
     * @param {object}  [options.onchain]          module options (on-chain)
     * @param {object}  [options.indicators]       module options (indicators)
     * @param {object}  [options.priceAction]      module options (price action)
     * @param {object}  [options.crossMarket]      module options (cross-market:
     *                                             anchors, benchmarks, leverage)
     */
    constructor({
        bus = null,
        router = null,
        sink = null,
        sinks = [],
        onInvalid = null,
        assetClass = ASSET_CLASS.CRYPTO,
        now = Date.now,
        publishLimit = MAX_PUBLISHED,
        publishThrottleMs = {},
        deltaFlow = {},
        liquidations = {},
        arbitrage = {},
        derivatives = {},
        liquidity = {},
        onchain = {},
        indicators = {},
        priceAction = {},
        crossMarket = {}
    } = {}) {
        this.now = now;
        this.assetClass = assetClass;
        this.router = router || new Router();
        this.bridge = createAnalyticsBridge({ bus, sink, sinks, onInvalid });
        this.publishThrottleMs = publishThrottleMs || {};
        this.publishLimit = Math.max(1, Number(publishLimit) || MAX_PUBLISHED);

        /* One instance per module — the engine never reaches inside them. */
        this.modules = {
            deltaFlow: new DeltaFlow({ now, ...deltaFlow }),
            liquidations: new LiquidationHeatmap({ now, ...liquidations }),
            arbitrage: new CrossExchangeArbitrage({ now, ...arbitrage }),
            derivatives: new DerivativesAnalytics({ now, ...derivatives }),
            /* Sub-phase 2.2: the six-market liquidity view (one engine serves
             * every asset class the envelopes name). */
            liquidity: new LiquidityAnalytics({ now, ...liquidity }),
            /* Sub-phase 2.4: the on-chain and institutional view — a chain, a
             * holder, a stablecoin or a fund, one reading per arrival. */
            onchain: new OnchainAnalytics({ now, ...onchain }),
            /* Sub-phase 2.5: the indicator layer — closed bars in (a venue's
             * own candle, or the bar the six-market ticker carries), one
             * reading per (symbol, timeframe) out. */
            indicators: new IndicatorAnalytics({ now, ...indicators }),
            /* Sub-phase 2.6: the price-action layer — the same closed bars the
             * indicator layer reads, answered as structure instead of as
             * numbers: fair-value gaps, order blocks, liquidity sweeps and
             * market-structure breaks, one reading per (symbol, timeframe). */
            priceAction: new PriceActionAnalytics({ now, ...priceAction }),
            /* Sub-phase 2.7: the cross-market layer — the same closed bars as
             * the two layers above, read two series at a time: a coefficient
             * against the market's macro anchor, the same series against its own
             * benchmark, and the leverage state composed from the derivatives
             * and liquidation readings of the modules already here. */
            crossMarket: new CrossMarketAnalytics({ now, ...crossMarket })
        };

        this.published = [];
        this.lastPublishedAt = new Map();
        this.log = [];
        this.unsubscribers = [];
        this.counters = {
            ingested: 0,
            unrouted: 0,
            skipped: 0,
            errors: 0,
            invalid: 0,
            published: 0,
            throttled: 0
        };
    }
    /* ------------------------------------------------------------
     * Ingestion
     * ---------------------------------------------------------- */

    /**
     * Feed one collector envelope through the router.
     * @param {object} envelope
     * @param {{force?:boolean}} [options] force = ignore publication throttles
     * @returns {object|null} { envelope, ingested, skipped, errors, published }
     */
    ingest(envelope, { force = false } = {}) {
        if (!isEnvelope(envelope)) {
            this.counters.invalid += 1;
            this.record("invalid", "not an envelope");
            return null;
        }

        this.counters.ingested += 1;
        const result = this.router.dispatch({ envelope, modules: this.modules, now: this.now });

        if (result.unrouted) {
            this.counters.unrouted += 1;
            this.record("unrouted", `eventType "${envelope.meta.eventType}" has no route`);
        }
        for (const entry of result.skipped) {
            this.counters.skipped += 1;
            this.record("skipped", `${entry.routeId}: ${entry.reason}`);
        }
        for (const entry of result.errors) {
            this.counters.errors += 1;
            this.record("error", `${entry.routeId}: ${entry.message}`);
        }

        const publications = result.ingested.flatMap((item) => item.publications);
        const published = this.publish(publications, { force, source: envelope });

        return { envelope, ingested: result.ingested, skipped: result.skipped, errors: result.errors, published };
    }

    /** realtime market packet (market-packet.cjs) → envelope → modules. */
    ingestPacket(packet, options = {}) {
        const envelope = fromMarketPacket(packet, {
            sourceType: options.sourceType || SOURCE_TYPE.REALTIME,
            assetClass: this.assetClass
        });
        return envelope ? this.ingest(envelope, options) : null;
    }

    /**
     * event-bus entry → envelope → modules. Three shapes are understood:
     *   - a bare envelope
     *   - an analytics entry produced by core/egress.cjs
     *   - a bus entry ({channel,event,market,exchange,symbol,at,payload})
     */
    ingestBusEntry(entry, options = {}) {
        if (!entry || typeof entry !== "object") return null;

        const nested = entry.envelope || (entry.payload && entry.payload.envelope) || null;
        if (isEnvelope(entry)) return this.ingest(entry, options);
        if (isEnvelope(nested)) return this.ingest(nested, options);

        const envelope = fromBusEntry(entry, {
            sourceType: options.sourceType || SOURCE_TYPE.REALTIME,
            assetClass: this.assetClass
        });
        return envelope ? this.ingest(envelope, options) : null;
    }

    /**
     * Subscribe every bus tap into the engine. Analytics envelopes are
     * ignored, so the engine can publish onto a bus it also listens to
     * without feeding its own output back in.
     */
    attach(bus) {
        if (!bus || typeof bus.subscribe !== "function") return () => {};

        const unsubscribe = bus.subscribe((entry) => {
            const nested = entry && (entry.envelope || (entry.payload && entry.payload.envelope));
            if (nested && nested.meta && nested.meta.sourceType === SOURCE_TYPE.ANALYTICS) return;
            try {
                this.ingestBusEntry(entry);
            } catch (err) {
                this.counters.errors += 1;
                this.record("attach", err.message);
            }
        });

        this.unsubscribers.push(unsubscribe);
        return unsubscribe;
    }

    detach() {
        for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    }
    /* ------------------------------------------------------------
     * Publication (the only egress path of the engine)
     * ---------------------------------------------------------- */

    /** Throttle override for an event type, or the route default. */
    throttleFor(publication) {
        const override = this.publishThrottleMs[publication.eventType];
        return typeof override === "number" ? override : publication.throttleMs;
    }

    /**
     * Wrap readings in analytics envelopes, throttle them and hand them
     * to the bridge (bus + sinks).
     */
    publish(publications = [], { force = false, source = null } = {}) {
        const entries = [];

        for (const publication of publications) {
            const at = this.now();
            const throttleMs = this.throttleFor(publication);
            const key = `${publication.eventType}|${publication.throttleKey}`;
            const last = this.lastPublishedAt.get(key);

            if (!force && throttleMs > 0 && last !== undefined && at - last < throttleMs) {
                this.counters.throttled += 1;
                continue;
            }
            this.lastPublishedAt.set(key, at);

            const envelope = analyticsEnvelope({
                eventType: publication.eventType,
                data: publication.data,
                symbol: publication.symbol,
                /* A reading keeps the asset class of the event it came from
                 * (forex stays forex); an engine-level default is the fallback. */
                assetClass: publication.assetClass || this.assetClass,
                exchange: publication.exchange || null,
                marketType: publication.marketType || null,
                timestamp: publication.timestamp === null || publication.timestamp === undefined
                    ? at
                    : publication.timestamp,
                receiveTimestamp: at,
                provenance: {
                    stage: "analytics-engine",
                    sourceType: source && source.meta ? source.meta.sourceType : null,
                    sourceEvent: source && source.meta ? source.meta.eventType : null,
                    eventType: publication.eventType,
                    /* The topic asset, when the reading's symbol is an id
                     * rather than a pair (see core/egress.cjs topicForEnvelope). */
                    topicAsset: publication.topicAsset || null
                }
            });

            const entry = this.bridge(envelope);
            if (!entry) {
                this.counters.invalid += 1;
                this.record("egress", `rejected analytics envelope for "${publication.eventType}"`);
                continue;
            }

            this.counters.published += 1;
            this.pushPublished(entry);
            entries.push(entry);
        }

        return entries;
    }

    /**
     * Publish a reading no incoming event produced (e.g. the combined
     * flow pressure). Always goes out (throttleMs 0) unless overridden.
     */
    emit({ eventType, symbol = null, data, exchange = null, marketType = null, assetClass = null, timestamp = null }) {
        if (!data) return [];

        const canonical = canonicalSymbol(symbol);

        return this.publish([{
            eventType,
            data,
            symbol: canonical,
            exchange,
            marketType,
            assetClass,
            timestamp,
            throttleMs: this.publishThrottleMs[eventType] === undefined ? 0 : this.publishThrottleMs[eventType],
            throttleKey: `${exchange || "aggregate"}:${canonical}`
        }]);
    }

    pushPublished(entry) {
        this.published.push({
            topic: entry.topic,
            channel: entry.channel || null,
            event: entry.event,
            symbol: entry.symbol,
            at: this.now(),
            entry
        });
        while (this.published.length > this.publishLimit) this.published.shift();
        return entry;
    }

    /** Published entries, newest last (optional topic filter). */
    publications({ topic = null, limit = 20 } = {}) {
        const filtered = topic === null
            ? this.published
            : this.published.filter((item) => item.topic === topic);
        return filtered.slice(-Math.max(1, Number(limit) || 1));
    }

    record(kind, message) {
        this.log.push({ kind, message, at: this.now() });
        while (this.log.length > MAX_LOG) this.log.shift();
        return this.log[this.log.length - 1];
    }
    /* ------------------------------------------------------------
     * Reads
     * ---------------------------------------------------------- */

    /** Everything the engine knows about one symbol, in one object. */
    snapshot({ symbol, exchange = null, top = 10, includeBins = true } = {}) {
        const upper = canonicalSymbol(symbol);
        if (!upper) return null;

        return {
            symbol: upper,
            asset: baseAssetOf(upper),
            exchange: exchange || null,
            flow: this.modules.deltaFlow.snapshot({ symbol: upper }),
            pressure: this.modules.deltaFlow.pressure({ symbol: upper, exchange }),
            heatmap: this.modules.liquidations.snapshot({ symbol: upper, top, includeBins }),
            arbitrage: this.modules.arbitrage.snapshot(upper),
            derivatives: this.modules.derivatives.snapshot(upper),
            liquidity: this.modules.liquidity.snapshot(upper),
            onchain: this.modules.onchain.snapshot(upper),
            indicators: this.modules.indicators.snapshot(upper),
            priceAction: this.modules.priceAction.snapshot(upper),
            crossMarket: this.modules.crossMarket.snapshot(upper),
            timestamp: this.now()
        };
    }

    routes() {
        return this.router.eventTypes;
    }

    reset({ symbol = null } = {}) {
        this.lastPublishedAt.clear();
        this.published = [];
        this.log = [];

        return {
            deltaFlow: this.modules.deltaFlow.reset({ symbol }),
            liquidations: this.modules.liquidations.reset({ symbol }),
            arbitrage: this.modules.arbitrage.reset({ symbol }),
            derivatives: this.modules.derivatives.reset({ symbol }),
            liquidity: this.modules.liquidity.reset({ symbol }),
            onchain: this.modules.onchain.reset({ symbol }),
            indicators: this.modules.indicators.reset({ symbol }),
            priceAction: this.modules.priceAction.reset({ symbol }),
            crossMarket: this.modules.crossMarket.reset({ symbol })
        };
    }

    stats() {
        return {
            ...this.counters,
            routes: this.router.eventTypes.length,
            modules: Object.keys(this.modules),
            publishedBuffer: this.published.length,
            throttleKeys: this.lastPublishedAt.size,
            subscribers: this.unsubscribers.length,
            recent: this.log.slice(-10)
        };
    }
    /* __APPEND__ */
}

module.exports = { AnalyticsEngine, createEngine };

function createEngine(options = {}) {
    return new AnalyticsEngine(options);
}

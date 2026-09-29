/* ============================================================
 * File: collector/crypto/derivatives/index.cjs
 * Section: collector/crypto/derivatives
 * Version: 1.0.0
 *
 * Role:
 *   The derivatives collector: it wires the config, the venue adapters,
 *   the REST client and the pollers into one object that produces
 *   standardised envelopes.
 *
 *   Data flow
 *     REST poller (per venue × symbol × type)
 *         → adapter.requests(symbol)      (URL)
 *         → core/http.fetchJson           (timeout + retry + backoff)
 *         → adapter.parse.<type>(body)    (raw venue fields → canonical input)
 *         → core/canonical.<type>Sample   (numeric contract: number|null)
 *         → createEnvelope(sourceType: "derivatives")
 *         → emit()                        (subscriber / bus bridge)
 *
 *   Failure isolation: one venue being down never stops the others. A
 *   failed fetch records the error on that venue's state + calls
 *   onCritical, and the poller simply schedules the next attempt.
 *
 *   Inventory (state) is kept per (exchange × symbol) so the analytics
 *   layer can ask a single object for "the latest OI on binance/BTCUSDT"
 *   instead of re-reading five venues.
 * ============================================================ */

const CONFIG = require("./config/derivatives.cjs");
const { fetchJson } = require("./core/http.cjs");
const { Poller } = require("./core/poller.cjs");
const { LiquidationStream } = require("./streams/liquidation-stream.cjs");
const { resolveVenues, getAdapter } = require("./venues/index.cjs");
const { createBusBridge } = require("./core/bus-bridge.cjs");
const canonical = require("./core/canonical.cjs");
const { createEnvelope, ASSET_CLASS, SOURCE_TYPE, MARKET_TYPE } = require("../common/envelope.cjs");

/* Canonical event names — identical to the analytics topic segments. */
const EVENT = Object.freeze({
    OPEN_INTEREST: "open_interest",
    FUNDING: "funding",
    LONG_SHORT_RATIO: "long_short_ratio",
    LIQUIDATION: "liquidation"
});

/* Poller task name → canonical event name (+ the canonical builder). */
const TASKS = Object.freeze({
    openInterest: { event: EVENT.OPEN_INTEREST, build: canonical.openInterestSample },
    funding: { event: EVENT.FUNDING, build: canonical.fundingSample },
    longShortRatio: { event: EVENT.LONG_SHORT_RATIO, build: canonical.longShortRatioSample },
    liquidation: { event: EVENT.LIQUIDATION, build: canonical.liquidationSample }
});

const INTERVAL_KEY = {
    openInterest: "openInterestMs",
    funding: "fundingMs",
    longShortRatio: "longShortRatioMs"
};

class DerivativesCollector {
    constructor({
        symbols = CONFIG.symbols,
        venues = CONFIG.venues,
        config = CONFIG,
        emit = null,
        onCritical = null,
        bus = null,
        sinks = null,
        adapters = null,
        fetchImpl = undefined,
        WebSocketImpl = null,
        timer = setTimeout,
        clear = clearTimeout,
        now = Date.now,
        random = Math.random,
        stream = null
    } = {}) {
        this.config = config;
        this.symbols = (symbols && symbols.length ? symbols : CONFIG.symbols).map((s) => String(s).toUpperCase());
        this.adapters = adapters || resolveVenues(venues && venues.length ? venues : CONFIG.venues);
        this.emit = emit || (() => {});
        this.onCritical = onCritical || (() => {});
        this.now = now;
        this.timer = timer;
        this.clear = clear;
        this.random = random;
        this.fetchImpl = fetchImpl;
        this.WebSocketImpl = WebSocketImpl;
        this.streamEnabled = stream === null ? !!this.config.stream.enabled : !!stream;

        /* Optional egress: bus bridge (Event Bus) + arbitrary sinks. */
        this.sinks = Array.isArray(sinks) ? sinks.slice() : [];
        this.bridge = bus ? createBusBridge({ bus, sink: (entry) => this.sinks.forEach((fn) => safe(fn, entry)) }) : null;

        this.states = new Map();   // "exchange:symbol" → state
        this.pollers = [];
        this.streams = [];
        this.health = new Map();   // "exchange:symbol" → { markPrice, indexPrice, lastSampleAt, errors }
        this.started = false;
    }
    /* ------------------------------------------------------------
     * Adapters & state
     * ---------------------------------------------------------- */
    key(exchange, symbol) {
        return `${exchange}:${symbol}`;
    }

    adapterFor(name) {
        if (name && typeof name === "object") return name;
        return this.adapters.find((adapter) => adapter.name === String(name).toLowerCase()) || null;
    }

    httpOptions() {
        return {
            fetchImpl: this.fetchImpl,
            timeoutMs: this.config.poll.timeoutMs,
            retries: this.config.poll.retries,
            backoffMs: this.config.poll.backoffMs,
            now: this.now,
            timer: this.timer
        };
    }

    ensureState(exchange, symbol) {
        const id = this.key(exchange, symbol);
        let state = this.states.get(id);
        if (!state) {
            const adapter = this.adapterFor(exchange);
            state = {
                exchange,
                symbol,
                venueSymbol: adapter ? adapter.symbolFor(symbol) : null,
                openInterest: null,
                funding: null,
                longShortRatio: null,
                liquidation: null,
                markPrice: null,
                indexPrice: null,
                updatedAt: {},
                samples: 0,
                errors: {},
                lastError: null
            };
            this.states.set(id, state);
            this.health.set(id, { lastSampleAt: null, errors: 0, lastError: null });
        }
        return state;
    }

    /* REST data types a venue actually serves for this symbol. */
    supportedTypes(adapter) {
        const requests = adapter.requests(this.symbols[0], { period: this.config.poll.period }) || {};
        return Object.keys(requests).filter((type) => requests[type] && TASKS[type]);
    }
    /* ------------------------------------------------------------
     * Fetch → parse → canonicalise
     * ---------------------------------------------------------- */

    /**
     * One (venue × symbol × type) round-trip.
     * @returns {Promise<object|null>} canonical sample, or null when the
     *   venue does not serve this type / returned an unusable body.
     * @throws  {HttpError|Error} on transport or venue-side rejection.
     */
    async loadType(adapter, type, symbol, state) {
        const requests = adapter.requests(symbol, { period: this.config.poll.period }) || {};
        const request = requests[type];
        const parse = adapter.parse && adapter.parse[type];
        if (!request || !request.url || typeof parse !== "function") return null;

        const ctx = {
            exchange: adapter.name,
            symbol,
            venueSymbol: adapter.symbolFor(symbol),
            period: this.config.poll.period,
            markPrice: state.markPrice,
            indexPrice: state.indexPrice
        };

        const response = await fetchJson(request.url, this.httpOptions());
        const raw = parse(response.data, ctx);
        if (!raw) return null;

        /* Some venues split one logical sample over two endpoints
         * (bitget: ticker + funding-time). `parse.<type>Time` merges in. */
        const merge = adapter.parse && adapter.parse[`${type}Time`];
        const mergeRequest = requests[`${type}Time`];
        if (typeof merge === "function" && mergeRequest && mergeRequest.url) {
            const extra = await fetchJson(mergeRequest.url, this.httpOptions());
            Object.assign(raw, merge(extra.data, ctx) || {});
        }

        return TASKS[type].build(raw, ctx);
    }

    /** Refresh one venue × symbol (all supported types, or a subset). */
    async refresh(exchange, symbol, types = null) {
        const adapter = this.adapterFor(exchange);
        if (!adapter) return {};

        const state = this.ensureState(adapter.name, symbol);
        const wanted = types && types.length ? types : this.supportedTypes(adapter);
        const samples = {};

        for (const type of wanted) {
            try {
                const sample = await this.loadType(adapter, type, symbol, state);
                if (!sample) continue;
                this.accept(adapter, type, state, sample);
                samples[type] = sample;
            } catch (err) {
                this.recordError(adapter, type, state, err);
            }
        }

        return samples;
    }

    /** Store a fresh sample, refresh derived context and publish it. */
    accept(adapter, type, state, sample) {
        const at = this.now();
        state[type] = sample;
        state.samples += 1;
        state.updatedAt[type] = at;
        state.errors[type] = null;

        /* Funding carries the mark/index price that turns OI into USD. */
        if (sample.markPrice !== null) state.markPrice = sample.markPrice;
        if (sample.indexPrice !== null) state.indexPrice = sample.indexPrice;

        const health = this.health.get(this.key(adapter.name, state.symbol));
        health.lastSampleAt = at;
        health.lastError = null;

        this.publish(adapter, type, state, sample, at);
        return sample;
    }
    publish(adapter, type, state, sample, at) {
        const envelope = createEnvelope({
            assetClass: ASSET_CLASS.CRYPTO,
            sourceType: SOURCE_TYPE.DERIVATIVES,
            marketType: MARKET_TYPE.FUTURES,
            exchange: adapter.name,
            symbol: state.symbol,
            eventType: TASKS[type].event,
            data: sample,
            timestamp: sample.timestamp,
            receiveTimestamp: at,
            provenance: {
                origin: "derivatives-collector",
                venueSymbol: state.venueSymbol,
                dataType: type,
                source: "rest"
            }
        });

        if (this.bridge) this.bridge(envelope);
        safe(this.emit, envelope);
        return envelope;
    }

    recordError(adapter, type, state, err) {
        const at = this.now();
        const message = err && err.message ? err.message : String(err);
        const entry = { message, at, status: err && err.status !== undefined ? err.status : null };

        state.errors[type] = entry;
        state.lastError = message;

        const health = this.health.get(this.key(adapter.name, state.symbol));
        health.errors += 1;
        health.lastError = message;

        this.onCritical({
            type: "DERIVATIVES_FETCH_ERROR",
            exchange: adapter.name,
            symbol: state.symbol,
            dataType: type,
            status: entry.status,
            message,
            timestamp: at
        });

        return entry;
    }

    /* ------------------------------------------------------------
     * Liquidation stream (best effort: only venues with a public feed)
     * ---------------------------------------------------------- */

    /** A venue push → canonical liquidation sample → envelope. */
    acceptLiquidation(adapter, symbol, raw, message) {
        if (!raw) return null;

        const state = this.ensureState(adapter.name, symbol);
        const scaled = raw.contractValue && Number(raw.contractValue) !== 1
            ? { ...raw, qty: safeMultiply(raw.qty, raw.contractValue) }
            : raw;

        const sample = canonical.liquidationSample(
            { ...scaled, side: scaled.liquidatedSide, orderSide: undefined },
            { exchange: adapter.name, symbol, venueSymbol: state.venueSymbol }
        );

        /* An unusable push (price/size 0, unknown side) is dropped. */
        if (sample.price === null || sample.qty === null || sample.side === null) return null;

        sample.orderSide = scaled.orderSide || null;
        state.liquidation = sample;
        state.updatedAt.liquidation = this.now();

        const envelope = createEnvelope({
            assetClass: ASSET_CLASS.CRYPTO,
            sourceType: SOURCE_TYPE.DERIVATIVES,
            marketType: MARKET_TYPE.FUTURES,
            exchange: adapter.name,
            symbol,
            eventType: EVENT.LIQUIDATION,
            data: { ...sample, streamTimestamp: message && (message.ts || message.E) ? message.ts || message.E : null },
            timestamp: sample.timestamp,
            receiveTimestamp: this.now(),
            provenance: {
                origin: "derivatives-collector",
                venueSymbol: state.venueSymbol,
                dataType: "liquidation",
                source: "stream"
            }
        });

        if (this.bridge) this.bridge(envelope);
        safe(this.emit, envelope);
        return sample;
    }
    /* ------------------------------------------------------------
     * Lifecycle
     * ---------------------------------------------------------- */

    buildPollers() {
        const pollers = [];

        for (const adapter of this.adapters) {
            for (const symbol of this.symbols) {
                for (const type of this.supportedTypes(adapter)) {
                    const intervalKey = INTERVAL_KEY[type];
                    const intervalMs = this.config.poll[intervalKey] || this.config.poll.openInterestMs;

                    pollers.push(new Poller({
                        name: `${adapter.name}:${symbol}:${type}`,
                        intervalMs,
                        jitterMs: this.config.poll.jitterMs,
                        timer: this.timer,
                        clear: this.clear,
                        now: this.now,
                        random: this.random,
                        task: () => this.refresh(adapter, symbol, [type]),
                        onError: (err) => this.recordError(adapter, type, this.ensureState(adapter.name, symbol), err)
                    }));
                }
            }
        }

        return pollers;
    }

    buildStreams() {
        const streams = [];
        if (!this.streamEnabled) return streams;

        for (const adapter of this.adapters) {
            if (!adapter.liquidation || !adapter.capabilities.liquidations) continue;

            for (const symbol of this.symbols) {
                streams.push(new LiquidationStream({
                    exchange: adapter.name,
                    symbol,
                    adapter,
                    emit: (raw, message) => this.acceptLiquidation(adapter, symbol, raw, message),
                    onCritical: this.onCritical,
                    WebSocketImpl: this.WebSocketImpl,
                    reconnectMs: this.config.stream.reconnectMs,
                    maxReconnectMs: this.config.stream.maxReconnectMs,
                    maxReconnects: this.config.stream.maxReconnects,
                    timer: this.timer,
                    clear: this.clear,
                    now: this.now
                }));
            }
        }

        return streams;
    }

    start({ streams = null } = {}) {
        if (this.started) return this;
        this.started = true;

        this.pollers = this.buildPollers();
        for (const poller of this.pollers) poller.start();

        const useStreams = streams === null ? this.streamEnabled : !!streams;
        this.streams = useStreams ? this.buildStreams() : [];
        for (const stream of this.streams) stream.start();

        return this;
    }

    stop() {
        this.started = false;
        for (const poller of this.pollers) poller.stop();
        for (const stream of this.streams) stream.stop();
        this.pollers = [];
        this.streams = [];
        return this;
    }

    /** One sweep over every venue × symbol — used by the CLI and tests. */
    async pollOnce({ types = null, symbols = this.symbols } = {}) {
        const results = {};
        for (const adapter of this.adapters) {
            for (const symbol of symbols) {
                const samples = await this.refresh(adapter, symbol, types);
                results[this.key(adapter.name, symbol)] = samples;
            }
        }
        return results;
    }
    /* ------------------------------------------------------------
     * Reads
     * ---------------------------------------------------------- */
    stateFor(exchange, symbol) {
        const adapter = this.adapterFor(exchange);
        const name = adapter ? adapter.name : exchange;
        const state = this.states.get(this.key(name, symbol));
        return state || null;
    }

    /** Latest sample of one type: latest("binance", "BTCUSDT", "funding"). */
    latest(exchange, symbol, type) {
        const state = this.stateFor(exchange, symbol);
        return state ? state[type] : null;
    }

    /** Everything known about every (venue × symbol) pair. */
    snapshot() {
        const out = {};
        for (const [id, state] of this.states) {
            out[id] = {
                exchange: state.exchange,
                symbol: state.symbol,
                venueSymbol: state.venueSymbol,
                samples: state.samples,
                updatedAt: { ...state.updatedAt },
                errors: { ...state.errors },
                openInterest: state.openInterest,
                funding: state.funding,
                longShortRatio: state.longShortRatio,
                liquidation: state.liquidation
            };
        }
        return out;
    }

    /**
     * Per-(venue × symbol) freshness: "ok" | "stale" | "unavailable".
     *   ok          → at least one sample, recent enough
     *   stale       → produced samples, then went quiet
     *   unavailable → never produced anything (venue down / unsupported)
     * A missing venue capability is reported through `missing`, never
     * silently rendered as "no data".
     */
    healthReport({ at = this.now() } = {}) {
        const staleMs = this.config.health.staleMs;
        const report = { at, staleMs, venues: {}, pairs: {} };

        for (const adapter of this.adapters) {
            report.venues[adapter.name] = {
                capabilities: { ...adapter.capabilities },
                rest: this.supportedTypes(adapter),
                pairs: 0,
                errors: 0,
                lastError: null
            };
        }

        for (const [id, state] of this.states) {
            const health = this.health.get(id) || { lastSampleAt: null, errors: 0, lastError: null };
            const ageMs = health.lastSampleAt === null ? null : Math.max(0, at - health.lastSampleAt);
            const status = health.lastSampleAt === null ? "unavailable" : (ageMs > staleMs ? "stale" : "ok");

            report.pairs[id] = {
                exchange: state.exchange,
                symbol: state.symbol,
                venueSymbol: state.venueSymbol,
                status,
                ageMs,
                samples: state.samples,
                errors: health.errors,
                lastError: health.lastError,
                missing: Object.keys(TASKS).filter((type) => !state[type])
            };

            const venue = report.venues[state.exchange];
            if (venue) {
                venue.pairs += 1;
                venue.errors += health.errors;
                if (health.lastError) venue.lastError = health.lastError;
            }
        }

        return report;
    }

    /** Poller + stream snapshots, for the CLI `--status` output. */
    stats() {
        return {
            started: this.started,
            venues: this.adapters.map((adapter) => adapter.name),
            symbols: [...this.symbols],
            pairs: this.states.size,
            pollers: this.pollers.map((poller) => poller.snapshot()),
            streams: this.streams.map((stream) => stream.snapshot())
        };
    }
}

/* ------------------------------------------------------------
 * Module helpers
 * ---------------------------------------------------------- */
function safe(fn, ...args) {
    if (typeof fn !== "function") return null;
    try {
        return fn(...args);
    } catch (err) {
        /* A broken subscriber must never break the collector. */
        return null;
    }
}

function safeMultiply(value, factor) {
    const a = canonical.finite(value);
    const b = canonical.finite(factor);
    return a === null || b === null ? null : a * b;
}

/** Factory used by run.cjs and the tests. */
function createCollector(options = {}) {
    return new DerivativesCollector(options);
}

module.exports = {
    DerivativesCollector,
    createCollector,
    EVENT,
    TASKS,
    INTERVAL_KEY,
    safeMultiply
};

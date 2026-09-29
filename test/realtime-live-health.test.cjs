/* ============================================================
 * File: test/realtime-live-health.test.cjs
 * Section: test   (LIVE — opens real websockets, needs network)
 *
 * Role:
 *   Per-(exchange, market) health + data-correctness check of the
 *   standalone Realtime section, driven only through its public API:
 *
 *       const realtime = require("../collector/crypto/realtime/index.cjs");
 *       await realtime.request(SYMBOL, { markets: [market], exchanges: [exchange] });
 *
 *   It collects real traffic for a bounded window and asserts, in order:
 *
 *     [1] plan      the planned streams equal the registered streams
 *     [2] streams   every planned stream reaches status "running"
 *     [3] packets   packets pass collector/crypto/common/market-data-quality.cjs
 *     [4] channels  the flow events / health markers of that market arrive
 *     [5] data      payload numbers are sane (validators below)
 *     [6] pipeline  L2 modules ran, none failed, emits reached the bus
 *     [7] state     aggregation + indicators + charts are populated
 *                   (README.txt section 3.6 checklist, rows 2..8)
 *     [8] errors    nothing failed in the log during the window   (row 9)
 *     [9] release   release(symbol) empties the connection registry
 *
 *   Usage:
 *     REALTIME_LIVE_HEALTH=1 node test/realtime-live-health.test.cjs \
 *         --exchange binance --market spot [--symbol BTCUSDT] [--seconds 20]
 *
 *     --exchange  venue, comma list, or "all"   (default binance)
 *     --market    spot | futures | both         (default spot)
 *     --symbol    pair to watch                 (default BTCUSDT)
 *     --seconds   collection window             (default 25, 5..300)
 *     --min-packets minimum acceptable packets  (default 10)
 *     --verbose   print a tick line every second
 *
 *     bash test/run-realtime-live-health.sh      # all 10 pairs, one by one
 *
 *   Without REALTIME_LIVE_HEALTH=1 (and without --exchange) the file prints a
 *   skip line and exits 0, exactly like the other live tests in test/.
 *
 * Exit codes: 0 PASS / SKIP, 1 FAIL, 2 bad usage, 4 harness timeout.
 * ============================================================ */

const assert = require("node:assert/strict");
const { depthSourceSummary } = require("../collector/crypto/common/depth-source.cjs");

/* ------------------------------------------------------------
 * 1. CLI
 * ---------------------------------------------------------- */
const DEFAULTS = Object.freeze({
    exchange: "binance",
    market: "spot",
    symbol: "BTCUSDT",
    seconds: 25,
    minPackets: 10,
    verbose: false
});

function parseArgs(argv) {
    const args = { ...DEFAULTS };
    const valued = new Set(["exchange", "market", "symbol", "seconds", "min-packets"]);

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("--")) continue;

        const [flag, inline] = token.slice(2).split("=");
        const hasValue = inline !== undefined;
        const value = hasValue ? inline : argv[index + 1];
        if (valued.has(flag) && !hasValue) index += 1;

        switch (flag) {
            case "exchange": args.exchange = String(value || "").toLowerCase(); break;
            case "market": args.market = String(value || "").toLowerCase(); break;
            case "symbol": args.symbol = String(value || "").toUpperCase(); break;
            case "seconds": args.seconds = Number(value); break;
            case "min-packets": args.minPackets = Number(value); break;
            case "verbose": args.verbose = true; break;
            default: break;
        }
    }

    args.seconds = Math.min(300, Math.max(5, Number(args.seconds) || DEFAULTS.seconds));
    args.minPackets = Math.max(1, Number(args.minPackets) || DEFAULTS.minPackets);
    assert.ok(["spot", "futures", "both"].includes(args.market), `--market must be spot|futures|both (got "${args.market}")`);
    assert.ok(args.exchange, "--exchange is required (a venue name, a comma list, or \"all\")");

    return args;
}

/* ------------------------------------------------------------
 * 2. Report
 *   Findings are grouped by (level, id) so a packet flood cannot
 *   drown the report: each group keeps a count + up to 3 samples.
 * ---------------------------------------------------------- */
function createReporter() {
    const groups = new Map();

    /** (detail, optional evidence) → one printable sample string. */
    function combine(detail, evidence) {
        if (evidence === undefined || evidence === null) return detail === undefined ? null : stringify(detail);
        const head = typeof detail === "string" ? detail : stringify(detail);
        return `${head} — ${stringify(evidence)}`;
    }

    function record(level, id, ok, detail) {
        const key = `${level}:${id}`;
        const group = groups.get(key) || { level, id, ok: true, count: 0, samples: [] };
        group.ok = group.ok && !!ok;
        group.count += 1;
        if (!ok && group.samples.length < 3) group.samples.push(detail === undefined ? null : detail);
        groups.set(key, group);
        return !!ok;
    }

    return {
        groups,
        pass: (id, detail) => record("CHECK", id, true, detail),
        expect: (id, condition, detail, evidence) => record("FAIL", id, !!condition, combine(detail, evidence)),
        fail: (id, detail, evidence) => record("FAIL", id, false, combine(detail, evidence)),
        warn: (id, detail, evidence) => record("WARN", id, false, combine(detail, evidence)),
        soft: (id, condition, detail, evidence) => record("WARN", id, !!condition, combine(detail, evidence)),
        list: () => [...groups.values()],
        failures: () => [...groups.values()].filter((group) => group.level === "FAIL" && !group.ok),
        warnings: () => [...groups.values()].filter((group) => group.level === "WARN" && !group.ok)
    };
}

function out(message) {
    process.stdout.write(`${message}\n`);
}

function step(tag, message) {
    out(`[LIVE-HEALTH] ${String(tag).padEnd(9)} ${message}`);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------
 * 3. Payload helpers
 * ---------------------------------------------------------- */
const POSITIVE_FIELDS = ["price", "markPrice", "lastPrice", "indexPrice", "open", "high", "low", "close", "bestBid", "bestAsk", "vwap", "bid", "ask"];
const NON_NEGATIVE_FIELDS = ["qty", "tradeQty", "volume", "size", "bidSum", "askSum", "bidLiquidity", "askLiquidity", "buyVolume", "sellVolume", "oi", "oiBase", "oiUsd", "totalUsd", "tradeCount"];

/** A side needs this many levels before it can be judged as a real book. */
const MIN_BOOK_LEVELS = 5;

/** Accepts both spot tuples ([price, qty]) and futures objects ({price, qty}). */
function selectLevels(levels) {
    if (Array.isArray(levels)) {
        return levels.map((level) => {
            if (Array.isArray(level)) return { price: Number(level[0]), qty: Number(level[1]) };
            if (level && typeof level === "object") return { price: Number(level.price), qty: Number(level.qty) };
            return null;
        }).filter(Boolean);
    }

    if (levels && typeof levels === "object") {
        return Object.entries(levels).map(([price, qty]) => ({ price: Number(price), qty: Number(qty) }));
    }

    return [];
}

function levelCount(levels) {
    if (Array.isArray(levels)) return levels.length;
    if (levels && typeof levels === "object") return Object.keys(levels).length;
    return -1;
}

function isPlainNumber(value) {
    return typeof value === "number" || (typeof value === "string" && value !== "");
}

function collectNumbers(value, path, sink, depth = 0) {
    if (value === null || value === undefined) return;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) sink.fail("numbers.finite", `${path} is a non-finite number`, { path, value: String(value) });
        return;
    }
    if (typeof value === "string" || typeof value === "boolean") return;
    if (depth >= 4) return;

    if (Array.isArray(value)) {
        for (let index = 0; index < Math.min(value.length, 40); index += 1) collectNumbers(value[index], `${path}[${index}]`, sink, depth + 1);
        return;
    }

    for (const [key, item] of Object.entries(value)) collectNumbers(item, path ? `${path}.${key}` : key, sink, depth + 1);
}

/* ------------------------------------------------------------
 * 4. Validators
 *   Severity policy:
 *     FAIL — invariants real market data can never break: non-finite or
 *            negative numbers, broken candles, unparseable levels, a crossed
 *            *ordered* book, one payload whose own bestBid > bestAsk.
 *     WARN — legitimate-but-notable: unordered levels or a "cross" inside an
 *            incremental patch (b/a deltas), duplicate packets, a multi-venue
 *            aggregate momentarily crossing, flow events that carry only the
 *            health context, wrong timestamp unit, sockets left after release.
 * ---------------------------------------------------------- */
function validateDepth(payload, type, sink) {
    // canonical-futures-packet.cjs stores `bids: null / asks: null` for packets
    // without an orderbook, and the futures handler merges that health context
    // into EVERY emitted event ⇒ null simply means "this event carries no depth".
    const hasBids = payload.bids !== undefined && payload.bids !== null;
    const hasAsks = payload.asks !== undefined && payload.asks !== null;
    if (!hasBids && !hasAsks) return;

    const rawBids = levelCount(payload.bids);
    const rawAsks = levelCount(payload.asks);

    if (rawBids < 0 || rawAsks < 0) {
        sink.fail("depth.shape", `${type} carried non-array/non-object bids or asks`, {
            type,
            bids: `${typeof payload.bids}:${stringify(payload.bids).slice(0, 120)}`,
            asks: `${typeof payload.asks}:${stringify(payload.asks).slice(0, 80)}`
        });
        return;
    }

    const bids = selectLevels(payload.bids);
    const asks = selectLevels(payload.asks);

    if (rawBids + rawAsks > 0 && bids.length + asks.length === 0) {
        sink.fail("depth.levels", `${type} carried ${rawBids + rawAsks} unparseable depth level(s)`, { type, rawBids, rawAsks });
        return;
    }

    if (!rawBids && !rawAsks) {
        sink.warn("depth.empty", `${type} carried an empty orderbook`, { type });
        return;
    }

    let orderedBook = true;

    for (const [side, levels] of [["bid", bids], ["ask", asks]]) {
        levels.forEach((level, index) => {
            if (!Number.isFinite(level.price) || level.price <= 0) sink.fail("depth.price", `${side} price is not finite and > 0 (index ${index})`, { type, side, index, value: level.price });
            if (!Number.isFinite(level.qty) || level.qty < 0) sink.fail("depth.qty", `${side} qty is not finite and >= 0 (index ${index})`, { type, side, index, value: level.qty });
        });

        for (let index = 1; index < levels.length; index += 1) {
            const previous = levels[index - 1].price;
            const current = levels[index].price;
            const ordered = side === "bid" ? current <= previous : current >= previous;
            if (!ordered) {
                if (orderedBook) {
                    sink.warn("depth.order", `${side} levels are not sorted (${previous} → ${current}) — expected for an incremental patch`, { type, side, index, sideLevels: levels.length });
                }
                orderedBook = false;
                break;
            }
        }
    }

    // A crossed book cannot exist on real data — but only an *ordered, removal
    // free* payload is a book at all. Binance/Bybit/OKX futures also push
    // incremental patches (b/a deltas): unordered, often with qty 0 removals,
    // where a "cross" is just two updates seen in one frame ⇒ WARN.
    const hasRemoval = [...bids, ...asks].some((level) => level.qty === 0);
    const fullBook = bids.length >= MIN_BOOK_LEVELS && asks.length >= MIN_BOOK_LEVELS;
    if (fullBook) {
        const bestBid = Math.max(...bids.map((level) => level.price));
        const bestAsk = Math.min(...asks.map((level) => level.price));
        const evidence = { type, bestBid, bestAsk, bidCount: bids.length, askCount: asks.length, orderedBook, hasRemoval };
        // bestBid === bestAsk is a touched/zero-width book — legal.
        if (bestBid > bestAsk) {
            if (orderedBook && !hasRemoval) {
                sink.fail("depth.crossed", `crossed book: bestBid ${bestBid} > bestAsk ${bestAsk}`, evidence);
            } else {
                sink.warn("depth.crossed.patch", `bestBid ${bestBid} > bestAsk ${bestAsk} inside an unordered/incremental patch`, evidence);
            }
        }
    }
}

function validateCandle(payload, type, sink) {
    const { open, high, low, close } = payload;
    if (![open, high, low, close].every((value) => value !== undefined)) return;

    for (const [field, value] of Object.entries({ open, high, low, close })) {
        if (!Number.isFinite(value) || value <= 0) sink.fail("candle.price", `candle ${field} is not finite and > 0`, { type, field, value });
    }

    if (Number.isFinite(high) && Number.isFinite(low) && high < low) sink.fail("candle.range", `candle high ${high} < low ${low}`, { type });
    if (Number.isFinite(high) && Number.isFinite(open) && Number.isFinite(close) && high < Math.max(open, close)) sink.fail("candle.high", `candle high ${high} < max(open, close)`, { type, open, high, close });
    if (Number.isFinite(low) && Number.isFinite(open) && Number.isFinite(close) && low > Math.min(open, close)) sink.fail("candle.low", `candle low ${low} > min(open, close)`, { type, open, low, close });
    if (payload.volume !== undefined && (!Number.isFinite(payload.volume) || payload.volume < 0)) sink.fail("candle.volume", "candle volume is not finite and >= 0", { type, value: payload.volume });
}

function validateFields(payload, type, sink) {
    for (const field of POSITIVE_FIELDS) {
        const value = payload[field];
        if (!isPlainNumber(value)) continue;
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) sink.fail(`field.${field}`, `${type} ${field} is not finite and > 0`, { field, value });
    }

    for (const field of NON_NEGATIVE_FIELDS) {
        const value = payload[field];
        if (!isPlainNumber(value)) continue;
        if (!Number.isFinite(Number(value)) || Number(value) < 0) sink.fail(`field.${field}`, `${type} ${field} is not finite and >= 0`, { field, value });
    }

    if (Number.isFinite(payload.bestBid) && Number.isFinite(payload.bestAsk) && payload.bestBid > 0 && payload.bestBid > payload.bestAsk) {
        sink.fail("field.spread", `${type} bestBid ${payload.bestBid} > bestAsk ${payload.bestAsk}`, { type });
    }

    if (payload.side !== undefined && payload.side !== null && !["buy", "sell"].includes(String(payload.side).toLowerCase())) {
        sink.warn("field.side", `${type} carries an unexpected side "${payload.side}"`, { type, side: payload.side });
    }
}

/**
 * Spot flow events are published with the health context only — the packet
 * itself goes to the aggregator, so this is a WARN, not a failure.
 */
function validateFlowPayload(payload, type, sink) {
    if (!["price", "trade", "candle", "depth", "unknown"].includes(type)) return;

    const carriesMarketData = Number.isFinite(payload.price)
        || Number.isFinite(payload.open)
        || levelCount(payload.bids) > 0;

    if (!carriesMarketData) {
        sink.warn("flow.payload", `flow event "${type}" carries only the health context (no price/candle/depth payload)`, { type, keys: Object.keys(payload).slice(0, 14) });
    }
}

function validateAggregate(aggregate, sink) {
    if (!aggregate || typeof aggregate !== "object") return;
    if (!aggregate.spot && !aggregate.futures) return;

    for (const market of ["spot", "futures"]) {
        const part = aggregate[market] ? aggregate[market].aggregate : null;
        if (!part) {
            sink.soft(`aggregate.${market}`, false, `symbol aggregate has no ${market} part`);
            continue;
        }

        for (const [key, value] of [
            ["price.median", part.price?.median],
            ["price.weightedMedian", part.price?.weightedMedian],
            ["markPrice.median", part.markPrice?.median],
            ["funding.averageRate", part.funding?.averageRate],
            ["oi.totalUsd", part.oi?.totalUsd]
        ]) {
            if (value === null || value === undefined) continue;
            if (!Number.isFinite(value)) sink.fail(`aggregate.${key}`, `${market} ${key} is not finite`, { value });
        }

        const bestBid = part.depth?.bestBid;
        const bestAsk = part.depth?.bestAsk;
        for (const [key, value] of [["depth.bestBid", bestBid], ["depth.bestAsk", bestAsk]]) {
            if (value === null || value === undefined) continue;
            if (!Number.isFinite(value) || value <= 0) sink.fail(`aggregate.${key}`, `${market} ${key} is not a positive number`, { value });
        }
        if (Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestBid > bestAsk) {
            // bestBid/bestAsk of the aggregate come from asynchronous per-venue
            // sources (books and tickers of five venues, freshest-wins), so a
            // momentary cross is a data-freshness signal, not a hard failure.
            sink.warn("aggregate.spread", `${market} aggregate bestBid ${bestBid} > bestAsk ${bestAsk}`, { market, bestBid, bestAsk, depthKeys: Object.keys(part.depth || {}).slice(0, 8) });
        }

        for (const window of ["1s", "5s", "1m"]) {
            const flow = part.trades ? part.trades[window] : null;
            if (!flow) continue;
            if (flow.imbalance !== null && flow.imbalance !== undefined && (!Number.isFinite(flow.imbalance) || Math.abs(flow.imbalance) > 1)) {
                sink.fail("aggregate.imbalance", `${market} trades[${window}].imbalance is outside [-1, 1]`, { value: flow.imbalance });
            }
            if (flow.tradeCount !== undefined && (!Number.isFinite(flow.tradeCount) || flow.tradeCount < 0)) {
                sink.fail("aggregate.tradeCount", `${market} trades[${window}].tradeCount is invalid`, { value: flow.tradeCount });
            }
        }
    }
}

function validateTimestamp(payload, type, sink, stats) {
    const value = payload.timestamp;
    if (!Number.isFinite(value)) return;

    stats.timestampSeen += 1;
    const skewMs = Date.now() - value;
    if (skewMs > 15 * 60 * 1000 || skewMs < -5 * 60 * 1000) {
        stats.timestampSkew += 1;
        sink.warn("timestamp.unit", `timestamp ${value} is ${Math.round(skewMs / 1000)}s away from now — wrong unit?`, { type, timestamp: value });
    }
}

function validateSequence(payload, key, sink, store) {
    const sequence = payload.sequence;
    if (!sequence || typeof sequence !== "object") return;

    const value = Number(sequence.updateId ?? sequence.seqId ?? sequence.seq ?? sequence.sequenceEnd ?? sequence.sequenceStart);
    if (!Number.isFinite(value)) return;

    const previous = store.get(key);
    if (previous !== undefined && value < previous) sink.warn("sequence.regression", `${key} sequence went backwards (${previous} → ${value})`, { key, value });
    if (previous === undefined || value > previous) store.set(key, value);
}

function validateEntry(entry, sink, stats, sequenceStore) {
    const payload = entry.payload || {};
    const type = String(payload.type || payload.event || entry.event || "");

    validateFlowPayload(payload, type, sink);
    validateDepth(payload, type, sink);
    validateCandle(payload, type, sink);
    validateFields(payload, type, sink);
    validateAggregate(payload.payload || payload, sink);
    validateTimestamp(payload, type, sink, stats);
    validateSequence(payload, `${entry.exchange}:${type}`, sink, sequenceStore);
    collectNumbers(payload, type || "payload", sink);
}

/* ------------------------------------------------------------
 * 5. Log capture
 *   The section writes its logs through core/logger.cjs →
 *   console.*, so capturing console for the window is enough to
 *   count real failures without touching the code under test.
 * ---------------------------------------------------------- */
const capturedLogs = [];
const CAPTURED_LOG_LIMIT = 800;

function stringify(value) {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    try {
        return JSON.stringify(value, (key, item) => (typeof item === "bigint" ? String(item) : item));
    } catch {
        return String(value);
    }
}

function captureConsole() {
    const original = {};
    for (const channel of ["log", "info", "warn", "error", "debug"]) {
        original[channel] = console[channel];
        console[channel] = (...parts) => {
            capturedLogs.push(`[${channel}] ${parts.map(stringify).join(" ")}`);
            while (capturedLogs.length > CAPTURED_LOG_LIMIT) capturedLogs.shift();
        };
    }
    return original;
}

function logProblems() {
    return capturedLogs.filter((line) => /\b(error|failed|critical|eaddrinuse)\b/i.test(line));
}

/* ------------------------------------------------------------
 * 6. Checks driven by the collected traffic
 * ---------------------------------------------------------- */
/**
 * Flow events published by ingest + group health markers from the
 * registrations (futures markers are the only source of the
 * price/depth/candles/funding/mark_price/oi events in that market).
 */
function requiredChannels(markets) {
    const groups = [];

    if (markets.includes("spot")) {
        groups.push(
            ["spot.price-flow", ["price"]],
            ["spot.trade-flow", ["trade"]],
            ["spot.candle-flow", ["candle"]],
            ["spot.depth-flow", ["depth"]]
        );
    }

    groups.push(["market-aggregate-flow", ["market_aggregate"]]);

    if (markets.includes("futures")) {
        groups.push(
            ["futures.price-marker", ["price"]],
            ["futures.depth-marker", ["depth"]],
            ["futures.candles-marker", ["candles"]]
        );
    }

    return groups;
}

/** Channels that depend on an event the venue may simply not have sent yet. */
function optionalChannels(markets) {
    if (!markets.includes("futures")) return [];
    return [
        ["futures.funding-marker", ["funding"]],
        ["futures.mark-price-marker", ["mark_price"]],
        ["futures.oi-marker", ["oi"]],
        ["futures.liquidation-marker", ["liquidation"]]
    ];
}

/**
 * Phase-0 depth gates (fixes #3..#6), evaluated against the bus history the
 * window already produced:
 *
 *   depth.sync.progress     the synchronized chain of the venue kept advancing
 *   depth.sync.resyncs      no snapshot storm (a resync loop shows up here)
 *   depth.single-source     every depth analytics event is tagged with the feed
 *                           that produced it (data.depthSource / depthKind)
 *   depth.single-source.fallback  a native tag may only appear after the
 *                           selector recorded a real fail-over
 *   depth.crossed.published no crossed book ever reaches the bus
 */
function checkDepthSource(realtime, args, reporter, packets) {
    if (!args.markets.includes("futures")) return null;

    const runtime = realtime.core.getRuntime();
    const analytics = ["depth_100", "depth_medium", "depth_full", "depth_delta", "depth_pressure", "depth_imbalance", "depth_aggregated"];
    const provenance = new Map();
    let seen = 0;
    let withoutProvenance = 0;
    let nativeAnalytics = 0;
    let crossed = 0;

    for (const channel of runtime.bus.channels({ symbol: args.symbol })) {
        const event = channel.split(":").pop();
        if (!analytics.includes(event)) continue;

        for (const entry of runtime.bus.historyFor(channel)) {
            seen += 1;
            const payload = entry.payload || {};
            const nested = payload.payload || {};
            const source = payload.depthSource || nested.depthSource || entry.depthSource || null;

            if (!source) {
                withoutProvenance += 1;
                continue;
            }

            const key = `${event}|${source}`;
            provenance.set(key, (provenance.get(key) || 0) + 1);
            if (source === "native") nativeAnalytics += 1;

            const bids = payload.bids || nested.bids;
            const asks = payload.asks || nested.asks;
            if (bids && asks && bids[0] && asks[0] && Number(bids[0].price) >= Number(asks[0].price)) {
                crossed += 1;
                reporter.fail("depth.crossed.published", `${event} published a crossed ${source} book`, {
                    event,
                    source,
                    bestBid: bids[0].price,
                    bestAsk: asks[0].price
                });
            }
        }
    }

    const selector = depthSourceSummary();
    const futuresPairs = (args.pairs || []).filter((pair) => pair.market === "futures").length || 1;
    const snapshots = packets.byType.get("depth_full_snapshot") || 0;
    const diffs = packets.byType.get("depth_full_diff") || 0;

    reporter.expect("depth.sync.progress", diffs > 0, `depth_full_diff packets = ${diffs} (synced decisions = ${selector.stats.syncedBook})`);
    reporter.soft("depth.sync.resyncs", snapshots <= futuresPairs * 2 + 2, `${snapshots} snapshot(s) for ${futuresPairs} futures venue(s) — a storm hints at a resync loop`);
    reporter.expect("depth.single-source", seen > 0 && withoutProvenance === 0, `${seen} depth analytics event(s), ${withoutProvenance} without depthSource`);
    reporter.soft("depth.single-source.fallback", nativeAnalytics === 0 || selector.stats.fallbacks > 0, `${nativeAnalytics} native-tagged analytics with ${selector.stats.fallbacks} recorded fail-over(s)`);
    reporter.soft("depth.selector.books", selector.books > 0, "the depth selector did not track a single book");

    return { seen, withoutProvenance, nativeAnalytics, crossed, provenance: Object.fromEntries(provenance), selector };
}

function checkChannels(realtime, args, reporter) {
    const runtime = realtime.core.getRuntime();
    const channels = runtime.bus.channels({ symbol: args.symbol });
    const events = new Set(channels.map((channel) => channel.split(":").pop()));

    for (const [id, wanted] of requiredChannels(args.markets)) {
        const found = wanted.filter((event) => events.has(event));
        reporter.expect(`channel.${id}`, found.length === wanted.length, `missing ${wanted.filter((event) => !events.has(event)).join(", ")}`);
    }

    for (const [id, wanted] of optionalChannels(args.markets)) {
        const found = wanted.filter((event) => events.has(event));
        reporter.soft(`channel.${id}`, found.length === wanted.length, `${wanted.filter((event) => !events.has(event)).join(", ")} not observed in the window`);
    }

    return channels;
}

/**
 * README.txt section 3.6 checklist, evaluated against the section state
 * (rows 2..8 and 10). Row 5 needs both markets, row 9 is the log check.
 */
function checkState(realtime, args, reporter) {
    const markets = args.markets;
    const state = realtime.getState(args.symbol) || {};
    const aggregation = state.aggregation || {};
    const aggregate = aggregation.aggregate || null;
    const indicators = aggregation.indicators || null;
    const charts = aggregation.charts || null;
    const spot = aggregate && aggregate.spot ? aggregate.spot.aggregate : null;
    const futures = aggregate && aggregate.futures ? aggregate.futures.aggregate : null;

    reporter.expect("state.aggregate", !!aggregate, "marketAggregation.get(symbol) is empty after the window");

    if (markets.includes("spot")) {
        // row 2 — spot median must be a real price, never null/0
        const median = spot ? spot.price.median : null;
        reporter.expect("row2.spot.price.median", Number.isFinite(median) && median > 0, `spot price.median = ${median}`);

        // row 4 — traded volume in the 1m window
        const flow = spot ? spot.trades["1m"] : null;
        reporter.soft("row4.spot.trades-1m", !!flow && flow.tradeCount > 0, `spot trades["1m"].tradeCount = ${flow ? flow.tradeCount : null}`);

        reporter.soft("state.spot.depth", !!spot && Number.isFinite(spot.depth.bestBid) && Number.isFinite(spot.depth.bestAsk), "spot aggregate depth is empty");
    }

    if (markets.includes("futures")) {
        // row 3 — futures book
        reporter.expect(
            "row3.futures.depth",
            !!futures && Number.isFinite(futures.depth.bestBid) && Number.isFinite(futures.depth.bestAsk),
            `futures bestBid/bestAsk = ${futures ? `${futures.depth.bestBid}/${futures.depth.bestAsk}` : "n/a"}`
        );
        reporter.soft("state.futures.price", !!futures && Number.isFinite(futures.price.median), "futures price median is empty");
        reporter.soft("state.futures.oi", !!futures && Number.isFinite(futures.oi.totalUsd), `futures oi.totalUsd = ${futures ? futures.oi.totalUsd : null}`);
    }

    if (markets.length === 2 && aggregate) {
        // row 5 — spot/futures basis (only meaningful with both markets)
        const basis = aggregate.crossMarket ? aggregate.crossMarket.basis : null;
        reporter.expect("row5.crossMarket.basis", Number.isFinite(basis), `crossMarket.basis = ${basis}`);
    }

    // row 6 — technical indicators (need >= 20 samples for sma20)
    const technical = indicators ? indicators.technical : null;
    reporter.soft("row6.indicators", !!technical && Number.isFinite(technical.sma20) && Number.isFinite(technical.ema9), `sma20 = ${technical ? technical.sma20 : null}, ema9 = ${technical ? technical.ema9 : null}`);

    // rows 7 / 8 — chart series
    const price = charts && Array.isArray(charts.price) ? charts.price : [];
    reporter.expect("row7.chart.price", price.length >= 3, `chart price points = ${price.length}`);
    reporter.expect(
        "row8.chart.non-zero",
        price.some((point) => [point.spot, point.futures, point.mark].some((value) => Number.isFinite(value) && value > 0)),
        "no non-zero spot/futures/mark value in the chart price series"
    );
    reporter.soft("row7b.chart.others", !!(charts && charts.liquidity && charts.liquidity.length && charts.volumeFlow && charts.volumeFlow.length), "chart volumeFlow/liquidity series are empty");

    // row 10 — venue state entries (markets × exchanges of this run)
    const venueStates = global.marketVenueState ? global.marketVenueState.values({ symbol: args.symbol }) : [];
    const expectedStates = args.pairs ? args.pairs.length : 0;
    reporter.expect("row10.venue-states", venueStates.length >= expectedStates, `venue states = ${venueStates.length}, expected ${expectedStates}`);

    return { aggregate, indicators, charts, spot, futures, price };
}

/* ------------------------------------------------------------
 * 7. Runner
 *   Live phases: [1] plan [2] streams [3] packets [4] channels
 *   [5] payloads [6] pipeline [7] state [8] logs [9] release.
 * ---------------------------------------------------------- */
let restoreQualityAccept = () => {};

async function runRealtimeLiveHealth(args) {
    args.markets = args.market === "both" ? ["spot", "futures"] : [args.market];
    args.exchanges = args.exchange === "all"
        ? null
        : args.exchange.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);

    const label = `${args.exchanges ? args.exchanges.join("+") : "all"}/${args.markets.join("+")}/${args.symbol}`;
    const reporter = createReporter();
    const stats = { timestampSeen: 0, timestampSkew: 0 };
    const sequenceStore = new Map();
    const healthMarkers = [];
    const packets = { attempts: 0, accepted: 0, rejected: 0, byType: new Map() };
    const sink = {
        fail: (...args) => reporter.fail(...args),
        warn: (...args) => reporter.warn(...args)
    };

    // keep the legacy two-way orchestrator bridge inert
    delete global.orchestrator;
    global.healthEmit = (event) => healthMarkers.push(event);
    global.debugTrace = () => {};

    step("start", `${label} — window ${args.seconds}s, min ${args.minPackets} packet(s)`);
    const startedAt = Date.now();
    const originalConsole = captureConsole();

    const realtime = require("../collector/crypto/realtime/index.cjs");
    const qualityModule = require("../collector/crypto/common/market-data-quality.cjs");
    // the handlers hold this same instance (destructured at load time), so
    // patching the instance method is visible to every ingest path
    const quality = qualityModule.marketDataQuality;

    /* [3] count every packet that goes through the shared quality gate */
    const originalAccept = quality.accept;
    restoreQualityAccept = () => { quality.accept = originalAccept; };
    quality.accept = (packet = {}) => {
        packets.attempts += 1;
        const accepted = originalAccept.call(quality, packet);
        if (accepted) {
            packets.accepted += 1;
            const type = String(packet.type || packet.event || "unknown");
            packets.byType.set(type, (packets.byType.get(type) || 0) + 1);
        } else {
            packets.rejected += 1;
        }
        return accepted;
    };

    /* [1] plan — mirror buildVenuePlan()'s predicates exactly */
    const enabledExchanges = new Set(realtime.getEnabledExchanges(args.symbol));
    const requestedExchanges = args.exchanges || realtime.venues.listVenues();

    args.pairs = requestedExchanges
        .filter((exchange) => enabledExchanges.has(exchange))
        .flatMap((exchange) => args.markets
            .filter((market) => realtime.getEnabledMarkets(exchange, args.symbol)[market] === true)
            .map((market) => ({ exchange, market })));

    const expected = args.pairs.flatMap(({ exchange, market }) =>
        realtime.venues.describeStreams(exchange, market).map((stream) => stream.id)
    );

    reporter.expect("plan.registered", expected.length > 0, `${label} has no registered stream — nothing to test`);
    if (!expected.length) return finish(reporter, { args, label, packets, healthMarkers }, originalConsole);

    const requestOptions = { markets: args.markets };
    if (args.exchanges) requestOptions.exchanges = args.exchanges;

    const socketsBefore = socketCount(activeResources());
    const response = await realtime.request(args.symbol, requestOptions);

    // NOTE: request()/getState() expose `venues` + `streams`, not the raw plan
    // (buildResponse drops it) — the started stream records are the plan:
    // startSymbol() creates exactly one record per planned stream id.
    const planned = (response && Array.isArray(response.streams) ? response.streams : []).map((stream) => stream.id);
    const expectedVenues = args.pairs.map(({ exchange, market }) => `${market}:${exchange}`);

    reporter.expect("request.reused", !!response && response.reused === false, `reused = ${response && response.reused}`);
    reporter.expect(
        "plan.started",
        planned.length === expected.length && expected.every((id) => planned.includes(id)),
        { planned, expected }
    );
    reporter.expect(
        "request.venues",
        !!response &&
            expectedVenues.every((venue) => response.venues.includes(venue)) &&
            response.venues.length === expectedVenues.length,
        { venues: response && response.venues, expectedVenues }
    );

    /* [4][5] every bus entry is validated as it arrives */
    const seen = { entries: 0, byEvent: new Map() };
    const unsubscribe = realtime.subscribe((entry) => {
        seen.entries += 1;
        seen.byEvent.set(entry.event, (seen.byEvent.get(entry.event) || 0) + 1);
        try {
            validateEntry(entry, sink, stats, sequenceStore);
        } catch (err) {
            sink.fail("harness.validator", `${entry.event} validator threw: ${err.message}`);
        }
    });

    /* [2] streams must reach "running" while the window fills up */
    step("wait", `collecting ${args.seconds}s from ${planned.length} stream(s) ...`);
    const deadline = Date.now() + args.seconds * 1000;
    while (Date.now() < deadline) {
        await sleep(1000);
        if (args.verbose) {
            const live = realtime.status();
            step("tick", `packets=${packets.accepted}/${packets.attempts} bus=${live.bus.published} running=${live.connections.running}/${live.connections.streams} failed=${live.pipeline.failed}`);
        }
    }
    unsubscribe();

    const durationMs = Date.now() - startedAt;
    const status = realtime.status();

    /* [2] every planned stream must be running after the window */
    const streamRecords = realtime.getState(args.symbol).streams;
    for (const stream of streamRecords) {
        reporter.expect(`stream.${stream.id}`, stream.status === "running", `${stream.status}${stream.lastError ? ` — ${stream.lastError}` : ""}`);
    }

    /* [3][6] packet + pipeline health */
    reporter.expect("packets.minimum", packets.accepted >= args.minPackets, `accepted ${packets.accepted} of ${packets.attempts} (min ${args.minPackets})`);
    reporter.soft("packets.rejected", packets.rejected === 0, `${packets.rejected} packet(s) rejected by market-data-quality.cjs`);
    reporter.soft("payload.timestamps", stats.timestampSeen > 0 && stats.timestampSkew === 0, `${stats.timestampSkew} of ${stats.timestampSeen} timestamp(s) look like a wrong unit`);
    reporter.expect("pipeline.ran", status.pipeline.executed > 0, `dispatched ${status.pipeline.dispatched}, executed ${status.pipeline.executed}`);
    reporter.expect("pipeline.no-failures", status.pipeline.failed === 0, `failed = ${status.pipeline.failed}`);
    reporter.expect("pipeline.emitted", status.pipeline.emitted > 0, "no L2 module output reached the bus");
    reporter.expect(
        "registry.market-modules",
        args.markets.every((market) => status.registry.markets.includes(market)),
        `registered markets = ${status.registry.markets.join(", ") || "none"}`
    );

    /* [4] channels / health markers of this market */
    const channelNames = checkChannels(realtime, args, reporter);

    /* [4b] depth provenance / single-source / crossed gates (fix #3..#6) */
    checkDepthSource(realtime, args, reporter, packets);

    /* [7] README.txt 3.6 state checklist */
    checkState(realtime, args, reporter);

    /* [8] nothing logged an error during the window */
    const problems = logProblems();
    reporter.expect("errors.log", problems.length === 0, problems.slice(0, 5));

    /* [9] release must empty the registry + bus */
    const released = realtime.release(args.symbol);
    const after = realtime.status();
    reporter.expect(
        "release.connection-registry",
        released === true && after.connections.symbols === 0 && after.connections.running === 0,
        `symbols = ${after.connections.symbols}, running = ${after.connections.running}, streams = ${after.connections.streams}`
    );
    reporter.expect("release.bus", after.bus.channels === 0, `bus channels after release = ${after.bus.channels}`);

    /* [9b] sockets/timers still held after release.
     * Spot WS factories return no handle at all (venue-adapters/wrappers.cjs
     * documents stop() as best-effort), so ws-control.cjs reconnects every
     * 1s..30s and keeps the process alive ⇒ WARN, not FAIL. */
    await sleep(600);
    const handlesAfter = activeResources();
    const socketsAfter = socketCount(handlesAfter);
    reporter.soft(
        "release.handles",
        socketsAfter <= socketsBefore,
        `${socketsAfter - socketsBefore} socket(s) still open after release (${formatResources(handlesAfter)})`
    );

    return finish(
        reporter,
        { args, label, packets, seen, healthMarkers, status, channelNames, durationMs, streamRecords, handlesAfter },
        originalConsole
    );
}


/* ------------------------------------------------------------
 * 8. Report + exit codes (0 PASS/SKIP, 1 FAIL, 2 usage, 4 timeout)
 * ---------------------------------------------------------- */
/** Node >= 17.3 handle census; null on older runtimes. */
function activeResources() {
    if (typeof process.getActiveResourcesInfo !== "function") return null;
    const counts = {};
    for (const name of process.getActiveResourcesInfo()) counts[name] = (counts[name] || 0) + 1;
    return counts;
}

function socketCount(counts) {
    if (!counts) return 0;
    return (counts.TCPSocketWrap || 0) + (counts.TLSSocketWrap || 0) + (counts.TCPServerWrap || 0);
}

function formatResources(counts) {
    if (!counts) return "unknown (node < 17.3)";
    return Object.entries(counts).map(([name, count]) => `${name}=${count}`).join(" ") || "none";
}

function restoreConsole(original) {
    for (const channel of Object.keys(original)) console[channel] = original[channel];
}

function printFindings(reporter) {
    for (const group of reporter.list()) {
        const mark = group.ok ? "PASS" : group.level;
        step("check", `${mark.padEnd(4)} ${group.id}${group.count > 1 ? ` x${group.count}` : ""}`);
        for (const sample of group.samples) step("detail", `          ↳ ${stringify(sample)}`);
    }
}

function finish(reporter, context, originalConsole) {
    const failures = reporter.failures();
    const warnings = reporter.warnings();
    const { args, label, packets, seen, status, channelNames, durationMs, healthMarkers, streamRecords, handlesAfter } = context;
    const checks = reporter.list();

    restoreConsole(originalConsole);
    restoreQualityAccept();
    restoreQualityAccept = () => {};

    if (packets) {
        step("traffic", `packets ${packets.accepted}/${packets.attempts} accepted${packets.rejected ? `, ${packets.rejected} rejected` : ""} in ${durationMs ? Math.round(durationMs / 1000) : 0}s`);
        step("types", `packet types: ${[...packets.byType].map(([type, count]) => `${type}=${count}`).join(", ") || "none"}`);
    }
    if (seen) step("events", `bus events: ${[...seen.byEvent].map(([event, count]) => `${event}=${count}`).join(", ") || "none"}`);
    if (channelNames) step("channels", `${channelNames.length} bus channel(s): ${channelNames.join(" ")}`);
    if (streamRecords) step("streams", streamRecords.map((stream) => `${stream.id}=${stream.status}${stream.closable ? `(${stream.closeMethod})` : "(detached)"}`).join(" "));
    if (status) step("pipeline", `dispatched=${status.pipeline.dispatched} executed=${status.pipeline.executed} skipped=${status.pipeline.skipped} failed=${status.pipeline.failed} emitted=${status.pipeline.emitted} markers=${status.pipeline.markers}`);
    if (handlesAfter) step("handles", `after release: ${formatResources(handlesAfter)}`);
    if (healthMarkers) step("legacy", `global.healthEmit calls = ${healthMarkers.length}`);

    printFindings(reporter);

    if (failures.length) {
        step("result", `FAIL ${label} — ${failures.length} failing group(s): ${failures.map((group) => group.id).join(", ")}`);
        if (warnings.length) step("result", `warn: ${warnings.map((group) => group.id).join(", ")}`);
        return 1;
    }

    step(
        "result",
        `PASS ${label} — ${checks.length} check group(s) green, ${warnings.length} warning(s)${warnings.length ? `: ${warnings.map((group) => group.id).join(", ")}` : ""}`
    );
    return 0;
}

/* ------------------------------------------------------------
 * 9. Entry point
 * ---------------------------------------------------------- */
async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (process.env.REALTIME_LIVE_HEALTH !== "1" && process.argv.length <= 2) {
        out("realtime live health check skipped (set REALTIME_LIVE_HEALTH=1 to open live websockets)");
        return 0;
    }

    const hardTimeout = setTimeout(() => {
        out(`[LIVE-HEALTH] timeout   harness exceeded ${args.seconds + 30}s — forcing exit`);
        process.exit(4);
    }, (args.seconds + 30) * 1000);
    hardTimeout.unref();

    try {
        return await runRealtimeLiveHealth(args);
    } finally {
        clearTimeout(hardTimeout);
    }
}

main()
    .then((code) => {
        // the section's spot WS factories cannot be torn down (see
        // venue-adapters/wrappers.cjs), so the event loop may still hold
        // sockets/timers after release() — the harness must exit on purpose.
        process.exit(Number(code) || 0);
    })
    .catch((err) => {
        const stack = err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : String(err);
        out(`[LIVE-HEALTH] crash     ${stack}`);
        process.exit(err && err.code === "ERR_ASSERTION" ? 2 : 1);
    });

/* END-OF-FILE */

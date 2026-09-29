/**
 * A3 — Router: routes, guards, canonical symbols
 * analytics-engine/core/router.cjs
 * ============================================================
 * The router is the only place that decides which event feeds which module
 * method and which reading follows. Two things are checked here:
 *   ۱) the table agrees with the real modules (method exists, event known),
 *   ۲) modules only ever see a canonical symbol, so an okx swap and a
 *      binance spot trade of the same asset land in ONE bucket.
 *
 * Run: node analytics-engine/tests/router.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");

const { createEnvelope, ASSET_CLASS, SOURCE_TYPE } = require(
    path.join(__dirname, "..", "..", "collector", "crypto", "common", "envelope.cjs")
);
const { ANALYTICS_EVENT_LIST, ANALYTICS_EVENTS, INDICATOR_TIMEFRAMES, indicatorEvent, PRICE_ACTION_TIMEFRAMES, priceActionEvent, CROSS_MARKET_TIMEFRAMES, macroCorrelationEvent, relativeStrengthEvent } = require(
    path.join(__dirname, "..", "topics.cjs")
);
const { Router, DEFAULT_ROUTES } = require(path.join(__dirname, "..", "core", "router.cjs"));
const { DeltaFlow } = require(path.join(__dirname, "..", "modules", "delta-flow", "index.cjs"));
const { LiquidationHeatmap } = require(path.join(__dirname, "..", "modules", "liquidations", "index.cjs"));
const { CrossExchangeArbitrage } = require(path.join(__dirname, "..", "modules", "arbitrage", "index.cjs"));
const { DerivativesAnalytics } = require(path.join(__dirname, "..", "modules", "derivatives", "index.cjs"));
const { LiquidityAnalytics } = require(path.join(__dirname, "..", "modules", "liquidity", "index.cjs"));
const { OnchainAnalytics } = require(path.join(__dirname, "..", "modules", "onchain", "index.cjs"));
const { IndicatorAnalytics } = require(path.join(__dirname, "..", "modules", "indicators", "index.cjs"));
const { PriceActionAnalytics } = require(path.join(__dirname, "..", "modules", "price_action", "index.cjs"));
const { CrossMarketAnalytics } = require(path.join(__dirname, "..", "modules", "cross_market", "index.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A3: ${msg}`);
    checks++;
};

function freshModules() {
    return {
        deltaFlow: new DeltaFlow(),
        liquidations: new LiquidationHeatmap(),
        arbitrage: new CrossExchangeArbitrage(),
        derivatives: new DerivativesAnalytics(),
        liquidity: new LiquidityAnalytics(),
        onchain: new OnchainAnalytics(),
        indicators: new IndicatorAnalytics(),
        priceAction: new PriceActionAnalytics(),
        crossMarket: new CrossMarketAnalytics()
    };
}

function envelope({
    eventType,
    symbol = "BTCUSDT",
    exchange = "binance",
    marketType = "spot",
    payload = {},
    timestamp = 1_700_000_000_000
} = {}) {
    return createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.REALTIME,
        marketType,
        exchange,
        symbol,
        eventType,
        data: payload,
        timestamp
    });
}

/** The table must agree with the modules that actually exist. */
function contract() {
    const ids = new Set();
    const published = new Set();
    const model = freshModules();

    for (const route of DEFAULT_ROUTES) {
        ok(typeof route.id === "string" && route.id.length > 0, "every route has an id");
        ok(!ids.has(route.id), `route id "${route.id}" is unique`);
        ids.add(route.id);
        ok(Array.isArray(route.eventTypes) && route.eventTypes.length > 0, `${route.id} listens to at least one event`);

        const target = model[route.module];
        ok(!!target, `${route.id} names a real module (${route.module})`);
        ok(typeof target[route.method] === "function", `${route.id}: ${route.module}.${route.method} exists`);
        ok(typeof route.build === "function", `${route.id} builds a sample`);
        ok(Array.isArray(route.publishes) && route.publishes.length > 0, `${route.id} publishes at least one reading`);

        for (const publication of route.publishes) {
            ok(ANALYTICS_EVENT_LIST.includes(publication.eventType), `${route.id} publishes a known event (${publication.eventType})`);
            ok(typeof publication.data === "function", `${route.id} resolves its reading lazily`);
            ok(typeof publication.throttleMs === "number" && publication.throttleMs >= 0, `${route.id} throttles by a real number`);
            published.add(publication.eventType);
        }
    }

    for (const eventType of ANALYTICS_EVENT_LIST) {
        ok(published.has(eventType), `every analytics event has a producer (${eventType})`);
    }

    /* The indicator layer answers per timeframe, so its one route must carry
     * exactly one publication per served timeframe — and the event table must
     * spell each of them the way indicatorEvent() does, or the engine would
     * publish a topic it never announced. */
    const indicatorRoutes = DEFAULT_ROUTES.filter((route) => route.module === "indicators");
    ok(indicatorRoutes.length === 1, "one route feeds the indicator module");
    ok(indicatorRoutes[0].publishes.length === INDICATOR_TIMEFRAMES.length,
        `one publication per served timeframe (${INDICATOR_TIMEFRAMES.length})`);

    for (const timeframe of INDICATOR_TIMEFRAMES) {
        const key = `INDICATORS_${timeframe.toUpperCase()}`;
        ok(ANALYTICS_EVENTS[key] === indicatorEvent(timeframe),
            `the ${key} event is spelled ${indicatorEvent(timeframe)}`);
        ok(indicatorRoutes[0].publishes.some((publication) => publication.eventType === indicatorEvent(timeframe)),
            `${indicatorEvent(timeframe)} has a producer of its own`);
    }

    /* The price-action layer answers per timeframe too, from its own list: the
     * two layers read the same bars and announce their own topics, so neither
     * list may drift from the event table. */
    const priceActionRoutes = DEFAULT_ROUTES.filter((route) => route.module === "priceAction");
    ok(priceActionRoutes.length === 1, "one route feeds the price-action module");
    ok(priceActionRoutes[0].publishes.length === PRICE_ACTION_TIMEFRAMES.length,
        `one publication per served timeframe (${PRICE_ACTION_TIMEFRAMES.length})`);

    for (const timeframe of PRICE_ACTION_TIMEFRAMES) {
        const key = `PRICE_ACTION_${timeframe.toUpperCase()}`;
        ok(ANALYTICS_EVENTS[key] === priceActionEvent(timeframe),
            `the ${key} event is spelled ${priceActionEvent(timeframe)}`);
        ok(priceActionRoutes[0].publishes.some((publication) => publication.eventType === priceActionEvent(timeframe)),
            `${priceActionEvent(timeframe)} has a producer of its own`);
    }

    /* The cross-market layer answers per timeframe too, but two questions at a
     * time (a coefficient against the market's anchor, the series against its own
     * benchmark), and it adds the leverage state on top. Both spellings come from
     * the same event table, so neither the list nor the table may drift. */
    const crossMarketRoutes = DEFAULT_ROUTES.filter((route) => route.module === "crossMarket");
    ok(crossMarketRoutes.length === 2,
        "two routes feed the cross-market module: the closed bars, and the leverage state");

    const crossCandle = crossMarketRoutes.find((route) => route.id === "cross-market.candle");
    ok(!!crossCandle && crossCandle.publishes.length === CROSS_MARKET_TIMEFRAMES.length * 2,
        `one correlation AND one relative reading per served timeframe (${CROSS_MARKET_TIMEFRAMES.length * 2})`);

    for (const timeframe of CROSS_MARKET_TIMEFRAMES) {
        const correlationKey = `MACRO_CORRELATION_${timeframe.toUpperCase()}`;
        const strengthKey = `RELATIVE_STRENGTH_${timeframe.toUpperCase()}`;
        ok(ANALYTICS_EVENTS[correlationKey] === macroCorrelationEvent(timeframe),
            `the ${correlationKey} event is spelled ${macroCorrelationEvent(timeframe)}`);
        ok(ANALYTICS_EVENTS[strengthKey] === relativeStrengthEvent(timeframe),
            `the ${strengthKey} event is spelled ${relativeStrengthEvent(timeframe)}`);
        ok(crossCandle.publishes.some((publication) => publication.eventType === macroCorrelationEvent(timeframe)),
            `${macroCorrelationEvent(timeframe)} has a producer of its own`);
        ok(crossCandle.publishes.some((publication) => publication.eventType === relativeStrengthEvent(timeframe)),
            `${relativeStrengthEvent(timeframe)} has a producer of its own`);
    }
}

function routing() {
    const router = new Router();
    const model = freshModules();

    ok(router.routeFor("trade").length === 1, "trade has one route");
    ok(router.routeFor("funding").length === 3,
        "funding feeds the derivatives module, the arbitrage module and the leverage view (which reads the same rate as one of its four parts)");
    ok(router.routeFor("l2").length === 1 && router.routeFor("depth").length === 1, "the depth aliases share the depth route");
    ok(router.routeFor("mark_price").length === 1, "a mark price can feed the spread module");
    ok(router.routeFor("ticker").length === 5,
        "a ticker feeds the spread, the liquidity module and all three bar-reading layers (the six-market frame may carry a bar)");
    ok(router.routeFor("depth").length === 1, "depth keeps its one owner (delta-flow) — the liquidity module reads the ticker frame instead");
    ok(router.routeFor("etf_quote").length === 1 && router.routeFor("exchange_reserves").length === 1
        && router.routeFor("whale_transfer").length === 1,
        "the six on-chain event types feed one route (the onchain module)");
    ok(router.routeFor("exchange_reserves")[0] === router.routeFor("etf_quote")[0],
        "one owner whichever of the six questions the arrival answers");
    const candleOwners = router.routeFor("candle").map((route) => route.module).sort();
    ok(candleOwners.join(",") === "crossMarket,indicators,priceAction",
        `a venue candle feeds all three bar-reading layers (${candleOwners.join(" · ")})`);
    ok(router.routeFor("kline").length === 0,
        "kline is the stream's name, candle is the envelope's — only the envelope word routes");
    ok(router.routeFor("ticker").some((route) => route.module === "indicators"),
        "and a six-market ticker reaches it too (that frame can carry a bar)");
    ok(router.routeFor("ticker").some((route) => route.module === "priceAction"),
        "the same frame reaches the price-action layer, which reads the same bar");
    ok(router.routeFor("ticker").some((route) => route.module === "crossMarket"),
        "and the cross-market layer, which reads that same bar against another series");
    ok(router.routeFor("mark_price").length === 1,
        "a mark price is not a candle: it stays with the spread module alone");
    ok(router.routeFor("nope").length === 0, "an unknown event has no route");

    const barless = router.dispatch({
        envelope: envelope({ eventType: "ticker", payload: { price: 100 } }),
        modules: model
    });
    ok(!barless.skipped.some((item) => item.routeId === "indicators.candle"),
        "a ticker with no bar in it is no route skip — the same frame is a legal input for several modules");
    ok(barless.ingested.some((item) => item.routeId === "liquidity.ticker"),
        "the frame still reaches the liquidity module (one input, several readings)");
    ok(barless.ingested.some((item) => item.routeId === "indicators.candle"),
        "and the indicator route takes it too, so the module can judge it");
    ok(barless.ingested.find((item) => item.routeId === "indicators.candle").publications.length === 0,
        "nothing is published for a frame that carries no bar: every timeframe answered null");
    ok(barless.skipped.length === 0 && model.crossMarket.stats().counters.unknownInterval === 1,
        "and the cross-market layer, which reads the same frames and says the same thing about it");
    ok(model.indicators.stats().counters.unknownInterval === 1,
        "and the module's own counters say what was missing (no readable interval)");

    const unrouted = router.dispatch({ envelope: envelope({ eventType: "nope" }), modules: model });
    ok(unrouted.unrouted === true && unrouted.ingested.length === 0, "an unrouted envelope is reported, never guessed at");

    const missing = router.dispatch({
        envelope: envelope({ eventType: "trade", payload: { side: "buy", qty: 1, price: 100 } }),
        modules: {}
    });
    ok(missing.skipped.length === 1 && /not available/.test(missing.skipped[0].reason), "a missing module is skipped, not fatal");
    ok(missing.ingested.length === 0, "nothing is ingested when a module is missing");

    const boom = new Router({
        routes: [{
            id: "boom",
            eventTypes: ["boom"],
            module: "deltaFlow",
            method: "ingestTrade",
            build: () => { throw new Error("build failed"); },
            publishes: []
        }]
    });
    const errored = boom.dispatch({ envelope: envelope({ eventType: "boom" }), modules: model });
    ok(errored.errors.length === 1 && errored.errors[0].message === "build failed", "a throwing build is reported per route");

    const empty = new Router({
        routes: [{
            id: "empty",
            eventTypes: ["empty"],
            module: "deltaFlow",
            method: "ingestTrade",
            build: () => null,
            publishes: []
        }]
    });
    const skipped = empty.dispatch({ envelope: envelope({ eventType: "empty" }), modules: model });
    ok(skipped.skipped.length === 1 && /unusable/.test(skipped.skipped[0].reason), "a null sample is skipped");
    ok(new Router({ routes: [] }).eventTypes.length === 0, "a router may be empty");
}

/** One canonical bucket for the same market across venues. */
function canonicalBuckets() {
    const router = new Router();
    const model = freshModules();

    const binance = router.dispatch({
        envelope: envelope({ eventType: "trade", payload: { side: "buy", qty: 2, price: 100 } }),
        modules: model
    });
    const okx = router.dispatch({
        envelope: envelope({
            eventType: "trade",
            exchange: "okx",
            symbol: "BTC-USDT-SWAP",
            marketType: "swap",
            payload: { side: "sell", qty: 1, price: 100 }
        }),
        modules: model
    });

    ok(binance.ingested.length === 1 && binance.ingested[0].routeId === "delta-flow.trade", "the trade route fired");
    ok(binance.ingested[0].sample.symbol === "BTCUSDT", "the sample carries the canonical symbol");
    ok(okx.ingested[0].sample.symbol === "BTCUSDT", "an okx swap symbol is canonicalised before the module sees it");

    const sample = binance.ingested[0].sample;
    ok(sample.rawSymbol === undefined, "the sample itself only carries the canonical symbol");

    const publication = binance.ingested[0].publications[0];
    ok(publication.eventType === "cvd", "a trade publishes a cvd reading");
    ok(publication.symbol === "BTCUSDT" && publication.exchange === "binance", "the reading names the market");
    ok(publication.throttleMs === 1000, "the reading uses the route throttle");
    ok(publication.throttleKey === "BTCUSDT", "the route's throttle key is the symbol");
    ok(publication.timestamp === 1_700_000_000_000, "the reading is stamped from the envelope");
    ok(publication.data !== null && publication.data.symbol === "BTCUSDT", "the reading is the module snapshot");

    const bucket = model.deltaFlow.snapshot({ symbol: "BTCUSDT" });
    const venues = Object.keys(bucket.venues || {});
    ok(venues.length === 2, `both venues share ONE bucket (${venues.join(", ")})`);
    ok(venues.some((key) => key.startsWith("binance")), "the bucket names binance");
    ok(venues.some((key) => key.startsWith("okx")), "the bucket names okx");

    const phantom = model.deltaFlow.snapshot({ symbol: "BTCUSDTSWAP" });
    ok(Object.keys(phantom.venues || {}).length === 0, "no phantom bucket under the raw venue spelling");
}

function coverage() {
    const cases = [
        { eventType: "depth", payload: { bids: [[100, 1]], asks: [[101, 1]] }, expected: ["orderbook_imbalance"] },
        {
            /* The forced order is one of the four parts of the leverage view, so
             * the same frame answers both questions: where the heat was, and how
             * much leverage is in the market. */
            eventType: "liquidation", payload: { side: "long", price: 100, qty: 1 },
            expected: ["liquidation_heatmap", "market_leverage_risk"]
        },
        {
            /* Open interest moved the leverage view too — but only when the
             * change is measurable: this frame carries a timestamp the module's
             * clock cannot place a reference inside the change window for, so the
             * part is absent and the reading (which would then be built from
             * nothing) is not published at all. */
            eventType: "open_interest", payload: { oiUsd: 1_000_000, markPrice: 100 },
            expected: ["open_interest"]
        },
        {
            eventType: "funding", payload: { rate: 0.0001, intervalHours: 8 },
            expected: ["oi_weighted_funding", "funding_carry", "market_leverage_risk"]
        },
        {
            eventType: "long_short_ratio",
            payload: { ratio: 1.2, longAccount: 0.55, shortAccount: 0.45 },
            expected: ["positioning", "market_leverage_risk"]
        },
        { eventType: "mark_price", payload: { price: 100 }, expected: ["cross_exchange_spread"] },
        {
            /* A six-market quote: the spread module answers "is this venue out
             * of line?", the liquidity module answers "what is the market?" */
            eventType: "ticker",
            payload: { price: 100, bid: 99.5, ask: 100.5, bidSize: 1, askSize: 2, evidence: { bidAsk: true, depth: true, cvd: "proxy" } },
            expected: ["cross_exchange_spread", "price_reading", "liquidity_flow"]
        },
        {
            /* The same ticker with a bar inside it: a bar is a reading too,
             * and it is the only one that is edge-triggered. */
            eventType: "ticker",
            payload: {
                price: 100, open: 98, high: 101, low: 97, close: 100, volume: 10, barInterval: "1d",
                evidence: { candle: true }
            },
            expected: ["cross_exchange_spread", "price_reading", "liquidity_flow", "candle"]
        }
    ];

    for (const item of cases) {
        const router = new Router();
        const model = freshModules();
        const result = router.dispatch({
            envelope: envelope({ eventType: item.eventType, payload: item.payload }),
            modules: model
        });

        ok(result.errors.length === 0, `${item.eventType}: no error`);
        ok(result.ingested.length > 0, `${item.eventType} is ingested`);

        const events = result.ingested
            .flatMap((entry) => entry.publications.map((publication) => publication.eventType))
            .sort();
        ok(JSON.stringify(events) === JSON.stringify([...item.expected].sort()), `${item.eventType} → ${item.expected.join(", ")}`);

        for (const entry of result.ingested) {
            for (const publication of entry.publications) {
                ok(publication.data !== undefined && publication.data !== null, `${item.eventType}: the reading is resolved`);
                ok(publication.symbol === "BTCUSDT", `${item.eventType}: the reading carries the canonical symbol`);
            }
        }
    }
}

contract();
routing();
canonicalBuckets();
coverage();

console.log(`A3 router: ${checks} checks passed`);

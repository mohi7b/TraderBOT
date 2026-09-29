/* ============================================================
 * File: analytics-engine/core/router.cjs
 * Section: analytics-engine/core
 * Version: 1.0.0
 *
 * Role:
 *   The routing table of the analytics engine: which incoming
 *   eventType feeds which module, through which method, and which
 *   analytics events that update produces.
 *
 *   Shape of a route:
 *     {
 *       id            stable name (also the skipped/error label)
 *       eventTypes    incoming meta.eventType values that match
 *       module        key in the engine's module registry
 *       method        the module method to call
 *       build         (payload, meta) → sample | null   (null = unusable)
 *       publishes     [{ eventType, data({modules, sample, meta, result}),
 *                        throttleMs, key(meta) }]
 *     }
 *
 *   A route knows nothing about buses, topics or throttling — it only
 *   turns `(payload, meta)` into a module call and describes the
 *   readings that should follow. The engine owns publication, so all
 *   egress policy lives in exactly one file.
 *
 *   `result` in `data(...)` is what the module's method answered *for
 *   this very sample* (its return value). A route may therefore publish
 *   the measurement the module just made instead of a state it happens
 *   to hold from an earlier frame: a frame the module refused answers
 *   null and leaves no reading behind, which is the only honest answer
 *   for it.
 * ============================================================ */

const {
    ANALYTICS_EVENTS,
    INDICATOR_TIMEFRAMES,
    indicatorEvent,
    PRICE_ACTION_TIMEFRAMES,
    priceActionEvent,
    CROSS_MARKET_TIMEFRAMES,
    macroCorrelationEvent,
    relativeStrengthEvent
} = require("../topics.cjs");
const { canonicalSymbol, baseAssetOf } = require("../../collector/crypto/common/envelope.cjs");

/* Depth-ish event names across realtime venues and canonical packets.
 *
 * The last three are the words the realtime collector actually publishes for a
 * book it maintains: the spot depth group emits `depth_20`, `depth_100` and
 * `depth_full` (registrations/spot.cjs → spot/depth/depth_*.cjs) and the futures
 * group emits `depth_100`, `depth_medium` and `depth_full`
 * (registrations/futures.cjs → futures/depth/depth_*.cjs), each of them with
 * top-level `bids`/`asks`. Without those words the only book that ever reached
 * delta-flow was the full-depth packet, so `orderbook_imbalance` existed for the
 * rare feed and not for the tick-by-tick one the venue modules maintain.
 *
 * Deliberately out: the depth frames that are not a book at all — `depth_delta`,
 * `depth_imbalance`, `depth_pressure` carry a number — and the aggregate frames
 * (`depth_aggregated` on futures, `depth_aggregator` on spot, `depth_cross_venue`
 * from the futures depth group) which carry the book one level down, under their
 * own `payload`, so they need a builder of their own rather than this one. A
 * frame the table does not name is reported unrouted, never guessed at. */
const DEPTH_EVENT_TYPES = [
    "depth",
    "depth_update",
    "depth_partial",
    "depth_snapshot",
    "depth_full",
    "depth_full_snapshot",
    "orderbook",
    "l2",
    "depth_20",
    "depth_100",
    "depth_medium"
];

/* The trade words a frame can arrive under.
 *
 * `trade` is the collector's own flow event: ingest/spot-handler.cjs publishes
 * `{ event: "trade", … }` for a trade packet. `orderflow` is the L2 echo that
 * carries the print itself — spot/orderflow/orderflow.cjs emits the trade's own
 * `price` + `qty` + `side`, which is what CVD is made of, while the handler's
 * frame carries the book context around it. Both names feed the one route, so a
 * venue that publishes either is read. Where the print sits — on the frame, or
 * under the frame's own `payload` — is `printOf`'s business below; a frame that
 * carries no print at all is refused by the route, and a print that is present
 * but unusable (`ingestTrade` → null) by the module.
 *
 * Deliberately out: `micro_trades` and `big_trades` are the *same* print filtered
 * by size (spot/orderflow/*.cjs), so routing them next to `orderflow` would count
 * one trade three times and inflate CVD. */
const TRADE_EVENT_TYPES = ["trade", "orderflow"];

/* ------------------------------------------------------------
 * Where a trade frame keeps its print
 *
 * A frame's print is `side` + `qty` + `price`, and the collector puts it in one
 * of the two places a frame keeps its content:
 *
 *   on the frame itself   the spot orderflow echo —
 *                         `{ event: "orderflow", price, qty, side }`
 *                         (spot/orderflow/orderflow.cjs)
 *   under its `payload`   a module frame that wraps its own output, the shape
 *                         market_aggregate, depth_aggregated and
 *                         orderflow_aggregator arrive in —
 *                         `{ event: "trade", payload: { side, qty, price } }`
 *
 * Both are the frame's own print, so both are read; the frame's own fields win
 * when they carry one, and a wrapper can never shadow them. Null when the frame
 * carries no print at all — that is what makes the collector's trade flow event
 * (published for the packet that carried a print, with the book context around
 * it) an unusable input to a trade route rather than "the flow as it stood".
 * ---------------------------------------------------------- */
function printOf(frame) {
    if (!frame || typeof frame !== "object") return null;

    const { side, qty, price } = frame;
    if (side === undefined || side === null) return null;
    if (qty === undefined || qty === null) return null;
    if (price === undefined || price === null) return null;

    return { side, qty, price };
}

/* Anything that carries a tradable price can feed the spread module. */
const PRICE_EVENT_TYPES = ["mark_price", "price", "ticker", "book_ticker"];

/* The six on-chain event types (collector/crypto/onchain/core/reading.cjs).
 * One envelope per answer about one subject — a chain, a holder, a stablecoin
 * or a fund — so they all travel the same route into one module. */
const ONCHAIN_EVENT_TYPES = [
    "exchange_reserves",
    "network_metrics",
    "whale_transfer",
    "stablecoin_supply",
    "lending_rate",
    "etf_quote"
];

/* Frames that may carry a bar. The realtime venues say "candle" for one,
 * whichever exchange sent it (every venue's ws.cjs calls emitMarketEvent(
 * "candle", …) — the kline stream reaches the bus under the same word), and the
 * six-market layer's `ticker` carries the venue's last bar inside it whenever
 * the provider serves one (barInterval + OHLCV).
 *
 * "May": a frame of one of these types is a legal input for the module even
 * when it holds no bar (a mark price, a book ticker, a quote-only reading) —
 * the module counts what is wrong with it (`unknownInterval`, `invalidBar`,
 * `open`, `undated`) and publishes nothing. The route therefore never turns a
 * frame another module reads fine into a route skip: one input, several
 * readings means several modules get to judge it. */
const CANDLE_EVENT_TYPES = ["candle", "ticker"];

/**
 * A candle-ish frame → the sample the bar-reading layer takes, or null when the
 * frame names no symbol (the only reason to skip such a frame: every other
 * shortcoming is the module's to count).
 *
 * One input, several readings: the same envelope keeps feeding the liquidity
 * module, and both bar readers (modules/indicators and modules/price_action)
 * see the very same sample — they are two views of one bar, never two bars.
 */
function frameOfCandle(payload = {}, meta = {}) {
    if (!meta.symbol) return null;

    return {
        exchange: meta.exchange || payload.exchange || null,
        symbol: meta.symbol,
        /* The market the bar belongs to travels with the bar. The two bar
         * readers ignore it; the cross-market layer needs it, because "which
         * benchmark does this series belong to" is a question about the
         * market, not about the candles. Null when the frame named none. */
        assetClass: meta.assetClass || null,
        /* The venues put the interval on `interval`, the six-market layer on
         * `barInterval`; both are handed over so the bar keeps the venue's own
         * word for it. A frame with neither — today's realtime candle event
         * drops the venue's interval on its way to the bus — is counted by the
         * module as `unknownInterval` and publishes nothing: the route never
         * invents an interval. (One such frame per venue per minute is also why
         * the module's counters, not the engine's, are the place to see it.) */
        interval: payload.interval,
        barInterval: payload.barInterval,
        /* The bar's own open time, in the order of trust: the field named for
         * it, then the frame's own stamp — a candle frame's timestamp IS its
         * bar's open time (binance's candle.t, the six-market reading's
         * timestamp) — and last the envelope's stamp, which for a bus entry is
         * the arrival time. The module falls back once more, and answers
         * `undated` rather than ringing a bar at the minute it happened to
         * arrive. */
        openTime: payload.openTime === undefined || payload.openTime === null
            ? payload.timestamp
            : payload.openTime,
        closeTime: payload.closeTime,
        open: payload.open,
        high: payload.high,
        low: payload.low,
        close: payload.close,
        volume: payload.volume,
        /* The venue's own word on whether the bar is finished. Without it the
         * module settles it against its clock (closeTime): an unfinished bar is
         * never read. */
        isClosed: payload.isClosed !== undefined ? payload.isClosed : payload.closed,
        timestamp: meta.timestamp
    };
}

/* ------------------------------------------------------------
 * Which side was liquidated
 *
 * The liquidations module answers "which positions were forced out" with
 * side: "long" | "short" — a long liquidation is the market selling. A frame
 * from a venue carries that venue's own word for it, and the collector has
 * already read each venue's word once, in collector/crypto/derivatives/venues:
 *
 *   binance  forceOrder.o.S — the side of the LIQUIDATION ORDER
 *            (venues/binance.cjs: "A long position is liquidated by selling
 *            → S:\"SELL\" ⇒ liquidated side = long")
 *   okx      liquidation-orders `side` — the liquidation order's side
 *            (venues/okx.cjs: "\"sell\" means a long position was closed out")
 *   bitget   the same order-side word (venues/bitget.cjs:
 *            LONG_LIQUIDATION_ORDER_SIDE = "sell"), or the position word
 *            `positionSide` when the push carries one — which arrives here as
 *            "long"/"short" and passes straight through
 *   bybit    allLiquidation.S — the liquidated POSITION's side, not the order's
 *            (venues/bybit.cjs, quoting Bybit: "When you receive a Buy update,
 *            this means that a long position has been liquidated")
 *
 * So "buy" means opposite things on the two families, and the venue is what
 * decides: the order-side table for everyone else, the position-side table for
 * bybit. A canonical long/short travels untouched — that is what the derivatives
 * collector publishes — and a word nobody understands is handed on exactly as it
 * arrived, so the module refuses it and counts `rejected`: a refusal is counted
 * where it is made, never silently translated into a guess.
 * ---------------------------------------------------------- */
const ORDER_SIDE_POSITION = Object.freeze({ buy: "short", sell: "long" });
const BYBIT_POSITION_OF_SIDE = Object.freeze({ buy: "long", sell: "short" });
const POSITION_SIDE_VENUES = Object.freeze(["bybit"]);

function liquidatedSideOf(side, exchange = null) {
    const word = String(side === null || side === undefined ? "" : side).trim().toLowerCase();
    if (word === "long" || word === "short") return word;

    const table = POSITION_SIDE_VENUES.includes(String(exchange || "").trim().toLowerCase())
        ? BYBIT_POSITION_OF_SIDE
        : ORDER_SIDE_POSITION;

    return table[word] || side;
}

const DEFAULT_ROUTES = Object.freeze([
    /* ------------------------------------------------------------
     * Sub-phase 1 — order flow (modules/delta-flow)
     *
     * Trades in, CVD out. A trade frame is the venue's print: `side`, `qty`,
     * `price`. Two producers carry that one print — the collector's trade flow
     * event and the spot orderflow module that echoes it (TRADE_EVENT_TYPES
     * above) — and both are the same print, so they share this one route; the
     * size-filtered echoes of it (micro_trades, big_trades) are deliberately left
     * unrouted, or one trade would be counted three times.
     *
     * One publication per symbol, throttled: every trade moves CVD, so the
     * reading refreshes at most once a second while the module keeps counting
     * every print it was given.
     * ---------------------------------------------------------- */
    {
        id: "delta-flow.trade",
        eventTypes: TRADE_EVENT_TYPES,
        module: "deltaFlow",
        method: "ingestTrade",
        /* A frame is a trade only when it carries a print — a side, a size and a
         * price — wherever the frame keeps it (printOf above: on the frame, or
         * under the frame's own `payload`). The collector publishes its trade flow
         * event for the packet that carried one (ingest/spot-handler.cjs:
         * `{ event: "trade", … }` with the book context around it and nothing
         * else), so a frame under a trade word without a print in it is reported
         * unusable here rather than turned into "the flow as it stood a second
         * ago". A value that is *present* but unusable — a side nobody means, a
         * zero size — is the module's own to refuse (`ingestTrade` → null);
         * nothing is published for it either. */
        build: (payload = {}, meta = {}) => {
            const inner = payload.payload && typeof payload.payload === "object" ? payload.payload : null;
            const print = printOf(payload) || (inner ? printOf(inner) : null);
            if (!print) return null;

            return {
                exchange: meta.exchange || payload.exchange || null,
                symbol: meta.symbol,
                side: print.side,
                qty: print.qty,
                price: print.price,
                timestamp: meta.timestamp
            };
        },
        publishes: [{
            eventType: ANALYTICS_EVENTS.CVD,
            throttleMs: 1000,
            key: (meta) => meta.symbol,
            /* The reading is the symbol's whole flow (every venue, one bucket), and
             * it goes out only for a print the module counted: a frame it refused
             * (`result` null — a side nobody means, a zero size) leaves the flow as
             * it was, and re-publishing that as a fresh reading would both claim
             * something happened and spend the throttle window on it. A flow with
             * nothing in it (`aggregate` null) is no reading either. */
            data: ({ modules, meta, result }) => {
                if (result === null) return null;

                const flow = modules.deltaFlow.snapshot({ symbol: meta.symbol });
                return flow.aggregate === null ? null : flow;
            }
        }]
    },
    /* The same module, the other half of order flow: a book in, the pressure
     * between its two sides out. Every book word in DEPTH_EVENT_TYPES arrives
     * here — the collector's own depth frames and the six-market depth reading —
     * so one venue's book is one reading, refreshed at most every two seconds.
     *
     * The words are shared by frames that are not books at all: the futures depth
     * group keeps its `depth` health marker on the same wire as its own book
     * words (`{ event: "depth" }`, no levels, no symbol), so a frame under these
     * names is *handed over* and the module judges it. */
    {
        id: "delta-flow.depth",
        eventTypes: DEPTH_EVENT_TYPES,
        module: "deltaFlow",
        method: "ingestDepth",
        build: (payload = {}, meta = {}) => ({
            exchange: meta.exchange || payload.exchange || null,
            symbol: meta.symbol,
            bids: payload.bids || payload.b || null,
            asks: payload.asks || payload.a || null,
            timestamp: meta.timestamp
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.ORDERBOOK_IMBALANCE,
            throttleMs: 2000,
            key: (meta) => `${meta.exchange || "unknown"}:${meta.symbol}`,
            /* One venue's book is the reading, and the reading is what the module
             * made of *this* frame: `ingestDepth` answers the sample it built out
             * of that book (mid, spread, both imbalances, a bias) or null when the
             * frame carried no usable level — a marker with no book in it, a book
             * whose levels are all unusable. Publishing the module's latest sample
             * instead would answer with a *newer book's* measurement (or an older
             * frame's) and, worse, let a bare marker consume the throttle window
             * and swallow the real book that arrived in the same packet. */
            data: ({ result }) => result
        }]
    },
    /* ------------------------------------------------------------
     * Liquidation prints → the heatmap of where leverage was washed out
     *
     * One forced order in, the whole map out (per symbol), refreshed at most
     * every five seconds. The side is read in the venue's own words first
     * (liquidatedSideOf above) — that is the difference between a map and a map
     * mirrored around the mid.
     *
     * `data` answers null unless this frame was a forced order the module could
     * place: a word it cannot read, no price, no size — the frame is refused, the
     * refusal is counted in the module's own `rejected`, and no reading takes its
     * place (nor does it spend the publication window, which would swallow the
     * real print that arrived next). That also covers the futures path's bare
     * `liquidation` health marker, which travels this route with no print in it.
     * An empty map is not a measurement either: `totals === null` publishes
     * nothing.
     * ---------------------------------------------------------- */
    {
        id: "liquidations.event",
        eventTypes: ["liquidation"],
        module: "liquidations",
        method: "ingest",
        build: (payload = {}, meta = {}) => ({
            exchange: meta.exchange || payload.exchange || null,
            symbol: meta.symbol,
            side: liquidatedSideOf(payload.side, meta.exchange || payload.exchange),
            price: payload.price,
            qty: payload.qty,
            notional: payload.notional,
            timestamp: meta.timestamp
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.LIQUIDATION_HEATMAP,
            throttleMs: 5000,
            key: (meta) => meta.symbol,
            data: ({ modules, meta, result }) => {
                if (result === null) return null;

                const snapshot = modules.liquidations.snapshot({ symbol: meta.symbol, top: 10 });
                return snapshot.totals === null ? null : snapshot;
            }
        }]
    },
    {
        id: "derivatives.open-interest",
        eventTypes: ["open_interest"],
        module: "derivatives",
        method: "ingestOpenInterest",
        build: (payload = {}, meta = {}) => ({
            exchange: meta.exchange || payload.exchange || null,
            symbol: meta.symbol,
            oiContracts: payload.oiContracts,
            oiBase: payload.oiBase,
            oiUsd: payload.oiUsd,
            markPrice: payload.markPrice,
            timestamp: meta.timestamp
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.OPEN_INTEREST,
            throttleMs: 0,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.derivatives.openInterestSnapshot(meta.symbol)
        }]
    },
    {
        id: "derivatives.funding",
        eventTypes: ["funding"],
        module: "derivatives",
        method: "ingestFunding",
        build: (payload = {}, meta = {}) => ({
            exchange: meta.exchange || payload.exchange || null,
            symbol: meta.symbol,
            rate: payload.rate,
            intervalHours: payload.intervalHours,
            nextFundingTime: payload.nextFundingTime,
            timestamp: meta.timestamp
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.OI_WEIGHTED_FUNDING,
            throttleMs: 0,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.derivatives.fundingSnapshot(meta.symbol)
        }]
    },
    {
        id: "arbitrage.funding",
        eventTypes: ["funding"],
        module: "arbitrage",
        method: "ingestFunding",
        build: (payload = {}, meta = {}) => ({
            exchange: meta.exchange || payload.exchange || null,
            symbol: meta.symbol,
            rate: payload.rate,
            intervalHours: payload.intervalHours,
            nextFundingTime: payload.nextFundingTime,
            timestamp: meta.timestamp
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.FUNDING_CARRY,
            throttleMs: 0,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.arbitrage.funding(meta.symbol)
        }]
    },
    {
        id: "arbitrage.price",
        eventTypes: PRICE_EVENT_TYPES,
        module: "arbitrage",
        method: "ingestMark",
        build: (payload = {}, meta = {}) => ({
            exchange: meta.exchange || payload.exchange || null,
            symbol: meta.symbol,
            price: payload.price !== undefined ? payload.price : payload.markPrice,
            timestamp: meta.timestamp
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.CROSS_EXCHANGE_SPREAD,
            throttleMs: 2000,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.arbitrage.spread(meta.symbol)
        }]
    },
    {
        id: "derivatives.positioning",
        eventTypes: ["long_short_ratio"],
        module: "derivatives",
        method: "ingestLongShortRatio",
        build: (payload = {}, meta = {}) => ({
            exchange: meta.exchange || payload.exchange || null,
            symbol: meta.symbol,
            ratio: payload.ratio,
            longAccount: payload.longAccount,
            shortAccount: payload.shortAccount,
            timestamp: meta.timestamp
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.POSITIONING,
            throttleMs: 0,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.derivatives.positioningSnapshot(meta.symbol)
        }]
    },
    {
        id: "liquidity.ticker",
        /* The six-market collector's own evidential word for a quote
         * (collector/liquidity_6markets/core/quote-normalizer.cjs: ticker |
         * depth | trade). Its depth and trade readings already have a home
         * (delta-flow), so only the ticker — the one that carries the price,
         * both book sides and possibly a bar inside it — is opened here.
         *
         * A ticker also feeds the spread module (PRICE_EVENT_TYPES): one
         * input, several readings, which is the designed pattern (funding
         * does the same). The two readings answer different questions —
         * cross_exchange_spread is a dislocation, price_reading/liquidity_flow
         * are the state of one market. */
        eventTypes: ["ticker"],
        module: "liquidity",
        method: "ingestReading",
        build: (payload = {}, meta = {}) => {
            if (!meta.symbol) return null;

            return {
                exchange: meta.exchange || payload.exchange || null,
                symbol: meta.symbol,
                assetClass: meta.assetClass,
                marketType: meta.marketType,
                kind: payload.kind,
                sourceMarket: payload.sourceMarket,
                price: payload.price,
                bid: payload.bid,
                ask: payload.ask,
                bidSize: payload.bidSize,
                askSize: payload.askSize,
                quoteSpreadBps: payload.quoteSpreadBps,
                open: payload.open,
                high: payload.high,
                low: payload.low,
                close: payload.close,
                volume: payload.volume,
                barInterval: payload.barInterval,
                evidence: payload.evidence,
                flow: payload.flow,
                timestamp: meta.timestamp
            };
        },
        publishes: [
            {
                eventType: ANALYTICS_EVENTS.PRICE_READING,
                throttleMs: 5000,
                key: (meta) => meta.symbol,
                data: ({ modules, meta }) => modules.liquidity.reading(meta.symbol)
            },
            {
                eventType: ANALYTICS_EVENTS.LIQUIDITY_FLOW,
                throttleMs: 15_000,
                key: (meta) => meta.symbol,
                data: ({ modules, meta }) => modules.liquidity.flow(meta.symbol)
            },
            {
                /* One bar = one event: candleUpdate() is edge-triggered, so a
                 * venue that only carries a quote (or a bar already published)
                 * yields null and no reading is published at all. */
                eventType: ANALYTICS_EVENTS.CANDLE,
                throttleMs: 0,
                key: (meta) => `${meta.exchange || "unknown"}:${meta.symbol}`,
                data: ({ modules, meta }) => modules.liquidity.candleUpdate(meta.symbol, { exchange: meta.exchange })
            }
        ]
    },
    /* ------------------------------------------------------------
     * Sub-phase 2.4 — the on-chain layer (collector/crypto/onchain)
     *
     * Six event types, one subject each (a chain, a holder, a stablecoin or a
     * fund), one arrival per envelope. They share one route because they share
     * one answer: what does this subject hold, how did the number move since
     * the sighting before it, and which of its signals are present and fresh.
     * ---------------------------------------------------------- */
    {
        id: "onchain.arrival",
        eventTypes: ONCHAIN_EVENT_TYPES,
        module: "onchain",
        method: "ingestReading",
        build: (payload = {}, meta = {}) => ({
            eventType: meta.eventType,
            /* The subject the reading is about; the frame is what carries it. */
            subjectId: meta.symbol,
            assetClass: meta.assetClass,
            /* Where the datum belongs: binance, tether, nasdaq, bitcoin. */
            exchange: meta.exchange || null,
            provenance: meta.provenance || null,
            /* The provider's time, and when this layer saw it — a gauge needs
             * both to say how far apart two sightings were (sinceMs/ageMs). */
            timestamp: meta.timestamp,
            receivedAt: meta.receivedAt,
            data: payload
        }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.ONCHAIN_FLOW,
            /* The collector's cadences are slow by nature (60 s … 4 h) and a
             * block is scanned exactly once, so every arrival is published. */
            throttleMs: 0,
            key: (meta) => meta.symbol,
            /* The topic asset is the subject id itself: baseAssetOf() would
             * read the fund TETH as the pair T/ETH. */
            topicAsset: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.onchain.flow(meta.symbol, { event: meta.eventType })
        }]
    },
    /* ------------------------------------------------------------
     * Sub-phase 2.5 — the indicator layer (modules/indicators)
     *
     * One input: a frame that may carry a bar (a venue candle, or the six-market
     * ticker that carries the venue's last bar inside it). The same envelope
     * keeps feeding the liquidity module — one input, several readings, the
     * pattern funding already sets. A frame of either type that holds no bar
     * is handed to the module anyway (it counts what was missing and answers
     * null); only a frame with no symbol at all is a route skip.
     *
     * One output per served timeframe, because RSI on 1m and RSI on 1d are two
     * different answers: the module holds one ring per (symbol, timeframe) and
     * each publication below asks that timeframe's own edge — pending() returns
     * a reading once, on the close of a new bar of that timeframe, so a frame
     * that closed no new bar yields null and publishes nothing.
     *
     * The topic list is INDICATOR_TIMEFRAMES (topics.cjs), the same default the
     * module is built with. A module configured with other timeframes needs a
     * router fed routes built from that same list (Router({ routes })).
     * ---------------------------------------------------------- */
    {
        id: "indicators.candle",
        eventTypes: CANDLE_EVENT_TYPES,
        module: "indicators",
        method: "ingestCandle",
        /* The frame is the bar layer's own (frameOfCandle above), the very same
         * sample the price-action route hands over — one input, two views. */
        build: frameOfCandle,
        publishes: INDICATOR_TIMEFRAMES.map((timeframe) => ({
            eventType: indicatorEvent(timeframe),
            /* Edge-triggered, so there is nothing to throttle: one reading per
             * closed bar of this timeframe, or nothing at all. */
            throttleMs: 0,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.indicators.pending(meta.symbol, timeframe)
        }))
    },
    /* ------------------------------------------------------------
     * Sub-phase 2.6 — the price-action layer (modules/price_action)
     *
     * The same input as the indicator layer, read by a second module: one frame
     * that may carry a bar (a venue candle, or the six-market ticker with the
     * venue's last bar inside it). The frame is turned into a sample by the very
     * same builder (frameOfCandle) and judged by the very same bar rules
     * (core/bars.cjs), because fair-value gaps and order blocks are shapes of
     * the bars the indicators are measured on — if the two layers disagreed
     * about a bar, one of them would be describing a market that never existed.
     * A frame with no bar, an unfinished bar, an unknown interval: counted by
     * the module (`unknownInterval`, `invalidBar`, `open`, `undated`) and no
     * publication at all.
     *
     * One output per served timeframe, edge-triggered on the close of that
     * timeframe's own bar: pending() returns a reading once per closed bar of
     * that timeframe, so a frame that closed no new bar publishes nothing, and
     * a 5m gap and a 4h structure are never mixed into one event. The topic list
     * is PRICE_ACTION_TIMEFRAMES (topics.cjs), the same default the module is
     * built with; a module configured with other timeframes needs a router fed
     * routes built from that same list (Router({ routes })).
     * ---------------------------------------------------------- */
    {
        id: "price-action.candle",
        eventTypes: CANDLE_EVENT_TYPES,
        module: "priceAction",
        method: "ingestCandle",
        build: frameOfCandle,
        publishes: PRICE_ACTION_TIMEFRAMES.map((timeframe) => ({
            eventType: priceActionEvent(timeframe),
            /* Edge-triggered, so there is nothing to throttle: one reading per
             * closed bar of this timeframe, or nothing at all. */
            throttleMs: 0,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.priceAction.pending(meta.symbol, timeframe)
        }))
    },
    /* ------------------------------------------------------------
     * Sub-phase 2.7 — the cross-market layer (modules/cross_market)
     *
     * The same input as the two bar layers above — one frame that may carry a
     * bar — read a third way: not the numbers of one series and not the
     * structure of one series, but the relationship between TWO series on one
     * timeframe. The frame is turned into a bar by the very same builder
     * (frameOfCandle) and judged by the very same rules (core/bars.cjs), so a
     * coefficient is always computed on bars the other layers would accept.
     *
     * Two readings per served timeframe, each edge-triggered on the close of
     * that timeframe's own bar:
     *   macro_correlation_<timeframe>  the subject against its macro anchor
     *   relative_strength_<timeframe>  the subject against its own benchmark
     *
     * A frame that closed no new bar publishes nothing; a subject whose peer
     * has not answered for the same bar publishes nothing either — the module
     * counts the refusal (`unanchored`, `unaligned`, `insufficient`, `flat`)
     * instead of correlating two windows that do not cover the same time.
     * ---------------------------------------------------------- */
    {
        id: "cross-market.candle",
        eventTypes: CANDLE_EVENT_TYPES,
        module: "crossMarket",
        method: "ingestCandle",
        build: frameOfCandle,
        publishes: [
            ...CROSS_MARKET_TIMEFRAMES.map((timeframe) => ({
                eventType: macroCorrelationEvent(timeframe),
                /* Edge-triggered on the closed bar of this timeframe, so there is
                 * nothing to throttle: one correlation per closed bar. */
                throttleMs: 0,
                key: (meta) => meta.symbol,
                data: ({ modules, meta }) => modules.crossMarket.pending(meta.symbol, timeframe)
            })),
            ...CROSS_MARKET_TIMEFRAMES.map((timeframe) => ({
                eventType: relativeStrengthEvent(timeframe),
                throttleMs: 0,
                key: (meta) => meta.symbol,
                data: ({ modules, meta }) => modules.crossMarket.relativePending(meta.symbol, timeframe)
            }))
        ]
    },
    /* ------------------------------------------------------------
     * Leverage risk — three measurements and one washout, in one reading
     *
     * Not an edge of a bar: a state of the market. The frame that arrives is
     * only the trigger (an open-interest reading, a funding rate, a long/short
     * ratio, a forced order); the module is handed what the derivatives module
     * and the liquidation heatmap answered about that symbol, and answers with
     * the parts it actually has plus the one thing that cannot be left out —
     * which parts were missing (`missing`) and how much of the scale they were
     * worth (`max`). It publishes nothing when nothing measurable is behind the
     * symbol (no OI, no funding, no ratio, no forced order), because a score
     * built from nothing would be a claim about the market.
     *
     * Throttled: every input of the four publishes the same state, and the
     * reading is one (per symbol). Order within this table guarantees the input
     * is ingested before it is composed: the routes above (derivatives.*,
     * liquidations.event) run first for these eventTypes.
     * ---------------------------------------------------------- */
    {
        id: "cross-market.leverage-risk",
        eventTypes: ["open_interest", "funding", "long_short_ratio", "liquidation"],
        module: "crossMarket",
        method: "leverageRisk",
        /* The frame only names the symbol here: everything the reading is made of
         * comes from the modules below, and none of it is the frame's own. */
        build: (payload = {}, meta = {}) => ({ symbol: meta.symbol }),
        publishes: [{
            eventType: ANALYTICS_EVENTS.MARKET_LEVERAGE_RISK,
            throttleMs: 5000,
            key: (meta) => meta.symbol,
            data: ({ modules, meta }) => modules.crossMarket.leverageRisk({
                symbol: meta.symbol,
                openInterest: modules.derivatives.openInterestSnapshot(meta.symbol),
                funding: modules.derivatives.fundingSnapshot(meta.symbol),
                positioning: modules.derivatives.positioningSnapshot(meta.symbol),
                /* top: 1 — the clusters are not what this reading is about, and a
                 * slice of nothing would read as a slice of everything. */
                liquidations: modules.liquidations.snapshot({ symbol: meta.symbol, top: 1, includeBins: false })
            })
        }]
    },
    /* __APPEND__ */
]);

/* ------------------------------------------------------------
 * Router
 * ---------------------------------------------------------- */
class Router {
    constructor({ routes = DEFAULT_ROUTES } = {}) {
        this.routes = [...routes];
        this.index = new Map();

        for (const route of this.routes) {
            for (const eventType of route.eventTypes) {
                const bucket = this.index.get(eventType) || [];
                bucket.push(route);
                this.index.set(eventType, bucket);
            }
        }
    }

    /** Every route registered for an eventType (empty when unrouted). */
    routeFor(eventType) {
        return this.index.get(String(eventType || "")) || [];
    }

    get eventTypes() {
        return [...this.index.keys()];
    }
    /**
     * Turn one envelope into module calls.
     * @returns {{ingested: object[], skipped: object[], errors: object[], unrouted: boolean}}
     *   ingested: [{ routeId, module, method, sample, publications }]
     */
    dispatch({ envelope, modules, now = Date.now } = {}) {
        const envelopeMeta = envelope && envelope.meta ? envelope.meta : {};
        const rawSymbol = envelopeMeta.symbol === undefined ? null : envelopeMeta.symbol;

        const meta = {
            eventType: envelopeMeta.eventType === undefined ? null : envelopeMeta.eventType,
            /* The asset class travels with the reading: one engine instance can
             * therefore serve the non-crypto markets (sub-phase 2.2) without
             * relabelling their output as crypto. */
            assetClass: envelopeMeta.assetClass === undefined ? null : envelopeMeta.assetClass,
            exchange: envelopeMeta.exchange === undefined ? null : envelopeMeta.exchange,
            /* Venues spell the same market differently (BTCUSDT vs BTC-USDT-SWAP),
             * so modules only ever see the canonical pair — otherwise cross-venue
             * aggregation silently splits one market into several buckets. The raw
             * spelling stays available for provenance. */
            symbol: canonicalSymbol(rawSymbol),
            rawSymbol,
            baseAsset: baseAssetOf(canonicalSymbol(rawSymbol)),
            marketType: envelopeMeta.marketType === undefined ? null : envelopeMeta.marketType,
            timestamp: envelopeMeta.timestamp === undefined ? null : envelopeMeta.timestamp,
            receivedAt: envelopeMeta.processedAt === undefined ? now() : envelopeMeta.processedAt,
            /* The frame's own provenance (origin, provider, subjectKind,
             * underlying, …): the words a collector keeps out of the payload a
             * route may still need — the module never sees the frame itself. */
            provenance: envelopeMeta.provenance === undefined ? null : envelopeMeta.provenance
        };
        const payload = envelope && envelope.payload !== undefined ? envelope.payload : null;

        const ingested = [];
        const skipped = [];
        const errors = [];
        const routes = this.routeFor(meta.eventType);

        if (!routes.length) return { ingested, skipped, errors, unrouted: true };

        for (const route of routes) {
            let sample = null;
            let result = null;
            try {
                sample = route.build(payload, meta);
            } catch (err) {
                errors.push({ routeId: route.id, message: err.message });
                continue;
            }

            if (!sample) {
                skipped.push({ routeId: route.id, reason: "unusable payload" });
                continue;
            }

            const target = modules[route.module];
            if (!target || typeof target[route.method] !== "function") {
                skipped.push({ routeId: route.id, reason: `module ${route.module}.${route.method} is not available` });
                continue;
            }

            try {
                /* What the module answered for this very sample — a measurement, a
                 * stored trade, null for a refusal — is handed to its publications
                 * below, so a route can read the answer to the frame it was given
                 * instead of a state the module happens to hold from an earlier
                 * one. */
                result = target[route.method](sample);
            } catch (err) {
                errors.push({ routeId: route.id, message: err.message });
                continue;
            }

            ingested.push({
                routeId: route.id,
                module: route.module,
                method: route.method,
                sample,
                result,
                publications: this.publicationsFor(route, { meta, sample, modules, result })
            });
        }

        return { ingested, skipped, errors, unrouted: false };
    }

    /**
     * Resolve the readings a route produced (a failing one is dropped).
     * `result` is the module's answer to this sample, for the readings that must
     * be the measurement of the frame they came from rather than a lookup of the
     * module's latest state. */
    publicationsFor(route, { meta, sample, modules, result = null }) {
        const out = [];

        for (const publication of route.publishes || []) {
            try {
                const data = typeof publication.data === "function"
                    ? publication.data({ modules, sample, meta, result })
                    : publication.data;
                if (data === null || data === undefined) continue;

                out.push({
                    eventType: publication.eventType,
                    data,
                    assetClass: meta.assetClass || null,
                    throttleMs: publication.throttleMs || 0,
                    throttleKey: typeof publication.key === "function"
                        ? publication.key(meta)
                        : `${meta.exchange || "unknown"}:${meta.symbol}`,
                    /* The asset segment of the topic, when the publisher knows
                     * it better than the symbol arithmetic does: an on-chain
                     * subject id is not a pair (TETH is a fund, not T/ETH). */
                    topicAsset: typeof publication.topicAsset === "function"
                        ? publication.topicAsset(meta)
                        : (publication.topicAsset === undefined ? null : publication.topicAsset),
                    symbol: meta.symbol,
                    exchange: meta.exchange || null,
                    marketType: meta.marketType || null,
                    timestamp: sample && sample.timestamp !== undefined && sample.timestamp !== null
                        ? sample.timestamp
                        : meta.timestamp
                });
            } catch (err) {
                /* A reading that cannot be produced is simply not published. */
            }
        }

        return out;
    }
}

module.exports = { Router, DEFAULT_ROUTES, DEPTH_EVENT_TYPES, TRADE_EVENT_TYPES, PRICE_EVENT_TYPES, ONCHAIN_EVENT_TYPES, CANDLE_EVENT_TYPES };

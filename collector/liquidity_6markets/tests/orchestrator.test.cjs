/* ============================================================
 * File: collector/liquidity_6markets/tests/orchestrator.test.cjs
 * Section: collector/liquidity_6markets/tests
 * Version: 1.0.0
 *
 * Role:
 *   The sweep loop, driven by a stub client that speaks every venue's
 *   real payload shape. No network, no keys, no wall clock: the tests
 *   move `now` by hand, so "a daily venue is not re-asked a second
 *   later" is a fact rather than a hope.
 *
 * Run:
 *   node --test collector/liquidity_6markets/tests/
 * ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { validateEnvelope, ASSET_CLASS } = require(path.join(ROOT, "..", "crypto", "common", "envelope.cjs"));
const { createCollector, defaultCatalog, CVD_METHOD, LIQUIDITY_MARKET } = require(path.join(ROOT, "index.cjs"));
const { parseArgs, OUT_FILE } = require(path.join(ROOT, "server.cjs"));

/** The clock these tests own — nothing below reads the wall clock twice. */
const START = Math.floor(Date.now() / 1000) * 1000;
/** Every venue usable: readiness is a fact of the env, not of the code. */
const ALL_KEYS = { TWELVEDATA_API_KEY: "test", FRED_API_KEY: "test", ALPHAVANTAGE_API_KEY: "test" };
const SIX_MARKETS = [
    ASSET_CLASS.CRYPTO,
    ASSET_CLASS.FOREX,
    ASSET_CLASS.COMMODITIES,
    ASSET_CLASS.INDICES,
    ASSET_CLASS.BONDS,
    ASSET_CLASS.REAL_ESTATE_CREDIT
];

function close(actual, expected, tolerance = 1e-9) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

/* ------------------------------------------------------------
 * Fixtures: a plausible level per instrument, and a book per venue.
 * Every venue answers in its own real payload shape with its own
 * timestamp, so a sweep is exercised against seven providers instead
 * of one shape seven times.
 * ---------------------------------------------------------- */

/** Roughly where each instrument trades, so cross-venue math means something. */
const BASE_PRICE = {
    BTCUSDT: 64000, ETHUSDT: 3100, SOLUSDT: 150,
    EURUSD: 1.085, GBPUSD: 1.27, USDJPY: 150.2, AUDUSD: 0.66, USDCAD: 1.36, USDCHF: 0.885, USDCNH: 7.25, USDTWI: 121.4,
    XAUUSD: 2400, XAGUSD: 30, WTIUSD: 78, BRENTUSD: 82, NATGAS: 2.8,
    SPX: 5200, NDX: 18000, DJI: 39000, DAX: 18500, NIKKEI: 39000,
    US02Y: 4.1, US05Y: 4.2, US10Y: 4.3, US30Y: 4.45,
    USHYOAS: 3.1, USIGOAS: 1.0, MORTGAGE30: 6.8, HOMEPRICE: 320, VNQ: 88
};

/**
 * skew: where this venue's level sits away from the base price.
 * halfSpread: null for a venue that publishes no bid/ask at all.
 * sizes: true only where the venue publishes a size next to its price.
 */
const VENUE_BOOK = {
    binance: { skew: 0.00010, halfSpread: 0.00020, sizes: true },
    okx: { skew: -0.00010, halfSpread: 0.00010, sizes: true },
    yahoo: { skew: 0.00020, halfSpread: null },
    stooq: { skew: -0.00030, halfSpread: null },
    /* Twelve Data's book sits a little lower and is the wider one — enough
     * that it never owns the best bid, and not wide enough to become a
     * crossing (arbitrage-looking) book against the tighter venues. */
    twelvedata: { skew: -0.00030, halfSpread: 0.00050 },
    alphavantage: { skew: -0.00020, halfSpread: 0.00015 },
    fred: { skew: 0, halfSpread: null }
};

function isoDay(at) { return new Date(at).toISOString().slice(0, 10); }
function isoTime(at) { return new Date(at).toISOString().slice(11, 19); }
function isoStamp(at) { return `${isoDay(at)} ${isoTime(at)}`; }
function round(value) { return Number(Number(value).toFixed(6)); }

function levelOf(instrumentId) {
    const base = BASE_PRICE[instrumentId];
    if (!Number.isFinite(base)) throw new RangeError(`fixture: no base price for ${instrumentId}`);
    return base;
}

/** The book one venue shows for one instrument at one moment. */
function bookOf(instrumentId, venue, at) {
    const base = levelOf(instrumentId);
    const shape = VENUE_BOOK[venue];
    if (!shape) throw new RangeError(`fixture: no book for ${venue}`);
    const level = round(base * (1 + shape.skew));
    const half = shape.halfSpread === null ? null : round(base * shape.halfSpread);
    return {
        at,
        level,
        bid: half === null ? null : round(level - half),
        ask: half === null ? null : round(level + half),
        open: round(level - base * 0.0005),
        high: round(level + base * 0.001),
        low: round(level - base * 0.001),
        close: level,
        volume: shape.sizes ? 100 : 1000,
        bidSize: shape.sizes ? 2.5 : null,
        askSize: shape.sizes ? 1.5 : null
    };
}

/* ------------------------------------------------------------
 * One answer per venue, in the shape that venue really sends.
 * ---------------------------------------------------------- */

const PAYLOADS = {
    yahoo: (instrument, at) => {
        const book = bookOf(instrument.id, "yahoo", at);
        const seconds = Math.floor(at / 1000);
        return {
            chart: {
                result: [{
                    meta: {
                        symbol: instrument.symbols.yahoo,
                        currency: instrument.quote || "USD",
                        dataGranularity: "1m",
                        regularMarketPrice: book.level,
                        regularMarketTime: seconds
                    },
                    timestamp: [seconds],
                    indicators: { quote: [{ open: [book.open], high: [book.high], low: [book.low], close: [book.close], volume: [book.volume] }] }
                }],
                error: null
            }
        };
    },

    stooq: (instrument, at) => {
        const book = bookOf(instrument.id, "stooq", at);
        const row = [instrument.symbols.stooq, isoDay(at), isoTime(at), book.open, book.high, book.low, book.close, book.volume].join(",");
        return `Symbol,Date,Time,Open,High,Low,Close,Volume\n${row}\n`;
    },

    twelvedata: (instrument, at) => {
        const book = bookOf(instrument.id, "twelvedata", at);
        return {
            symbol: instrument.symbols.twelvedata,
            exchange: "FX",
            currency: instrument.quote || "USD",
            datetime: isoStamp(at),
            timestamp: Math.floor(at / 1000),
            open: String(book.open),
            high: String(book.high),
            low: String(book.low),
            close: String(book.close),
            volume: String(book.volume),
            bid: String(book.bid),
            ask: String(book.ask)
        };
    },

    alphavantage: (instrument, at) => {
        const book = bookOf(instrument.id, "alphavantage", at);
        /* The provider itself picks the function: an FX instrument (from+to)
         * gets the realtime exchange rate, anything else the daily quote. */
        if (instrument.from && instrument.to) {
            return {
                "Realtime Currency Exchange Rate": {
                    "1. From_Currency Code": instrument.from,
                    "3. To_Currency Code": instrument.to,
                    "5. Exchange Rate": String(book.level),
                    "6. Last Refreshed": isoStamp(at),
                    "8. Bid Price": String(book.bid),
                    "9. Ask Price": String(book.ask)
                }
            };
        }
        return {
            "Global Quote": {
                "01. symbol": instrument.symbols.alphavantage,
                "02. open": String(book.open),
                "03. high": String(book.high),
                "04. low": String(book.low),
                "05. price": String(book.level),
                "06. volume": String(book.volume),
                "07. latest trading day": isoDay(at),
                "08. previous close": String(book.open)
            }
        };
    },

    fred: (instrument, at) => {
        const book = bookOf(instrument.id, "fred", at);
        return {
            realtime_start: isoDay(at),
            realtime_end: isoDay(at),
            observations: [
                { date: isoDay(at), value: String(book.level) },
                { date: isoDay(at - 86_400_000), value: String(round(book.level - 0.01)) }
            ]
        };
    },

    binance: (instrument) => {
        const book = bookOf(instrument.id, "binance", START);
        /* bookTicker carries no timestamp and no OHLCV: BBO only. */
        return {
            symbol: instrument.symbols.binance,
            bidPrice: String(book.bid),
            bidQty: String(book.bidSize),
            askPrice: String(book.ask),
            askQty: String(book.askSize)
        };
    },

    okx: (instrument, at) => {
        const book = bookOf(instrument.id, "okx", at);
        return {
            code: "0",
            msg: "",
            data: [{
                instId: instrument.symbols.okx,
                instType: "SPOT",
                last: String(book.level),
                lastSz: "1",
                askPx: String(book.ask),
                askSz: String(book.askSize),
                bidPx: String(book.bid),
                bidSz: String(book.bidSize),
                open24h: String(book.open),
                high24h: String(book.high),
                low24h: String(book.low),
                vol24h: String(book.volume),
                volCcy24h: "100",
                ts: at
            }]
        };
    }
};

/* ------------------------------------------------------------
 * The stub client answers the URL the collector really built, so a
 * wrong symbol or a wrong endpoint fails the fixture, not the network.
 * ---------------------------------------------------------- */

/** venue → (provider symbol → instrument), straight off the catalog. */
function symbolIndex(catalog) {
    const index = new Map();
    for (const instrument of catalog.instruments()) {
        for (const [venue, symbol] of Object.entries(instrument.symbols)) {
            if (!index.has(venue)) index.set(venue, new Map());
            index.get(venue).set(symbol, instrument);
        }
    }
    return index;
}

/** The provider's spelling — read back out of the request the collector built. */
function symbolOf(venue, url) {
    const parsed = new URL(url);
    const search = parsed.searchParams;
    if (venue === "yahoo") return decodeURIComponent(parsed.pathname.split("/").pop());
    if (venue === "stooq") return search.get("s");
    if (venue === "fred") return search.get("series_id");
    if (venue === "okx") return search.get("instId");
    if (venue === "alphavantage") return search.get("symbol") || `${search.get("from_currency") || ""}${search.get("to_currency") || ""}`;
    return search.get("symbol");
}

function instrumentOf(index, venue, url) {
    const symbol = symbolOf(venue, url);
    const instrument = index.get(venue) ? index.get(venue).get(symbol) : null;
    if (!instrument) throw new RangeError(`fixture: no instrument for ${venue}:${symbol}`);
    return instrument;
}

/**
 * @param {object} options
 * @param {{at:number}} options.clock   fixture clock (payloads follow it)
 * @param {object} [options.failures]   venue → failure (mutable, by reference)
 */
function stubClient({ clock, failures = {} } = {}) {
    const index = symbolIndex(defaultCatalog());
    const calls = [];

    return {
        calls,
        async get(venue, url, options = {}) {
            calls.push({ venue, url, parse: options.parse });
            const failure = failures[venue];
            if (failure) {
                return { ok: false, status: failure.status || 500, reason: failure.reason || "HTTP 500", url, data: null };
            }
            return { ok: true, status: 200, reason: null, url, data: PAYLOADS[venue](instrumentOf(index, venue, url), clock.at) };
        },
        stats: () => ({ stub: true, calls: calls.length }),
        acquire: async () => 1,
        intervalOf: () => 0,
        reset: () => 0,
        apiKeyFor: () => null
    };
}

/** A collector on a hand-held clock, with no network and no waiting. */
function harness({ clock = { at: START }, failures = {}, env = ALL_KEYS, collector: overrides = {} } = {}) {
    const client = stubClient({ clock, failures });
    return {
        clock,
        client,
        failures,
        calls: client.calls,
        collector: createCollector({ client, now: () => clock.at, sleep: async () => {}, env, ...overrides })
    };
}

/* ============================================================
 * The sweep
 * ============================================================ */

test("one sweep asks every ready venue and accounts for every answer", async () => {
    const { collector, client } = harness();

    assert.deepEqual(Object.keys(collector.status().venues), [], "nothing is scheduled before the first sweep");

    const sweep = await collector.pollOnce();
    const status = collector.status();

    assert.equal(status.planned, 75, "30 instruments × the venues that can quote them");
    assert.equal(sweep.venues, 7);
    assert.equal(sweep.requested, 75);
    assert.equal(sweep.readings, 75, "every venue answered in its own shape, and every answer parsed");
    assert.equal(sweep.rejected, 0);
    assert.equal(sweep.published, 75, "with no bus attached the bridge still returns the entry it built");
    assert.deepEqual(sweep.failedVenues, []);
    assert.deepEqual(sweep.refusals, []);
    assert.equal(client.calls.length, 75);

    const asked = {};
    for (const report of sweep.reports) {
        asked[report.venue] = report.requested;
        assert.equal(report.readings, report.requested, `${report.venue} served every instrument it was asked for`);
    }
    assert.deepEqual(asked, { yahoo: 20, stooq: 22, twelvedata: 12, alphavantage: 6, fred: 9, binance: 3, okx: 3 });

    assert.equal(status.engine.instruments, 30);
    assert.equal(status.engine.readings, 75);
    assert.equal(status.engine.rejected, 0);
});

test("a venue is asked on its own cadence, not once per sweep", async () => {
    const { collector, clock, calls } = harness();

    const first = await collector.pollOnce();
    assert.equal(first.venues, 7);

    clock.at += 60_000; /* a minute: only the crypto venues have moved */
    const second = await collector.pollOnce();
    assert.deepEqual(second.reports.map((report) => report.venue).sort(), ["binance", "okx"]);
    assert.equal(second.requested, 6, "three instruments on two crypto venues");
    assert.equal(second.readings, 6);

    const status = collector.status();
    assert.equal(status.venues.yahoo.sweeps, 1);
    assert.equal(status.venues.binance.sweeps, 2);
    assert.equal(status.venues.yahoo.dueInMs, 60_000, "Yahoo is halfway through its two minutes");
    assert.equal(status.venues.fred.dueInMs, 86_400_000 - 60_000, "FRED is a daily series");
    assert.equal(status.venues.stooq.dueInMs, 43_200_000 - 60_000, "Stooq answers once a day");

    clock.at += 60_000; /* two minutes after the first sweep */
    const third = await collector.pollOnce();
    assert.deepEqual(third.reports.map((report) => report.venue).sort(), ["binance", "okx", "twelvedata", "yahoo"]);
    assert.equal(third.readings, 20 + 12 + 3 + 3, "the minute venues came back, the daily ones did not");
    assert.equal(calls.filter((call) => call.venue === "fred").length, 9, "and the daily venue was asked exactly once");
});

test("a failing venue is dropped for the rest of the sweep, backed off, and invited back", async () => {
    const failures = { stooq: { status: 503, reason: "HTTP 503" } };
    const { collector, clock } = harness({ failures });

    const first = await collector.pollOnce();
    const stooq = first.reports.find((report) => report.venue === "stooq");

    assert.equal(stooq.requested, 1, "the unhappy venue is asked once, then left alone for this sweep");
    assert.equal(stooq.failed, "HTTP 503");
    assert.deepEqual(stooq.refusals, [{ instrument: "EURUSD", reason: "HTTP 503" }]);
    assert.deepEqual(first.failedVenues, [{ venue: "stooq", reason: "HTTP 503" }]);
    assert.equal(first.venues, 7, "the other six venues still ran");
    assert.equal(first.requested, 54, "the rest of Stooq's requests never happened");
    assert.equal(first.readings, 53);
    assert.equal(first.rejected, 0);

    const backedOff = collector.status().venues.stooq;
    assert.equal(backedOff.consecutiveFailures, 1);
    assert.equal(backedOff.failures, 1);
    assert.equal(backedOff.dueInMs, 900_000, "a daily cadence doubled is capped at 15 minutes");

    delete failures.stooq; /* the venue is healthy again */
    clock.at += 60_000;
    const quiet = await collector.pollOnce();
    assert.deepEqual(quiet.reports.map((report) => report.venue).sort(), ["binance", "okx"], "a backed-off venue is not retried on the next tick");

    clock.at += 840_000; /* exactly when the backoff elapses */
    const back = await collector.pollOnce();
    const recovered = back.reports.find((report) => report.venue === "stooq");
    assert.ok(recovered, "the venue is asked again once its backoff elapsed");
    assert.equal(recovered.readings, 22);
    assert.equal(recovered.failed, null);

    const healthy = collector.status().venues.stooq;
    assert.equal(healthy.consecutiveFailures, 0, "a venue that answers is healthy again");
    assert.equal(healthy.dueInMs, 43_200_000, "and returns to its own cadence");

    /* A live venue: the 30s floor applies instead of the cap. */
    const throttled = harness({ failures: { binance: { status: 429, reason: "HTTP 429" } } });
    const rateLimited = await throttled.collector.pollOnce();
    assert.equal(rateLimited.readings, 72, "only Binance's three instruments were lost");
    assert.equal(throttled.collector.status().venues.binance.dueInMs, 60_000, "5s cadence, 30s floor, doubled once");
});

/* ============================================================
 * Narrowing the plan — without narrowing the honesty
 * ============================================================ */

test("venue, instrument and market filters all narrow the plan", async () => {
    const narrowed = harness({ collector: { venues: ["binance", "okx"], instruments: ["BTCUSDT", "SOLUSDT"] } });
    const sweep = await narrowed.collector.pollOnce();

    assert.deepEqual(sweep.reports.map((report) => report.venue).sort(), ["binance", "okx"]);
    assert.equal(sweep.requested, 4, "two instruments × two venues");
    assert.equal(narrowed.collector.status().planned, 4);
    assert.equal(narrowed.collector.snapshot("ETHUSDT"), null, "an instrument outside the filter is never asked");
    assert.ok(narrowed.collector.snapshot("BTCUSDT"));

    const bonds = harness({ collector: { markets: [ASSET_CLASS.BONDS] } });
    const bondSweep = await bonds.collector.pollOnce();
    assert.deepEqual(bondSweep.reports.map((report) => report.venue).sort(), ["fred", "stooq"]);
    assert.equal(bondSweep.requested, 8, "four yields, two venues");

    const view = bonds.collector.snapshot("US10Y");
    const fredLevel = bookOf("US10Y", "fred", START).level;
    const stooqLevel = bookOf("US10Y", "stooq", START).level;
    assert.equal(view.venueCount, 2);
    close(view.mid, (fredLevel + stooqLevel) / 2);
    close(view.spreadAbs, Math.abs(fredLevel - stooqLevel));
    assert.equal(view.tradableSpreadBps, null, "neither venue publishes bid/ask, so no tradable spread is claimed");
    assert.equal(view.bidAskSpreadBps, null);
    assert.equal(view.depthImbalance, null);
    assert.deepEqual(view.depthVenues, []);
});

test("a sweep can be published: every entry is a valid envelope on the liquidity axis", async () => {
    const bus = {
        published: [],
        publish(entry) { this.published.push(entry); return true; }
    };
    const sinked = [];
    const { collector } = harness({
        collector: { bus, sink: (entry) => sinked.push(entry), markets: [ASSET_CLASS.CRYPTO], venues: ["binance"] }
    });

    const sweep = await collector.pollOnce();
    assert.equal(sweep.requested, 3);
    assert.equal(bus.published.length, 3);
    assert.equal(sinked.length, 3, "the sink receives the same entries the bus got");

    for (const entry of bus.published) {
        const validation = validateEnvelope(entry.envelope);
        assert.equal(validation.ok, true, `invalid envelope: ${validation.errors.join("; ")}`);

        assert.equal(entry.market, LIQUIDITY_MARKET, "the bus axis belongs to this collector");
        assert.equal(entry.exchange, ASSET_CLASS.CRYPTO);
        assert.equal(entry.symbol, entry.envelope.meta.symbol);

        const meta = entry.envelope.meta;
        assert.equal(meta.sourceType, "liquidity");
        assert.equal(meta.assetClass, ASSET_CLASS.CRYPTO);
        assert.equal(meta.marketType, "spot", "the venue word spot/futures is the frame's, not the venue's");
        assert.equal(meta.exchange, "binance");
        assert.equal(meta.eventType, "ticker", "one book level is a BBO, not an orderbook");

        assert.ok(entry.envelope.payload.price > 0);
        assert.ok(entry.envelope.payload.bid < entry.envelope.payload.ask);
        assert.equal(entry.envelope.payload.flow.venueCount, 1);
        assert.equal(entry.envelope.payload.flow.cvdMethod, CVD_METHOD);
    }

    assert.deepEqual(bus.published.map((entry) => entry.symbol).sort(), ["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
});

/* ============================================================
 * Running, stopping and being told what to do
 * ============================================================ */

test("run() sweeps on a schedule, counts honestly, and stops when told", async () => {
    const { collector, clock } = harness();
    const seen = [];
    const summary = await collector.run({
        sweeps: 3,
        interval: 1000,
        onSweep: (sweep) => {
            seen.push(sweep);
            clock.at += 60_000; /* the next sweep happens a minute later */
        }
    });

    assert.deepEqual(seen.map((sweep) => sweep.venues), [7, 2, 4], "busy, then the crypto venues, then the minute venues");
    assert.equal(summary.sweeps, 3);
    assert.equal(summary.readings, 75 + 6 + 38);
    assert.equal(summary.rejected, 0);
    assert.equal(summary.failedVenues, 0);
    assert.equal(summary.stopped, null, "a counted run is finished, not stopped");
    assert.ok(summary.finishedAt >= summary.startedAt);

    const idle = harness();
    const idleSummary = await idle.collector.run({ interval: 1000, stopWhenIdle: true });
    assert.equal(idleSummary.sweeps, 3, "one busy sweep, then two quiet ticks");
    assert.equal(idleSummary.readings, 75);
    assert.equal(idleSummary.stopped, "idle", "nothing due twice in a row means there is nothing left to wait for");

    const controller = new AbortController();
    controller.abort();
    const aborted = await collector.run({ sweeps: null, signal: controller.signal });
    assert.equal(aborted.sweeps, 0, "an aborted run does not sweep once to be polite");
    assert.equal(aborted.stopped, "aborted");
});

test("the runnable entry point parses its flags without inventing values", () => {
    assert.deepEqual(parseArgs([]), { markets: null, venues: null, instruments: null, interval: null, sweeps: null, bus: false, out: OUT_FILE });

    const full = parseArgs([
        "--markets", "forex,commodities",
        "--venues", "yahoo, stooq",
        "--instruments", "EURUSD",
        "--interval", "30000",
        "--sweeps", "2",
        "--out", "/tmp/liquidity.ndjson",
        "--bus"
    ]);
    assert.deepEqual(full.markets, ["forex", "commodities"]);
    assert.deepEqual(full.venues, ["yahoo", "stooq"], "a space after the comma is trimmed");
    assert.deepEqual(full.instruments, ["EURUSD"]);
    assert.equal(full.interval, 30_000);
    assert.equal(full.sweeps, 2);
    assert.equal(full.bus, true);
    assert.equal(full.out, "/tmp/liquidity.ndjson");

    const noise = parseArgs(["--nonsense", "1", "--sweeps", "later"]);
    assert.ok(Number.isNaN(noise.sweeps), "a non-numeric count is NaN, which the server reads as \"run until stopped\"");
    assert.equal(noise.out, OUT_FILE, "an unknown flag leaves the defaults alone");
    assert.equal(noise.bus, false);
});

/* ============================================================
 * The claim of the sub-phase: six markets on one axis
 * ============================================================ */

test("six markets on one axis: every market reports, and only crypto publishes depth", async () => {
    const { collector } = harness();
    await collector.pollOnce();
    const views = collector.snapshots();

    assert.equal(Object.keys(views).length, 30);

    const byMarket = {};
    for (const view of Object.values(views)) byMarket[view.assetClass] = (byMarket[view.assetClass] || 0) + 1;
    assert.deepEqual(Object.keys(byMarket).sort(), [...SIX_MARKETS].sort(), "all six markets reported in the same sweep");
    assert.deepEqual(byMarket, { crypto: 3, forex: 8, commodities: 5, indices: 5, bonds: 4, realestatecredit: 5 });

    for (const view of Object.values(views)) {
        assert.equal(view.stale, false, `${view.instrument} was quoted a moment ago`);
        assert.ok(view.mid > 0, `${view.instrument} has a price`);
        assert.equal(view.cvdMethod, CVD_METHOD, "the proxy is labelled on every instrument");
        assert.equal(view.cvdDay, isoDay(START));
    }

    const btc = views.BTCUSDT;
    assert.equal(btc.venueCount, 4);
    assert.equal(btc.longVenue, "binance");
    assert.equal(btc.shortVenue, "okx");
    assert.ok(btc.tradableSpreadBps > 0, "two crypto books really do cross");
    assert.equal(btc.bidAskVenue, "okx", "the tightest single book is OKX's");
    assert.deepEqual(btc.depthVenues, ["binance", "okx"]);
    close(btc.depthImbalance, (2.5 + 2.5 - 1.5 - 1.5) / (2.5 + 2.5 + 1.5 + 1.5));

    assert.equal(views.SOLUSDT.venueCount, 2, "SOL is on the two crypto venues only");
    assert.deepEqual(views.SOLUSDT.depthVenues, ["binance", "okx"]);

    const eurusd = views.EURUSD;
    assert.equal(eurusd.venueCount, 4);
    assert.equal(eurusd.depthVenues.length, 0, "no FX venue here publishes sizes");
    /* The tighter venue owns both sides here: the engine then reports that
     * venue's own book as the tradable spread instead of pretending a
     * second venue is involved. */
    assert.equal(eurusd.longVenue, "alphavantage");
    assert.equal(eurusd.shortVenue, "alphavantage");
    assert.equal(eurusd.bidAskVenue, "alphavantage", "the tighter book belongs to Alpha Vantage");
    close(eurusd.tradableSpreadBps, eurusd.bidAskSpreadBps);

    assert.equal(views.SPX.venueCount, 2, "an index is quoted by the two key-free venues");
    assert.equal(views.SPX.tradableSpreadBps, null, "no index venue publishes a book");

    assert.equal(views.WTIUSD.tradableSpreadBps, null, "one book is not a cross-venue spread");
    assert.equal(views.WTIUSD.bidAskVenue, "twelvedata");
    assert.equal(views.WTIUSD.assetClass, ASSET_CLASS.COMMODITIES);

    assert.equal(views.USDTWI.venueCount, 1, "a macro series is single-source on purpose");
    assert.equal(views.USDTWI.assetClass, ASSET_CLASS.FOREX);
});


/* ============================================================
 * A stop is a stop: it does not wait for a quiet venue or a cadence
 * ============================================================ */

test("a stop ends the sweep in flight, and a cancelled venue is not a failed one", async () => {
    const clock = { at: START };
    const controller = new AbortController();

    /* A venue that accepts the connection and then says nothing, but does
     * give up when it is asked to — like a real fetch with a signal. */
    const quiet = {
        get: (venue, url, { signal } = {}) =>
            new Promise((resolve) => {
                const settle = () => resolve({ ok: false, status: null, data: null, reason: "cancelled", url });
                if (signal && signal.aborted) return settle();
                if (signal) return signal.addEventListener("abort", settle, { once: true });
            }),
        stats: () => ({ quiet: true })
    };

    const { collector } = harness({
        clock,
        collector: { client: quiet, markets: ["crypto"], venues: ["binance"], intervalMs: 600_000 }
    });

    const running = collector.run({ signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    const summary = await running;

    assert.equal(summary.stopped, "aborted");
    assert.equal(summary.sweeps, 1, "the sweep in flight ended with the stop instead of running its schedule");
    assert.equal(summary.failedVenues, 0, "being stopped is not a venue failing");
    assert.equal(collector.status().venues.binance.consecutiveFailures, 0, "and the venue is not backed off for it");
});

test("a stop cuts the pause between sweeps short, however long the cadence is", async () => {
    const clock = { at: START };
    const controller = new AbortController();
    const pauses = [];

    const { collector } = harness({
        clock,
        collector: {
            intervalMs: 600_000,
            /* The pause is entered, the caller then stops, and the pause must
             * end there: a sleep that never finishes is the honest stand-in
             * for "the cadence is still running". */
            sleep: () => {
                pauses.push("asked");
                controller.abort();
                return new Promise(() => {});
            }
        }
    });

    const summary = await collector.run({ signal: controller.signal });

    assert.deepEqual(pauses, ["asked"], "the loop asked for its cadence pause…");
    assert.equal(summary.stopped, "aborted", "…and the caller's stop ended it");
    assert.equal(summary.sweeps, 1, "no second sweep was started after the stop");
});


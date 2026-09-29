/**
 * A7 — The runnable consumer: analytics-engine/server.cjs
 * ============================================================
 * The engine is only useful if something runs it. This test walks the
 * entry point without a network and without a realtime service: flags,
 * the honesty of resolveBus (a bus, null, or a reason — never a stand-in),
 * and the streaming path (bus entry → engine → one NDJSON reading), plus
 * the promise that the server's own output never comes back in and that an
 * attached process keeps working until it is told to stop.
 *
 * Run: node analytics-engine/tests/server.test.cjs
 * ============================================================
 */
const assert = require("assert");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const server = require(path.join(ROOT, "server.cjs"));
const {
    createEnvelope,
    ASSET_CLASS,
    MARKET_TYPE,
    SOURCE_TYPE
} = require(path.join(ROOT, "..", "collector", "crypto", "common", "envelope.cjs"));

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `A7: ${msg}`);
    checks++;
};

/** EventBus double that mimics collector/crypto/realtime/core/event-bus.cjs. */
function fakeBus(clock) {
    const state = { taps: new Set(), history: [] };

    return {
        state,
        subscribe(fn) {
            state.taps.add(fn);
            return () => state.taps.delete(fn);
        },
        publish(entry, context = {}) {
            const wrapped = {
                channel: [context.market, context.exchange, context.symbol, entry.event].join(":"),
                event: entry.event,
                market: context.market || null,
                exchange: context.exchange || null,
                symbol: context.symbol || null,
                at: clock(),
                payload: entry
            };

            state.history.push(wrapped);
            for (const tap of [...state.taps]) tap(wrapped);
            return wrapped;
        }
    };
}

function flags() {
    const bare = server.parseArgs([]);
    ok(bare.bus === false && bare.once === false, "no flag, no bus: the server starts as a reporter");
    ok(bare.out === server.OUT_FILE && bare.status === server.DEFAULT_STATUS_MS, "the defaults are named constants");
    ok(server.OUT_FILE.endsWith(path.join("data", "analytics", "analytics.ndjson")), "the default log lives under data/analytics");

    const all = server.parseArgs(["--bus", "--once", "--out", "/tmp/x.ndjson", "--status", "5000"]);
    ok(all.bus === true && all.once === true && all.out === "/tmp/x.ndjson" && all.status === 5000, "every flag is parsed");
    ok(server.parseArgs(["--no-file"]).out === null, "--no-file means no file, not a file called null");
    ok(server.parseArgs(["--nope", "x"]).bus === false, "an unknown flag changes nothing");
}

function resolveBusIsHonest() {
    const resolved = server.resolveBus();
    const isBus = resolved !== null && typeof resolved.publish === "function" && typeof resolved.subscribe === "function";
    const isReason = resolved !== null && typeof resolved.error === "string";

    ok(resolved === null || isBus || isReason,
        "resolveBus answers with a bus, null, or a reason — never a stand-in");
    ok(!(isBus && isReason), "and never both at once");
}

function derivativesEnvelope({ exchange = "binance", symbol = "BTCUSDT" } = {}) {
    return createEnvelope({
        assetClass: ASSET_CLASS.CRYPTO,
        sourceType: SOURCE_TYPE.DERIVATIVES,
        marketType: MARKET_TYPE.FUTURES,
        exchange,
        symbol,
        eventType: "open_interest",
        data: { oiUsd: 1_000_000, markPrice: 100 },
        timestamp: 1_700_000_000_000
    });
}

/** A six-market quote, exactly as the liquidity collector publishes it. */
function goldEnvelope() {
    return createEnvelope({
        assetClass: ASSET_CLASS.COMMODITIES,
        sourceType: SOURCE_TYPE.LIQUIDITY,
        exchange: "yahoo",
        symbol: "XAUUSD",
        eventType: "ticker",
        data: { price: 2_400, bid: 2_399.5, ask: 2_400.5, evidence: { bidAsk: true, depth: false, candle: false, cvd: "proxy" } },
        timestamp: 1_700_000_000_000
    });
}

/** The entry shape every collector's bus bridge publishes. */
function collectorEntry(envelope) {
    return {
        event: envelope.meta.eventType,
        market: envelope.meta.assetClass,
        exchange: envelope.meta.exchange,
        symbol: envelope.meta.symbol,
        envelope
    };
}


function streamsEveryReading() {
    let at = 1_700_000_000_000;
    const bus = fakeBus(() => at);
    const lines = [];
    const instance = server.createAnalyticsServer({
        bus,
        emit: (line) => lines.push(line),
        statusMs: 0,
        now: () => at
    });

    ok(instance.stats().subscribers === 1, "the server listens on the bus");
    ok(instance.status().attached === true, "and says so");
    ok(instance.status().routes.includes("ticker"), "the six-market input word is among the routed event types");
    ok(instance.status().modules.length === 9, "with all nine modules");

    bus.publish(collectorEntry(derivativesEnvelope()), { market: "futures", exchange: "binance", symbol: "BTCUSDT" });
    ok(lines.length === 2 && lines[0].kind === "reading" && lines[1].kind === "reading",
        "a bus entry became one NDJSON reading per question the frame answers");
    ok(lines[0].topic === "analytics.crypto.btc.open_interest", "the line names the topic");
    ok(lines[1].topic === "analytics.crypto.btc.market_leverage_risk", "the second line is the leverage state the frame moved");
    ok(lines[0].channel === "analytics:crypto:BTCUSDT:open_interest", "and the bus channel");
    ok(lines[0].envelope.meta.sourceType === SOURCE_TYPE.ANALYTICS, "and carries the whole analytics envelope");
    ok(instance.stats().ingested === 1, "one ingest, one reading per question");
    ok(bus.state.history.length === 3, "the bus saw the input and both readings");

    at += 60_000;
    bus.publish(collectorEntry(goldEnvelope()), { market: "liquidity", exchange: "commodities", symbol: "XAUUSD" });
    const topics = lines.map((line) => line.topic);
    ok(topics.includes("analytics.commodities.xau.price_reading"), "a six-market frame is turned into a price reading");
    ok(topics.includes("analytics.commodities.xau.liquidity_flow"), "and a flow reading");
    ok(topics.every((topic) => topic.split(".").length === 4), "every topic has exactly four segments");
    ok(instance.stats().ingested === 2, "the engine's own output never came back in as an input");

    const final = instance.stop();
    ok(final.ingested === 2 && final.published === lines.length, "stop returns the final counters");
    ok(instance.stats().subscribers === 0, "and detaches from the bus");

    const before = instance.stats().ingested;
    bus.publish(collectorEntry(derivativesEnvelope({ exchange: "okx" })), { market: "futures", exchange: "okx", symbol: "BTCUSDT" });
    ok(instance.stats().ingested === before, "after stop the server is deaf to the bus");
}

function noBusIsReportedNotFaked() {
    const instance = server.createAnalyticsServer({ emit: () => {}, statusMs: 0 });

    ok(instance.stats().subscribers === 0, "without a bus there is nothing to listen to");
    ok(instance.status().attached === false, "and the status says exactly that");
    ok(instance.status().routes.length > 0, "the routes are still known — the report is useful without a bus");

    const final = instance.stop();
    ok(final.ingested === 0 && final.published === 0, "and nothing was invented");
}

/**
 * An attached process is a *working* process.
 * The bus it watches and its log both live in it and the status heartbeat is
 * deliberately unref'd, so if nothing else holds the event loop open Node
 * finds it empty and exits 0 in the middle of the work — the program is cut
 * off with a success code. This runs the real entry point in a child, with
 * the realtime service started in that same child, and asserts the child is
 * still there after the boot, then stops it and reads the final report.
 */
function attachedProcessStaysAlive() {
    const realtimeFile = path.join(ROOT, "..", "collector", "crypto", "realtime", "index.cjs");
    const serverFile = path.join(ROOT, "server.cjs");
    const child = spawn(process.execPath, ["-e", [
        `require(${JSON.stringify(realtimeFile)}).getService(); /* this process runs the service */`,
        `process.argv = ["node", "server.cjs", "--bus", "--no-file", "--status", "100"];`,
        `require(${JSON.stringify(serverFile)}).main().catch((err) => {`,
        `    console.error("CHILD fatal: " + ((err && err.stack) || err));`,
        `    process.exitCode = 1;`,
        `});`
    ].join("\n")], { stdio: ["ignore", "pipe", "pipe"] });

    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });

    return new Promise((resolve, reject) => {
        const tooLate = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`A7: the child never honoured SIGTERM\n${output}`));
        }, 8000);

        child.on("exit", (code) => {
            clearTimeout(tooLate);
            try {
                ok(output.includes("[analytics] bus: attached"), `the child attached to the bus this process runs\n${output}`);
                ok(code === 0, `SIGTERM is a clean stop (exit ${code})\n${output}`);
                ok(output.includes("[analytics] done:"), "and the stop reports the final counters");
                resolve();
            } catch (err) {
                reject(err);
            }
        });

        /* Long enough for the child to boot and reach its await: an unheld
         * process is gone in a few milliseconds, so a live child is a proof. */
        setTimeout(() => {
            try {
                ok(child.exitCode === null && child.signalCode === null,
                    `after 1.2s the attached process is still running, not cut off\n${output}`);
            } catch (err) {
                child.kill("SIGKILL");
                reject(err);
                return;
            }
            child.kill("SIGTERM");
        }, 1200);
    });
}

(async () => {
    flags();
    resolveBusIsHonest();
    streamsEveryReading();
    noBusIsReportedNotFaked();
    await attachedProcessStaysAlive();

    console.log(`A7 server: ${checks} checks passed`);
})().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
});

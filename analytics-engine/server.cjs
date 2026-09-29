/* ============================================================
 * File: analytics-engine/server.cjs
 * Section: analytics-engine
 * Version: 1.0.0
 *
 * Role:
 *   The runnable entry point of the analytical layer — the consumer half of
 *   the collector⇄analytics seam (A6).
 *
 *     node analytics-engine/server.cjs --bus
 *     node analytics-engine/server.cjs --bus --out data/analytics/analytics.ndjson
 *     node analytics-engine/server.cjs --bus --once        # attach, report, exit
 *     node analytics-engine/server.cjs                     # no bus: report and stop
 *
 *   The bus is taken from the running realtime service, exactly the way
 *   collector/liquidity_6markets/server.cjs takes it, so the process never
 *   invents a bus of its own. Once attached, every envelope a collector
 *   publishes — realtime, derivatives, the six markets or the on-chain layer
 *   — is turned into an analytics reading on
 *   analytics.<assetClass>.<asset>.<event> and written here as one NDJSON
 *   line (topic, channel, event, symbol, full envelope).
 *
 *   The engine's own output travels on the same bus. It is never fed back
 *   in (core/egress.cjs marks analytics frames, engine.attach() skips them),
 *   which is why this process can run next to the collectors forever without
 *   doubling its own traffic.
 *
 *   Without a bus the process still says what it would do — the routes it
 *   knows and the modules it holds — and stops, instead of pretending.
 *
 *   Attached, it stays until SIGINT/SIGTERM — and it holds itself open on
 *   purpose: this process owns no socket of its own (the bus it watches and
 *   its log both live here), so without a handle of its own Node would find
 *   an empty event loop and exit 0 in the middle of the work.
 * ============================================================ */

const fs = require("node:fs");
const path = require("node:path");

const { createEngine } = require("./engine.cjs");

/** Where the readings are appended when the caller does not name a file. */
const OUT_FILE = path.join(__dirname, "..", "data", "analytics", "analytics.ndjson");
const DEFAULT_STATUS_MS = 60_000;
/**
 * How often an attached process tells the event loop it is still working.
 * The status heartbeat is a report (unref'd, and it may be turned off with
 * --status 0), so liveness is a separate, deliberate handle of its own.
 */
const KEEP_ALIVE_MS = 60_000;

function parseArgs(argv) {
    const options = { bus: false, out: OUT_FILE, status: DEFAULT_STATUS_MS, once: false };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const value = argv[index + 1];
        if (flag === "--bus") options.bus = true;
        else if (flag === "--once") options.once = true;
        else if (flag === "--out") { options.out = value; index += 1; }
        else if (flag === "--status") { options.status = Number(value); index += 1; }
        else if (flag === "--no-file") options.out = null;
    }
    return options;
}

/** The Realtime event bus, when that service is already running. */
function resolveBus() {
    try {
        /* The explicit file: this repo's modules are index.cjs, and Node's
         * directory resolution only knows index.js/index.json/index.node. */
        const realtime = require("../collector/crypto/realtime/index.cjs");
        /* getService() *builds* a service when none exists, so asking for one
         * is not the same as finding one: this process attaches to the bus it
         * really runs, never to a private empty stand-in. */
        const { hasService } = realtime.service;
        if (typeof hasService === "function" && !hasService()) return null;
        const service = typeof realtime.getService === "function" ? realtime.getService() : null;
        return (service && service.runtime && service.runtime.bus) || null;
    } catch (err) {
        return { error: err.message };
    }
}


/**
 * Attach an engine to a bus and stream every reading it produces.
 * @param {object}   [options]
 * @param {object}   [options.bus]       EventBus-compatible (null: engine only)
 * @param {Function} [options.emit]      (line) => void; replaces the file sink
 * @param {object}   [options.out]       writable stream for the NDJSON lines
 * @param {number}   [options.statusMs]  heartbeat interval (0: none)
 * @param {Function} [options.now]       clock
 * @param {Function} [options.log]       one human line per heartbeat
 * @returns {{engine, lines, stop, stats, status}}
 */
function createAnalyticsServer({ bus = null, emit = null, out = null, statusMs = 0, now = Date.now, log = null } = {}) {
    const lines = [];
    const record = typeof emit === "function"
        ? emit
        : (line) => {
            lines.push(line);
            if (out) out.write(`${JSON.stringify(line)}\n`);
        };

    const engine = createEngine({
        bus,
        now,
        sink: (entry) => record({
            kind: "reading",
            at: now(),
            topic: entry.topic,
            channel: entry.channel,
            event: entry.event,
            market: entry.market,
            exchange: entry.exchange,
            symbol: entry.symbol,
            asset: entry.asset,
            envelope: entry.envelope
        })
    });

    const attached = engine.attach(bus);
    let timer = null;

    if (statusMs > 0 && typeof log === "function") {
        timer = setInterval(() => {
            const stats = engine.stats();
            log(`[analytics] ingested ${stats.ingested}, published ${stats.published}, throttled ${stats.throttled}, unrouted ${stats.unrouted}`);
        }, statusMs);
        if (typeof timer.unref === "function") timer.unref();
    }

    function stop() {
        if (timer !== null) { clearInterval(timer); timer = null; }
        engine.detach();
        return engine.stats();
    }

    return {
        engine,
        lines,
        attached,
        stop,
        stats: () => engine.stats(),
        status: () => ({
            attached: engine.unsubscribers.length > 0,
            routes: engine.routes(),
            modules: engine.stats().modules,
            counters: engine.counters
        })
    };
}


async function main() {
    const options = parseArgs(process.argv.slice(2));
    const routes = createEngine({}).routes();

    let bus = null;
    let reason = null;
    if (options.bus) {
        const resolved = resolveBus();
        if (resolved && resolved.error) reason = resolved.error;
        else if (resolved === null) reason = "no realtime service is running (start it, or drop --bus)";
        else bus = resolved;
    }
    if (options.bus && bus === null) console.error(`[analytics] bus unavailable: ${reason}`);

    const out = options.out === null
        ? null
        : (fs.mkdirSync(path.dirname(options.out), { recursive: true }), fs.createWriteStream(options.out, { flags: "a" }));

    const server = createAnalyticsServer({
        bus,
        out,
        statusMs: Number.isFinite(options.status) ? options.status : DEFAULT_STATUS_MS,
        log: console.log
    });

    if (out) {
        out.write(`${JSON.stringify({ kind: "start", at: Date.now(), bus: Boolean(bus), reason, out: options.out, routes, modules: server.stats().modules })}\n`);
    }
    console.log(`[analytics] routed event types: ${routes.join(", ")}`);
    console.log(`[analytics] modules: ${server.stats().modules.join(", ")}`);
    console.log(`[analytics] bus: ${bus ? "attached" : `not attached (${reason || "--bus was not given"})`}`);

    async function finish() {
        const final = server.stop();
        if (out) {
            out.write(`${JSON.stringify({ kind: "summary", at: Date.now(), counters: final })}\n`);
            await new Promise((resolve) => out.end(resolve));
        }
        console.log(`[analytics] done: ${final.ingested} ingested, ${final.published} published, ${final.throttled} throttled`);
        console.log(`[analytics] log: ${options.out || "none"}`);
        return final;
    }

    /* --once — and any run without a bus — reports what it found, then stops. */
    if (options.once || bus === null) return finish();

    /* An attached process owns no socket: the bus it watches and its log live
     * in this process, and the status heartbeat is deliberately unref'd — a
     * report must never be a reason to stay alive. This handle is the process
     * holding itself open, so Node does not find an empty event loop and exit
     * 0 in the middle of the work. */
    const keepAlive = setInterval(() => {}, KEEP_ALIVE_MS);

    const controller = new AbortController();
    process.on("SIGINT", () => { console.log("[analytics] stopping…"); controller.abort(); });
    process.on("SIGTERM", () => { console.log("[analytics] stopping…"); controller.abort(); });

    try {
        await new Promise((resolve) => controller.signal.addEventListener("abort", resolve, { once: true }));
    } finally {
        clearInterval(keepAlive);
    }
    return finish();
}

if (require.main === module) {
    main().catch((err) => {
        console.error(`[analytics] fatal: ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs, resolveBus, createAnalyticsServer, main, OUT_FILE, DEFAULT_STATUS_MS, KEEP_ALIVE_MS };

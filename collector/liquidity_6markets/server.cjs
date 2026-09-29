/* ============================================================
 * File: collector/liquidity_6markets/server.cjs
 * Section: collector/liquidity_6markets
 * Version: 1.0.0
 *
 * Role:
 *   The runnable entry point of the six-market liquidity collector.
 *
 *     node collector/liquidity_6markets/server.cjs --sweeps 3
 *     node collector/liquidity_6markets/server.cjs --markets forex,commodities
 *     node collector/liquidity_6markets/server.cjs --venues yahoo --interval 30000
 *
 *   Every reading is written as one NDJSON line (the same envelope that
 *   would travel on the bus), so a run is inspectable even with no bus
 *   and no API keys: the first line says which venues were ready and
 *   which were missing a key, the last says what happened.
 *
 *   `--bus` additionally publishes onto the Realtime event bus, taken
 *   from the running realtime service, so analytics-engine sees
 *   liquidity:* entries next to its crypto ones. Without it the collector
 *   still works — it just does not pretend the bus is there.
 * ============================================================ */

const fs = require("node:fs");
const path = require("node:path");

const { createCollector, providerReadiness, defaultCatalog } = require("./index.cjs");

const OUT_DIR = path.join(__dirname, "..", "..", "data", "liquidity_6markets");
const OUT_FILE = path.join(OUT_DIR, "liquidity.ndjson");

function parseArgs(argv) {
    const options = { markets: null, venues: null, instruments: null, interval: null, sweeps: null, bus: false, out: OUT_FILE };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const value = argv[index + 1];
        const list = () => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : null);
        if (flag === "--markets") { options.markets = list(); index += 1; }
        else if (flag === "--venues") { options.venues = list(); index += 1; }
        else if (flag === "--instruments") { options.instruments = list(); index += 1; }
        else if (flag === "--interval") { options.interval = Number(value); index += 1; }
        else if (flag === "--sweeps") { options.sweeps = Number(value); index += 1; }
        else if (flag === "--out") { options.out = value; index += 1; }
        else if (flag === "--bus") options.bus = true;
    }
    return options;
}

/** The Realtime event bus, when that service is already running. */
function resolveBus() {
    try {
        /* The explicit file: this repo's modules are index.cjs, and Node's
         * directory resolution only knows index.js/index.json/index.node. */
        const realtime = require("../crypto/realtime/index.cjs");
        /* getService() *builds* a service when none exists, so asking for one
         * is not the same as finding one: a collector attaches to the bus this
         * process really runs, never to a private empty stand-in. */
        const { hasService } = realtime.service;
        if (typeof hasService === "function" && !hasService()) return null;
        const service = realtime.getService();
        return (service && service.runtime && service.runtime.bus) || null;
    } catch (err) {
        return { error: err.message };
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const readiness = providerReadiness();

    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    const out = fs.createWriteStream(options.out, { flags: "a" });
    const write = (line) => out.write(`${JSON.stringify(line)}\n`);

    let bus = null;
    if (options.bus) {
        const resolved = resolveBus();
        if (resolved && resolved.error) console.error(`[bus] unavailable (${resolved.error}) — continuing without it`);
        else if (resolved === null) console.error("[bus] unavailable (no realtime service is running in this process) — continuing without it");
        else bus = resolved;
    }

    const collector = createCollector({
        bus,
        markets: options.markets,
        venues: options.venues,
        instruments: options.instruments,
        ...(Number.isFinite(options.interval) ? { intervalMs: options.interval } : {}),
        sink: (entry) => write({ kind: "entry", channel: entry.channel || null, event: entry.event, market: entry.market, exchange: entry.exchange, symbol: entry.symbol, envelope: entry.envelope })
    });

    const status = collector.status();
    write({ kind: "start", at: Date.now(), bus: Boolean(bus), out: options.out, readiness, markets: status.markets, planned: status.planned, refused: status.refused });
    console.log(`[liquidity] markets: ${status.markets.map((market) => `${market.market}(${market.instruments})`).join(" ")}`);
    console.log(`[liquidity] venues ready: ${readiness.filter((entry) => entry.ready).map((entry) => entry.id).join(", ") || "none"}`);
    console.log(`[liquidity] venues missing a key: ${readiness.filter((entry) => !entry.ready).map((entry) => `${entry.id}:${entry.missingEnv}`).join(", ") || "none"}`);
    console.log(`[liquidity] planned requests per sweep: ${status.planned}, refusals: ${status.refused.length}`);

    const controller = new AbortController();
    process.on("SIGINT", () => { console.log("[liquidity] stopping…"); controller.abort(); });
    process.on("SIGTERM", () => { console.log("[liquidity] stopping…"); controller.abort(); });

    const summary = await collector.run({
        sweeps: Number.isFinite(options.sweeps) ? options.sweeps : null,
        signal: controller.signal,
        onSweep: (sweep) => {
            console.log(`[liquidity] sweep ${sweep.at}: venues ${sweep.venues}, readings ${sweep.readings}, rejected ${sweep.rejected}, failed ${sweep.failedVenues.map((venue) => venue.venue).join("|") || "-"}`);
            for (const refusal of sweep.refusals) console.log(`           refusal ${refusal.venue}/${refusal.instrument}: ${refusal.reason}`);
        }
    });

    const final = collector.status();
    write({ kind: "summary", summary, venues: final.venues, engine: final.engine });
    console.log(`[liquidity] done: sweeps ${summary.sweeps}, readings ${summary.readings}, rejected ${summary.rejected}, stopped ${summary.stopped || "count"}`);
    console.log(`[liquidity] snapshots: ${Object.keys(collector.snapshots()).length} instruments`);
    console.log(`[liquidity] log: ${options.out}`);

    await new Promise((resolve) => out.end(resolve));
    return summary;
}

if (require.main === module) {
    main().catch((err) => {
        console.error(`[liquidity] fatal: ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs, resolveBus, main, OUT_FILE, defaultCatalog };

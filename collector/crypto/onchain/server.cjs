/* ============================================================
 * File: collector/crypto/onchain/server.cjs
 * Section: collector/crypto/onchain
 * Version: 1.0.0
 *
 * Role:
 *   The runnable entry point of the on-chain collector.
 *
 *     node collector/crypto/onchain/server.cjs --polls 1
 *     node collector/crypto/onchain/server.cjs --groups chains,holders --interval 60000
 *     node collector/crypto/onchain/server.cjs --providers mempool --polls 5
 *     node collector/crypto/onchain/server.cjs --bus
 *
 *   Every reading is written as one NDJSON line (the same envelope that
 *   would travel on the bus), so a run is inspectable with no bus and no
 *   API keys: the first line says which subjects exist and which providers
 *   are ready, every entry line is one envelope, and the last line says
 *   what the run did.
 *
 *   `--bus` additionally publishes onto the Realtime event bus, taken from
 *   the running realtime service, so analytics-engine sees onchain:*
 *   entries next to its spot/futures ones. Without it the collector still
 *   works — it just does not pretend the bus is there.
 * ============================================================ */

const fs = require("node:fs");
const path = require("node:path");

const { createCollector, providerReadiness, createSubjectCatalog, SUBJECT_GROUPS, GROUP_IDS } = require("./index.cjs");

const OUT_DIR = path.join(__dirname, "..", "..", "..", "data", "onchain");
const OUT_FILE = path.join(OUT_DIR, "onchain.ndjson");

function parseArgs(argv) {
    const options = { groups: null, tasks: null, providers: null, interval: null, polls: null, bus: false, out: OUT_FILE };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const value = argv[index + 1];
        const list = () => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : null);
        if (flag === "--groups") { options.groups = list(); index += 1; }
        else if (flag === "--tasks") { options.tasks = list(); index += 1; }
        else if (flag === "--providers") { options.providers = list(); index += 1; }
        else if (flag === "--interval") { options.interval = Number(value); index += 1; }
        else if (flag === "--polls" || flag === "--sweeps") { options.polls = Number(value); index += 1; }
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
        const realtime = require("../realtime/index.cjs");
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

/** A catalog of the requested groups, or undefined for the whole one. */
function catalogFor(groups) {
    if (!groups || groups.length === 0) return undefined;
    const unknown = groups.filter((groupId) => !GROUP_IDS.includes(groupId));
    if (unknown.length > 0) throw new RangeError(`unknown group(s) ${unknown.join(", ")} — known: ${GROUP_IDS.join(", ")}`);
    return createSubjectCatalog({ groups: SUBJECT_GROUPS.filter((group) => groups.includes(group.GROUP_ID)) });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const readiness = providerReadiness();
    const catalog = catalogFor(options.groups);

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
        ...(catalog ? { catalog } : {}),
        taskIds: options.tasks,
        providerIds: options.providers,
        ...(Number.isFinite(options.interval) ? { intervalMs: options.interval } : {}),
        onInvalid: (errors, envelope) => write({
            kind: "rejected",
            symbol: envelope && envelope.meta ? envelope.meta.symbol : null,
            event: envelope && envelope.meta ? envelope.meta.eventType : null,
            errors
        }),
        sink: (entry) => write({
            kind: "entry",
            channel: entry.channel || null,
            event: entry.event,
            market: entry.market,
            assetClass: entry.exchange,
            symbol: entry.symbol,
            envelope: entry.envelope
        })
    });

    const status = collector.status();
    write({
        kind: "start",
        at: Date.now(),
        bus: Boolean(bus),
        out: options.out,
        readiness,
        subjects: status.subjects,
        subjectCount: status.subjectCount,
        eventTypes: status.eventTypes,
        planned: status.planned,
        scheduled: status.scheduledTasks,
        onDemand: status.onDemandTasks,
        refused: status.refused
    });

    console.log(`[onchain] subjects: ${status.subjects.map((group) => `${group.group}(${group.subjects})`).join(" ")} — ${status.subjectCount} total`);
    console.log(`[onchain] event types: ${[...status.eventTypes].join(", ")}`);
    console.log(`[onchain] providers ready: ${readiness.filter((entry) => entry.ready).map((entry) => entry.id).join(", ") || "none"}`);
    console.log(`[onchain] providers missing a key: ${readiness.filter((entry) => !entry.ready).map((entry) => `${entry.id}:${entry.missingEnv}`).join(", ") || "none"}`);
    console.log(`[onchain] tasks per poll: ${status.planned} (${status.scheduledTasks} scheduled, ${status.onDemandTasks} on demand), refusals: ${status.refused.length}`);
    for (const refusal of status.refused) console.log(`           refusal ${refusal.taskId}: ${refusal.reason}`);

    const controller = new AbortController();
    process.on("SIGINT", () => { console.log("[onchain] stopping…"); controller.abort(); });
    process.on("SIGTERM", () => { console.log("[onchain] stopping…"); controller.abort(); });

    const summary = await collector.run({
        polls: Number.isFinite(options.polls) ? options.polls : null,
        interval: Number.isFinite(options.interval) ? options.interval : undefined,
        signal: controller.signal,
        onPoll: (sweep) => {
            console.log(`[onchain] poll ${sweep.at}: due ${sweep.due}, tasks ${sweep.tasks}, rows ${sweep.rows}, readings ${sweep.readings}, published ${sweep.published}, followUps ${sweep.followUps}, failed ${sweep.failed.length}`);
            for (const failure of sweep.failed) console.log(`           failed ${failure.taskId}: ${failure.reason}`);
        }
    });

    const final = collector.status();
    write({ kind: "summary", summary, capsules: final.capsules, tasks: final.tasks, client: final.client, subjects: final.subjects });
    console.log(`[onchain] done: polls ${summary.polls}, readings ${summary.readings}, published ${summary.published}, failed tasks ${summary.failedTasks}, stopped ${summary.stopped || "count"}`);
    console.log(`[onchain] log: ${options.out}`);

    await new Promise((resolve) => out.end(resolve));
    return summary;
}

if (require.main === module) {
    main().catch((err) => {
        console.error(`[onchain] fatal: ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs, resolveBus, catalogFor, main, OUT_FILE };

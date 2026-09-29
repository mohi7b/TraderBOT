// Historical Server Layer — Engine Worker (S2 · D23)
//
// WHY A WORKER THREAD?
//   `better-sqlite3` is synchronous: a 26 s warmup scan or a 1 s aggregation
//   blocks the whole Node event loop, so *every* request — even `/health` —
//   waits behind it. Measured in S1: `/health` hung for the full warmup window.
//   Moving the DB work into a dedicated worker keeps the HTTP loop responsive:
//   the server keeps answering while the engine grinds.
//
// CONTRACT (message protocol):
//   in : { id, op, args }
//   out: { id, ok: true, data } | { id, ok: false, error }
//   ops: "ping" | "warmup" | "tf" | "metadata"
//
// The worker owns the DB connection (via the engine modules) and returns plain
// JSON-serializable values. Normalization + HTTP shaping stay in the main
// thread (cheap, few ms) so the protocol surface stays small.
const { parentPort, workerData } = require("worker_threads");

const { buildTf, warmExchangeCache, listExchanges, latestTimestampRaw, readRaw1m } = require("../../_engine/timeframe/build-tf.cjs");
const { assertTf, tfWidthMs } = require("../../_engine/timeframe/utils.cjs");
const { normalize1m } = require("../../_engine/normalize/normalize.cjs");
const { DEFAULT_ROOT } = require("../../_engine/root.cjs");

const ROOT_DIR = (workerData && workerData.rootDir) || DEFAULT_ROOT;
const COVERAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function handle(op, args = {}) {
    switch (op) {
        case "ping":
            return { pong: true, pid: process.pid, uptimeSec: Math.round(process.uptime()) };
        case "warmup":
            return { warmed: warmExchangeCache(args.symbols || ["BTCUSDT"], ROOT_DIR) };
        case "tf": {
            const tf = assertTf(args.tf);
            const candles = buildTf(String(args.symbol).toUpperCase(), tf, {
                exchange: args.exchange || null,
                from: Number.isInteger(args.from) ? args.from : null,
                to: Number.isInteger(args.to) ? args.to : null,
                rootDir: ROOT_DIR,
            });
            return { tf, exchange: args.exchange || null, candles };
        }
        case "metadata": {
            const symbol = String(args.symbol).toUpperCase();
            const exchange = args.exchange || null;
            const tf = assertTf(args.tf || "1h");
            const nowMs = Number.isInteger(args.nowMs) ? args.nowMs : Date.now();
            const latestTimestamp = latestTimestampRaw(symbol, exchange, ROOT_DIR);
            let coverage = {
                windowDays: COVERAGE_WINDOW_DAYS,
                coveragePct: null,
                gapCount: 0,
                missingBars: 0,
                rows: 0,
            };
            try {
                const rows = readRaw1m(symbol, exchange, nowMs - COVERAGE_WINDOW_DAYS * DAY_MS, nowMs, ROOT_DIR);
                const { candles, report } = normalize1m(rows, { nowMs });
                coverage = {
                    windowDays: COVERAGE_WINDOW_DAYS,
                    coveragePct: report.coveragePct,
                    gapCount: report.gaps.length,
                    missingBars: report.missingBars,
                    rows: candles.length,
                };
            } catch (err) {
                coverage.error = err && err.message ? String(err.message) : "coverage probe failed";
            }
            return {
                symbol,
                timeframe: tf,
                exchange,
                venues: listExchanges(symbol, ROOT_DIR),
                barSpacingMs: tfWidthMs(tf),
                latestTimestamp,
                nowMs,
                coverage,
            };
        }
        default:
            throw new RangeError(`unknown op: ${op}`);
    }
}

parentPort.on("message", (msg) => {
    const { id, op, args } = msg || {};
    try {
        const data = handle(op, args);
        parentPort.postMessage({ id, ok: true, data });
    } catch (err) {
        parentPort.postMessage({
            id,
            ok: false,
            error: err && err.message ? String(err.message) : "worker error",
            stack: err && err.stack ? String(err.stack).split("\n").slice(0, 3).join(" | ") : undefined,
        });
    }
});

parentPort.postMessage({ id: "ready", ok: true, data: { ready: true, pid: process.pid } });

// Real-Time 1m Updater orchestrator for ALL markets.
//
// Incrementally updates the raw candles_1m store for every (venue × marketType) with only the NEWEST 1m
// candles — from each market's own last-filled timestamp to "now". It does NOT backfill historical gaps
// (that is the Full Downloader's job); it only extends the tail.
//
// Unlike run-all-markets.cjs (which spawns one OS process per market to run a heavy full download), this
// runs updates SEQUENTIALLY in-process: each update is a tiny tail fetch, so there is no need for parallel
// workers, and running one at a time guarantees each exchange receives at most one in-flight request.
//
// Usage:
//   node run-update-all.cjs [SYMBOL]        (default BTCUSDT)
//   node run-update-all.cjs BTCUSDT
const { update1m } = require("./update-1m.cjs");
const { lastFilledTimestamp } = require("./merge-into-1m-db.cjs");
const { normalizeSymbol } = require("./merge-into-1m-db.cjs");
const { DEFAULT_ROOT } = require("../_engine/root.cjs");
const adapters = require("../_engine/fetch/crypto/index.cjs");

const DEFAULT_SYMBOL = "BTCUSDT";
const VENUES = Object.keys(adapters);
const TARGET_MARKET_TYPES = Object.freeze(["spot", "futures"]);

const C = {
    reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m",
    cyan: "\x1b[36m", gray: "\x1b[90m", yellow: "\x1b[33m",
};
const USE_COLOR = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function fmtMs(ms) {
    return Number.isInteger(ms) ? new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "") : "—";
}

async function main() {
    const symbol = normalizeSymbol(process.argv[2] || DEFAULT_SYMBOL);
    const markets = [];
    for (const marketType of TARGET_MARKET_TYPES) {
        for (const venue of VENUES) {
            markets.push({ venue, marketType, exchange: `${venue}_${marketType}` });
        }
    }

    console.log(`Updating ${symbol} for ${markets.length} markets (latest candles only, sequential)...`);

    let done = 0;
    let totalInserted = 0;
    const doneSet = new Set();

    for (const m of markets) {
        const exch = m.exchange;
        const before = lastFilledTimestamp(symbol, exch, { rootDir: DEFAULT_ROOT });
        try {
            const result = await update1m(symbol, { exchange: exch, market: m.marketType, rootDir: DEFAULT_ROOT, log: () => {} });
            if (result.updated) {
                done += 1;
                totalInserted += result.inserted || 0;
                const after = lastFilledTimestamp(symbol, exch, { rootDir: DEFAULT_ROOT });
                const tag = USE_COLOR ? `${C.green}+${result.inserted}${C.reset}` : `+${result.inserted}`;
                const name = USE_COLOR ? `${C.bold}${exch}${C.reset}` : exch;
                console.log(`  ${tag}  ${name.padEnd(20)} ${before ? fmtMs(before) : "—"} → ${after ? fmtMs(after) : "—"}`);
            } else {
                const reason = result.reason || "unchanged";
                const tag = reason === "up-to-date" ? (USE_COLOR ? `${C.gray}✓${C.reset}` : "✓") : (USE_COLOR ? `${C.yellow}·${C.reset}` : "·");
                const name = USE_COLOR ? `${C.bold}${exch}${C.reset}` : exch;
                console.log(`  ${tag}  ${name.padEnd(20)} ${reason}`);
            }
        } catch (err) {
            const tag = USE_COLOR ? `${C.red}✗${C.reset}` : "✗";
            console.log(`  ${tag}  ${exch.padEnd(20)} error: ${err && err.message ? err.message : err}`);
        }
    }

    const summary = totalInserted > 0
        ? `${done} market(s) updated, ${totalInserted} new candle(s) total.`
        : "All markets up-to-date (no new candles).";
    console.log(summary);
}

if (require.main === module) {
    main().catch((err) => {
        console.error("Update-all error:", err && err.message ? err.message : err);
        process.exitCode = 1;
    });
}

module.exports = { main };

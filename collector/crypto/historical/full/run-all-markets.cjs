// Automatic full-download orchestrator for the historical collector.
//
// Runs the Full Downloader for every available market in parallel (one OS process per market, so each
// effectively gets its own dedicated terminal/worker), waits for all raw 1m databases to complete, and
// reports progress with a single, self-updating display — no per-chunk log spam.
//
// A "market" here = one (venue × marketType) pair. Venues come from the crypto adapter index and market
// types are spot + futures, so we get 5 venues × 2 markets = 10 markets, each downloading the same symbol
// (default BTCUSDT).
//
// Usage:
//   node run-all-markets.cjs [SYMBOL]
//   node run-all-markets.cjs BTCUSDT
//
// Output contract (compact):
//   - a live progress block that overwrites itself in place,
//   - one "OK" line when each market finishes,
//   - a final "ALL COMPLETE" line when every market has finished.
const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");
const adapters = require("../_engine/fetch/crypto/index.cjs");
const { openRaw1mDatabase, deleteExchangeRows, normalizeSymbol } = require("./merge-into-1m-db.cjs");
const { DEFAULT_ROOT } = require("../_engine/root.cjs");

const POLL_MS = 2000;
const DEFAULT_SYMBOL = "BTCUSDT";

// The venues we can actually download from (every crypto adapter). This is exactly 5: binance, bybit, okx,
// kucoin, bitget. markets.cjs's VENUES also lists coinbase/kraken, but those have no adapter, so we derive
// the real set from the adapter index instead.
const VENUES = Object.keys(adapters);

// The market types we download. A "market" = (venue × marketType), so 5 venues × 2 types = 10 markets.
// (swap/delivery/inverse live in markets.cjs too, but map onto the same futures API; only spot and
// futures are requested here per the goal of "5 exchanges × spot/futures".)
const TARGET_MARKET_TYPES = Object.freeze(["spot", "futures"]);

// The markets to download: every (venue × marketType) combination.
//
// Ordering constraint for rate-limit safety: TARGET_MARKET_TYPES is [spot, futures], and we run each
// venue's markets SEQUENTIALLY (spot first, then futures once spot finishes). This guarantees a given
// exchange receives at most one in-flight request at a time (spot OR futures, never both concurrently),
// so we never exceed the per-venue rate limit from a single IP. Different venues still run in parallel.
function buildMarkets() {
    const markets = [];
    // Build market-type-major order: all SPOT first, then all FUTURES. This groups the display so the
    // spot block appears before the futures block (each exchange still runs spot→futures sequentially).
    for (const marketType of TARGET_MARKET_TYPES) {
        for (const venue of VENUES) {
            markets.push({ venue, marketType, exchange: `${venue}_${marketType}`, order: TARGET_MARKET_TYPES.indexOf(marketType) });
        }
    }
    return markets;
}

// Reads the current raw-store snapshot for one market: how many candles are stored and the span covered.
function snapshotMarket(symbol, exchange, rootDir) {
    const db = openRaw1mDatabase(symbol, { rootDir, readonly: true });
    if (!db) return { count: 0, earliest: null, latest: null };
    try {
        const row = db.prepare("SELECT COUNT(*) AS c, MIN(timestamp_raw) AS mn, MAX(timestamp_raw) AS mx FROM candles_1m WHERE symbol = ? AND exchange = ?").get(normalizeSymbol(symbol), exchange);
        return { count: row.c ?? 0, earliest: row.mn ?? null, latest: row.mx ?? null };
    } finally {
        db.close();
    }
}

// Estimates the total number of 1m candles a market will ultimately hold, given its exchange's served
// [earliest, latest] span. This lets the display show "downloaded / expected" (e.g. 250 / 1,985,020).
function expectedCandles(earliest, latest) {
    if (!Number.isInteger(earliest) || !Number.isInteger(latest) || latest < earliest) return null;
    return Math.floor((latest - earliest) / 60000) + 1;
}


function fmt(epochMs) {
    if (!Number.isInteger(epochMs)) return "—";
    return new Date(epochMs).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

// ANSI color + style helpers.
const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m",
};

// Detects whether ANSI cursor tricks are safe. Many environments (SSH capture, `tee`, CI logs, `dumb`
// terminals) report isTTY=true but do NOT honor cursor-up/clear sequences, which turns a self-updating
// block into an endless pile of repeated lines. So we DEFAULT to a safe single-line progress, and only opt
// into the fancy multi-line in-place block when the user explicitly passes `--fancy` (on a real terminal).
const FANCY = process.argv.includes("--fancy");
const PLAIN = !FANCY;
const USE_COLOR = FANCY && process.env.NO_COLOR === undefined;

// Interactive confirmation for destructive actions (e.g. --delete). Reads one line from stdin.
// Only an explicit "yes"/"y" (case-insensitive) proceeds; EVERYTHING else — including "no" or pressing
// Enter (empty) — aborts. The default is therefore NO, so an accidental --delete never wipes the DB.
function confirmDelete(symbol) {
  return new Promise(function (resolve) {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    var warn = "DANGER: this will delete ALL stored " + symbol + " candle data for every market from the database.";
    var prompt = "Are you sure you want to DELETE the database? (yes/no) [no]: ";
    rl.question(warn + "\n" + prompt, function (answer) {
      rl.close();
      var a = (answer || "").trim().toLowerCase();
      resolve(a === "yes" || a === "y");
    });
  });
}

// Renders the live status as a multi-line table. To avoid cursor-clear pile-up in capture environments,
// we only re-render when the state actually changed (see `draw`/`stateKey`). In a real TTY we move the
// cursor back up to overwrite; otherwise each re-render prints a fresh (still compact) block. Spot markets
// are listed first, then futures. Each line shows "done/expected" candles plus the covered time span.
function render(lines, { symbol, markets, statuses }) {
    const tty = Boolean(process.stdout.isTTY) && !PLAIN;

    // Group: spot rows first, then futures rows (markets is already market-type-major, but sort defensively).
    const spots = markets.filter((m) => m.order === 0);
    const futures = markets.filter((m) => m.order !== 0);

    const fmtCountOrSpan = (s) => {
        const span = (s.earliest || s.latest) ? `${fmt(s.earliest)} → ${fmt(s.latest)}` : "—";
        const count = Number.isInteger(s.expected) ? `${s.count}/${s.expected}` : `${s.count}`;
        return { count, span };
    };

    const row = (m, s) => {
        const bar = s.state === "done" ? "✓" : (s.state === "error" ? "✗" : (s.state === "waiting" ? "·" : "…"));
        const { count, span } = fmtCountOrSpan(s);
        const name = m.exchange.padEnd(20);
        const countW = count.padStart(12);
        return `  ${bar} ${name} ${countW}   ${span}`;
    };

    const out = [];
    out.push(`SPOT  (${symbol})`);
    for (const m of spots) out.push(row(m, statuses[m.exchange] || { state: "waiting", count: 0, earliest: null, latest: null, expected: null }));
    out.push(`FUTURES`);
    for (const m of futures) out.push(row(m, statuses[m.exchange] || { state: "waiting", count: 0, earliest: null, latest: null, expected: null }));

    const done = markets.filter((m) => (statuses[m.exchange] || {}).state === "done").length;
    const pct = markets.length ? Math.round((done / markets.length) * 100) : 0;
    out.push(`${done}/${markets.length} markets complete (${pct}%)`);

    const block = out.join("\n");

    if (tty && lines > 0) {
        process.stdout.write(`\x1b[${lines}A\x1b[J`);
    }
    process.stdout.write(block + "\n");
    return out.length;
}

if (require.main === module) {
(async function main() {
    const symbol = normalizeSymbol(process.argv[2] || DEFAULT_SYMBOL);
    const rewrite = process.argv.includes("--rewrite");
    const doDelete = process.argv.includes("--delete");
    const rootDir = DEFAULT_ROOT; // canonical root -> candles_1m.db lands in crypto/<symbol>/
    const markets = buildMarkets();

    // --delete: one-time cleanup only. Wipe every market's rows, then exit (no download). Run this BEFORE
    // a --rewrite pass so the rewrite never deletes anything itself.
    if (doDelete) {
        // Safety gate: require an explicit interactive "yes" before any destructive delete. Default is NO.
        const confirmed = await confirmDelete(symbol);
        if (!confirmed) {
            console.log("Aborted — nothing was deleted. (Answer 'yes' to confirm a destructive delete.)");
            process.exit(0);
        }
        let total = 0;
        for (const m of markets) {
            const removed = deleteExchangeRows(symbol, m.exchange, { rootDir });
            total += removed;
            console.log(`  deleted ${m.exchange.padEnd(20)} ${removed} row(s)`);
        }
        console.log(`${C.green}Deleted ${total} row(s) total for ${symbol}.${C.reset}`);
        process.exit(0);
    }

    console.log(`${C.bold}${C.cyan}Full download${C.reset} ${C.magenta}${symbol}${C.reset} for ${markets.length} markets (${VENUES.length} exchanges × ${TARGET_MARKET_TYPES.length} market types)${rewrite ? `  ${C.yellow}--rewrite (re-download, no wipe)${C.reset}` : ""} ...`);

    const statuses = {};
    // Mark spot markets as "running" immediately; futures wait until their venue's spot finishes.
    for (const m of markets) {
        const state = m.order === 0 ? "running" : "waiting";
        statuses[m.exchange] = { state, count: 0, earliest: null, latest: null };
    }

    // Seed initial snapshot so the display reflects any already-existing data (resume).
    for (const m of markets) {
        const snap = snapshotMarket(symbol, m.exchange, rootDir);
        statuses[m.exchange] = { ...statuses[m.exchange], ...snap };
    }

    let renderedLines = 0;
    let lastRenderedKey = "";
    // Track only in-flight markets. Futures are added when their venue's spot finishes, then removed when
    // the futures worker exits. Starting with spot-only keeps the done-detection correct.
    const pending = new Set(markets.filter((m) => m.order === 0).map((m) => m.exchange));

    // A compact, stable "fingerprint" of the current state — used to avoid re-rendering when nothing has
    // actually changed (prevents terminal spam when ANSI cursor-clearing is unavailable).
    function stateKey() {
        // Include only the fields that drive a meaningful visual change (count, state, expected). The
        // earliest/latest span moves with every new chunk, so including it would re-render every tick.
        return markets.map((m) => {
            const s = statuses[m.exchange];
            return `${m.exchange}:${s.state}:${s.count}:${s.expected ?? ""}`;
        }).join("|");
    }

    // Draws the block only if the state changed since the last draw (avoids re-printing an unchanged table
    // every poll tick, which would pile up in capture environments).
    function draw() {
        const key = stateKey();
        if (key === lastRenderedKey) return;
        lastRenderedKey = key;
        renderedLines = render(renderedLines, { symbol, markets, statuses });
    }

    function reportAllDoneIfReady() {
        if (pending.size > 0) return;
        const done = markets.filter((m) => statuses[m.exchange].state === "done").length;
        if (done === markets.length) {
            console.log(`\n${C.green}${C.bold}✓ ALL COMPLETE${C.reset}: ${markets.length} markets finished (${symbol}).`);
            process.exit(0);
        } else {
            console.log(`\n${C.yellow}${C.bold}⚠ All processes ended but ${markets.length - done} market(s) failed${C.reset}.`);
            process.exit(1);
        }
    }

    function finalize(exchange, ok, err) {
        const fresh = snapshotMarket(symbol, exchange, rootDir);
        statuses[exchange] = { state: ok ? "done" : "error", ...fresh };
        draw();
        if (ok) {
            console.log(`\n${C.green}✓ Done ${C.bold}${exchange}${C.reset}: ${fresh.count} candles (${fmt(fresh.earliest)} → ${fmt(fresh.latest)})`);
        } else {
            console.log(`\n${C.red}✗ Failed ${C.bold}${exchange}${C.reset}: ${err || "unknown error"}`);
        }
        renderedLines = 0;
        reportAllDoneIfReady();
    }

    function poll() {
        for (const m of markets) {
            const s = statuses[m.exchange];
            if (s.state === "done" || s.state === "error" || s.state === "waiting") continue;
            const snap = snapshotMarket(symbol, m.exchange, rootDir);
            statuses[m.exchange] = { ...s, ...snap };
        }
        draw();
        if (pending.size > 0) setTimeout(poll, POLL_MS);
    }

    // Launch one worker process per market, but per venue they run SEQUENTIALLY: spot first, then futures
    // only after spot finishes. This keeps a single exchange from ever receiving two in-flight requests at
    // once, so we stay under its rate limit. Different venues still run in parallel with each other.
    const marketsByVenue = new Map();
    for (const m of markets) {
        if (!marketsByVenue.has(m.venue)) marketsByVenue.set(m.venue, []);
        marketsByVenue.get(m.venue).push(m);
    }

    function launchMarket(m) {
        const args = [path.join(__dirname, "worker-full.cjs"), symbol, m.exchange];
        if (rewrite) args.push("--rewrite");
        const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => { stdout += d.toString(); });
        child.stderr.on("data", (d) => { stderr += d.toString(); });

        // Best-effort expected-candle probe (does not block the worker): resolve the venue's served range
        // via its adapter so the display can show "downloaded / expected" while the worker downloads.
        (async () => {
            try {
                const factory = adapters[m.venue];
                if (!factory) return;
                const fetcher = factory({ timeoutMs: 10000 });
                let earliest;
                if (typeof fetcher.earliestOpenTime === "function") {
                    earliest = await fetcher.earliestOpenTime({ symbol, market: m.marketType });
                } else {
                    // Venues without a dedicated earliest probe (e.g. Binance) accept startTime=0.
                    const firstPage = await fetcher.fetchKlines({ symbol, market: m.marketType, startTime: 0, endTime: undefined, limit: 1 }).catch(() => []);
                    earliest = firstPage.length ? firstPage[0].openTime : null;
                }
                const latestPage = await fetcher.fetchKlines({ symbol, market: m.marketType, limit: 1, mode: "update" }).catch(() => []);
                const latest = latestPage.length ? Math.max(...latestPage.map((c) => c.openTime)) : null;
                const expected = expectedCandles(earliest, latest);
                if (Number.isInteger(expected)) statuses[m.exchange] = { ...statuses[m.exchange], expected };
                draw();
            } catch {
                /* ignore probe failures; expected stays null until worker reports it */
            }
        })();

        child.on("close", (code) => {
            pending.delete(m.exchange);

            // BEFORE finalizing: if this venue has a next (futures) market, queue it now so the
            // done-detection below never observes a transient empty `pending` (which would falsely exit).
            const queue = marketsByVenue.get(m.venue) || [];
            const next = queue.find((candidate) => candidate.order > m.order);
            if (next) {
                pending.add(next.exchange);
                statuses[next.exchange] = { ...statuses[next.exchange], state: "running" };
                launchMarket(next);
            }

            let ok = false;
            let err = null;
            try {
                const line = stdout.trim().split("\n").filter(Boolean).pop();
                const parsed = line ? JSON.parse(line) : null;
                ok = !!(parsed && parsed.ok);
                if (!ok) err = parsed && parsed.error ? parsed.error : (stderr || `exit ${code}`);
                // The worker reports the exchange's authoritative [earliest, latest]; use it for expected.
                if (parsed && Number.isInteger(parsed.earliest) && Number.isInteger(parsed.latest)) {
                    statuses[m.exchange].expected = expectedCandles(parsed.earliest, parsed.latest);
                }
            } catch {
                ok = false;
                err = stderr || `exit ${code}`;
            }
            finalize(m.exchange, ok, err);
        });
    }

    // Kick off only the first market (spot) of each venue.
    for (const [venue, queue] of marketsByVenue) {
        const first = queue.find((m) => m.order === 0);
        if (first) launchMarket(first);
    }

    // Start the live progress poller.
    lastRenderedKey = "";
    draw();
    setTimeout(poll, POLL_MS);
})().catch((err) => {
    console.error(`${C.red}Orchestrator error:${C.reset}`, err && err.message ? err.message : err);
    process.exit(1);
});
}

module.exports = { buildMarkets, snapshotMarket, expectedCandles, fmt, render, VENUES, TARGET_MARKET_TYPES, DEFAULT_SYMBOL };


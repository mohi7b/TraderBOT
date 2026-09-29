// Full Downloader entry point.
//
// Usage:
//   node run-full.cjs BTCUSDT --exchange=binance --market=spot
//   node run-full.cjs BTCUSDT --exchange=binance --market=futures
//   node run-full.cjs BTCUSDT --exchange=okx --market=futures
//
// The `exchange` value stored is the standard key "<venue>_<marketType>" (e.g. "binance_spot"), so spot
// and futures are fully separated in the raw store and resume independently.
const { createVenueFetchers } = require("../_engine/fetch/venues.cjs");
const { runScheduler } = require("./scheduler.cjs");
const { createRateController } = require("./rate-controller.cjs");
const { openRaw1mDatabase, lastFilledTimestamp, deleteExchangeRows, normalizeSymbol } = require("./merge-into-1m-db.cjs");
const { buildExchangeKey, splitExchangeKey, apiMarketOf } = require("./markets.cjs");

const MINUTE_MS = 60 * 1000;

function print(message) {
    process.stdout.write(`[full] ${message}\n`);
}

function parseArgs(argv) {
    const positional = [];
    const flags = {};
    for (const arg of argv.slice(2)) {
        if (arg.startsWith("--")) {
            const eq = arg.indexOf("=");
            if (eq >= 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
            else flags[arg.slice(2)] = true;
        } else {
            positional.push(arg);
        }
    }
    return { symbol: positional[0] ?? null, flags };
}

// Oldest candle open time the exchange serves (ascending; limit=1 at startTime=0).
// OKX exposes no startTime/endTime (only the `after` cursor), so it provides `earliestOpenTime`
// which walks the history backward (rate-limited) instead of the default startTime=0 probe.
async function earliestRemote(fetcher, symbol, market) {
    if (typeof fetcher.earliestOpenTime === "function") {
        return fetcher.earliestOpenTime({ symbol, market });
    }
    const page = await fetcher.fetchKlines({ symbol, market, startTime: 0, endTime: undefined, limit: 1 });
    return page.length ? page[0].openTime : null;
}

// Newest candle open time the exchange serves (recent window; a generous limit guarantees we capture the
// most recent minute even if the window contains more than a handful of candles).
async function latestRemote(fetcher, symbol, market, now = Date.now()) {
    const page = await fetcher.fetchKlines({ symbol, market, startTime: now - 5 * MINUTE_MS, endTime: undefined, limit: 1000 });
    return page.length ? Math.max(...page.map((c) => c.openTime)) : null;
}

async function runFull(symbol, { exchange, market = "spot", fetchImpl, timeoutMs, rootDir, now = Date.now(), log, rewrite = false } = {}) {
    const resolved = normalizeSymbol(symbol);
    const logger = log || print;

    // If the caller passed a bare venue (e.g. "binance"), combine it with the market type. If they passed
    // an already-standard key (e.g. "binance_spot"), use it directly.
    const exchangeKey = exchange.includes("_") ? exchange : buildExchangeKey(exchange, market);
    const { venue } = splitExchangeKey(exchangeKey);
    const apiMarket = apiMarketOf(exchangeKey);

    // NOTE: `--rewrite` does NOT wipe the database here. Deleting is a separate, one-time operation (see
    // `deleteMarket` / the `--delete` flag). Rewriting means: ignore the resume point and re-download the
    // full range from the exchange's earliest candle, overwriting existing rows via INSERT OR IGNORE.

    const fetcher = createVenueFetchers({ venues: [venue], fetchImpl, timeoutMs })[0];
    if (!fetcher) throw new RangeError(`Unknown exchange: ${venue}`);

    logger(`Starting full download for ${resolved} from ${exchangeKey} (venue=${venue}, apiMarket=${apiMarket}) ...`);

    const earliest = await earliestRemote(fetcher, resolved, apiMarket);
    const latest = await latestRemote(fetcher, resolved, apiMarket, now);

    if (!Number.isInteger(earliest) || !Number.isInteger(latest)) {
        throw new Error(`Could not determine time range from ${exchangeKey} (earliest=${earliest}, latest=${latest})`);
    }
    logger(`Exchange range: ${new Date(earliest).toISOString()} .. ${new Date(latest).toISOString()}`);

    const lastFilled = lastFilledTimestamp(resolved, exchangeKey, { rootDir });
    logger(lastFilled !== null ? `Last stored candle: ${new Date(lastFilled).toISOString()}` : "Empty database — starting from earliestRemote");
    if (rewrite) logger("Rewrite mode: re-downloading the full range from earliestRemote (overwriting existing rows).");

    const controller = createRateController();
    const result = await runScheduler({
        symbol: resolved, exchange: exchangeKey, earliestRemote: earliest, latestRemote: latest,
        fetchImpl, timeoutMs, rootDir, rateController: controller, log: logger, fresh: rewrite,
    });

    // Final count check.
    const db = openRaw1mDatabase(resolved, { rootDir, readonly: true });
    let total = 0;
    if (db) {
        total = db.prepare("SELECT COUNT(*) AS c FROM candles_1m WHERE symbol = ? AND exchange = ?").get(resolved, exchangeKey).c;
        db.close();
    }

    logger(`Done: ${result.ranges} range(s), ${result.totalInserted} new candles, ${total} total raw rows.`);
    return Object.freeze({ symbol: resolved, exchange: exchangeKey, earliest, latest, ranges: result.ranges, totalInserted: result.totalInserted, total });
}

// Deletes a market's stored rows (one-time cleanup, used by the `--delete` flag). Returns rows removed.
function deleteMarket(symbol, exchange, { market = "spot", rootDir } = {}) {
    const resolved = normalizeSymbol(symbol);
    const exchangeKey = exchange.includes("_") ? exchange : buildExchangeKey(exchange, market);
    return deleteExchangeRows(resolved, exchangeKey, { rootDir });
}

// CLI entry point.
if (require.main === module) {
    const { symbol, flags } = parseArgs(process.argv);
    const isTrue = (v) => v === true || v === "true" || v === "1";
    if (!symbol) {
        console.error("Error: symbol argument is required.");
        console.error("Usage: node run-full.cjs <SYMBOL> --exchange=<EXCHANGE> --market=<MARKET> [--rewrite] [--delete]");
        console.error("Example: node run-full.cjs BTCUSDT --exchange=binance --market=spot");
        console.error("         node run-full.cjs BTCUSDT --exchange=okx --market=spot --rewrite");
        console.error("         node run-full.cjs BTCUSDT --exchange=okx --market=spot --delete");
        process.exitCode = 1;
    } else if (isTrue(flags.delete)) {
        const removed = deleteMarket(symbol, { exchange: flags.exchange || "binance", market: flags.market || "spot" });
        console.log(`Deleted ${removed} row(s).`);
    } else {
        runFull(symbol, {
            exchange: flags.exchange || "binance",
            market: flags.market || "spot",
            rewrite: isTrue(flags.rewrite),
        })
            .then(() => {})
            .catch((error) => {
                console.error("Full download error:", error && error.message ? error.message : error);
                process.exitCode = 1;
            });
    }
}

module.exports = { runFull, deleteMarket };


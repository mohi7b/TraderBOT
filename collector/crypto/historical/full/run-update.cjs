// Real-Time 1m Updater CLI.
//
// Usage:
//   node run-update.cjs BTCUSDT --exchange=binance --market=spot
//   node run-update.cjs BTCUSDT --exchange=binance --market=futures
//   node run-update.cjs BTCUSDT --exchange=okx --market=futures
//
// Incrementally pulls only the newest 1m candles for the given standard exchange key and merges them
// into the raw candles_1m store (separate from the Full Downloader's one-time backfill).
const { update1m } = require("./update-1m.cjs");

function print(message) {
    process.stdout.write(`[update] ${message}\n`);
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

if (require.main === module) {
    const { symbol, flags } = parseArgs(process.argv);
    if (!symbol) {
        console.error("خطا: ورودی symbol داده نشده است.");
        console.error("استفاده: node run-update.cjs <SYMBOL> --exchange=<EXCHANGE> --market=<MARKET>");
        console.error("مثال:   node run-update.cjs BTCUSDT --exchange=binance --market=spot");
        process.exitCode = 1;
    } else {
        update1m(symbol.trim().toUpperCase(), { exchange: flags.exchange || "binance", market: flags.market || "spot", log: print })
            .then((result) => {
                if (result.updated) print(`پایان: ${result.inserted} کندل جدید برای ${result.exchange}.`);
                else print(`دادهٔ جدیدی وجود ندارد (${result.exchange}, ${result.reason}).`);
            })
            .catch((error) => {
                console.error("خطا در بروزرسانی 1m:", error && error.message ? error.message : error);
                process.exitCode = 1;
            });
    }
}

module.exports = { update1m };

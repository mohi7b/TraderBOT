// Full-download worker (spawned by run-all-markets.cjs).
//
// Runs the Full Downloader for a single (symbol, venue, marketType) triple in complete silence, then emits
// exactly one line of JSON on stdout describing the final outcome. The orchestrator parses this single line
// to update its compact progress display, so the terminals are never spammed with per-chunk logs.
//
// Usage (internal):
//   node worker-full.cjs <SYMBOL> <EXCHANGE_KEY> [--rewrite]
// where EXCHANGE_KEY is "<venue>_<marketType>" (e.g. "binance_spot"). `--rewrite` wipes that market's
// stored rows before re-downloading (passed through from run-all-markets --rewrite).
const { runFull } = require("./run-full.cjs");

function main() {
    const symbol = process.argv[2];
    const exchange = process.argv[3];
    const rewrite = process.argv.includes("--rewrite");

    if (!symbol || !exchange) {
        process.stdout.write(JSON.stringify({ ok: false, error: "usage: worker-full.cjs <SYMBOL> <EXCHANGE_KEY> [--rewrite]" }) + "\n");
        process.exit(1);
        return;
    }

    // Worker is silent on stdout (so the final JSON line stays clean), but recovery/retry messages go to
    // stderr so they are visible in logs without corrupting the orchestrator's stdout JSON parse.
    const log = (msg) => process.stderr.write(`[${exchange}] ${msg}\n`);

    runFull(symbol, { exchange, log, rewrite })
        .then((result) => {
            process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
            process.exit(0);
        })
        .catch((err) => {
            process.stdout.write(JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err), symbol, exchange }) + "\n");
            process.exit(1);
        });
}

if (require.main === module) {
    main();
}

module.exports = { main };

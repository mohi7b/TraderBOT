#!/usr/bin/env node
/* ============================================================
 * File: collector/crypto/historical/storage/run-compact.cjs
 * Section: collector/crypto/historical/storage
 * Version: 1.0.0
 *
 * Role:
 *   The migration command: the downloader's per-symbol SQLite in, monthly
 *   Parquet files out.
 *
 *     node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT
 *     node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --exchange binance_spot
 *     node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --exchange okx_spot --month 2025-01
 *     node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --dry-run --limit 3
 *     node collector/crypto/historical/storage/run-compact.cjs --symbol BTCUSDT --skip-existing
 *
 *   One dataset at a time (a venue's spot or futures series), one month per
 *   write, and a line per month: rows, bytes, fingerprint, refused rows.
 *   Re-running is safe: a month is replaced as a whole, never merged, so
 *   the same command twice produces the same files. `--skip-existing` makes
 *   a long migration resumable: a month that is already on disk is left
 *   exactly as it is, so an interrupted run can simply be started again.
 * ============================================================ */

const fs = require("node:fs");
const path = require("node:path");

const layout = require("./candle-layout.cjs");
const { openStore, COMPRESSIONS, DEFAULT_COMPRESSION } = require("./candle-store.cjs");
const { openCandleSource, DEFAULT_TABLE } = require("./sqlite-candle-source.cjs");

/** Where the downloader keeps its per-symbol databases. */
const DOWNLOAD_DIR = path.join(__dirname, "..", "crypto");

function parseArgs(argv) {
    const options = {
        db: null, symbol: null, exchange: null, month: null, table: DEFAULT_TABLE,
        root: layout.DEFAULT_ROOT, compression: DEFAULT_COMPRESSION,
        limit: null, dryRun: false, strict: false, skipExisting: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const value = argv[index + 1];
        if (flag === "--db") { options.db = value; index += 1; }
        else if (flag === "--symbol") { options.symbol = value; index += 1; }
        else if (flag === "--exchange") { options.exchange = value; index += 1; }
        else if (flag === "--month") { options.month = value; index += 1; }
        else if (flag === "--table") { options.table = value; index += 1; }
        else if (flag === "--root") { options.root = value; index += 1; }
        else if (flag === "--compression") { options.compression = String(value || "").toUpperCase(); index += 1; }
        else if (flag === "--limit") { options.limit = Number(value); index += 1; }
        else if (flag === "--dry-run") options.dryRun = true;
        else if (flag === "--skip-existing") options.skipExisting = true;
        else if (flag === "--strict") options.strict = true;
    }
    return options;
}

/** BTC-USDT, btc_usdt and BTCUSDT are the same symbol (as in the downloader). */
function normalizeSymbol(symbol) {
    return layout.assertSymbol(String(symbol || "").toUpperCase().replace(/[-_/\s]/g, ""));
}

function defaultDb(symbol) {
    return path.join(DOWNLOAD_DIR, normalizeSymbol(symbol), "candles_1m.db");
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Migrate one database (default: every dataset it holds).
 * @param {object} options  as parsed by parseArgs
 * @param {Function} [log]  one line per month
 * @returns {Promise<object>} the report
 */
async function compact(options, log = console.log) {
    const symbol = options.symbol ? normalizeSymbol(options.symbol) : null;
    const dbFile = options.db || defaultDb(symbol);
    if (!COMPRESSIONS.includes(options.compression)) {
        throw new RangeError(`--compression must be one of ${COMPRESSIONS.join("|")}, got ${JSON.stringify(options.compression)}`);
    }

    const source = openCandleSource({ file: dbFile, table: options.table });
    const store = openStore({ root: options.root, compression: options.compression });
    const startedAt = Date.now();

    const report = {
        db: dbFile,
        root: options.root,
        compression: options.compression,
        dryRun: options.dryRun,
        datasets: [],
        months: 0,
        rows: 0,
        written: 0,
        skipped: 0,
        bytes: 0,
        refused: 0,
        elapsedMs: 0
    };

    try {
        const datasets = source.datasets({ exchange: options.exchange, symbol });

        if (datasets.length === 0) {
            throw new RangeError(`no dataset in ${dbFile} matches ${options.exchange || "*"}/${symbol || "*"}`);
        }

        let budget = Number.isFinite(options.limit) ? options.limit : Infinity;

        for (const dataset of datasets) {
            const perDataset = { exchange: dataset.exchange, symbol: dataset.symbol, months: 0, rows: 0, written: 0, skipped: 0, bytes: 0, refused: 0 };
            const months = source.months({ exchange: dataset.exchange, symbol: dataset.symbol })
                .filter((monthKey) => !options.month || monthKey === options.month);
            /* Resumable runs: a month already on disk is left untouched, exactly
             * as `--skip-existing` promises. store.months() only reports finished
             * files, so an interrupted write is never mistaken for a month. */
            const present = options.skipExisting
                ? new Set(store.months(dataset.exchange, dataset.symbol))
                : null;

            for (const monthKey of months) {
                if (present && present.has(monthKey)) {
                    perDataset.skipped += 1;
                    report.skipped += 1;
                    log(`${dataset.exchange}/${dataset.symbol} ${monthKey}: already on disk — skipped`);
                    continue;
                }
                if (budget <= 0) break;
                budget -= 1;

                const rows = source.readMonth({ exchange: dataset.exchange, symbol: dataset.symbol, monthKey });
                perDataset.months += 1;
                perDataset.rows += rows.length;

                if (options.dryRun) {
                    log(`[dry-run] ${dataset.exchange}/${dataset.symbol} ${monthKey}: ${rows.length} rows`);
                    continue;
                }

                const written = await store.writeMonth({
                    exchange: dataset.exchange,
                    symbol: dataset.symbol,
                    monthKey,
                    rows,
                    strict: options.strict
                });

                perDataset.bytes += written.bytes;
                perDataset.written += written.written ? 1 : 0;
                perDataset.refused += written.rejected.length;

                if (written.written) {
                    log(`${dataset.exchange}/${dataset.symbol} ${monthKey}: ${written.rows} rows, ${formatBytes(written.bytes)}, sha256 ${written.sha256.slice(0, 12)}${written.replaced ? " (replaced)" : ""}`);
                } else {
                    log(`${dataset.exchange}/${dataset.symbol} ${monthKey}: nothing written — ${written.reason}`);
                }
                for (const rejected of written.rejected) {
                    log(`           refused ${new Date(rejected.row && rejected.row.timestamp).toISOString()}: ${rejected.problems.join("; ")}`);
                }
            }

            report.datasets.push(Object.freeze(perDataset));
            report.months += perDataset.months;
            report.rows += perDataset.rows;
            report.written += perDataset.written;
            report.bytes += perDataset.bytes;
            report.refused += perDataset.refused;
        }
    } finally {
        source.close();
        report.elapsedMs = Date.now() - startedAt;
    }

    return Object.freeze(report);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    console.log(`[compact] db:    ${options.db || defaultDb(options.symbol)}`);
    console.log(`[compact] out:   ${layout.describeLayout(options.root)} (${options.compression})`);
    if (options.month) console.log(`[compact] month: ${options.month}`);
    if (options.dryRun) console.log("[compact] dry run: reading, writing nothing");

    const report = await compact(options);

    for (const dataset of report.datasets) {
        console.log(`[compact] ${dataset.exchange}/${dataset.symbol}: ${dataset.months} months, ${dataset.rows} rows read, ${dataset.written} files, ${formatBytes(dataset.bytes)}, ${dataset.skipped} skipped, ${dataset.refused} refused`);
    }
    console.log(`[compact] done in ${report.elapsedMs} ms: ${report.written} files, ${report.bytes ? formatBytes(report.bytes) : "0 B"}, ${report.skipped} months left alone, ${report.refused} refused rows`);
    return report;
}

if (require.main === module) {
    main().catch((err) => {
        console.error(`[compact] fatal: ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
    });
}

module.exports = { DOWNLOAD_DIR, parseArgs, normalizeSymbol, defaultDb, formatBytes, compact, main, openStore, openCandleSource, layout };

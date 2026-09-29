/* ============================================================
 * File: collector/crypto/historical/storage/sqlite-candle-source.cjs
 * Section: collector/crypto/historical/storage
 * Version: 1.0.0
 *
 * Role:
 *   The read side of the migration: the downloader's per-symbol SQLite
 *   (`candles_1m`, one row per minute per venue) exposed as months.
 *
 *     select ... where exchange=? and symbol=? and timestamp_raw >= ? and < ?
 *
 *   Two deliberate limits keep a 4.3 GB file from becoming a memory
 *   problem: this reader is *read-only* (no accidental writes to a file
 *   that took hours to download) and it hands back *one month at a time*
 *   (~45k rows), which is exactly the unit the Parquet store writes.
 *
 *   The column names are the downloader's own (timestamp_raw, quote_volume,
 *   number_of_trades) and are mapped here, once, instead of being renamed
 *   inside the database.
 * ============================================================ */

const fs = require("node:fs");
const Database = require("better-sqlite3");

const layout = require("./candle-layout.cjs");

const DEFAULT_TABLE = "candles_1m";
const REQUIRED_COLUMNS = Object.freeze(["timestamp_raw", "exchange", "symbol", "open", "high", "low", "close"]);
const OPTIONAL_COLUMNS = Object.freeze(["volume", "quote_volume", "number_of_trades"]);

/** The downloader's names → the store's names. */
const COLUMN_MAP = Object.freeze({
    timestamp: "timestamp_raw",
    open: "open",
    high: "high",
    low: "low",
    close: "close",
    volume: "volume",
    quoteVolume: "quote_volume",
    trades: "number_of_trades"
});

function nullable(value) {
    return value === null || value === undefined ? null : Number(value);
}

/** One SQLite row → one candle (with the epoch under its store name). */
function toCandle(row) {
    return {
        timestamp: Number(row.timestamp_raw),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: nullable(row.volume),
        quoteVolume: nullable(row.quote_volume),
        trades: nullable(row.number_of_trades)
    };
}

/**
 * @param {object} options
 * @param {string} options.file             per-symbol candles_1m.db
 * @param {string} [options.table]          table name (default candles_1m)
 */
function openCandleSource({ file, table = DEFAULT_TABLE } = {}) {
    if (typeof file !== "string" || file.trim() === "") throw new TypeError("openCandleSource: file is required");
    if (!fs.existsSync(file)) throw new RangeError(`candle database not found: ${file}`);

    const db = new Database(file, { readonly: true, fileMustExist: true, timeout: 10_000 });
    const columns = db.prepare(`pragma table_info("${table}")`).all().map((column) => column.name);
    if (columns.length === 0) throw new RangeError(`${file}: table "${table}" does not exist`);

    const missing = REQUIRED_COLUMNS.filter((name) => !columns.includes(name));
    if (missing.length) {
        throw new RangeError(`${file}: "${table}" is missing ${missing.join(", ")} (found: ${columns.join(", ")})`);
    }

    /** The datasets inside this file (a key per venue and one per symbol). */
    function datasets({ exchange = null, symbol = null } = {}) {
        /* Both halves of the key are a range on the primary key: no scan. */
        if (exchange && symbol) {
            const bounds = boundsOf({ exchange, symbol });
            return bounds.rows === 0 ? [] : [Object.freeze({ exchange, symbol, rows: bounds.rows, firstAt: bounds.firstAt, lastAt: bounds.lastAt })];
        }

        const where = [];
        const params = [];
        if (exchange) { where.push("exchange = ?"); params.push(exchange); }
        if (symbol) { where.push("symbol = ?"); params.push(symbol); }
        const clause = where.length ? `where ${where.join(" and ")}` : "";
        return db.prepare(
            `select exchange, symbol, count(*) as rows, min(timestamp_raw) as firstAt, max(timestamp_raw) as lastAt
             from "${table}" ${clause} group by exchange, symbol order by exchange, symbol`
        ).all(...params).map((row) => Object.freeze({
            exchange: row.exchange,
            symbol: row.symbol,
            rows: row.rows,
            firstAt: nullable(row.firstAt),
            lastAt: nullable(row.lastAt)
        }));
    }

    /** Row count and bounds of one dataset (index-friendly when both keys are given). */
    function boundsOf({ exchange = null, symbol = null } = {}) {
        const where = [];
        const params = [];
        if (exchange) { where.push("exchange = ?"); params.push(exchange); }
        if (symbol) { where.push("symbol = ?"); params.push(symbol); }
        const clause = where.length ? `where ${where.join(" and ")}` : "";
        const row = db.prepare(
            `select count(*) as rows, min(timestamp_raw) as firstAt, max(timestamp_raw) as lastAt from "${table}" ${clause}`
        ).get(...params);
        return Object.freeze({ rows: row.rows, firstAt: nullable(row.firstAt), lastAt: nullable(row.lastAt) });
    }

    /**
     * Months that hold at least one row, oldest first.
     * With both halves of the key this walks the month range of the dataset
     * and *verifies* each candidate with an indexed count — so a month in
     * the middle of a dataset's life that was never collected is absent
     * instead of being interpolated into existence.
     */
    function months({ exchange = null, symbol = null } = {}) {
        if (!exchange || !symbol) {
            const union = new Set();
            for (const dataset of datasets()) {
                if (exchange && dataset.exchange !== exchange) continue;
                if (symbol && dataset.symbol !== symbol) continue;
                for (const month of months(dataset)) union.add(month);
            }
            return [...union].sort();
        }

        const bounds = boundsOf({ exchange, symbol });
        if (bounds.firstAt === null) return [];

        const out = [];
        let cursor = layout.monthKeyOf(bounds.firstAt);
        const last = layout.monthKeyOf(bounds.lastAt);
        while (cursor <= last) {
            if (countMonth({ exchange, symbol, monthKey: cursor }) > 0) out.push(cursor);
            cursor = layout.nextMonth(cursor);
        }
        return out;
    }

    function countMonth({ exchange, symbol, monthKey }) {
        const { from, to } = layout.monthBounds(monthKey);
        const row = db.prepare(
            `select count(*) as rows from "${table}" where exchange = ? and symbol = ? and timestamp_raw >= ? and timestamp_raw < ?`
        ).get(exchange, symbol, from, to);
        return row ? row.rows : 0;
    }

    /** Every candle of one month, oldest first — the unit the store writes. */
    function readMonth({ exchange, symbol, monthKey }) {
        const { from, to } = layout.monthBounds(monthKey);
        return db.prepare(
            `select timestamp_raw, open, high, low, close, volume, quote_volume, number_of_trades
             from "${table}"
             where exchange = ? and symbol = ? and timestamp_raw >= ? and timestamp_raw < ?
             order by timestamp_raw`
        ).all(exchange, symbol, from, to).map(toCandle);
    }

    function stats() {
        const summary = db.prepare(`select count(*) as rows, count(distinct exchange) as exchanges from "${table}"`).get();
        return Object.freeze({ file, table, columns: Object.freeze([...columns]), rows: summary.rows, exchanges: summary.exchanges });
    }

    return {
        file,
        table,
        columns: Object.freeze([...columns]),
        boundsOf,
        datasets,
        months,
        countMonth,
        readMonth,
        stats,
        close: () => db.close()
    };
}

module.exports = { DEFAULT_TABLE, REQUIRED_COLUMNS, OPTIONAL_COLUMNS, COLUMN_MAP, toCandle, openCandleSource };

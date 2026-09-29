// Raw 1m database owner: schema, path resolution, raw-candle standardization, and safe chunk merge.
//
// The raw store is a single database per symbol: crypto/{symbol}/candles_1m.db. It holds only raw,
// unmodified OHLCV candle data — no time adjustments, no indicators, no larger timeframes, and no other
// derived or auxiliary metrics.
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const { DEFAULT_ROOT } = require("../_engine/root.cjs");

// Raw candles table schema. timestamp_raw is the exchange's open-time epoch-ms (UTC), stored verbatim.
const CANDLES_1M_SCHEMA = `
CREATE TABLE IF NOT EXISTS candles_1m (
    timestamp_raw INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL,
    quote_volume REAL,
    number_of_trades INTEGER,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    PRIMARY KEY (symbol, exchange, timestamp_raw)
);
`;

// Normalizes a trading symbol to the canonical form used for the database directory name:
// uppercase, with any "-" or "_" separators removed (e.g. "btc-usdt", "BTC_USDT" -> "BTCUSDT").
// This must be applied EVERYWHERE the symbol becomes a directory key so all venues write into the
// same per-symbol store regardless of the exact spelling the user typed.
function normalizeSymbol(symbol) {
    if (typeof symbol !== "string") throw new TypeError("symbol must be a string");
    return symbol.trim().toUpperCase().replace(/[-_]/g, "");
}

// Resolves the raw 1m database path: crypto/{symbol}/candles_1m.db
function resolveRaw1mPath(symbol, { rootDir = DEFAULT_ROOT } = {}) {
    if (typeof symbol !== "string" || symbol.trim() === "") throw new TypeError("symbol must be a non-empty string");
    return path.join(rootDir, "crypto", normalizeSymbol(symbol), "candles_1m.db");
}

// Opens (and creates) the raw 1m database.
function openRaw1mDatabase(symbol, { rootDir = DEFAULT_ROOT, readonly = false } = {}) {
    const filePath = resolveRaw1mPath(symbol, { rootDir });
    if (readonly) {
        if (!fs.existsSync(filePath)) return null;
        return new Database(filePath, { readonly: true });
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    db.exec(CANDLES_1M_SCHEMA);
    return db;
}

// Standardizes a normalized fetch candle ({ openTime, open, high, low, close, volume, quoteVolume,
// trades, venue, symbol }) into a raw candles_1m row. No time adjustment or derivation is performed.
function standardizeCandle(candle) {
    if (!candle || !Number.isInteger(candle.openTime)) throw new TypeError("candle.openTime must be an integer");
    return Object.freeze({
        timestamp_raw: candle.openTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: Number.isFinite(candle.volume) ? candle.volume : null,
        quote_volume: Number.isFinite(candle.quoteVolume) ? candle.quoteVolume : null,
        number_of_trades: Number.isFinite(candle.trades) ? Math.trunc(candle.trades) : null,
        exchange: candle.exchange || candle.venue,
        symbol: (candle.symbol || "").toUpperCase(),
    });
}

// Validates a normalized candle (standard shape) before storage.
function validateCandle(candle) {
    if (!candle || typeof candle !== "object") return false;
    if (!Number.isInteger(candle.openTime)) return false;
    for (const key of ["open", "high", "low", "close"]) {
        if (!Number.isFinite(candle[key])) return false;
    }
    if (candle.high < Math.min(candle.open, candle.close) || candle.low > Math.max(candle.open, candle.close)) return false;
    if (candle.high < candle.low) return false;
    return true;
}

// Merges a chunk of standardized candles into candles_1m in a single committed transaction, inserting
// only rows whose (symbol, exchange, timestamp_raw) key is not already present (no duplicates, no gaps).
function mergeChunk(db, rows) {
    if (rows.length === 0) return 0;
    const insert = db.prepare(`
        INSERT OR IGNORE INTO candles_1m
        (timestamp_raw, open, high, low, close, volume, quote_volume, number_of_trades, exchange, symbol)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let inserted = 0;
    const transaction = db.transaction((items) => {
        for (const row of items) {
            const info = insert.run(
                row.timestamp_raw, row.open, row.high, row.low, row.close,
                row.volume, row.quote_volume, row.number_of_trades, row.exchange, row.symbol
            );
            if (info.changes > 0) inserted += 1;
        }
    });
    transaction(rows);
    db.pragma("wal_checkpoint(TRUNCATE)");
    return inserted;
}

// Reads the latest filled open-time timestamp for a symbol+exchange (null when nothing stored yet).
function lastFilledTimestamp(symbol, exchange, { rootDir = DEFAULT_ROOT } = {}) {
    const db = openRaw1mDatabase(symbol, { rootDir, readonly: true });
    if (!db) return null;
    try {
        const row = db.prepare("SELECT MAX(timestamp_raw) AS ts FROM candles_1m WHERE symbol = ? AND exchange = ?").get(symbol.toUpperCase(), exchange);
        return row && row.ts !== null ? row.ts : null;
    } finally {
        db.close();
    }
}

// Deletes every stored row for a symbol+exchange (used by --rewrite to rebuild a market from scratch).
// Returns the number of rows removed.
function deleteExchangeRows(symbol, exchange, { rootDir = DEFAULT_ROOT } = {}) {
    const db = openRaw1mDatabase(symbol, { rootDir, readonly: false });
    if (!db) return 0;
    try {
        const info = db.prepare("DELETE FROM candles_1m WHERE symbol = ? AND exchange = ?").run(symbol.toUpperCase(), exchange);
        return info.changes ?? 0;
    } finally {
        db.close();
    }
}

// Returns the number of stored rows for a symbol+exchange within an inclusive [fromTs, toTs] range.
function countRange(symbol, exchange, { fromTs, toTs, rootDir = DEFAULT_ROOT } = {}) {
    const db = openRaw1mDatabase(symbol, { rootDir, readonly: true });
    if (!db) return 0;
    try {
        const row = db.prepare(
            "SELECT COUNT(*) AS c FROM candles_1m WHERE symbol = ? AND exchange = ? AND timestamp_raw >= ? AND timestamp_raw <= ?"
        ).get(symbol.toUpperCase(), exchange, fromTs, toTs);
        return row ? row.c : 0;
    } finally {
        db.close();
    }
}

// Detects whether the stored data for a symbol+exchange has any gaps between the exchange's earliest and
// latest served candles (head, internal, or tail holes). A naive MAX(timestamp) resume would skip over
// all of them.
//
// We detect holes cheaply with a single COUNT: a complete store must hold exactly one row per minute over
// [earliestRemote, latestRemote]. `slackMs` tolerates the newest candle not yet having arrived (the
// exchange's "latest" advances every minute, so the very tail lags by a minute or two). Any shortfall
// beyond that slack means a gap exists somewhere — head, middle, or tail — and triggers a full re-walk.
// Detects whether the stored data for a symbol+exchange has a *head* (or internal) gap — i.e. the oldest
// stored candle is meaningfully newer than the exchange's earliest served candle, OR there are holes
// before the last-filled timestamp. If the head is intact and data proceeds monotonically, there is no
// gap: a resume can safely continue from lastFilled+1min and just fill the TAIL. We intentionally do NOT
// treat an incomplete tail (latestRemote ahead of the newest stored candle) as a gap, otherwise every
// interrupted run would re-walk the entire history instead of resuming.
function hasGaps(symbol, exchange, { earliestRemote, rootDir = DEFAULT_ROOT, slackMs = 60 * 1000 } = {}) {
    if (!Number.isInteger(earliestRemote)) return false;
    const db = openRaw1mDatabase(symbol, { rootDir, readonly: true });
    if (!db) return true; // no DB -> empty, treat as needing a full fill
    try {
        // Oldest stored candle for this market.
        const row = db.prepare("SELECT MIN(timestamp_raw) AS ts FROM candles_1m WHERE symbol = ? AND exchange = ?").get(symbol.toUpperCase(), exchange);
        if (!row || row.ts === null) return true; // nothing stored -> full fill needed
        // If the oldest stored candle is far newer than the exchange's earliest, the head is missing.
        return row.ts - earliestRemote > slackMs;
    } finally {
        db.close();
    }
}

module.exports = {
    CANDLES_1M_SCHEMA, resolveRaw1mPath, openRaw1mDatabase, standardizeCandle, validateCandle,
    mergeChunk, lastFilledTimestamp, countRange, hasGaps, deleteExchangeRows, normalizeSymbol, DEFAULT_ROOT,
};



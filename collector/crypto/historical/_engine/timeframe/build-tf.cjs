// Dynamic Timeframe Builder.
//
// Reads raw 1m candles straight from candles_1m.db and groups them into any supported higher timeframe
// on the fly. Nothing is persisted: every call recomputes from raw data, so the result is always current.
//
// Bucketing logic (see utils.cjs):
//   open        = open of the first 1m candle in the bucket
//   high        = max(high)
//   low         = min(low)
//   close       = close of the last 1m candle in the bucket
//   volume      = sum(volume)
//   quoteVolume = sum(quote_volume)

const { openRaw1mDatabase } = require("../../full/merge-into-1m-db.cjs");
const { assertTf, tfWidthMs, bucketFloor } = require("./utils.cjs");
const { DEFAULT_ROOT } = require("../root.cjs");
const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------------------
// S3 — Exchange memo (fixes the cold-start scan)
// ---------------------------------------------------------------------------
// Resolving the "most populated" exchange is a COUNT+GROUP BY over the symbol's
// whole index (~26-50 s on the 4.15 GB store). With the engine worker in place
// this no longer blocks HTTP, but a cold start still queues every request behind
// that scan (measured: cold /tf = 47.5 s).
//
// The result is stable for hours, so it is memoized on disk (a rebuildable
// cache file — NOT part of the raw store, D6) and reused across restarts:
//   memory cache (1 h)  →  disk memo (24 h)  →  SQLite scan (+ write memo)
const EXCHANGE_MEMO_FILE = process.env.HISTORICAL_EXCHANGE_MEMO || "";
const EXCHANGE_MEMO_TTL_MS = Number(process.env.HISTORICAL_EXCHANGE_MEMO_TTL_MS || 24 * 60 * 60 * 1000);

function memoPath() {
    if (EXCHANGE_MEMO_FILE) return EXCHANGE_MEMO_FILE;
    return path.join(__dirname, "..", "..", "api", ".cache", "exchange-memo.json");
}

function readExchangeMemo(symbol) {
    try {
        const raw = fs.readFileSync(memoPath(), "utf8");
        const parsed = JSON.parse(raw);
        const entry = parsed[String(symbol).toUpperCase()];
        if (!entry || !Array.isArray(entry.list) || !entry.list.length) return null;
        if (Date.now() - Number(entry.at || 0) > EXCHANGE_MEMO_TTL_MS) return null;
        return entry.list;
    } catch {
        return null; // فایل نیست/خراب است ⇒ مسیر عادی (اسکن) اجرا میشود
    }
}

function writeExchangeMemo(symbol, list) {
    try {
        const file = memoPath();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        let parsed = {};
        try {
            parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
            parsed = {};
        }
        parsed[String(symbol).toUpperCase()] = { list, at: Date.now() };
        fs.writeFileSync(file, JSON.stringify(parsed), "utf8");
    } catch {
        /* بیصدا: memo فقط بهینهسازی است، نه منبع حقیقت */
    }
}

// ---------------------------------------------------------------------------
// Performance layer (added for the historical API — no data/semantics change)
// ---------------------------------------------------------------------------
// Measured on crypto/BTCUSDT/candles_1m.db (4.15 GB, 2026-09-23):
//   · range-bounded aggregation for a 208-day window : ~0.8 s  (index-backed)
//   · resolving the default exchange ("most populated")
//       = GROUP BY exchange + COUNT(*) over the symbol's whole index : ~50 s
//         — and the old code ran that on EVERY request without ?exchange.
// Fixes here:
//   1) the connection + prepared statements are reused instead of open/close
//      per call (plus mmap/cache pragmas for read speed);
//   2) the exchange list is cached per symbol with a TTL and can be warmed at
//      server start, so the 50 s scan happens once per hour, not per request;
//   3) bucketing is done in SQL (fewer rows cross into JS, no JS re-loop).

const DB_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TTL_MS = 60 * 60 * 1000;

const DB_CACHE = new Map(); // symbol -> { db, at }
const EXCHANGE_CACHE = new Map(); // symbol -> { list, at }

// Reuses one readonly connection per symbol (the schema is tiny, the table is not).
function getDb(symbol, rootDir) {
    const key = `${rootDir}::${symbol}`;
    const hit = DB_CACHE.get(key);
    if (hit && Date.now() - hit.at < DB_TTL_MS) return hit.db;
    if (hit) { try { hit.db.close(); } catch { /* already closed */ } DB_CACHE.delete(key); }
    const db = openRaw1mDatabase(symbol, { rootDir, readonly: true });
    if (!db) return null;
    db.pragma("mmap_size = 268435456"); // 256 MB VM map — read-only, no file change
    db.pragma("cache_size = -64000"); // 64 MB page cache
    DB_CACHE.set(key, { db, at: Date.now() });
    return db;
}

// Test/DI hook: drop cached connections and exchange lists.
function clearCaches() {
    for (const { db } of DB_CACHE.values()) { try { db.close(); } catch { /* ignore */ } }
    DB_CACHE.clear();
    EXCHANGE_CACHE.clear();
}


// Builds one aggregated candle from an ordered list of raw 1m rows belonging to a single bucket.
function aggregateBucket(rows) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let quoteVolume = 0;
    let trades = 0;
    for (const r of rows) {
        if (r.high > high) high = r.high;
        if (r.low < low) low = r.low;
        if (Number.isFinite(r.volume)) volume += r.volume;
        if (Number.isFinite(r.quote_volume)) quoteVolume += r.quote_volume;
        if (Number.isFinite(r.number_of_trades)) trades += r.number_of_trades;
    }
    return Object.freeze({
        timestamp: first.timestamp_raw,
        open: first.open,
        high: high === -Infinity ? first.open : high,
        low: low === Infinity ? first.close : low,
        close: last.close,
        volume,
        quoteVolume,
        trades,
    });
}

// Builds the WHERE fragment (and bound values) shared by the raw reader and the SQL aggregator.
function rangeFilter(symbol, exchange, from, to) {
    const clauses = ["symbol = ?"];
    const values = [symbol.toUpperCase()];
    if (exchange) {
        clauses.push("exchange = ?");
        values.push(exchange);
    }
    if (Number.isInteger(from)) { clauses.push("timestamp_raw >= ?"); values.push(from); }
    if (Number.isInteger(to)) { clauses.push("timestamp_raw <= ?"); values.push(to); }
    return { where: clauses.join(" AND "), values };
}

// Reads raw 1m rows for a symbol (optionally a specific exchange) within [from, to], ascending.
// ⚠️ Uses the shared readonly connection (getDb) — callers must NOT close it.
function readRaw1m(symbol, exchange, from, to, rootDir) {
    const db = getDb(symbol, rootDir);
    if (!db) return [];
    const { where, values } = rangeFilter(symbol, exchange, from, to);
    return db.prepare(`SELECT * FROM candles_1m WHERE ${where} ORDER BY timestamp_raw ASC`).all(...values);
}

// ---------------------------------------------------------------------------
// SQL-side aggregation (the hot path)
// ---------------------------------------------------------------------------
// Identical bucket semantics to aggregateBucket(), but computed by SQLite:
//   open = open of the first 1m candle in the bucket · high/low = max/min
//   close = close of the last 1m candle in the bucket · volume… = sums
//   timestamp = bucket start (UTC epoch-aligned floor == bucketFloor)
// ⚠️ The divisor MUST be bound/cast as an INTEGER: binding it as a REAL turns
//    `/` into real division, so every row becomes its own bucket (measured bug:
//    272,930 buckets instead of 5,000 for a 208-day window).
const AGG_SQL = (where) => `
WITH x AS (
    SELECT timestamp_raw, open, high, low, close, volume, quote_volume, number_of_trades,
           (timestamp_raw / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS bucket
    FROM candles_1m WHERE ${where}
),
b AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY timestamp_raw ASC)  AS rn_a,
           ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY timestamp_raw DESC) AS rn_z
    FROM x
)
SELECT bucket AS timestamp,
       MAX(CASE WHEN rn_a = 1 THEN open END)  AS open,
       MAX(high) AS high,
       MIN(low)  AS low,
       MAX(CASE WHEN rn_z = 1 THEN close END) AS close,
       SUM(volume) AS volume,
       SUM(quote_volume) AS quoteVolume,
       SUM(number_of_trades) AS trades
FROM b GROUP BY bucket ORDER BY bucket ASC`;

function aggregateRangeSql(symbol, exchange, tfKey, from, to, rootDir) {
    const db = getDb(symbol, rootDir);
    if (!db) return [];
    const width = tfWidthMs(tfKey);
    const { where, values } = rangeFilter(symbol, exchange, from, to);
    const rows = db.prepare(AGG_SQL(where)).all(width, width, ...values);
    return rows.map((r) => Object.freeze({
        timestamp: r.timestamp,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume ?? 0,
        quoteVolume: r.quoteVolume ?? 0,
        trades: r.trades ?? 0,
    }));
}

// JS fallback (the original code path) — used only if the SQL aggregation fails
// (e.g. an SQLite build without window functions or an unexpected schema).
function aggregateRangeJs(symbol, exchange, tfKey, from, to, rootDir) {
    const rows = readRaw1m(symbol, exchange, from, to, rootDir);
    if (rows.length === 0) return [];
    const candles = [];
    let bucketStart = null;
    let bucketRows = [];
    const flush = () => {
        if (bucketRows.length > 0) candles.push(aggregateBucket(bucketRows));
        bucketRows = [];
    };
    for (const row of rows) {
        const start = bucketFloor(row.timestamp_raw, tfKey);
        if (bucketStart === null || start !== bucketStart) {
            flush();
            bucketStart = start;
        }
        bucketRows.push(row);
    }
    flush();
    return candles;
}

// Returns the distinct exchanges present for a symbol, ordered by row count descending (the most-populated
// exchange first). Used to pick a sensible default when the caller does not specify one.
// ⚠️ **Cached**: this COUNT+GROUP BY walks the symbol's whole index (~50 s on the
// 4.15 GB BTCUSDT store). Caching it per symbol is what turns the no-`?exchange`
// path from "50 s per request" into "50 s once per hour" (see warmExchangeCache).
function listExchanges(symbol, rootDir = DEFAULT_ROOT) {
    const key = `${rootDir}::${symbol.toUpperCase()}`;
    const hit = EXCHANGE_CACHE.get(key);
    if (hit && Date.now() - hit.at < EXCHANGE_TTL_MS) return hit.list;
    /** S3: memo دیسکی ⇒ راه‌اندازی سرد بعدی **بدون اسکن** (نه منبع حقیقت) */
    const memo = readExchangeMemo(symbol);
    if (memo) {
        EXCHANGE_CACHE.set(key, { list: memo, at: Date.now() });
        return memo;
    }
    const db = getDb(symbol, rootDir);
    if (!db) return [];
    const list = db
        .prepare("SELECT exchange, COUNT(*) AS n FROM candles_1m WHERE symbol = ? GROUP BY exchange ORDER BY n DESC")
        .all(symbol.toUpperCase())
        .map((r) => r.exchange);
    EXCHANGE_CACHE.set(key, { list, at: Date.now() });
    writeExchangeMemo(symbol, list);
    return list;
}

/**
 * S1 — **probe ارزان تازگی:** آخرین `timestamp_raw` یک نماد/صرافی.
 * `MAX()` روی ایندکس PK اجرا می‌شود ⇒ O(log n) و در حد میلی‌ثانیه (بدون اسکن).
 * @returns timestamp (ms) یا `null`
 */
function latestTimestampRaw(symbol, exchange = null, rootDir = DEFAULT_ROOT) {
    const db = getDb(symbol, rootDir);
    if (!db) return null;
    const clauses = ["symbol = ?"];
    const values = [symbol.toUpperCase()];
    if (exchange) {
        clauses.push("exchange = ?");
        values.push(exchange);
    }
    const row = db
        .prepare(`SELECT MAX(timestamp_raw) AS ts FROM candles_1m WHERE ${clauses.join(" AND ")}`)
        .get(...values);
    return row && row.ts !== null && row.ts !== undefined ? Number(row.ts) : null;
}

// Warms the exchange cache for the given symbols — call once after the server
// starts listening so the first user request never pays the scan.
function warmExchangeCache(symbols, rootDir = DEFAULT_ROOT) {
    const out = [];
    for (const s of symbols) {
        const t0 = Date.now();
        const list = listExchanges(s, rootDir);
        out.push({ symbol: s.toUpperCase(), exchanges: list.length, first: list[0] ?? null, ms: Date.now() - t0 });
    }
    return out;
}

// Builds higher-timeframe candles from raw 1m data.
//
// buildTf(symbol, tf, { exchange, from, to, rootDir }):
//   - exchange: optional; when omitted, the most-populated exchange for the symbol is used.
//   - from/to:  optional inclusive epoch-ms window (raw 1m timestamps are bucketed, so the returned
//               candles are complete buckets that overlap the window).
//   Returns an ordered array of aggregated candles.
function buildTf(symbol, tf, { exchange = null, from = null, to = null, rootDir = DEFAULT_ROOT } = {}) {
    const resolved = symbol.trim().toUpperCase();
    const key = assertTf(tf);

    let resolvedExchange = exchange;
    if (!resolvedExchange) {
        const exchanges = listExchanges(resolved, rootDir); // cached — see listExchanges()
        resolvedExchange = exchanges[0] ?? null;
    }
    if (!resolvedExchange) return [];

    /**
     * Hot path: aggregation inside SQLite over the PRIMARY KEY index
     * (symbol, exchange, timestamp_raw) ⇒ the window is an index range scan,
     * the output is one row per bucket, and no JS object churn happens.
     * On failure the original JS path runs unchanged (defensive: an engine
     * detail must never take the endpoint down).
     */
    try {
        return aggregateRangeSql(resolved, resolvedExchange, key, from, to, rootDir);
    } catch (err) {
        console.warn(`[build-tf] SQL aggregation failed, falling back to JS: ${err && err.message}`);
        return aggregateRangeJs(resolved, resolvedExchange, key, from, to, rootDir);
    }
}

module.exports = {
    buildTf,
    aggregateBucket,
    readRaw1m,
    listExchanges,
    // Performance/hot-path helpers (see the notes at the top of the file).
    warmExchangeCache,
    clearCaches,
    aggregateRangeSql,
    aggregateRangeJs,
    /** S1: probe ارزان تازگی داده (`MAX(timestamp_raw)` روی ایندکس PK). */
    latestTimestampRaw,
};

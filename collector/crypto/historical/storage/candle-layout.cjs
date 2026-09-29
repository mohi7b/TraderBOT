/* ============================================================
 * File: collector/crypto/historical/storage/candle-layout.cjs
 * Section: collector/crypto/historical/storage
 * Version: 1.0.0
 *
 * Role:
 *   Where a 1m candle file lives, and what its name is allowed to say.
 *   The layout is the contract between the downloader (one SQLite per
 *   symbol), this storage engine (monthly Parquet) and everything that
 *   reads them later (analytics-engine, the chart API):
 *
 *     <root>/crypto/<exchange>/<SYMBOL>/1m/<YYYY-MM>.parquet
 *
 *   Nothing here touches the filesystem or the clock, so "which file
 *   holds 2025-01 of binance_spot/BTCUSDT" is a fact a test can state
 *   rather than a convention a comment hopes for.
 *
 *   `exchange` is the downloader's own key — `<venue>_<marketType>`
 *   ("binance_spot", "okx_futures") — so a spot file and a futures file
 *   can never be mistaken for one another, and no symbol is ever
 *   searched for across venues.
 * ============================================================ */

const path = require("node:path");

const ONE_MINUTE_MS = 60_000;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** <venue>_<spot|futures> — the key collector/crypto/historical stores. */
const EXCHANGE_RE = /^[a-z0-9]{2,20}_(spot|futures)$/;
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;
const FILE_RE = /^(\d{4}-\d{2})\.parquet$/;
/** A partially written month: never readable as data. */
const TEMP_PREFIX = ".tmp-";

const DEFAULT_ROOT = path.join(__dirname, "..", "..", "..", "..", "data", "historical");

function assertSymbol(symbol) {
    if (typeof symbol !== "string" || !SYMBOL_RE.test(symbol)) {
        throw new RangeError(`symbol must be uppercase alphanumeric (e.g. BTCUSDT), got ${JSON.stringify(symbol)}`);
    }
    return symbol;
}

function assertExchange(exchange) {
    if (typeof exchange !== "string" || !EXCHANGE_RE.test(exchange)) {
        throw new RangeError(`exchange must be <venue>_<spot|futures> (e.g. binance_spot), got ${JSON.stringify(exchange)}`);
    }
    return exchange;
}

function assertMonthKey(monthKey) {
    if (typeof monthKey !== "string" || !MONTH_RE.test(monthKey)) {
        throw new RangeError(`monthKey must be YYYY-MM (e.g. 2025-01), got ${JSON.stringify(monthKey)}`);
    }
    return monthKey;
}

/** "YYYY-MM" of an epoch-ms instant, in UTC. */
function monthKeyOf(timestamp) {
    const at = new Date(Number(timestamp));
    if (!Number.isFinite(at.getTime())) throw new RangeError(`monthKeyOf: ${timestamp} is not a timestamp`);
    return `${at.toISOString().slice(0, 4)}-${at.toISOString().slice(5, 7)}`;
}

/** [from, to) epoch-ms of one month key — the window a month file may hold. */
function monthBounds(monthKey) {
    assertMonthKey(monthKey);
    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    const from = Date.UTC(year, month - 1, 1);
    const to = Date.UTC(year, month, 1);
    return Object.freeze({ from, to });
}

/** Epoch ms floored to its minute — the only honest 1m timestamp. */
function minuteOf(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) throw new RangeError(`minuteOf: ${timestamp} is not a timestamp`);
    return Math.floor(value / ONE_MINUTE_MS) * ONE_MINUTE_MS;
}

/** The next month key: "2025-12" → "2026-01". */
function nextMonth(monthKey) {
    return monthKeyOf(monthBounds(monthKey).to);
}

/** <root>/crypto/<exchange>/<SYMBOL>/1m */
function datasetDir(root, exchange, symbol) {
    return path.join(root, "crypto", assertExchange(exchange), assertSymbol(symbol), "1m");
}

/** The one file that holds one month of one dataset. */
function monthFile(root, exchange, symbol, monthKey) {
    return path.join(datasetDir(root, exchange, symbol), `${assertMonthKey(monthKey)}.parquet`);
}

/** "2025-01" for a readable month file, or null for anything else. */
function monthOfFile(name) {
    if (typeof name !== "string") return null;
    const match = name.match(FILE_RE);
    return match ? match[1] : null;
}

/** Is this the leftover of an interrupted write? (never data) */
function isTempName(name) {
    return typeof name === "string" && name.startsWith(TEMP_PREFIX);
}

/** The path template, printed by the CLI so the promise is visible. */
function describeLayout(root = DEFAULT_ROOT) {
    return path.join(root, "crypto", "<exchange>", "<SYMBOL>", "1m", "<YYYY-MM>.parquet");
}

module.exports = {
    ONE_MINUTE_MS,
    MONTH_RE,
    EXCHANGE_RE,
    SYMBOL_RE,
    TEMP_PREFIX,
    DEFAULT_ROOT,
    assertSymbol,
    assertExchange,
    assertMonthKey,
    monthKeyOf,
    monthBounds,
    minuteOf,
    nextMonth,
    datasetDir,
    monthFile,
    monthOfFile,
    isTempName,
    describeLayout
};

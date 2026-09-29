/* ============================================================
 * File: collector/crypto/historical/storage/candle-store.cjs
 * Section: collector/crypto/historical/storage
 * Version: 1.0.0
 *
 * Role:
 *   The 1m candle storage engine: one SQLite row set in, one monthly
 *   Parquet file out (and back again). It replaces "4.3 GB of SQLite per
 *   symbol" with files a columnar reader can scan:
 *
 *     <root>/crypto/<exchange>/<SYMBOL>/1m/<YYYY-MM>.parquet
 *
 *   Three promises are enforced here rather than assumed:
 *
 *     A file holds exactly its month. A row whose timestamp falls outside
 *     the month it is written to is refused, not silently filed away.
 *     A write is atomic. Rows go to a temp file that is only renamed once
 *     the Parquet footer is closed, so a reader never sees half a month.
 *     A number is a number or it is null. Prices must be positive, high
 *     must not be below low, and a missing volume stays null.
 *
 *   Rejected rows are handed back with their reasons, so a migration can
 *   be strict (throw on the first problem) or honest (write what is real,
 *   report what was not).
 * ============================================================ */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const parquet = require("parquetjs-lite");

const layout = require("./candle-layout.cjs");

const COMPRESSIONS = Object.freeze(["SNAPPY", "GZIP", "UNCOMPRESSED"]);
const DEFAULT_COMPRESSION = "SNAPPY";
const PRICE_FIELDS = Object.freeze(["open", "high", "low", "close"]);

/** The schema, written out: an epoch, four prices, and optional counts. */
function candleSchema({ compression = DEFAULT_COMPRESSION } = {}) {
    if (!COMPRESSIONS.includes(compression)) {
        throw new RangeError(`compression must be one of ${COMPRESSIONS.join("|")}, got ${JSON.stringify(compression)}`);
    }
    return new parquet.ParquetSchema({
        timestamp: { type: "INT64", compression },
        open: { type: "DOUBLE", compression },
        high: { type: "DOUBLE", compression },
        low: { type: "DOUBLE", compression },
        close: { type: "DOUBLE", compression },
        volume: { type: "DOUBLE", optional: true, compression },
        /* Older venues published neither of these: null, never 0. */
        quoteVolume: { type: "DOUBLE", optional: true, compression },
        trades: { type: "INT32", optional: true, compression },
        exchange: { type: "UTF8", compression },
        symbol: { type: "UTF8", compression }
    });
}

/**
 * Whatever a Parquet reader hands back for an INT64 → epoch ms.
 * parquetjs may return a number, a BigInt, a numeric string or a
 * high/low pair; anything else is a bug and says so.
 */
function toEpochMs(value, { quiet = false } = {}) {
    const refuse = () => {
        if (quiet) return null;
        throw new TypeError(`not an epoch-ms timestamp: ${JSON.stringify(value)}`);
    };
    if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : refuse();
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string") {
        const number = Number(value);
        return Number.isFinite(number) ? Math.trunc(number) : refuse();
    }
    if (Array.isArray(value) && value.length === 2 && value.every((part) => Number.isFinite(part))) {
        /* parquetjs Long tuple: [high, low]. */
        return value[0] * 2 ** 32 + (value[1] >>> 0);
    }
    if (value && typeof value === "object" && Number.isFinite(value.high) && Number.isFinite(value.low)) {
        return value.high * 2 ** 32 + (value.low >>> 0);
    }
    return refuse();
}

/** Why this row may not live in this month file (empty array: it may). */
function candleProblems(row, { monthKey, bounds }) {
    const problems = [];
    if (!row || typeof row !== "object") return [`row is not an object: ${JSON.stringify(row)}`];

    const at = toEpochMs(row.timestamp, { quiet: true });
    if (at === null) problems.push(`timestamp is not an epoch-ms number: ${JSON.stringify(row.timestamp)}`);
    else if (at < bounds.from || at >= bounds.to) {
        problems.push(`timestamp ${new Date(at).toISOString()} is outside ${monthKey} (${new Date(bounds.from).toISOString()} → ${new Date(bounds.to).toISOString()})`);
    }

    for (const field of PRICE_FIELDS) {
        const value = Number(row[field]);
        if (!Number.isFinite(value) || value <= 0) problems.push(`${field} is not a positive price (${JSON.stringify(row[field])})`);
    }
    if (Number(row.high) < Number(row.low)) problems.push(`high ${row.high} is below low ${row.low}`);
    if (Number(row.open) > Number(row.high) || Number(row.low) > Number(row.open)) problems.push("open is outside the high/low range");
    if (Number(row.close) > Number(row.high) || Number(row.low) > Number(row.close)) problems.push("close is outside the high/low range");

    for (const field of ["volume", "quoteVolume"]) {
        if (row[field] === null || row[field] === undefined) continue;
        const value = Number(row[field]);
        if (!Number.isFinite(value) || value < 0) problems.push(`${field} is not a non-negative number (${JSON.stringify(row[field])})`);
    }
    if (row.trades !== null && row.trades !== undefined && !Number.isFinite(Number(row.trades))) {
        problems.push(`trades is not a number (${JSON.stringify(row.trades)})`);
    }
    return problems;
}

/** sha256 of a file, streamed so a month file never has to fit in memory. */
function hashFile(file) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        fs.createReadStream(file)
            .on("data", (chunk) => hash.update(chunk))
            .on("end", () => resolve(hash.digest("hex")))
            .on("error", reject);
    });
}

function nullableNumber(value) {
    if (value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/** One Parquet row → one candle, with the epoch as a plain number. */
function toCandle(row) {
    return Object.freeze({
        timestamp: toEpochMs(row.timestamp),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: nullableNumber(row.volume),
        quoteVolume: nullableNumber(row.quoteVolume),
        trades: nullableNumber(row.trades),
        exchange: row.exchange,
        symbol: row.symbol
    });
}

/**
 * The store.
 * @param {object} [options]
 * @param {string} [options.root]        data root (default: <repo>/data/historical)
 * @param {string} [options.compression] SNAPPY | GZIP | UNCOMPRESSED
 */
function openStore({ root = layout.DEFAULT_ROOT, compression = DEFAULT_COMPRESSION } = {}) {
    const schema = candleSchema({ compression });

    function datasetDir(exchange, symbol) {
        return layout.datasetDir(root, exchange, symbol);
    }

    /** Months present on disk, oldest first (interrupted writes are not months). */
    function months(exchange, symbol) {
        const dir = datasetDir(exchange, symbol);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).map(layout.monthOfFile).filter(Boolean).sort();
    }

    function stats(exchange, symbol) {
        const list = months(exchange, symbol);
        let bytes = 0;
        for (const monthKey of list) bytes += fs.statSync(layout.monthFile(root, exchange, symbol, monthKey)).size;
        return Object.freeze({
            exchange,
            symbol,
            dir: datasetDir(exchange, symbol),
            months: list.length,
            bytes,
            firstMonth: list[0] || null,
            lastMonth: list[list.length - 1] || null
        });
    }

    /** Split a row set into the rows this month may hold and the rows it may not. */
    function prepare({ exchange, symbol, monthKey, rows = [], strict = false }) {
        layout.assertExchange(exchange);
        layout.assertSymbol(symbol);
        layout.assertMonthKey(monthKey);
        const bounds = layout.monthBounds(monthKey);
        const accepted = [];
        const rejected = [];

        for (const row of rows) {
            const problems = candleProblems(row, { monthKey, bounds });
            if (problems.length) {
                if (strict) throw new RangeError(`${exchange}/${symbol} ${monthKey}: ${problems.join("; ")}`);
                rejected.push(Object.freeze({ row, problems: Object.freeze(problems) }));
                continue;
            }
            accepted.push({
                timestamp: layout.minuteOf(toEpochMs(row.timestamp)),
                open: Number(row.open),
                high: Number(row.high),
                low: Number(row.low),
                close: Number(row.close),
                volume: nullableNumber(row.volume),
                quoteVolume: nullableNumber(row.quoteVolume),
                trades: row.trades === null || row.trades === undefined ? null : Math.trunc(Number(row.trades)),
                exchange,
                symbol
            });
        }

        accepted.sort((left, right) => left.timestamp - right.timestamp);
        return { accepted, rejected, bounds, file: layout.monthFile(root, exchange, symbol, monthKey) };
    }

    /**
     * Write one month, atomically. An empty month is not a file.
     * @returns {Promise<object>} {file, rows, bytes, sha256, rejected, written}
     */
    async function writeMonth({ exchange, symbol, monthKey, rows = [], strict = false }) {
        const plan = prepare({ exchange, symbol, monthKey, rows, strict });
        const existing = fs.existsSync(plan.file);

        if (plan.accepted.length === 0) {
            return Object.freeze({
                file: plan.file, rows: 0, bytes: 0, sha256: null, replaced: false, existing,
                rejected: plan.rejected, written: false,
                reason: plan.rejected.length ? "every row was refused" : "the month is empty"
            });
        }

        fs.mkdirSync(path.dirname(plan.file), { recursive: true });
        const temp = path.join(path.dirname(plan.file), `${layout.TEMP_PREFIX}${process.pid}-${monthKey}.parquet`);
        const writer = await parquet.ParquetWriter.openFile(schema, temp);
        try {
            for (const row of plan.accepted) await writer.appendRow(row);
            await writer.close();
        } catch (err) {
            try { await writer.close(); } catch (ignored) { /* already closed */ }
            if (fs.existsSync(temp)) fs.unlinkSync(temp);
            throw err;
        }

        fs.renameSync(temp, plan.file); /* the only moment a reader can see this month */
        return Object.freeze({
            file: plan.file,
            rows: plan.accepted.length,
            bytes: fs.statSync(plan.file).size,
            sha256: await hashFile(plan.file),
            rejected: plan.rejected,
            written: true,
            replaced: existing
        });
    }

    /** Every candle of one month, oldest first (empty when the month is absent). */
    async function readMonth({ exchange, symbol, monthKey }) {
        const file = layout.monthFile(root, exchange, symbol, monthKey);
        if (!fs.existsSync(file)) return [];

        const reader = await parquet.ParquetReader.openFile(file);
        const rows = [];
        try {
            const cursor = reader.getCursor();
            let row = await cursor.next();
            while (row) {
                rows.push(toCandle(row));
                row = await cursor.next();
            }
        } finally {
            await reader.close();
        }
        rows.sort((left, right) => left.timestamp - right.timestamp);
        return rows;
    }

    /** [from, to) candles, read month by month so memory stays bounded. */
    async function readRange({ exchange, symbol, from, to = Infinity }) {
        const fromMs = Number(from);
        const toMs = Number(to);
        if (!Number.isFinite(fromMs)) throw new RangeError("readRange: from must be an epoch-ms number");

        const wanted = months(exchange, symbol).filter((monthKey) => {
            const bounds = layout.monthBounds(monthKey);
            return bounds.to > fromMs && bounds.from < toMs;
        });

        const rows = [];
        for (const monthKey of wanted) {
            for (const row of await readMonth({ exchange, symbol, monthKey })) {
                if (row.timestamp >= fromMs && row.timestamp < toMs) rows.push(row);
            }
        }
        return rows.sort((left, right) => left.timestamp - right.timestamp);
    }

    return { root, compression, schema, datasetDir, months, stats, prepare, writeMonth, readMonth, readRange };
}

module.exports = {
    COMPRESSIONS,
    DEFAULT_COMPRESSION,
    candleSchema,
    toEpochMs,
    candleProblems,
    toCandle,
    hashFile,
    openStore
};

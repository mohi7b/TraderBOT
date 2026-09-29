// Schedules the full download: finds the last filled timestamp, builds consecutive 300-candle ranges
// from the earliest remote candle to the latest remote candle, and runs fetch-chunk + merge for each.
// It is resumable: if interrupted, the next run resumes from last_filled_timestamp.
const { fetchChunk } = require("./fetch-chunk.cjs");
const { openRaw1mDatabase, mergeChunk, lastFilledTimestamp, hasGaps } = require("./merge-into-1m-db.cjs");
const { createRateController, DEFAULT_CHUNK_SIZE } = require("./rate-controller.cjs");

const MINUTE_MS = 60 * 1000;

// Recovery / retry tuning for transient download failures: an interrupted fetch-chunk of a single range
// must NOT kill the whole worker — we retry the same range a few times (with ~10s between attempts)
// before giving up.
const DEFAULT_MAX_RECOVERY_ATTEMPTS = 6;
const RECOVERY_SLEEP_MS = 10 * 1000;
const recoverySleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// classifies an error thrown by fetchChunk / the HTTP layer. client.cjs throws a plain Error like
// "HTTP 429 for <url>" (no numeric .status), so we parse the status out of the message.
//   hard === true  -> rate-limit / ban / forbidden (429/418/403): do NOT auto-retry (IP may be restricted);
//                     surface immediately.
//   hard === false && retryable === true -> transient (5xx/network/timeout): safe to wait ~10s and retry.
function classifyError(error) {
    const msg = (error && (error.message || String(error))) || "unknown error";
    let httpStatus = null;
    if (error && Number.isInteger(error.status)) {
        httpStatus = error.status;
    } else {
        const m = msg.match(/HTTP[ /]([1-5][0-9][0-9])/);
        if (m) httpStatus = Number(m[1]);
    }
    const text = msg.toLowerCase();
    const isLimit = httpStatus === 429 || httpStatus === 418 || httpStatus === 403
        || /rate ?limit|too many|banned|forbidden|\b429\b|\b418\b|\b403\b/i.test(text);
    const is500 = httpStatus !== null && httpStatus >= 500;
    return {
        httpStatus,
        hard: isLimit,
        retryable: !isLimit && (is500 || /timeout|fetch|econnreset|etimedout|socket hang up|network|interrupted|abort/i.test(text)),
        message: msg,
    };
}


// Runs one fetch-chunk of a single range with automatic recovery on TRANSIENT errors only.
// Hard errors (rate-limit / ban / forbidden, e.g. 429/418/403) are NOT auto-retried (requirement #1): we
// surface them immediately so a limited/banned IP is never hammered harder. Between recovery attempts we
// wait ~10s (requirement #2). Meaningful error codes/messages are logged (requirement #3).
async function fetchChunkWithRecovery({ symbol, exchange, range, fetchImpl, timeoutMs, rateController, logger, maxAttempts = DEFAULT_MAX_RECOVERY_ATTEMPTS }) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await fetchChunk({
                symbol, exchange, startTime: range.from, endTime: range.to,
                rateController, fetchImpl, timeoutMs,
            });
        } catch (error) {
            lastError = error;
            const cls = classifyError(error);
            if (cls.hard) throw error; // rate-limit / ban / forbidden: do not keep retrying
            if (attempt < maxAttempts) {
                const codeTxt = cls.httpStatus !== null ? ` HTTP ${cls.httpStatus}` : "";
                const reason = cls.message ? ` — ${cls.message.slice(0, 200)}` : "";
                logger(`[recovery] ${exchange} chunk ${new Date(range.from).toISOString()} attempt ${attempt}/${maxAttempts} failed; retrying in ~10s.${codeTxt}${reason}`);
                await recoverySleep(RECOVERY_SLEEP_MS);
            } else {
                const codeTxt = cls.httpStatus !== null ? ` (HTTP ${cls.httpStatus})` : "";
                const reason = cls.message ? ` — ${cls.message.slice(0, 300)}` : "";
                logger(`[recovery] Giving up ${exchange} chunk ${new Date(range.from).toISOString()} after ${maxAttempts} attempts.${codeTxt}${reason}`);
            }
        }
    }
    throw lastError || new Error(`fetchChunkWithRecovery gave up for ${exchange} at ${range.from}`);
}

function progressReporter({ totalChunks, log = (m) => process.stdout.write(`[scheduler] ${m}\n`) }) {
    let completed = 0;
    const startedAt = Date.now();
    return Object.freeze({
        tick({ inserted, latestTs, elapsedMs }) {
            completed += 1;
            const pct = totalChunks ? Math.round((completed / totalChunks) * 100) : 100;
            const perChunk = elapsedMs > 0 ? completed / (elapsedMs / 1000) : 0;
            const remainingChunks = Math.max(0, totalChunks - completed);
            const etaSeconds = perChunk > 0 ? remainingChunks / perChunk : 0;
            log(`پیشرفت: ${completed}/${totalChunks} (${pct}%) | inserted=${inserted} | آخری=${new Date(latestTs).toISOString()} | ETA≈${Math.round(etaSeconds)}s`);
        },
    });
}

async function runScheduler({ symbol, exchange, earliestRemote, latestRemote, fetchImpl, timeoutMs, rootDir, log, rateController, fresh = false } = {}) {
    if (typeof symbol !== "string" || symbol.trim() === "") throw new TypeError("symbol is required");
    if (typeof exchange !== "string" || exchange.trim() === "") throw new TypeError("exchange is required");
    if (!Number.isInteger(earliestRemote) || !Number.isInteger(latestRemote) || latestRemote < earliestRemote) {
        throw new RangeError("earliestRemote/latestRemote must be valid epoch-ms with latest >= earliest");
    }

    const controller = rateController || createRateController();
    const logger = log || ((m) => process.stdout.write(`[scheduler] ${m}\n`));

    // Resume point. We only trust the last-filled timestamp as a resume point when the store has no gaps
    // between the exchange's earliest and latest served candles; otherwise a naive MAX(timestamp) resume
    // would silently skip over holes (e.g. data present only from 13:28 today, with 2019→2026 empty).
    // `fresh` forces a full re-walk from the exchange's earliest candle regardless of what is stored.
    const lastFilled = lastFilledTimestamp(symbol, exchange, { rootDir });
    const gaps = !fresh && hasGaps(symbol, exchange, { earliestRemote, rootDir });
    if (gaps) logger(`Gap detected in stored range — restarting from ${new Date(earliestRemote).toISOString()}`);

    let cursorStart = earliestRemote;
    if (!fresh && !gaps && Number.isInteger(lastFilled) && lastFilled >= earliestRemote) {
        cursorStart = lastFilled + MINUTE_MS;
    }

    // Build consecutive 300-candle ranges.
    const ranges = [];
    let from = cursorStart;
    while (from <= latestRemote) {
        const to = Math.min(from + (DEFAULT_CHUNK_SIZE - 1) * MINUTE_MS, latestRemote);
        ranges.push({ from, to });
        if (to >= latestRemote) break;
        from = to + MINUTE_MS;
    }

    const report = progressReporter({ totalChunks: ranges.length, log: logger });
    const db = openRaw1mDatabase(symbol, { rootDir });

    let totalInserted = 0;
    try {
        for (const range of ranges) {
            const chunkStartedAt = Date.now();
            const chunk = await fetchChunkWithRecovery({
                symbol, exchange, range, fetchImpl, timeoutMs, rateController: controller, logger,
            });
            const inserted = mergeChunk(db, chunk.rows);
            totalInserted += inserted;
            report.tick({ inserted, latestTs: chunk.rows.length ? chunk.rows[chunk.rows.length - 1].timestamp_raw : range.to, elapsedMs: Date.now() - chunkStartedAt });
        }
    } finally {
        db.close();
    }

    return Object.freeze({ symbol, exchange, ranges: ranges.length, totalInserted, lastFilled: cursorStart });
}

module.exports = { runScheduler, progressReporter, fetchChunkWithRecovery, classifyError, DEFAULT_MAX_RECOVERY_ATTEMPTS, RECOVERY_SLEEP_MS, MINUTE_MS };

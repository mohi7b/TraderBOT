// Real-Time 1m Updater: incrementally updates the raw candles_1m store with only the newest 1m candles
// for a given standard exchange key ("<venue>_<marketType>").
//
// Spot and futures (and swap/delivery/inverse) are fully separated: each has its own exchange key, its
// own resume point (last_filled per (symbol, exchange)), and its own API market. Nothing is overwritten;
// merge uses the (symbol, exchange, timestamp_raw) primary key so spot/futures never mix.
const { createVenueFetchers } = require("../_engine/fetch/venues.cjs");
const { fetchChunk } = require("./fetch-chunk.cjs");
const { createRateController, DEFAULT_CHUNK_SIZE } = require("./rate-controller.cjs");
const { openRaw1mDatabase, mergeChunk, lastFilledTimestamp, resolveRaw1mPath } = require("./merge-into-1m-db.cjs");
const { buildExchangeKey, splitExchangeKey, apiMarketOf } = require("./markets.cjs");
const fs = require("node:fs");
const path = require("node:path");

const MINUTE_MS = 60 * 1000;

/**
 * **S4 — sidecar تازگی (O(1)):** کلکتور همان لحظه می‌داند چه کندلی نوشته ⇒ آن را
 * کنار DB می‌نویسد (`latest.json`). سرویس تاریخی این را با **یک خواندن فایل**
 * برمی‌دارد، به‌جای `MAX(timestamp_raw)` که روی ۴٫۷۸M ردیف **۵۰–۷۵ ثانیه** است ✗.
 * `dbMtimeMs` هم ثبت می‌شود تا اعتبار قابل‌سنجش باشد (اگر فایل DB بعد از این لحظه
 * تغییر کند، سرویس sidecar را کهنه می‌داند و به probe برمی‌گردد ✓).
 * خطای نوشتن ⇒ **fail-open** (سرویس به probe برمی‌گردد، هیچ‌چیز نمی‌شکند).
 */
function writeLatestSidecar(symbol, exchangeKey, latestTs, rootDir) {
    try {
        const dbPath = resolveRaw1mPath(symbol, { rootDir });
        const st = fs.statSync(dbPath);
        const file = path.join(path.dirname(dbPath), "latest.json");
        fs.writeFileSync(file, JSON.stringify({
            symbol,
            exchange: exchangeKey,
            latest: latestTs,
            dbMtimeMs: Math.round(st.mtimeMs),
            dbSize: st.size,
            at: Date.now(),
        }));
        return true;
    } catch {
        return false;
    }
}

// Newest candle open time the venue currently serves for the given API market. A 5-minute window with
// limit=100 is safe across all venues (OKX caps at 100) and captures the newest minute.
async function latestRemote(fetcher, symbol, market, now = Date.now()) {
    const page = await fetcher.fetchKlines({ symbol, market, startTime: now - 5 * MINUTE_MS, endTime: undefined, limit: 100 });
    return page.length ? Math.max(...page.map((c) => c.openTime)) : null;
}

// Update one exchange-key's raw 1m store. Returns a summary of the update.
async function update1m(symbol, { exchange, market = "spot", fetchImpl, timeoutMs, rootDir, now = Date.now(), log = () => {}, rateController } = {}) {
    const resolved = symbol.trim().toUpperCase();
    const exchangeKey = exchange.includes("_") ? exchange : buildExchangeKey(exchange, market);
    const { venue } = splitExchangeKey(exchangeKey);
    const apiMarket = apiMarketOf(exchangeKey);

    const fetcher = createVenueFetchers({ venues: [venue], fetchImpl, timeoutMs })[0];
    if (!fetcher) throw new RangeError(`Unknown exchange: ${venue}`);

    const lastFilled = lastFilledTimestamp(resolved, exchangeKey, { rootDir });
    const latest = await latestRemote(fetcher, resolved, apiMarket, now);

    if (!Number.isInteger(latest)) {
        return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: false, reason: "no-remote", lastFilled, latest: null });
    }

    if (lastFilled === null) {
        return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: false, reason: "empty-db", lastFilled: null, latest });
    }

    const nextFrom = lastFilled + MINUTE_MS;
    if (latest <= lastFilled) {
        /** S4: sidecar هم به‌روز می‌شود (حتی بدون نوشتن ⇒ «DB همین‌جاست» صریح می‌شود) */
        writeLatestSidecar(resolved, exchangeKey, lastFilled, rootDir);
        return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: false, reason: "up-to-date", lastFilled, latest });
    }

    const controller = rateController || createRateController();
    const db = openRaw1mDatabase(resolved, { rootDir });

    let totalInserted = 0;
    let cursor = nextFrom;
    /** S4: آخرین کندل **نوشته‌شده** (برای sidecar) */
    let lastWritten = lastFilled;
    try {
        while (cursor <= latest) {
            const chunk = await fetchChunk({
                symbol: resolved, exchange: exchangeKey, startTime: cursor, endTime: latest,
                fetchImpl, timeoutMs, rateController: controller,
            });
            if (chunk.rows.length === 0) break;
            totalInserted += mergeChunk(db, chunk.rows);
            const lastTs = chunk.rows[chunk.rows.length - 1].timestamp_raw;
            lastWritten = lastTs;
            log(`[${exchangeKey}] +${chunk.rows.length} (تا ${new Date(lastTs).toISOString()})`);
            const next = lastTs + MINUTE_MS;
            if (next <= cursor) break;
            cursor = next;
        }
    } finally {
        db.close();
    }

    /** S4: sidecar پس از بستن DB (اثر انگشت فایل، همین لحظه) */
    writeLatestSidecar(resolved, exchangeKey, lastWritten, rootDir);

    return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: totalInserted > 0, inserted: totalInserted, lastFilled, latest, lastWritten });
}

module.exports = { update1m, latestRemote, writeLatestSidecar };

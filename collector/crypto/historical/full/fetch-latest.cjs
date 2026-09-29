// fetch-latest.cjs — سازمانی: بروزرسانی آخرین کندل 1m برای هر بازار (spot/futures/swap/...) به‌صورت
// کاملاً جداگانه.
//
// fetchLatest(symbol, exchange):
//   - exchange استاندارد "<venue>_<marketType>" است (مثلاً "binance_spot", "binance_futures", "okx_swap").
//   - بر اساس marketType، API درست فراخوانی می‌شود:
//       _spot     -> API اسپات
//       _futures  -> API فیوچرز
//       _swap     -> API سواپ (نقشه به فیوچرزِ صرافی، چون آداپتورها spot/futures دارند)
//   - merge با کلید اصلی (symbol, exchange, timestamp_raw) — هیچ overwrite، هیچ تداخل.
//   - هر بازار resume مستقل خودش را دارد: اسپات از آخرین کندل اسپات، فیوچرز از آخرین کندل فیوچرز.
const { createVenueFetchers } = require("../_engine/fetch/venues.cjs");
const { fetchChunk } = require("./fetch-chunk.cjs");
const { createRateController } = require("./rate-controller.cjs");
const { openRaw1mDatabase, mergeChunk, lastFilledTimestamp } = require("./merge-into-1m-db.cjs");
const { splitExchangeKey, apiMarketOf } = require("./markets.cjs");

const MINUTE_MS = 60 * 1000;

// Resolves the venue fetcher for a standard exchange key.
function resolver(exchange, { fetchImpl, timeoutMs } = {}) {
    const { venue } = splitExchangeKey(exchange);
    const fetcher = createVenueFetchers({ venues: [venue], fetchImpl, timeoutMs })[0];
    if (!fetcher) throw new RangeError(`Unknown exchange: ${venue}`);
    return fetcher;
}

// Newest candle open time the venue currently serves for the given API market.
async function latestRemote(fetcher, symbol, market, now = Date.now()) {
    const page = await fetcher.fetchKlines({ symbol, market, startTime: now - 5 * MINUTE_MS, endTime: undefined, limit: 100 });
    return page.length ? Math.max(...page.map((c) => c.openTime)) : null;
}

// Fetches and merges the latest 1m candles for one standard exchange key. Returns a result summary.
async function fetchLatest(symbol, exchange, { market = "spot", fetchImpl, timeoutMs, rootDir, now = Date.now(), log = () => {}, rateController } = {}) {
    const resolved = symbol.trim().toUpperCase();
    const exchangeKey = exchange.includes("_") ? exchange : require("./markets.cjs").buildExchangeKey(exchange, market);
    const apiMarket = apiMarketOf(exchangeKey);

    const fetcher = resolver(exchangeKey, { fetchImpl, timeoutMs });

    const lastFilled = lastFilledTimestamp(resolved, exchangeKey, { rootDir });
    const latest = await latestRemote(fetcher, resolved, apiMarket, now);

    if (!Number.isInteger(latest)) {
        return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: false, reason: "no-remote", lastFilled, latest: null });
    }
    if (lastFilled === null) {
        return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: false, reason: "empty-db", lastFilled: null, latest });
    }
    if (latest <= lastFilled) {
        return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: false, reason: "up-to-date", lastFilled, latest });
    }

    const controller = rateController || createRateController();
    const db = openRaw1mDatabase(resolved, { rootDir });

    let totalInserted = 0;
    let cursor = lastFilled + MINUTE_MS;
    try {
        while (cursor <= latest) {
            const chunk = await fetchChunk({
                symbol: resolved, exchange: exchangeKey, startTime: cursor, endTime: latest,
                fetchImpl, timeoutMs, rateController: controller,
            });
            if (chunk.rows.length === 0) break;
            totalInserted += mergeChunk(db, chunk.rows);
            const lastTs = chunk.rows[chunk.rows.length - 1].timestamp_raw;
            log(`[${exchangeKey}] +${chunk.rows.length} (تا ${new Date(lastTs).toISOString()})`);
            const next = lastTs + MINUTE_MS;
            if (next <= cursor) break;
            cursor = next;
        }
    } finally {
        db.close();
    }

    return Object.freeze({ symbol: resolved, exchange: exchangeKey, updated: totalInserted > 0, inserted: totalInserted, lastFilled, latest });
}

module.exports = { fetchLatest };

// P5/گام ۲ — کلکتور «جریان taker» (CVD واقعی ✓) · مستقل از انبار خام ✗
//
//   node full/update-flow.cjs BTCUSDT --exchange=binance --market=spot [--days=7]
//
// چرا مستقل: `takerBuyBaseVolume` در مسیر فعلی جمع‌آوری **نمی‌شود** ✗ و افزودنش به
// آداپتورهای عمومی، سطح ریسک را روی کل کلکتور بالا می‌برد ✗ ⇒ یک مسیر **جدا و
// کم‌سطح** ساخته شد ✓ که فقط روی `flow_1m.db` می‌نویسد ✓ (انبار خام دست‌نخورده ✗).
//
// ⚠️ rate-limit: هر درخواست ۱۰۰۰ کندل + فاصلهٔ محترمانه ✓ · هیچ تلاش مجدد برای
//    ۴۲۹/۴۱۸/۴۰۳ ✗ (همان سیاست ضدبلاک پروژه ✓).
const { openFlowDatabase, upsertFlow, lastFlowTimestamp, upsertMetrics } = require("./flow-store.cjs");
const { buildExchangeKey, splitExchangeKey, apiMarketOf } = require("./markets.cjs");

const MINUTE_MS = 60_000;
const MAX_LIMIT = 1000;

function baseUrlOf(apiMarket) {
    /** فقط binance (spot/futures) در این گام ✓ — بقیهٔ صرافی‌ها بعداً با همان الگو ✓ */
    return apiMarket === "spot" ? "https://api.binance.com/api/v3/klines" : "https://fapi.binance.com/fapi/v1/klines";
}

/** یک صفحهٔ kline ⇒ ردیف‌های taker (buy از ایندکس ۹ ✓ · sell = volume − buy ✓) */
function toFlowRows(symbol, exchangeKey, klines) {
    const out = [];
    for (const k of klines) {
        const ts = Number(k[0]);
        const volume = Number(k[5]);
        const trades = Number(k[8]);
        const takerBuy = Number(k[9]);
        if (![ts, volume, takerBuy].every((v) => Number.isFinite(v))) continue; // ← بدون ساختگی ✗
        out.push({
            symbol,
            exchange: exchangeKey,
            timestamp_raw: ts,
            taker_buy_base: takerBuy,
            taker_sell_base: Math.max(0, volume - takerBuy),
            trades: Number.isFinite(trades) ? trades : null,
        });
    }
    return out;
}

async function updateFlow(symbol, { exchange = "binance", market = "spot", days = 7, fetchImpl = fetch, log = () => {}, sleepMs = 350 } = {}) {
    const resolved = String(symbol).trim().toUpperCase();
    const exchangeKey = exchange.includes("_") ? exchange : buildExchangeKey(exchange, market);
    const { venue } = splitExchangeKey(exchangeKey);
    if (venue !== "binance") throw new RangeError(`این گام فقط binance را پوشش می‌دهد (درخواست: ${venue})`);
    const apiMarket = apiMarketOf(exchangeKey);
    const url = baseUrlOf(apiMarket);

    const now = Date.now();
    const from = now - days * 24 * 60 * MINUTE_MS;
    const resumeFrom = lastFlowTimestamp(resolved, exchangeKey);
    let cursor = Math.max(from, resumeFrom !== null ? resumeFrom + MINUTE_MS : from);

    const db = openFlowDatabase(resolved);
    let inserted = 0;
    let requests = 0;
    try {
        while (cursor < now) {
            const qs = new URLSearchParams({
                symbol: resolved,
                interval: "1m",
                startTime: String(cursor),
                limit: String(MAX_LIMIT),
            });
            const res = await fetchImpl(`${url}?${qs}`);
            requests += 1;
            if (res.status === 429 || res.status === 418 || res.status === 403) {
                /** سیاست ضدبلاک: **توقف فوری** ✗ (بدون تلاش مجدد ✓) */
                throw new Error(`rate-limited (HTTP ${res.status}) ⇒ توقف (سیاست ضدبلاک ✗)`);
            }
            if (!res.ok) throw new Error(`HTTP ${res.status} برای ${url}`);
            const klines = await res.json();
            if (!Array.isArray(klines) || klines.length === 0) break;
            const rows = toFlowRows(resolved, exchangeKey, klines);
            inserted += upsertFlow(db, rows);
            const lastTs = rows.length ? rows[rows.length - 1].timestamp_raw : null;
            if (lastTs === null) break;
            log(`[flow] +${rows.length} (تا ${new Date(lastTs).toISOString()}) · requests=${requests}`);
            const next = lastTs + MINUTE_MS;
            if (next <= cursor) break;
            cursor = next;
            if (cursor < now) await new Promise((r) => setTimeout(r, sleepMs)); // احترام به نرخ ✓
        }
    } finally {
        db.close();
    }
    return Object.freeze({ symbol: resolved, exchange: exchangeKey, inserted, requests, days, resumedFrom: resumeFrom });
}

if (require.main === module) {
    const argv = process.argv.slice(2);
    const symbol = argv[0];
    const flag = (name, dflt) => {
        const hit = argv.find((a) => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : dflt;
    };
    if (!symbol) {
        console.error("استفاده: node full/update-flow.cjs <SYMBOL> --exchange=binance --market=spot [--days=7]");
        process.exitCode = 1;
    } else {
        updateFlow(symbol, {
            exchange: flag("exchange", "binance"),
            market: flag("market", "spot"),
            days: Number(flag("days", "7")),
            log: (m) => console.log(m),
        })
            .then((r) => console.log(`[flow] پایان: inserted=${r.inserted} requests=${r.requests} resumedFrom=${r.resumedFrom ?? "none"}`))
            .catch((e) => {
                console.error("[flow] خطا:", e && e.message ? e.message : e);
                process.exitCode = 1;
            });
    }
}

/**
 * **P5/۳ — سنجه‌های صرافی (funding · openInterest):** فقط **فیوچرز** ✗ — صرافی
 * spot این دو را ندارد ✓ ⇒ برای spot صادقانه «not-applicable» برمی‌گردد ✓
 * (هیچ عدد ساختگی ✗). همان سیاست ضدبلاک: ۴۲۹/۴۱۸/۴۰۳ ⇒ توقف فوری ✗.
 */
async function updateFlowMetrics(symbol, { exchange = "binance", market = "spot", fetchImpl = fetch, log = () => {} } = {}) {
    const resolved = String(symbol).trim().toUpperCase();
    const exchangeKey = exchange.includes("_") ? exchange : buildExchangeKey(exchange, market);
    const { venue } = splitExchangeKey(exchangeKey);
    const apiMarket = apiMarketOf(exchangeKey);
    if (venue !== "binance") throw new RangeError(`این گام فقط binance را پوشش می‌دهد (${venue})`);
    if (apiMarket === "spot") {
        return Object.freeze({ symbol: resolved, exchange: exchangeKey, stored: 0, reason: "not-applicable (spot: funding/OI ندارد)" });
    }

    const rows = [];
    const nowMs = Date.now();
    /** funding: آخرین نرخ‌ها (limit=1 ⇒ نرخ جاری ✓) */
    const fr = await fetchImpl(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${resolved}&limit=2`);
    if (fr.status === 429 || fr.status === 418 || fr.status === 403) {
        throw new Error(`rate-limited (HTTP ${fr.status}) ⇒ توقف ✗`);
    }
    if (fr.ok) {
        const list = await fr.json();
        for (const x of Array.isArray(list) ? list : []) {
            rows.push({ symbol: resolved, exchange: exchangeKey, kind: "funding", timestamp_raw: Number(x.fundingTime), value: Number(x.fundingRate) });
        }
    }
    /** openInterest: snapshot جاری (timestamp = همان لحظهٔ درخواست ✓) */
    const oi = await fetchImpl(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${resolved}`);
    if (oi.status === 429 || oi.status === 418 || oi.status === 403) {
        throw new Error(`rate-limited (HTTP ${oi.status}) ⇒ توقف ✗`);
    }
    if (oi.ok) {
        const j = await oi.json();
        const v = Number(j && j.openInterest);
        if (Number.isFinite(v)) rows.push({ symbol: resolved, exchange: exchangeKey, kind: "openInterest", timestamp_raw: nowMs, value: v });
    }

    const clean = rows.filter((r) => Number.isFinite(r.timestamp_raw) && Number.isFinite(r.value)); // ← بدون NaN ✗
    const db = openFlowDatabase(resolved);
    let stored = 0;
    try {
        stored = upsertMetrics(db, clean);
    } finally {
        db.close();
    }
    log(`[flow] metrics: stored=${stored} (funding+OI · ${exchangeKey})`);
    return Object.freeze({ symbol: resolved, exchange: exchangeKey, stored, requests: 2 });
}

module.exports = { updateFlow, toFlowRows, updateFlowMetrics };

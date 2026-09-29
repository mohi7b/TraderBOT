// P5/گام ۱ — «جریان نقدینگی سبک» (MoneyFlow-lite) از دادهٔ **موجود** ✓
//
//   GET /flow/:symbol?exchange=<key>&window=<minutes>
//
// ⚠️ صداقت داده (سیاست پروژه: «هیچ مقدار ساختگی» ✗):
//   · **قابل استخراج از انبار فعلی:** `volume` · `quote_volume` · `number_of_trades` ✓
//       ⇒ `rvol` (حجم نسبی) · `volumeZ` (z-score حجم) · `tradesZ` (z-score تعداد ترید) ✓
//   · **قابل استخراج نیست (فعلاً):** `cvd` (نیاز به حجم خریدار/فروشندهٔ taker ✗) ·
//     `funding` · `openInterest` (نیاز به جمع‌آوری تازه از صرافی ✗)
//       ⇒ صریحاً `null` برمی‌گردند + `meta.notAvailable[]` + `meta.plan` ✓
//   · هیچ درخواست تازه‌ای به صرافی زده نمی‌شود ✗ (فقط از مسیر کش‌شدهٔ `/tf` ✓)
//     ⇒ صفر ریسک rate-limit ✓
const { assertTf } = require("../../_engine/timeframe/utils.cjs");
const proxy = require("../utils/engine-proxy.cjs");
const { SPEC_VERSIONS } = require("../utils/spec-version.cjs");
/** P5/۲ — انبار جریان taker (CVD واقعی ✓ · انبار خام دست‌نخورده ✗) */
const { readFlowRange, readLatestMetrics } = require("../../full/flow-store.cjs");

const MINUTE_MS = 60_000;
const DEFAULT_WINDOW = 1440; // ۱ روز کندل ۱m
const MAX_WINDOW = Number(process.env.HISTORICAL_FLOW_MAX_WINDOW || 10_080); // سقف ۷ روز
const DAY_MINUTES = 1440;

function assertSymbol(symbol) {
    if (typeof symbol !== "string" || symbol.trim() === "") throw new TypeError("symbol is required");
    return symbol.trim().toUpperCase();
}

/** میانگین و انحراف معیار جمعیت (بدون کتابخانه ✓) */
function meanStd(values) {
    const n = values.length;
    if (n === 0) return { mean: null, std: null };
    let sum = 0;
    for (const v of values) sum += v;
    const mean = sum / n;
    let acc = 0;
    for (const v of values) acc += (v - mean) * (v - mean);
    return { mean, std: Math.sqrt(acc / n) };
}

/** z-score آخرین مقدار نسبت به سری (یا `null` اگر سری بی‌واریانس باشد ✗) */
function zOfLast(values) {
    if (values.length < 30) return null; // نمونهٔ کم ⇒ هیچ عدد ساختگی ✗
    const { mean, std } = meanStd(values);
    if (mean === null || std === null || !(std > 0)) return null;
    return Number(((values[values.length - 1] - mean) / std).toFixed(4));
}

async function flowHandler({ symbol }, ctx = {}) {
    const resolved = assertSymbol(symbol);
    const exchange = ctx.query && ctx.query.exchange ? String(ctx.query.exchange) : null;
    const windowParam = Number(ctx.query && ctx.query.window);
    const window = Number.isInteger(windowParam) && windowParam > 0
        ? Math.min(MAX_WINDOW, windowParam)
        : DEFAULT_WINDOW;
    const nowMs = Date.now();
    const from = nowMs - window * MINUTE_MS;

    /** داده از **همان مسیر کش‌شدهٔ `/tf`** ✓ (tf=1m با پنجرهٔ کراندار ✓) */
    const { value: built, cached } = await proxy.getTf({
        symbol: resolved,
        tf: assertTf("1m"),
        exchange,
        from,
        to: nowMs,
    });
    const candles = built.candles ?? [];
    const volumes = candles.map((c) => Number(c.volume ?? 0));
    const trades = candles.map((c) => Number(c.trades ?? 0));

    /** RVOL: میانگین ۲۴ ساعت آخر ÷ میانگین ۲۴ ساعت پیش از آن (یا null ✓) */
    let rvol = null;
    if (volumes.length >= DAY_MINUTES * 2) {
        const recent = volumes.slice(-DAY_MINUTES);
        const prior = volumes.slice(-DAY_MINUTES * 2, -DAY_MINUTES);
        const a = recent.reduce((s, v) => s + v, 0) / recent.length;
        const b = prior.reduce((s, v) => s + v, 0) / prior.length;
        rvol = b > 0 ? Number((a / b).toFixed(4)) : null;
    }

    const lastTs = candles.length ? candles[candles.length - 1].timestamp : null;

    /**
     * **CVD واقعی (P5/۲):** از انبار جداگانهٔ `taker_flow` ✓ (اگر جمع‌آوری شده باشد).
     * `cvd` = مجموع (خریدار taker − فروشنده taker) در پنجره ✓ · `takerRatio` = سهم خرید ✓
     * · `cvdZ` = z-score **دلتای هر دقیقه** (نه تجمعی ✗). اگر داده نبود ⇒ `null` ✓
     */
    let cvd = null;
    let takerRatio = null;
    let cvdZ = null;
    let flowRows = 0;
    try {
        const rows = readFlowRange(resolved, exchange ?? "binance_spot", from, nowMs);
        flowRows = rows.length;
        if (rows.length >= 30) {
            const deltas = rows.map((r) => Number(r.taker_buy_base) - Number(r.taker_sell_base));
            const buy = rows.reduce((s, r) => s + Number(r.taker_buy_base), 0);
            const sell = rows.reduce((s, r) => s + Number(r.taker_sell_base), 0);
            cvd = Number(deltas.reduce((s, d) => s + d, 0).toFixed(4));
            takerRatio = buy + sell > 0 ? Number((buy / (buy + sell)).toFixed(4)) : null;
            cvdZ = zOfLast(deltas);
        }
    } catch {
        /** انبار جریان نبود ⇒ `null` صریح ✓ (هیچ ساختگی ✗) */
    }

    const notAvailable = [];
    if (cvd === null) notAvailable.push("cvd");
    if (!candles.some((c) => c.trades !== undefined && c.trades !== null)) notAvailable.push("tradesZ");

    /**
     * **P5/۳ — funding/openInterest:** فقط فیوچرز ✗ (صرافی spot این دو را ندارد ✓)
     * ⇒ برای spot صریحاً `null` + توضیح ✓ (هیچ ساختگی ✗) · مقدار از انبار جریان ✓.
     */
    let funding = null;
    let fundingAt = null;
    let openInterest = null;
    let openInterestAt = null;
    try {
        const m = readLatestMetrics(resolved, exchange ?? "binance_spot");
        if (m.funding) {
            funding = m.funding.value;
            fundingAt = m.funding.timestamp;
        }
        if (m.openInterest) {
            openInterest = m.openInterest.value;
            openInterestAt = m.openInterest.timestamp;
        }
    } catch {
        /* بی‌صدا ⇒ null ✓ */
    }
    if (funding === null) notAvailable.push("funding");
    if (openInterest === null) notAvailable.push("openInterest");

    return Object.freeze({
        symbol: resolved,
        exchange,
        window,
        metrics: Object.freeze({
            /** حجم نسبی (۲۴h ÷ ۲۴h پیشین) — از `volume` ✓ */
            rvol,
            /** z-score حجم در پنجره — از `volume` ✓ */
            volumeZ: zOfLast(volumes),
            /** z-score تعداد ترید در پنجره — از `number_of_trades` ✓ */
            tradesZ: notAvailable.includes("tradesZ") ? null : zOfLast(trades),
            /** **CVD واقعی** (P5/۲) — مجموع دلتای taker در پنجره ✓ */
            cvd,
            /** سهم خریدار taker از کل حجم (۰..۱) ✓ */
            takerRatio,
            /** z-score دلتای هر دقیقه ✓ */
            cvdZ,
            /** **funding** (فقط فیوچرز ✗ · spot ⇒ null ✓) + زمان مقدار ✓ */
            funding,
            fundingAt,
            /** **openInterest** (فقط فیوچرز ✗) + زمان snapshot ✓ */
            openInterest,
            openInterestAt,
        }),
        price: candles.length
            ? Object.freeze({
                last: candles[candles.length - 1].close,
                lastTimestamp: lastTs,
                lagSeconds: lastTs ? Math.max(0, Math.round((nowMs - lastTs) / 1000)) : null,
            })
            : null,
        meta: Object.freeze({
            spec: SPEC_VERSIONS,
            nowMs,
            cached,
            rows: candles.length,
            /** تعداد ردیف‌های جریان‌سنجی خوانده‌شده (۰ = جمع‌آوری نشده ✓) */
            flowRows,
            /** فهرست صریح چیزهایی که **نیست** ✓ (هیچ مقدار ساختگی ✗) */
            notAvailable,
            plan:
                "CVD/funding/openInterest نیازمند جمع‌آوری تازه است (taker-buy حجم یا API صرافی) " +
                "⇒ تا آن زمان صریحاً null می‌مانند (سیاست «بدون دادهٔ ساختگی» ✗).",
            policy: { fabricate: false, label: "N/A" },
        }),
    });
}

module.exports = { flowHandler, meanStd, zOfLast };

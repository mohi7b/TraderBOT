// GET /tf/:symbol/:tf
// Dynamically builds higher-timeframe candles from raw 1m data. Optional query params:
//   ?exchange=<key>   filter to a specific exchange ("binance_spot"); defaults to the most-populated.
//   ?from=<ms>&to=<ms>  inclusive epoch-ms window.
const { buildTf } = require("../../_engine/timeframe/build-tf.cjs");
const { assertTf, tfWidthMs } = require("../../_engine/timeframe/utils.cjs");
const { normalizeBuckets, NORMALIZER_VERSION } = require("../../_engine/normalize/normalize.cjs");
const proxy = require("../utils/engine-proxy.cjs");

/**
 * **سقف پنجره در سطح API (S2):** همان سیاست D2/D3 که فرانت اعمال می‌کند،
 * این‌جا هم اجرا می‌شود تا یک کلاینت ساده نتواند سرور را با پنجرهٔ نامحدود
 * (مثل `from=0`) مشغول کند. برش **به عقب** است و در `meta.clamped` گزارش
 * می‌شود؛ هیچ خطایی و هیچ دادهٔ ساختگی‌ای تولید نمی‌شود.
 */
const MAX_CANDLES = 5_000;
const MAX_WINDOW_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/**
 * **قرارداد پنجره (C1):** کلاینت دیگر پنجره نمی‌سازد؛ فقط `tf` را می‌خواهد.
 *  · `to` نبود ⇒ `now` · `to` جلوتر از حال ⇒ به `now` کشیده میشود (clamped)
 *  · `from` نبود ⇒ **خودسرور** پنجرهٔ مجاز را میسازد (`to − allowed`) و آن را
 *    در `clamped=true` گزارش میکند ⇒ هیچ درخواستی «از ابتدای تاریخ» خوانده
 *    نمیشود (پرهیز از اسکن بیمرز).
 */
function clampWindow(tf, from, to, nowMs) {
    const width = tfWidthMs(tf);
    const allowed = Math.min(MAX_WINDOW_MS, MAX_CANDLES * width);
    let clamped = false;
    let toMs = Number.isInteger(to) ? to : nowMs;
    if (toMs > nowMs + width) {
        toMs = nowMs;
        clamped = true;
    }
    let fromMs = Number.isInteger(from) ? from : null;
    if (fromMs === null) {
        fromMs = toMs - allowed;
        clamped = true;
    } else if (toMs - fromMs > allowed) {
        fromMs = toMs - allowed;
        clamped = true;
    }
    return { from: fromMs, to: toMs, clamped };
}
const { formatTimestamp } = require("../utils/formatter.cjs");
/**
 * **C3 — feature-flag diff:** `HISTORICAL_DIFF=0` ⇒ فیلد `diff` تولید
 * نمی‌شود و `since` بی‌اثر می‌شود (خاموش‌کردن فوری بدون deploy).
 */
const DIFF_ENABLED = process.env.HISTORICAL_DIFF !== "0";
const { SPEC_VERSIONS } = require("../utils/spec-version.cjs");

function assertSymbol(symbol) {
    if (typeof symbol !== "string" || symbol.trim() === "") throw new TypeError("symbol is required");
    return symbol.trim().toUpperCase();
}

function parseInts(query) {
    const out = {};
    /** C3: `since` = آخرین `latestTimestamp` کلاینت (epoch-ms) برای پاسخ diff */
    for (const key of ["from", "to", "since"]) {
        if (query && query[key] !== undefined && query[key] !== null && query[key] !== "") {
            const n = Number(query[key]);
            if (!Number.isInteger(n)) throw new TypeError(`${key} must be an integer epoch-ms`);
            out[key] = n;
        }
    }
    return out;
}

async function tfHandler({ symbol, tf }, ctx = {}) {
    const resolvedSymbol = assertSymbol(symbol);
    const resolvedTf = assertTf(tf);
    const { from = null, to = null, since = null } = parseInts(ctx.query);
    const exchange = ctx.query && ctx.query.exchange ? String(ctx.query.exchange) : null;
    const nowMs = Date.now();

    /**
     * S2 — **ورکر + کش:** ساخت تایم‌فریم در Worker Thread انجام می‌شود (حلقهٔ
     * HTTP هرگز پشت اسکن سنکرون SQLite بلاک نمی‌شود — D23) و نتیجه در کش RAM
     * با TTL/LRU می‌نشیند (D7). درخواست‌های یکسان هم‌زمان هم dedup می‌شوند.
     */
    /**
     * **لنگر بر آخرین دادهٔ موجود (رفع باگ ۱m/۵m):**
     * دادهٔ خام می‌تواند عقب باشد (الان ~۱۹ روز). برای تایم‌فریم‌های کوتاه، سقف
     * ۵۰۰۰ کندل پنجره‌ای کوتاه‌تر از این عقب‌ماندگی می‌سازد (۱m=۳٫۵ روز · ۵m=۱۷٫۴ روز)
     * ⇒ پنجره **بعد از آخرین کندل** می‌افتد و پاسخ خالی می‌شد.
     * این‌جا اگر پنجره بعد از آخرین کندل باشد (یا نتیجه خالی در بیاید)، پنجره
     * **به عقب می‌لغزد** تا «آخرین N کندل موجود» برگردد؛ واقعیت در
     * `meta.anchored` + `latestTimestamp`/`lagSeconds` صادقانه گزارش می‌شود.
     * ⚠️ هیچ کندل ساختگی ساخته نمی‌شود؛ فقط پنجره جابه‌جا می‌شود (D6/A7).
     */
    const widthMs = tfWidthMs(resolvedTf);
    const allowedMs = Math.min(MAX_WINDOW_MS, MAX_CANDLES * widthMs);
    /**
     * **probe ارزان لنگر (S4):** `latestTimestampRaw` روی ایندکس PK (O(log n) ≈ ms)
     * ⇒ دیگر برای یک عدد، `getMetadata` سنگین (پوشش ۷روزه) صدا زده نمی‌شود.
     * (شاهد باگ واقعی: `/tf 1d` حتی با **hit کش دیسکی** ۹۵ ثانیه طول کشید ✗)
     */
    const latestTs = () => proxy.latestTimestamp({ symbol: resolvedSymbol, exchange });
    let guard = clampWindow(resolvedTf, from, to, nowMs);
    let anchored = false;
    /**
     * **لنگر تنبل (S4):** پیش‌بررسی «آیا پنجره بعد از آخرین داده است؟» حذف شد چون
     * بدون probe گران (۵۰–۷۵s ✗) ممکن نبود. همان نتیجه با **پاسخ خالی** گرفته
     * می‌شود: اگر پنجره بعد از داده باشد، ساخت خالی برمی‌گردد و شاخهٔ «تلاش
     * دوباره» (پایین) لنگر را با **یک** probe اجرا می‌کند ⇒ مسیر گرم/کش‌دیسکی
     * هیچ هزینهٔ probe ندارد ✓
     */

    /**
     * **S4-B — کلید کش دیسکی:** کش دیسکی روی **پنجرهٔ خودِ درخواست** کلید می‌شود
     * (نه پنجرهٔ محاسبه‌شدهٔ C1) تا `pre-warm` (که پنجره ندارد ⇒ `null`) با
     * درخواست واقعی فرانت (که هم پنجره نمی‌فرستد ⇒ `null`) **یک کلید** بسازد.
     * درخواست‌های صریح `from/to` هم کلید مستقل خودشان را دارند.
     * (باگ واقعی: prewarm کلید `any__any` می‌نوشت و route کلید `from__to` می‌خواند
     *  ⇒ هیچ‌وقت hit نمی‌شد و ۱d سرد >۹۰s می‌ماند ✗)
     */
    const readWindow = (window) =>
        proxy.getTf({
            symbol: resolvedSymbol,
            tf: resolvedTf,
            exchange,
            from: window.from,
            to: window.to,
            diskKeyFrom: from,
            diskKeyTo: to,
        });

    let { value: built, cached } = await readWindow(guard);
    /** فقط در حالت پاسخ خالی، probe (memo‌شده) صدا زده می‌شود — نه در مسیر گرم */
    const lastRaw = built.candles.length ? null : latestTs();
    if (!built.candles.length && lastRaw !== null && !anchored) {
        /** نتیجهٔ خالی ⇒ یک تلاش دوباره با لنگر آخرین داده */
        const toMs = Math.min(lastRaw + widthMs, nowMs);
        guard = { from: toMs - allowedMs, to: toMs, clamped: false };
        anchored = true;
        const retry = await readWindow(guard);
        built = retry.value;
        cached = retry.cached;
    }
    const candles = built.candles;

    const map = (c) => Object.freeze({
        timestamp: c.timestamp,
        time: formatTimestamp(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        quote_volume: c.quoteVolume,
        trades: c.trades,
    });

    /**
     * S1 — **Normalizer (تک‌نسخهٔ سرور):** مرتب‌سازی، حذف تکرار/آینده، گزارش
     * گپ‌ها و تفکیک «کندل بسته» از «کندل در حال تشکیل».
     * ⚠️ هیچ کندل ساختگی ساخته نمی‌شود؛ گپ‌ها فقط **گزارش** می‌شوند (A7/D6).
     */
    const { closed, forming, report } = normalizeBuckets(candles, {
        nowMs,
        tfWidthMs: tfWidthMs(resolvedTf),
    });
    const closedData = closed.map(map);
    const formingData = forming ? map(forming) : null;
    const all = formingData ? [...closedData, formingData] : closedData;

    /**
     * **C3 — diff (فقط با `since`):**
     *  · `appended` = کندل‌های **بستهٔ** جدیدتر از `since`
     *  · `revisedTail` = **آخرین کندل بستهٔ ≤ `since`**؛ لازم است چون باکتی که
     *    کلاینت «در حال تشکیل» می‌دید، پس از بسته‌شدن مقادیر نهایی می‌گیرد
     *    (قرارداد merge: بازنویسی دم + افزودن دنباله) ⇒ بدون revision، مقدار
     *    نهاییِ همان کندل هرگز به کلاینت نمی‌رسد.
     *  · `forming` همیشه کامل فرستاده می‌شود (کوچک است و «نوک زنده»).
     *  ⚠️ هیچ فیلد قبلی حذف نشده (سازگاری عقب‌رو · D24).
     */
    const diff = DIFF_ENABLED && since !== null
        ? Object.freeze({
            since,
            appended: closedData.filter((c) => c.timestamp > since),
            revisedTail: (() => {
                const older = closedData.filter((c) => c.timestamp <= since);
                return older.length ? older[older.length - 1] : null;
            })(),
        })
        : null;

    return Object.freeze({
        symbol: resolvedSymbol,
        tf: resolvedTf,
        exchange,
        count: all.length,
        /** سازگاری عقب‌رو: `candles` = `closed + forming` (D24) */
        candles: all,
        closed: closedData,
        forming: formingData,
        /** C3: پاسخ diff (فقط با `since` و وقتی flag روشن است، وگرنه `null`) */
        diff,
        gaps: report.gaps,
        gapCount: report.gaps.length,
        missingBars: report.missingBars,
        coveragePct: report.coveragePct,
        latestTimestamp: report.lastTimestamp,
        lagSeconds:
            report.lastTimestamp === null
                ? null
                : Math.max(0, Math.round((nowMs - report.lastTimestamp) / 1000)),
        meta: {
            normalizer: NORMALIZER_VERSION,
            spec: SPEC_VERSIONS,
            nowMs,
            /** S2: از کش RAM آمد یا از ورکر ساخته شد (D25) */
            cached,
            /** S2: آیا پنجره به سقف D2/D3 برش خورد؟ */
            clamped: guard.clamped,
            /** S3: پنجره روی آخرین دادهٔ موجود لنگر شد؟ (دادهٔ عقب‌مانده) */
            anchored,
            window: { from: guard.from, to: guard.to },
            droppedInvalid: report.droppedInvalid,
            droppedFuture: report.droppedFuture,
            duplicates: report.duplicates,
        },
    });
}

module.exports = { tfHandler };

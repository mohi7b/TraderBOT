// GET /metadata/:symbol?tf=1h&exchange=binance_spot
//
// S1 — Honest service metadata: freshness (cheap MAX probe), bounded coverage
// (last 7 days from raw 1m), venues, session/timezone, contract versions and the
// cache/health counters. Nothing here is guessed: values we cannot know from the
// store (e.g. tickSize) are returned as null on purpose.
const { listExchanges, latestTimestampRaw, readRaw1m } = require("../../_engine/timeframe/build-tf.cjs");
const { assertTf, tfWidthMs } = require("../../_engine/timeframe/utils.cjs");
const { normalize1m, NORMALIZER_VERSION } = require("../../_engine/normalize/normalize.cjs");
const proxy = require("../utils/engine-proxy.cjs");
const { SPEC_VERSIONS } = require("../utils/spec-version.cjs");

const COVERAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function assertSymbol(symbol) {
    if (typeof symbol !== "string" || symbol.trim() === "") throw new TypeError("symbol is required");
    return symbol.trim().toUpperCase();
}

async function metadataHandler({ symbol }, ctx = {}) {
    const resolvedSymbol = assertSymbol(symbol);
    const tf = assertTf((ctx.query && ctx.query.tf) || "1h");
    const exchange =
        ctx.query && ctx.query.exchange ? String(ctx.query.exchange) : null; // null = پرمعامله‌ترین صرافی
    const nowMs = Date.now();

    /**
     * S2 — **همهٔ کار DB در ورکر انجام می‌شود** (حلقهٔ HTTP بلاک نمی‌شود، D23) و
     * نتیجه در **کش RAM ۵دقیقه‌ای** می‌نشیند (D7). مسیر نتیجه دقیقاً همان شکل
     * قبلی است؛ فقط سریع‌تر و بدون بلاک.
     */
    const { value: engine, cached } = await proxy.getMetadata({
        symbol: resolvedSymbol,
        exchange,
        tf,
    });
    const latestTimestamp = engine.latestTimestamp;
    const lagSeconds =
        latestTimestamp === null ? null : Math.max(0, Math.round((nowMs - latestTimestamp) / 1000));
    const coverage = engine.coverage;
    const venues = engine.venues;

    return Object.freeze({
        symbol: resolvedSymbol,
        timeframe: tf,
        exchange,
        venueCount: venues.length,
        venues,
        /**
         * مقیاس/مرز زمانی (S5): داده **UTC خام** است و محور چارت مبدأ **ثابت**
         * ۲۱:۰۰ UTC دارد (بدون DST · بدون ادغام باکت) — نه وابسته به محلی NY.
         */
        timezone: "UTC",
        axisOrigin: { kind: "fixed-utc", hour: 21 },
        /** @deprecated S5 — نگه‌داشته برای مصرف‌کننده‌های قدیمی */
        nyClose: { timeZone: "America/New_York", hour: 16 },
        session: "24/7",
        barSpacingMs: tfWidthMs(tf),
        latestTimestamp,
        lagSeconds,
        coverage,
        /** در انبار خام ما وجود ندارد ⇒ به‌جای حدس، null (سیاست «بدون مقدار جعلی») */
        tickSize: null,
        cache: { ...(ctx.stats || {}), metaCached: cached },
        spec: SPEC_VERSIONS,
        normalizer: NORMALIZER_VERSION,
    });
}

module.exports = { metadataHandler, COVERAGE_WINDOW_DAYS };

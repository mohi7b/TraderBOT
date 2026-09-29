/**
 * S1 — Server Layer (Historical): Normalizer + metadata + health
 * collector/crypto/historical/test/normalize-s1.test.cjs
 * ============================================================
 * دو لایه بررسی:
 *   ۱) **واحد (بدون سرور):** قواعد نرمال‌سازی روی دادهٔ ساختگی — صعودی اکید،
 *      حذف تکرار/آینده/نامعتبر، گزارش گپ، پوشش، و **نبود کندل ساختگی**.
 *   ۲) **زنده (سرویس :4000):** `/health` · `/metadata/:symbol` · تفکیک
 *      `{closed, forming}` · سازگاری عقب‌روی `candles` · alias `/candles` ·
 *      نبود باکت آینده · و سالم‌ماندن صفحهٔ فرانت با پاسخ تازه.
 *
 * اجرا: node collector/crypto/historical/test/normalize-s1.test.cjs
 * ============================================================
 */
const assert = require("assert");

const HIST = process.env.HISTORICAL_API || "http://127.0.0.1:4000";
const FRONT = process.env.MACRO_FRONTEND || "http://127.0.0.1:3000";
const SYMBOL = (process.argv[2] || "BTCUSDT").toUpperCase();
const MIN = 60_000;
const HOUR = 60 * MIN;

const {
    normalize1m,
    normalizeBuckets,
    NORMALIZER_VERSION,
} = require("../_engine/normalize/normalize.cjs");
const { SPEC_VERSIONS } = require("../api/utils/spec-version.cjs");

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `S1: ${msg}`);
    checks++;
};

/** ۱) نرمال‌سازی ۱m روی دادهٔ ساختگی (تکرار/آینده/نامعتبر/گپ) */
function unitNormalizer() {
    const now = 1_800_000_000_000;
    const rows = [
        { timestamp: now - 5 * MIN, open: 1, high: 2, low: 0.5, close: 1.5 },
        { timestamp: now - 10 * MIN, open: 1, high: 2, low: 0.5, close: 1.5 },
        { timestamp: now - 10 * MIN, open: 9, high: 9, low: 9, close: 9 },
        { timestamp: now + 3 * MIN, open: 1, high: 2, low: 0.5, close: 1.5 },
        { timestamp: now - 3 * MIN, open: NaN, high: 2, low: 0.5, close: 1.5 },
        { timestamp: now - 8 * MIN, open: 1, high: 2, low: 0.5, close: 1.5 },
    ];
    const { candles, report } = normalize1m(rows, { nowMs: now });

    ok(candles.length === 3, `تعداد کندل معتبر باید ۳ باشد (${candles.length})`);
    ok(report.duplicates === 1, `تکرار باید ۱ باشد (${report.duplicates})`);
    ok(report.droppedFuture === 1, `کندل آینده باید ۱ باشد (${report.droppedFuture})`);
    ok(report.droppedInvalid === 1, `کندل نامعتبر باید ۱ باشد (${report.droppedInvalid})`);
    /**
     * دادهٔ ساختگی بالا **دو** گپ می‌سازد: `−۱۰m → −۸m` و `−۸m → −۵m`
     * (هر کدام ۲ کندل غایب) ⇒ انتظار درست: ۲ گپ و ۴ کندل غایب.
     * ⚠️ این عدد یک‌بار اشتباه دستی محاسبه شد و همین تست گرفتش — بردارها
     * باید کنار هم محاسبه و بازبینی شوند.
     */
    ok(report.gaps.length === 2, `دو گپ انتظار می‌رفت (${report.gaps.length})`);
    /**
     * محاسبهٔ درست (یک‌بار دستی اشتباه شمرده شد و همین تست گرفتش):
     *   `−10m → −8m` = ۲ دقیقه ⇒ ۱ کندل غایب
     *   `−8m → −5m`  = ۳ دقیقه ⇒ ۲ کندل غایب   ⇒ مجموع **۳**
     *   پوشش = ۳ / (۳ + ۳) = **۵۰٪**
     */
    ok(report.missingBars === 3, `کندل‌های غایب باید ۳ باشد (${report.missingBars})`);
    ok(
        Math.abs(report.coveragePct - 50) < 0.01,
        `پوشش باید ۵۰٪ باشد (${report.coveragePct})`,
    );
    ok(
        Number(candles[1].timestamp) > Number(candles[0].timestamp),
        "ترتیب صعودی اکید نقض شد",
    );
    ok(report.input === 6, `تعداد ورودی باید ۶ باشد (${report.input})`);
    console.log(
        `  ✔ S1 unit: normalize1m → kept=${candles.length} · coverage=${report.coveragePct}% · gaps=${report.gaps.length}`,
    );
}

/** ۲) تفکیک closed/forming روی باکت‌های ساختگی */
function unitBuckets() {
    const now = 1_800_000_000_000;
    const rows = [
        { timestamp: now - 3 * HOUR, open: 1, high: 2, low: 0.5, close: 1.5 },
        { timestamp: now - 2 * HOUR, open: 1, high: 2, low: 0.5, close: 1.5 },
        { timestamp: now - 30 * MIN, open: 1, high: 2, low: 0.5, close: 1.5 },
    ];
    const { closed, forming, report } = normalizeBuckets(rows, { nowMs: now, tfWidthMs: HOUR });
    ok(closed.length === 2, `باید ۲ باکت بسته باشد (${closed.length})`);
    ok(forming !== null, "باکت در حال تشکیل باید شناسایی شود");
    ok(report.forming === true, "گزارش باید forming=true بدهد");
    console.log(`  ✔ S1 unit: buckets → closed=${closed.length} · forming=${Boolean(forming)}`);
}

(async () => {
    ok(NORMALIZER_VERSION === "1.0.0", `نسخهٔ نرمالایزر (${NORMALIZER_VERSION})`);
    ok(
        SPEC_VERSIONS.baseVersion === "3.0" && SPEC_VERSIONS.specVersion === "3.2",
        `نسخه‌های قرارداد روی سرویس: ${JSON.stringify(SPEC_VERSIONS)}`,
    );
    unitNormalizer();
    unitBuckets();

    // ۳) /health — و انتظار برای آماده‌شدن (readiness probe)
    const healthRes = await fetch(`${HIST}/health`);
    ok(healthRes.status === 200, `HTTP /health = ${healthRes.status}`);
    let health = (await healthRes.json()).data;
    ok(health.ok === true, "/health باید ok باشد");
    ok(typeof health.uptimeSec === "number", "uptimeSec در /health نیست");
    ok(health.spec.specVersion === "3.2", "نسخهٔ قرارداد در /health نادرست است");
    console.log(`  ✔ S1 live: /health ok · ready=${health.ready} · uptime=${health.uptimeSec}s`);

    /**
     * ⚠️ **درس S1 (D23):** warmup راه‌اندازی اسکن سنکرون SQLite است و در بازهٔ
     * اجرایش حلقهٔ event loop می‌بندد. پس مثل یک readiness probe واقعی صبر
     * می‌کنیم تا `ready=true` شود و بعد مسیرهای داده را می‌سنجیم.
     */
    const waitReadyMs = Number(process.env.S1_WAIT_READY_MS || 120000);
    const deadline = Date.now() + waitReadyMs;
    while (!health.ready && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const probe = await fetch(`${HIST}/health`);
        health = (await probe.json()).data;
    }
    ok(health.ready === true, `سرویس در ${waitReadyMs}ms آماده نشد (warmup)`);
    console.log(`  ✔ S1 live: ready پس از warmup (${health.warmup?.ms}ms)`);

    // ۴) /metadata
    const metaRes = await fetch(`${HIST}/metadata/${SYMBOL}`);
    ok(metaRes.status === 200, `HTTP /metadata = ${metaRes.status}`);
    const meta = (await metaRes.json()).data;
    ok(Number.isFinite(meta.latestTimestamp), `latestTimestamp نامعتبر: ${meta.latestTimestamp}`);
    ok(typeof meta.lagSeconds === "number", `lagSeconds نامعتبر: ${meta.lagSeconds}`);
    ok(
        meta.coverage && typeof meta.coverage.coveragePct === "number",
        "پوشش ۷روزه در metadata نیست",
    );
    ok(meta.tickSize === null, "tickSize باید null باشد (در DB ما نیست)");
    ok(meta.venueCount >= 1, `venueCount نامعتبر: ${meta.venueCount}`);
    ok(meta.normalizer === "1.0.0", `نسخهٔ نرمالایزر در metadata: ${meta.normalizer}`);
    console.log(
        `  ✔ S1 live: /metadata lag=${Math.round(meta.lagSeconds / 86400)}d · coverage7d=${meta.coverage.coveragePct}% · venues=${meta.venueCount} · tickSize=${meta.tickSize}`,
    );

    // ۵) /tf با تفکیک closed/forming + سازگاری عقب‌رو
    const now = Date.now();
    const from = now - 208 * 86400000;
    const tfRes = await fetch(`${HIST}/tf/${SYMBOL}/1h?from=${from}&to=${now}`);
    ok(tfRes.status === 200, `HTTP /tf = ${tfRes.status}`);
    const tf = (await tfRes.json()).data;
    ok(Array.isArray(tf.closed) && tf.closed.length > 100, `closed نامعتبر (${tf.closed?.length})`);
    ok("forming" in tf, "فیلد forming در پاسخ نیست");
    ok(
        tf.count === tf.closed.length + (tf.forming ? 1 : 0),
        `count باید closed+forming باشد (${tf.count})`,
    );
    ok(tf.candles.length === tf.count, `سازگاری عقب‌رو: candles ≠ count (${tf.candles.length})`);
    ok(
        tf.candles.every((c) => c.timestamp <= now + 60 * MIN),
        "کندل آینده در پاسخ وجود دارد",
    );
    ok(
        tf.closed.every((c) => c.timestamp + 3600000 <= tf.meta.nowMs + 1000),
        "همهٔ باکت‌های closed باید تمام‌شده باشند",
    );
    ok(
        typeof tf.coveragePct === "number" && tf.coveragePct > 0,
        `coveragePct نامعتبر (${tf.coveragePct})`,
    );
    ok(Array.isArray(tf.gaps), "فیلد gaps در پاسخ نیست");
    ok(tf.meta.normalizer === "1.0.0", "نسخهٔ نرمالایزر در /tf نیست");
    console.log(
        `  ✔ S1 live: /tf closed=${tf.closed.length} · forming=${Boolean(tf.forming)} · coverage=${tf.coveragePct}% · gaps=${tf.gapCount}`,
    );

    // ۶) alias /candles
    const aliasRes = await fetch(`${HIST}/candles/${SYMBOL}/1h?from=${from}&to=${now}`);
    ok(aliasRes.status === 200, `HTTP /candles = ${aliasRes.status}`);
    const alias = (await aliasRes.json()).data;
    ok(alias.count === tf.count, `alias باید همان تعداد را بدهد (${alias.count} vs ${tf.count})`);
    console.log(`  ✔ S1 live: /candles alias ✓ (${alias.count} کندل)`);

    // ۷) فرانت با پاسخ تازه سالم بماند (رگرسیون end-to-end)
    const pageRes = await fetch(`${FRONT}/dashboard/historical/crypto`);
    ok(pageRes.status === 200, `صفحهٔ فرانت: HTTP ${pageRes.status}`);
    const html = await pageRes.text();
    const candles = Number((html.match(/data-hist-candles="(\d+)"/) || [])[1] ?? -1);
    ok(candles > 100, `صفحه باید همچنان کندل داشته باشد (${candles})`);
    console.log(`  ✔ S1 live: frontend page ${candles} کندل (قرارداد پاسخ نشکست)`);

    console.log(`normalize-s1: ${checks} assertion(s) passed`);
})().catch((e) => {
    console.error(`normalize-s1 FAILED: ${e && e.message}`);
    process.exitCode = 1;
});

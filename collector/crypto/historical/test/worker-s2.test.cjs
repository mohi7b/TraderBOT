/**
 * S2 — Worker Thread + کش RAM (TTL/LRU/dedup) — تست عددی
 * collector/crypto/historical/test/worker-s2.test.cjs
 * ============================================================
 * چه چیزی را اثبات می‌کند؟
 *   ۱) موتور در **ورکر** اجرا می‌شود (`engine.inlineMode=false` · `workerAlive=true`)
 *      ⇒ حلقهٔ HTTP پشت اسکن سنگین SQLite بلاک نمی‌شود (D23).
 *   ۲) **کش RAM**: درخواست دوم همان پنجره از حافظه می‌آید (`meta.cached=true`)،
 *      سریع‌تر از بار اول است، و شمارندهٔ `hits` بالا می‌رود.
 *   ۳) **dedup هم‌زمانی**: سه درخواست یکسان موازی ⇒ یک ساخت، بدون سه اسکن.
 *   ۴) سقف پنجره در API (`meta.clamped`) و قرارداد پاسخ کامل است.
 *
 * اجرا: node collector/crypto/historical/test/worker-s2.test.cjs
 * ============================================================
 */
const assert = require("assert");

const HIST = process.env.HISTORICAL_API || "http://127.0.0.1:4000";
const SYMBOL = (process.argv[2] || "BTCUSDT").toUpperCase();
const DAY = 86_400_000;

let checks = 0;
const ok = (cond, msg) => {
    assert.ok(cond, `S2: ${msg}`);
    checks++;
};

const get = async (path) => {
    const res = await fetch(`${HIST}${path}`);
    const body = await res.json();
    return { status: res.status, body, data: body && body.data };
};

(async () => {
    // ۱) سلامتی + وضعیت ورکر/کش
    const t0 = Date.now();
    const health = await get("/health");
    const healthMs = Date.now() - t0;
    ok(health.status === 200, `HTTP /health = ${health.status}`);
    ok(healthMs < 1500, `پاسخ /health باید سریع باشد (نه پشت warmup) — ${healthMs}ms`);
    ok(health.data.engine.workerAlive === true, "ورکر زنده نیست (workerAlive≠true)");
    ok(health.data.engine.inlineMode === false, "سرویس در حالت inline است (ورکر غیرفعال)");
    ok(health.data.engine.workerCalls >= 1, "هیچ فراخوانی ورکری ثبت نشده (warmup?)");
    console.log(
        `  ✔ S2 health: ${healthMs}ms · workerAlive=${health.data.engine.workerAlive} · threadId=${health.data.engine.workerThreadId} · workerCalls=${health.data.engine.workerCalls}`,
    );

    // ۲) بار سرد (miss) روی پنجره‌ای که تازه است
    const now = Date.now();
    const from = now - 100 * DAY;
    const cold0 = Date.now();
    const cold = await get(`/tf/${SYMBOL}/1h?from=${from}&to=${now}`);
    const coldMs = Date.now() - cold0;
    ok(cold.status === 200, `HTTP /tf (سرد) = ${cold.status}`);
    ok(cold.data.meta.cached === false || cold.data.meta.cached === true, "meta.cached نیست");
    ok(cold.data.closed.length > 100, `closed نامعتبر (${cold.data.closed.length})`);

    // ۳) بار گرم (hit) — همان پنجره، از RAM
    const warm0 = Date.now();
    const warm = await get(`/tf/${SYMBOL}/1h?from=${from}&to=${now}`);
    const warmMs = Date.now() - warm0;
    ok(warm.data.meta.cached === true, "درخواست دوم باید از کش RAM بیاید (meta.cached=true)");
    ok(warm.data.count === cold.data.count, `کش باید همان تعداد را بدهد (${warm.data.count})`);
    ok(warmMs <= Math.max(300, coldMs), `بار گرم باید سریع‌تر باشد (cold=${coldMs}ms · warm=${warmMs}ms)`);
    console.log(`  ✔ S2 cache: cold=${coldMs}ms (miss) · warm=${warmMs}ms (hit) · ${cold.data.count} کندل`);

    // ۴) dedup: سه درخواست یکسان موازی روی پنجرهٔ تازه
    const from2 = now - 120 * DAY;
    const before = (await get("/health")).data.engine;
    const results = await Promise.all([
        get(`/tf/${SYMBOL}/1h?from=${from2}&to=${now}`),
        get(`/tf/${SYMBOL}/1h?from=${from2}&to=${now}`),
        get(`/tf/${SYMBOL}/1h?from=${from2}&to=${now}`),
    ]);
    const after = (await get("/health")).data.engine;
    ok(results.every((r) => r.status === 200), "یکی از درخواست‌های موازی شکست خورد");
    ok(
        results.every((r) => r.data.count === results[0].data.count),
        "خروجی درخواست‌های موازی یکسان نیست",
    );
    const workerCalls = after.workerCalls - before.workerCalls;
    ok(workerCalls <= 2, `برای ۳ درخواست موازی حداکثر ۲ فراخوانی ورکر انتظار می‌رفت (${workerCalls})`);
    console.log(
        `  ✔ S2 dedup: ۳ درخواست موازی ⇒ workerCalls=${workerCalls} · deduped=${after.deduped - before.deduped} · hits=${after.hits - before.hits}`,
    );

    // ۵) سقف پنجره در API: پنجرهٔ نامحدود باید برش بخورد و گزارش شود
    const huge = await get(`/tf/${SYMBOL}/1h?from=0&to=${now}`);
    ok(huge.status === 200, `پنجرهٔ بزرگ باید ۲۰۰ بدهد (برش)، نه خطا (${huge.status})`);
    ok(huge.data.meta.clamped === true, "پنجرهٔ بزرگ باید meta.clamped=true بدهد");
    ok(huge.data.count <= 5001, `سقف کندل رعایت نشد (${huge.data.count})`);
    console.log(`  ✔ S2 guard: from=0 ⇒ clamped=${huge.data.meta.clamped} · ${huge.data.count} کندل (سقف ۵۰۰۰)`);

    // ۶) قرارداد پاسخ
    for (const field of ["closed", "forming", "candles", "gaps", "coveragePct", "latestTimestamp", "lagSeconds"]) {
        ok(field in cold.data, `فیلد «${field}» در پاسخ /tf نیست`);
    }
    ok(cold.data.meta.normalizer === "1.0.0", "نسخهٔ نرمالایزر در /tf نیست");
    console.log(`  ✔ S2 contract: closed/forming/gaps/coverage/latestTimestamp ✓ (${cold.data.coveragePct}% پوشش)`);

    console.log(`worker-s2: ${checks} assertion(s) passed`);
})().catch((e) => {
    console.error(`worker-s2 FAILED: ${e && e.message}`);
    process.exitCode = 1;
});

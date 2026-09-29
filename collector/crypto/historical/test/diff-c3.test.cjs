/**
 * C3 — **diff + ETag/304** (تست زندهٔ سبک روی سرویس واقعی).
 * ============================================================
 * اجرا: `node collector/crypto/historical/test/diff-c3.test.cjs`
 * پیش‌نیاز: سرویس تاریخی روی `HISTORICAL_API_BASE` (پیش‌فرض 127.0.0.1:4000) بالا باشد.
 *
 * قراردادهای سنجیده‌شده:
 *  ۱) `/tf` سرصفحهٔ `ETag` می‌دهد و `If-None-Match` ⇒ **۳۰۴ بدون بدنه**
 *  ۲) بدون `since` ⇒ `diff = null` (سازگاری کامل عقب‌رو)
 *  ۳) `since = latestTimestamp` ⇒ `appended = []` و `revisedTail` = آخرین کندل بسته
 *  ۴) `since` قدیمی‌تر ⇒ `appended` فقط کندل‌های **بستهٔ جدیدتر** + `revisedTail ≤ since`
 *  ۵) **merge بدون تکرار (idempotent):** `revisedTail + appended` = دنبالهٔ پاسخ کامل
 */
const BASE = process.env.HISTORICAL_API_BASE || "http://127.0.0.1:4000";
const TF = process.env.HISTORICAL_DIFF_TF || "1h";
const EX = process.env.HISTORICAL_DIFF_EXCHANGE || "binance_spot";
const URL_TF = `${BASE}/tf/BTCUSDT/${TF}?exchange=${EX}`;

let passed = 0;
const failed = [];
function ok(cond, msg) {
    if (cond) {
        passed += 1;
        process.stdout.write(`  ✔ ${msg}\n`);
    } else {
        failed.push(msg);
        process.stdout.write(`  ✘ ${msg}\n`);
    }
}

(async function main() {
    // ۱) ETag روی ۲۰۰
    const r1 = await fetch(URL_TF);
    ok(r1.status === 200, `HTTP 200 (${r1.status})`);
    const etag = r1.headers.get("etag");
    ok(typeof etag === "string" && etag.startsWith('W/"'), `سرصفحهٔ ETag منتشر شد (${etag})`);
    const cc = r1.headers.get("cache-control");
    ok(cc === "no-cache", `Cache-Control=no-cache (${cc})`);

    // ۲) درخواست شرطی ⇒ ۳۰۴ بدون بدنه
    const r2 = await fetch(URL_TF, { headers: { "if-none-match": etag } });
    ok(r2.status === 304, `If-None-Match هم‌سان ⇒ 304 (${r2.status})`);
    ok((await r2.text()).length === 0, "بدنهٔ ۳۰۴ کامل خالی است");
    ok((r2.headers.get("etag") ?? "").length > 0, "سرصفحهٔ ETag روی پاسخ ۳۰۴ هست (کلاینت باید بتواند دوباره اعتبار بسنجد)");

    // ۳) ETag ناهم‌سان ⇒ ۲۰۰ با بدنه (کنترل منفی)
    const r2b = await fetch(URL_TF, { headers: { "if-none-match": 'W/"deadbeefdeadbeef"' } });
    ok(r2b.status === 200, `ETag ناهم‌سان ⇒ 200 (${r2b.status})`);

    const j1 = (await r1.json()).data;
    ok(j1.diff === null, "بدون since ⇒ diff=null (سازگاری عقب‌رو)");
    const closed = j1.closed;
    const latest = j1.latestTimestamp;
    ok(closed.length > 100 && Number.isFinite(latest), `دادهٔ پایه سالم (closed=${closed.length})`);

    // ۴) since = latestTimestamp ⇒ appended خالی + revisedTail = آخرین کندل بسته
    const j3 = (await (await fetch(`${URL_TF}&since=${latest}`)).json()).data;
    ok(j3.diff && j3.diff.since === latest, "diff.since بازتاب داده شد");
    ok(j3.diff.appended.length === 0, `appended باید ۰ باشد (${j3.diff.appended.length})`);
    ok(
        j3.diff.revisedTail && j3.diff.revisedTail.timestamp === closed[closed.length - 1].timestamp,
        "revisedTail = آخرین کندل بستهٔ ≤ since",
    );

    // ۵) since قدیمی‌تر ⇒ دنبالهٔ کوچک
    const width = 3600000; // 1h
    const older = latest - 5 * width;
    const j4 = (await (await fetch(`${URL_TF}&since=${older}`)).json()).data;
    ok(j4.diff.appended.length >= 1 && j4.diff.appended.length <= 6, `appended کوچک است (${j4.diff.appended.length})`);
    ok(j4.diff.appended.every((c) => c.timestamp > older), "همهٔ appended > since");
    ok(j4.diff.revisedTail.timestamp <= older, "revisedTail ≤ since (برای بازنویسی مقدار نهایی)");

    // ۶) merge بدون تکرار: revisedTail + appended = دنبالهٔ پاسخ کامل
    const merged = [...(j4.diff.revisedTail ? [j4.diff.revisedTail] : []), ...j4.diff.appended];
    const tail = closed.slice(-merged.length);
    ok(
        merged.length === tail.length &&
            merged.every((c, i) => c.timestamp === tail[i].timestamp && c.close === tail[i].close),
        `merge با دنبالهٔ پاسخ کامل یکسان است (${merged.length} کندل)`,
    );
    ok(
        new Set(merged.map((c) => c.timestamp)).size === merged.length,
        "بدون تکرار زمان در merge (idempotent)",
    );

    process.stdout.write(`\ndiff-c3: ${passed} assertion(s) passed${failed.length ? `, ${failed.length} failed` : ""}\n`);
    if (failed.length) {
        for (const f of failed) process.stdout.write(`   ✘ ${f}\n`);
        process.exitCode = 1;
    }
})().catch((error) => {
    process.stdout.write(`\ndiff-c3: خطا — ${error && error.message ? error.message : error}\n`);
    process.exitCode = 1;
});

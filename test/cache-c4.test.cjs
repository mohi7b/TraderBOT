/**
 * C4 — **کش LRU کلاینت + سبک‌سازی رندر: سنجه‌های عددی.**
 * ============================================================
 * اجرا: `node test/cache-c4.test.cjs`   (پیش‌نیاز: سرور Next روی `cache-c4` BASE)
 *
 * چه چیزی سنجیده می‌شود (نه ادعا، عدد):
 *  ۱) **کش درون‌پروسه‌ای (LRU=۳ نماد · TTL):** بار دوم همان TF ⇒ `data-hist-cache="hit"`
 *  ۲) **سود عددی:** `data-hist-ms` بار دوم به‌مراتب کمتر از بار اول (KB و ms گزارش می‌شوند)
 *  ۳) **سوییچ TF:** 1m → 1h → 1m ⇒ بار دوم 1m «hit» است (هیچ درخواست تازه‌ای به سرور تاریخی)
 *  ۴) **دیاگنوستیک C1/C4 در SSR:** `data-hist-window` · `data-hist-anchored` · `data-hist-lag`
 *  ۵) **baseline اندازه‌گیری‌شده:** KB پاسخ `/tf` و KB صفحهٔ SSR برای هر TF
 */
const BASE = process.env.HISTORICAL_FRONT_BASE || "http://127.0.0.1:3000";
const PAGE = `${BASE}/dashboard/historical/crypto`;
const API = process.env.HISTORICAL_API_BASE || "http://127.0.0.1:4000";

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
const attr = (html, name) => (html.match(new RegExp(`data-${name}="([^"]*)"`)) || [])[1];

async function page(tf) {
    const url = `${PAGE}?tf=${tf}&asset=BTCUSDT&venue=binance_spot`;
    const t0 = Date.now();
    const res = await fetch(url);
    const html = await res.text();
    return { ms: Date.now() - t0, status: res.status, bytes: Buffer.byteLength(html), html };
}

(async function main() {
    /** ۱) بار اول (miss) و بار دوم (hit) برای همان TF */
    const a1 = await page("1h");
    ok(a1.status === 200, `SSR 1h بار اول: HTTP ${a1.status}`);
    const b1 = await page("1h");
    const cache1 = attr(b1.html, "hist-cache");
    const ms1a = Number(attr(a1.html, "hist-ms"));
    const ms1b = Number(attr(b1.html, "hist-ms"));
    ok(cache1 === "hit" || cache1 === "miss", `data-hist-cache منتشر شد («${cache1}»)`);
    ok(cache1 === "hit", `بار دوم همان TF از کش کلاینت خوانده شد («${cache1}»)`);
    ok(Number.isFinite(ms1a) && Number.isFinite(ms1b), `data-hist-ms منتشر شد (${ms1a} → ${ms1b})`);
    process.stdout.write(`     ↳ /tf: بار اول ${ms1a}ms · بار دوم ${ms1b}ms (کش) >‌سود ≈ ${ms1a - ms1b}ms\n`);
    ok(ms1b < ms1a, `بار دوم سریع‌تر از بار اول (${ms1b}ms < ${ms1a}ms)`);

    /** ۲) سوییچ TF: 1m → 1h → 1m ⇒ بار دوم 1m باید hit باشد */
    const m1 = await page("1m");
    ok(m1.status === 200, `SSR 1m: HTTP ${m1.status}`);
    const h1 = await page("1h");
    ok(h1.status === 200, "SSR 1h (پس از 1m): HTTP 200");
    const m2 = await page("1m");
    ok(
        attr(m2.html, "hist-cache") === "hit",
        `سوییچ TF: 1m بار دوم = hit («${attr(m2.html, "hist-cache")}»)`,
    );
    process.stdout.write(
        `     ↳ سوییچ TF: 1m=${attr(m1.html, "hist-cache")} · 1h=${attr(h1.html, "hist-cache")} · 1m(دوباره)=${attr(m2.html, "hist-cache")}\n`,
    );

    /** ۳) دیاگنوستیک C1/C4 (پنجره/لنگر/عقب‌ماندگی) */
    const win = attr(m2.html, "hist-window");
    const anchored = attr(m2.html, "hist-anchored");
    const lag = attr(m2.html, "hist-lag");
    ok(typeof win === "string" && /^\d{4}-.*\.\.\d{4}-/.test(win), `data-hist-window معتبر («${win}»)`);
    ok(anchored === "0" || anchored === "1", `data-hist-anchored منتشر شد («${anchored}»)`);
    ok(lag === "none" || /^\d+$/.test(lag), `data-hist-lag منتشر شد («${lag}») · ثانیه`);

    /** ۴) baseline عددی: KB پاسخ سرویس تاریخی و KB صفحهٔ SSR (برای گزارش قبل/بعد) */
    for (const tf of ["1m", "1h"]) {
        const j = await fetch(`${API}/tf/BTCUSDT/${tf}?exchange=binance_spot`);
        const body = await j.text();
        const p = await page(tf);
        process.stdout.write(
            `     ↳ baseline ${tf}: /tf ${(Buffer.byteLength(body) / 1024).toFixed(0)}KB · SSR ${(p.bytes / 1024).toFixed(0)}KB\n`,
        );
        ok(Buffer.byteLength(body) > 0, `/tf ${tf} بدنه دارد`);
    }

    process.stdout.write(`\ncache-c4: ${passed} assertion(s) passed${failed.length ? `, ${failed.length} failed` : ""}\n`);
    if (failed.length) {
        for (const f of failed) process.stdout.write(`   ✘ ${f}\n`);
        process.exitCode = 1;
    }
})().catch((error) => {
    process.stdout.write(`\ncache-c4: خطا — ${error && error.message ? error.message : error}\n`);
    process.exitCode = 1;
});

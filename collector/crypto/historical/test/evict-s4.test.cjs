/**
 * S4 — **تست eviction واقعی LRU کش پروکسی** (`> CACHE_MAX` کلید).
 * ============================================================
 * اجرا: `node collector/crypto/historical/test/evict-s4.test.cjs`
 * پیش‌نیاز: سرویس تاریخی بالا (`HISTORICAL_API_BASE`، پیش‌فرض 127.0.0.1:4000)
 *
 * چه چیزی سنجیده می‌شود:
 *  ۱) با `N` (> سقف) درخواست **کلیدِ متمایز**، `cacheSize` هرگز از `cacheMax` نمی‌گذرد
 *  ۲) `evictions > 0` (سیاست LRU واقعاً اجرا می‌شود، نه clear یکجا)
 *  ۳) `misses` با تعداد کلیدهای تازه رشد می‌کند و **hit** روی کلید — تازه‌ترین — کار می‌کند
 *
 * چرا پنجره‌های کوچک و متمایز: کلید کش = (`symbol|exchange|tf|from|to`) ⇒ با
 * جابه‌جایی `from/to` در چند دقیقه، کلیدهای مستقل و **ارزان** ساخته می‌شود
 * (کوئری ایندکس‌محور روی بازهٔ کوچک) بدون کوبیدن دیسک.
 */
const BASE = process.env.HISTORICAL_API_BASE || "http://127.0.0.1:4000";
const TF = "1m";
const MIN = 60_000;

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

async function health() {
    const res = await fetch(`${BASE}/health`);
    const body = await res.json();
    return body.data ?? body;
}

(async function main() {
    const h0 = await health();
    const max = h0.engine.cacheMax;
    const baseMiss = h0.engine.misses;
    const baseEvict = h0.engine.evictions;
    ok(Number.isFinite(max) && max > 0, `سقف کش گزارش شد (cacheMax=${max})`);

    const N = max + 7; // کمی بیشتر از سقف ⇒ eviction حتمی
    const anchor = Date.now() - 7 * 24 * 3600 * 1000; // لنگر ثابت (بدون وابستگی به «اکنون»)
    const base = Math.floor(anchor / MIN) * MIN;

    process.stdout.write(`     ↳ ارسال ${N} درخواست با کلید متمایز (tf=${TF}، پنجره‌های ۲ دقیقه‌ای)…\n`);
    for (let i = 0; i < N; i += 1) {
        const from = base - i * 5 * MIN;
        const to = from + 2 * MIN;
        const res = await fetch(`${BASE}/tf/BTCUSDT/${TF}?from=${from}&to=${to}`);
        if (res.status !== 200) {
            ok(false, `درخواست ${i} با HTTP ${res.status} پاسخ داد`);
            break;
        }
    }

    const h1 = await health();
    const e = h1.engine;
    process.stdout.write(
        `     ↳ cacheSize=${e.cacheSize}/${e.cacheMax} · evictions=${e.evictions} · misses=${e.misses} · hits=${e.hits}\n`,
    );
    ok(e.cacheSize <= e.cacheMax, `سقف LRU رعایت شد (${e.cacheSize} ≤ ${e.cacheMax})`);
    ok(e.evictions > baseEvict, `eviction واقعی رخ داد (${baseEvict} → ${e.evictions})`);
    ok(e.misses > baseMiss, `کلیدهای تازه miss شدند (${baseMiss} → ${e.misses})`);
    ok(e.cacheSize >= 1, "کش پس از eviction خالی/خراب نشد");

    /** hit روی **تازه‌ترین** کلید (آخرین درخواست باید در کش مانده باشد) */
    const from = base - (N - 1) * 5 * MIN;
    const res = await fetch(`${BASE}/tf/BTCUSDT/${TF}?from=${from}&to=${from + 2 * MIN}`);
    ok(res.status === 200, "درخواست تکراری تازه‌ترین کلید = 200");
    const h2 = await health();
    /**
     * **S4:** «تازه‌ترین کلید» می‌تواند از **RAM** یا از **کش دیسکی** سرو شود
     * (هر دو یعنی هیچ بازسازی/کوئری سنگینی رخ نداده ✓). assert قبلی فقط RAM را
     * می‌شمرد ⇒ با فعال‌شدن کش دیسکی نادرست می‌شد ✗
     */
    const servedFast =
        h2.engine.hits + h2.engine.tfDisk.hits > e.hits + e.tfDisk.hits;
    ok(
        servedFast,
        `تازه‌ترین کلید سریع سرو شد (RAM hits: ${e.hits} → ${h2.engine.hits} · disk hits: ${e.tfDisk.hits} → ${h2.engine.tfDisk.hits})`,
    );

    process.stdout.write(`\nevict-s4: ${passed} assertion(s) passed${failed.length ? `, ${failed.length} failed` : ""}\n`);
    if (failed.length) {
        for (const f of failed) process.stdout.write(`   ✘ ${f}\n`);
        process.exitCode = 1;
    }
})().catch((error) => {
    process.stdout.write(`\nevict-s4: خطا — ${error && error.message ? error.message : error}\n`);
    process.exitCode = 1;
});

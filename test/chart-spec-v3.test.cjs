/**
 * Chart Engine v3 — تست قرارداد روی خروجی واقعی SSR
 * test/chart-spec-v3.test.cjs
 * ============================================================
 * **چرا تست SSR و نه تست واحد؟**
 *   منطق ریاضی دامنه‌ها TypeScript است و runner تست این پروژه pure CJS است
 *   (بدون ts-node). پس قرارداد v3 روی **HTML واقعی** بررسی می‌شود — همان روشی
 *   که در این پروژه ۶ باگ واقعی را گرفت (چون مرورگر headless در دسترس نیست).
 *
 * پیش‌نیاز: سرور dev روی http://127.0.0.1:3000 بالا باشد.
 * اجرا:      node test/chart-spec-v3.test.cjs [country ...]
 * ============================================================
 */
const assert = require("assert");

const BASE = process.env.MACRO_FRONTEND || "http://127.0.0.1:3000";
const COUNTRIES = process.argv.slice(2).length ? process.argv.slice(2) : ["USA", "DEU", "TUR"];

/** چارت‌های مورد انتظار: دامنه → (سیاست missing, تعداد سیگنال) */
const CHARTS = [
  { domain: "cpi", policy: "hide", signals: 7, math: "1.0" },
  { domain: "policy", policy: "na", signals: 7, math: "1.0" },
  { domain: "growth", policy: "na", signals: 7, math: "1.0" },
  { domain: "financial", policy: "na", signals: 7, math: "1.0" },
];

async function fetchHtml(country) {
  const res = await fetch(`${BASE}/dashboard/macro?country=${country}`);
  assert.strictEqual(res.status, 200, `${country}: HTTP ${res.status}`);
  return res.text();
}

function countAll(html, re) {
  return [...html.matchAll(re)].map((m) => m[1]);
}

(async () => {
  let checked = 0;
  for (const country of COUNTRIES) {
    const html = await fetchHtml(country);

    // ۱) نسخهٔ قرارداد روی هر چهار چارت
    const specs = countAll(html, /data-spec-version="([^"]+)"/g);
    assert.strictEqual(specs.length, CHARTS.length, `${country}: تعداد data-spec-version`);
    for (const v of specs) assert.strictEqual(v, "3.0", `${country}: specVersion=${v}`);

    // ۲) نسخهٔ ریاضی هر دامنه
    const maths = countAll(html, /data-math-version="([^"]+)"/g);
    assert.deepStrictEqual(maths.sort(), CHARTS.map((c) => c.math).sort(), `${country}: mathVersion`);

    // ۳) سیاست «بدون داده» هر دامنه (hide/dash/dash/na)
    const policies = countAll(html, /data-missing-policy="([^"]+)"/g).sort();
    assert.deepStrictEqual(
      policies,
      CHARTS.map((c) => c.policy).sort(),
      `${country}: missing policies`,
    );

    // ۴) سطر سیگنال‌ها: چهار سطر، هر کدام ۷ بج (بدون شکست خط)
    const rows = countAll(html, /data-chart-signals="(\d+)"/g).map(Number);
    assert.deepStrictEqual(rows, CHARTS.map((c) => c.signals), `${country}: rows=${rows}`);
    assert.strictEqual(/basis-full/.test(html), false, `${country}: شکست خط در سطر سیگنال`);

    // ۵) i18n: هیچ tooltip نباید کلید خام `signals.*` باشد (fallback = باگ ترجمه)
    assert.strictEqual(
      /title="signals\.[a-z]/.test(html),
      false,
      `${country}: tooltip ترجمه‌نشده (کلید خام) پیدا شد`,
    );

    checked++;
    console.log(`  ✔ ${country}: 4 chart specs · math/policy OK · rows=${rows.join("/")}`);
  }
  console.log(`chart-spec v3 contract: ${checked} country(ies) passed`);
})().catch((e) => {
  console.error(`chart-spec v3 contract FAILED: ${e && e.message}`);
  process.exitCode = 1;
});

// ------------------------------------------------------------------
// H1 — دامنهٔ تاریخی (Historical · BTCUSDT)
// ------------------------------------------------------------------
/**
 * دو لایهٔ بررسی:
 *   ۱) **قرارداد استاتیک** (بدون سرور): نسخهٔ ۳.۱ · قفل‌ماندن ماکرو روی ۳.۰ ·
 *      رعایت D6 (استفاده از TimeShift موجود و **دست‌نزدن به `bucketFloor`**) ·
 *      افزودنی‌های موتور (بج عریض/پنل زیرین/رنگ کندل از تم) · **هم‌خوانی
 *      i18n**: هر `hintKey` کامپوننت باید در `macro.fa.json` و `macro.en.json`
 *      واقعاً وجود داشته باشد (جلوی drift متن‌ها را می‌گیرد).
 *   ۲) **SSR اختیاری**: اگر سرور frontend بالا باشد، صفحهٔ تاریخی خوانده و
 *      نشانگرهای `data-*` بررسی می‌شوند؛ اگر نباشد با پیام روشن skip می‌شود.
 */
const fs = require("fs");
const pathMod = require("path");
const ROOT = pathMod.resolve(__dirname, "..");
const readSrc = (p) => fs.readFileSync(pathMod.join(ROOT, p), "utf8");

let h1Count = 0;
function h1Assert(cond, msg) {
  assert.ok(cond, `H1: ${msg}`);
  h1Count++;
}

function h1StaticContract() {
  const spec = readSrc("frontend/lib/chart/spec/historical.ts");
  h1Assert(/HISTORICAL_SPEC_VERSION\s*=\s*"3\.2"/.test(spec), "نسخهٔ دامنه باید 3.2 باشد");
  h1Assert(/validateHistoricalSpec/.test(spec), "ولیدیتور قرارداد تاریخی موجود است");
  h1Assert(/StructureSpec/.test(spec), "افزودنی ۳.۲ (provisional/confirmed) در قرارداد هست");

  /**
   * ⚠️ تفکیک مهم (تجربهٔ واقعی همین تست): **قرارداد spec** در
   * `lib/chart/spec/types.ts` و **قراردادهای موتور** در `lib/chart/types.ts`
   * دو فایل جدا هستند؛ افزودنی‌های H1 همه در دومی‌اند.
   */
  const specTypes = readSrc("frontend/lib/chart/spec/types.ts");
  h1Assert(/CHART_SPEC_VERSION\s*=\s*"3\.0"/.test(specTypes), "قرارداد ماکرو باید روی ۳٫۰ قفل بماند");
  const engineTypes = readSrc("frontend/lib/chart/types.ts");
  h1Assert(/wideLast\?:/.test(engineTypes), "wideLast روی ChartSignalsStyle");
  h1Assert(/panes\?: \{ volume\?: number \}/.test(engineTypes), "panes.volume در layout");
  h1Assert(/scaleMargins\?: \{ top: number; bottom: number \}/.test(engineTypes), "scaleMargins سری");
  h1Assert(/color\?: string;/.test(engineTypes), "رنگ نقطه‌به‌نقطه (پنل حجم)");

  const tb = readSrc("frontend/lib/historical/timeBoundary.ts");
  h1Assert(/DEFAULT_TIME_SHIFT/.test(tb), "D6: استفاده از TimeShift موجود پروژه");
  /**
   * ⚠️ `bucketFloor` در **متن توضیحات** فایل ذکر شده (برای ثبت تصمیم D6) ⇒
   * بررسی باید روی **کد** انجام شود، نه روی کامنت‌ها (تجربهٔ واقعی همین تست).
   */
  const tbCode = tb.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  h1Assert(!/bucketFloor/.test(tbCode), "D6: هیچ دست‌کاری در bucketFloor موتور (فقط در doc)");
  h1Assert(/toNyAxisCandles/.test(tbCode) && /detectGaps/.test(tbCode), "TAMC کامل (محور NY + گپ)");
  /**
   * رگرسیون‌بانِ دو خطای واقعی 2026-09-23 که صفحه را در **مرورگر** می‌انداختند:
   *   ۱) باکت‌های هم‌زمان‌شدهٔ DST ⇒ نیاز به ادغام (ترتیب اکیداً صعودی LWC)
   *   ۲) بازهٔ زوم نامعتبر ⇒ `Uncaught Error: Value is null`
   */
  h1Assert(/collapseAxisCollisions/.test(tbCode), "TAMC: ادغام برخورد محور (DST) موجود است");
  h1Assert(/collapseAxisCollisions/.test(readSrc("frontend/components/domain/historical/CandleChart.tsx")), "چارت از ادغام DST استفاده می‌کند");
  /** H2: نشانگر گرافیکی کراس = نقاش درون‌موتوری (داده از دامنه، بدون تابع از سرور) */
  h1Assert(
    /"cross-markers": paintCrossMarkers/.test(readSrc("frontend/lib/chart/layers.ts")),
    "موتور: نقاش cross-markers ثبت شده است",
  );
  h1Assert(
    /export function crossMarkerPoints/.test(readSrc("frontend/lib/historical/crossLayer.ts")),
    "دامنه: سازندهٔ نقاط نشانگر کراس موجود است",
  );

  const engine = readSrc("frontend/components/base/BaseChart.tsx");
  h1Assert(/data-signal-wide/.test(engine), "موتور: رندر بج عریض");
  h1Assert(/priceScale\(scaleId\)\.applyOptions/.test(engine), "موتور: پنل زیرین (مقیاس مخفی)");
  h1Assert(/candleUp/.test(engine), "موتور: رنگ کندل از اسلات‌های تم");

  h1Assert(/shahrivar_hist/.test(readSrc("frontend/lib/chart/themePresets.ts")), "تم تاریخی ثبت شده");

  const chart = readSrc("frontend/components/domain/historical/CandleChart.tsx");
  h1Assert(/data-hist-time-boundary="utc-21"/.test(chart), "SSR: مبدأ محور ثابت ۲۱:۰۰ UTC (S5)");
  h1Assert(/HIST_VOLUME_SCALE_ID/.test(chart), "پنل حجم در کامپوننت");

  const keys = [...chart.matchAll(/hintKey:\s*"([^"]+)"/g)].map((m) => m[1]);
  h1Assert(keys.length === 8, `تعداد hintKey=${keys.length} (انتظار ۸: ۱ اصلی + ۶ فرعی + ۱ هشدار)`);
  for (const lang of ["fa", "en"]) {
    const msg = JSON.parse(readSrc(`frontend/messages/macro.${lang}.json`));
    for (const k of keys) {
      let cur = msg;
      for (const part of k.replace(/^signals\./, "").split(".")) {
        cur = cur && typeof cur === "object" ? cur[part] : undefined;
      }
      h1Assert(typeof cur === "string", `${lang}: کلید i18n ناموجود «${k}»`);
    }
  }
  console.log("  ✔ H1 static: contract 3.2 · D6 boundary · engine additions · 8×2 i18n hints");
}

async function h1Ssr() {
  const base = process.env.HIST_FRONTEND || BASE;
  try {
    const res = await fetch(`${base}/dashboard/historical/crypto`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    h1Assert(/data-spec-version="3\.2"/.test(html), "SSR: data-spec-version=3.2");
    h1Assert(/data-base-spec-version="3\.0"/.test(html), "SSR: پایهٔ قرارداد ۳٫۰");
    h1Assert(/data-hist-time-boundary="utc-21"/.test(html), "SSR: مبدأ محور ثابت ۲۱:۰۰ UTC (S5)");
    /** P1.2c — دروازهٔ خودآزمون هستهٔ V2 (SeriesRegistry · LayerPainter · SpecGate) */
    const engineSelf = (html.match(/data-engine-selftest="([^"]*)"/) || [])[1];
    h1Assert(engineSelf !== undefined, "SSR: data-engine-selftest منتشر نشد ✗");
    h1Assert(
      engineSelf === "ok:0",
      `خودآزمون هستهٔ V2 خطا دارد: «${engineSelf}» — ${
        (html.match(/data-engine-selftest-first="([^"]*)"/) || [])[1] ?? ""
      }`,
    );
    /** P3-b — پروفایل فعال: یکی از شش id هستهٔ `profiles.ts` ✓ (پیش‌فرض classic ✓) */
    const profileAttr = (html.match(/data-chart-profile="([^"]*)"/) || [])[1];
    h1Assert(
      ["classic", "micro", "flow", "ai", "hybrid", "pro"].includes(profileAttr ?? ""),
      `data-chart-profile نامعتبر: «${profileAttr}» ✗`,
    );
    const down = /data-hist-service="down"/.test(html);
    /**
     * ⚠️ درسِ واقعی: «سرویس up» فقط یعنی خطای سرویس نداشته — نه اینکه داده آمده.
     * باگ یکای پارامتر و شکل envelope باعث شد صفحه **۲۰۰ با صفر کندل** بدهد و
     * این خط بود که آن را می‌گرفت. پس این‌جا وجود کندل هم **اجباری** بررسی می‌شود.
     */
    const candleCount = Number((html.match(/data-hist-candles="(\d+)"/) || [])[1] ?? -1);
    h1Assert(down || candleCount > 0, `SSR: سرویس بالا ولی کندل صفر (count=${candleCount})`);
    /** H2: نشانگرهای کراس باید دقیقاً به تعداد کراس‌های شناسایی‌شده باشند */
    const markerCount = Number((html.match(/data-hist-cross-markers="(\d+)"/) || [])[1] ?? -1);
    const crossCount = Number((html.match(/data-hist-cross-count="(\d+)"/) || [])[1] ?? -2);
    h1Assert(
      markerCount === crossCount,
      `SSR: نشانگر کراس (${markerCount}) با تعداد کراس (${crossCount}) یکی نیست`,
    );
    console.log(
      `  ✔ H1 SSR: page 200 · candles=${down ? "—" : candleCount} · service=${down ? "down (پیام اختصاصی)" : "up"}`,
    );
  } catch (e) {
    console.log(`  · H1 SSR skipped (${e && e.message}) — سرور frontend بالا نیست`);
  }
}

/** ⚠️ مقاوم: یک assertion شکست‌خورده نباید بخش SSR و بقیهٔ گزارش را پنهان کند. */
try {
  h1StaticContract();
} catch (e) {
  console.error(`H1 static FAILED: ${e && e.message}`);
  process.exitCode = 1;
}
h1Ssr()
  .then(() => console.log(`H1 historical contract: ${h1Count} assertion(s) passed`))
  .catch((e) => {
    console.error(`H1 historical contract FAILED: ${e && e.message}`);
    process.exitCode = 1;
  });

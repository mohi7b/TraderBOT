/**
 * A1 — Analysis Layer (AL): قرارداد، برابری عددی و نبود محاسبه در چارت
 * test/analysis-a1.test.cjs
 * ============================================================
 * رانر تست پروژه pure CJS است (بدون ts-node) ⇒ سه لایه بررسی می‌شود:
 *   ۱) **ساختاری**: پوشه‌ها/رجیستری/تیپ‌ها + این‌که ریاضی EMA/SMA دیگر در
 *      `historical/indicators.ts` تعریف نشده (D11) و چارت هم فرمول ندارد.
 *   ۲) **پارامترها**: `params.json` با اسکیما جور است و شناسهٔ بی‌اسکیما ندارد.
 *   ۳) **برابری عددی AL ↔ CJS** روی دادهٔ واقعی: صفحه مقدار AL را در
 *      `data-hist-ema21` / `data-hist-sma50` منتشر می‌کند؛ تست با **آینهٔ TAMC**
 *      (انتقال NY + ادغام DST) سری محور را می‌سازد و مقدار انتظار را با مرجع CJS
 *      (`collector/crypto/common/analysis/indicators/base/price/price-indicators.cjs`) می‌سنجد.
 *   ۴) **خودآزمون AL** (`data-al-selftest`) + پنل `?pane=macd`.
 *
 * اجرا: node test/analysis-a1.test.cjs [symbol] [tf]
 * ============================================================
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const BASE = process.env.MACRO_FRONTEND || "http://127.0.0.1:3000";
const HIST = process.env.HISTORICAL_API || "http://127.0.0.1:4000";
const ROOT = path.resolve(__dirname, "..");
const SYMBOL = (process.argv[2] || "BTCUSDT").toUpperCase();
const TF = process.argv[3] || "1h";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, `A1: ${msg}`);
  checks++;
};

/** ۱) ساختار AL (بدون سرور) */
function staticStructure() {
  const files = [
    "frontend/lib/analysis/versioning.ts",
    "frontend/lib/analysis/indicators/registry.ts",
    "frontend/lib/analysis/indicators/params.json",
    "frontend/lib/analysis/indicators/params.schema.ts",
    "frontend/lib/analysis/indicators/types.ts",
    "frontend/lib/analysis/indicators/selftest.ts",
    "frontend/lib/analysis/indicators/compute/ema.ts",
    "frontend/lib/analysis/indicators/compute/sma.ts",
    "frontend/lib/analysis/indicators/compute/rsi.ts",
    "frontend/lib/analysis/indicators/compute/macd.ts",
    "frontend/lib/analysis/indicators/compute/atr.ts",
    "frontend/lib/analysis/indicators/compute/bbands.ts",
    "frontend/lib/analysis/indicators/compute/vwap.ts",
    "frontend/lib/analysis/integrations/chart/indicators.ts",
  ];
  for (const f of files) ok(exists(f), `فایل AL موجود نیست: ${f}`);

  const registry = read("frontend/lib/analysis/indicators/registry.ts");
  for (const id of ["ema", "ema_fast", "ema_slow", "sma", "rsi", "macd", "atr", "bbands", "vwap"]) {
    ok(new RegExp(`\\b${id}:\\s*descriptor\\(`).test(registry), `اندیکاتور «${id}» در رجیستری نیست`);
  }
  ok(/formulaVersion:\s*formulaVersionOf/.test(registry), "رجیستری باید فرمول‌نسخه را از versioning بگیرد");
  ok(/scalePolicy/.test(registry), "رجیستری باید سیاست مقیاس (overlay/pane) داشته باشد");

  /** D11: ریاضی EMA/SMA نباید در لایهٔ تاریخی بماند (فقط re-export) */
  const hist = read("frontend/lib/historical/indicators.ts");
  ok(!/2 \/ \(period \+ 1\)/.test(hist), "D11: فرمول EMA نباید در historical/indicators.ts بماند");
  ok(!/export function sma\(/.test(hist), "D11: تابع sma نباید در historical/indicators.ts تعریف شود");
  ok(
    /from "@\/lib\/analysis\/indicators\/compute/.test(hist),
    "D11: historical/indicators باید از AL re-export کند",
  );

  /** چارت باید از AL بخواند، نه فرمول محلی */
  const chart = read("frontend/components/domain/historical/CandleChart.tsx");
  ok(/buildIndicator\(/.test(chart), "چارت باید از buildIndicator (AL) استفاده کند");
  ok(/paramsFor\("ema"\)/.test(chart), "پارامتر EMA باید از AL بیاید");
  ok(!/ema\(closes,/.test(chart), "چارت نباید خودش EMA حساب کند");
}

/** ۲) پارامترها: JSON ↔ اسکیما */
function paramsContract() {
  const raw = JSON.parse(read("frontend/lib/analysis/indicators/params.json"));
  const schema = read("frontend/lib/analysis/indicators/params.schema.ts");
  for (const id of Object.keys(raw)) {
    // `$comment` و `signals` کلیدهای ساختاری‌اند، نه شناسهٔ اندیکاتور
    if (id.startsWith("$") || id === "signals") continue;
    ok(new RegExp(`\\b${id}:\\s*\\{`).test(schema), `شناسهٔ «${id}» در params.json اسکیما ندارد`);
  }
  ok(raw.ema.period === 21 && raw.sma.period === 50, "پیش‌فرض‌های مصوب EMA21/SMA50 تغییر کرده‌اند");
  ok(
    raw.rsi.period === 14 && raw.macd.fast === 12 && raw.macd.slow === 26,
    "پیش‌فرض RSI/MACD مطابق مصوبه نیست",
  );
  ok(/errors\.push/.test(schema), "اسکیما باید خطا جمع کند (fail-fast)");

  /** A2: بخش سیگنال‌ها هم باید اسکیما داشته باشد (همان قاعدهٔ «خارج از کد») */
  const signalIds = Object.keys(raw.signals ?? {}).filter((k) => !k.startsWith("$"));
  ok(signalIds.length >= 3, `بخش signals باید حداقل ۳ سیگنال داشته باشد (فعلی: ${signalIds.length})`);
  for (const id of signalIds) {
    ok(
      new RegExp(`\\b${id}:\\s*\\{`).test(schema),
      `سیگنال «${id}» در params.json اسکیمای SIGNAL_PARAM_SCHEMA ندارد`,
    );
  }
}

/** آینهٔ TAMC در Node: انتقال NY (intraday) + ادغام برخورد DST. */
function buildAxis(rows) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const offsetMin = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Math.round(
      (Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute) - ms) / 60000,
    );
  };
  const axis = [];
  for (const c of rows) {
    /**
     * **S5 — آینهٔ TAMC با مبدأ ثابت:** داخل‌روزی **بدون شیفت** (شناسه ✓) و
     * روزانه+ = `ts + 21h` (close ثابت ✓). دیگر هیچ وابستگی به NY/DST نیست ⇒
     * مرجع دقیقاً همان سری‌ای است که چارت می‌بیند ✓ (ادغام برخورد هم لازم نیست ✓)
     */
    const isDaily = /^(1d|3d|5d|1w|1mo|1y)$/.test(TF);
    const a = isDaily ? c.timestamp + 21 * 3600000 : c.timestamp;
    const prev = axis[axis.length - 1];
    if (prev && prev.axisTime === a) {
      prev.high = Math.max(prev.high, c.high);
      prev.low = Math.min(prev.low, c.low);
      prev.close = c.close;
      continue;
    }
    axis.push({ axisTime: a, high: c.high, low: c.low, close: c.close });
  }
  return axis;
}

(async () => {
  staticStructure();
  paramsContract();
  console.log("  ✔ A1 static: ساختار AL + رجیستری ۹ اندیکاتور + D11 + params.json");

  const res = await fetch(`${BASE}/dashboard/historical/crypto`);
  assert.strictEqual(res.status, 200, `صفحهٔ تاریخی: HTTP ${res.status}`);
  const html = await res.text();

  // ۳) خودآزمون AL از طریق SSR
  const self = (html.match(/data-al-selftest="([^"]+)"/) || [])[1] ?? "";
  ok(self.startsWith("ok:"), `خودآزمون AL در SSR ناموفق: «${self}»`);
  console.log(`  ✔ A1 selftest: ${self} (بردارهای مرجع SMA/EMA/RSI/MACD/ATR/BB/VWAP)`);

  // ۴) نسخه/فرمول منتشرشده
  const alVer = (html.match(/data-al-version="([^"]+)"/) || [])[1] ?? "";
  const alFormula = (html.match(/data-al-formula="([^"]+)"/) || [])[1] ?? "";
  ok(/^\d+\.\d+\.\d+$/.test(alVer), `data-al-version نامعتبر: «${alVer}»`);
  ok(/ema:1\.0\.0/.test(alFormula), `data-al-formula باید نسخهٔ فرمول EMA را بدهد: «${alFormula}»`);

  // ۵) برابری عددی با مرجع CJS روی همان سری محور
  const ref = require(path.join(ROOT, "collector/crypto/common/analysis/indicators/base/price/price-indicators.cjs"));
  const now = Date.now();
  const from = now - 208 * 86400000;
  const api = await fetch(`${HIST}/tf/${SYMBOL}/${TF}`);
  assert.strictEqual(api.status, 200, `سرویس تاریخی: HTTP ${api.status}`);
  const body = await api.json();
  /**
   * **پنجرهٔ یکسان با صفحهٔ SSR (C1):** درخواست **بدون `from`/`to`** زده می‌شود
   * تا سرور خودش پنجره را بسازد — دقیقاً همان پنجره‌ای که صفحه دیده است.
   * باگ واقعی: قبلاً تست پنجرهٔ ۲۰۸ روزهٔ خودش را می‌گرفت و مرزهای کمی متفاوت
   * با پنجرهٔ سرور ⇒ اختلاف نسبی ~۵e-4 در EMA (یک‌چند میله افت) ✗
   */
  /**
   * **C2/C3 — مبنای مرجع = مبنای چارت:** اگر سازندهٔ چارت روی `closed` حساب کرده
   * (یعنی سرور کندل در حال تشکیل داده و SSR آن را با `data-al-basis="closed"`
   * اعلام کرده)، مرجع CJS هم باید **همان دنباله** را ببیند ⇒ کندل نیم‌کاره از
   * ورودی مرجع حذف می‌شود. (تصمیم صریح: «تست برابری روی `closed[]` بازنویسی
   * شود» — نه بازگرداندن چارت به محور کامل.)
   */
  const basisIsClosed = /data-al-basis="closed"/.test(html);
  const rows = body?.data?.candles ?? [];
  assert.ok(rows.length > 100, `کندل کافی برنگشت (${rows.length})`);
  /**
   * **هم‌ترازی قطعی با سری چارت:** صفحه تعداد میله‌های مبنای خودش را در
   * `data-al-basis-bars` منتشر می‌کند. از آنجا که پیشوند تاریخ هرگز تغییر
   * نمی‌کند و فقط دنباله اضافه می‌شود، **برش پیشوندی به همان تعداد** دقیقاً
   * همان سری‌ای است که چارت دیده — حتی اگر بین دو درخواست (چارت و تست) کلکتور
   * کندل تازه اضافه کرده باشد. (باگ واقعی: قبلاً یک کندل کورکورانه حذف/نگه
   * داشته می‌شد ⇒ اختلاف نسبی ~۵e-4 در EMA ✗)
   */
  const basisBars = Number((html.match(/data-al-basis-bars="(\d+)"/) || [])[1] ?? 0);
  const formingTsAttr = (html.match(/data-hist-forming="([^"]+)"/) || [])[1];
  const formingMs = formingTsAttr && formingTsAttr !== "none" ? Date.parse(formingTsAttr) : null;
  /**
   * **هم‌ترازی زمانی (قطعی):** مبنای AL باکت در حال تشکیل را حذف می‌کند ⇒ مرجع هم
   * باید `timestamp < forming` باشد. برش «به تعداد» شکننده بود: با چند ثانیه
   * اختلاف بین دو درخواست (چارت و تست) پنجرهٔ سرور یک کندل جلو/عقب می‌رود ⇒
   * اختلاف نسبی ~۱e-۳ در EMA21 ✗ (جابه‌جایی یک کندلی) — حالا با **زمان** تراز می‌شود ✓
   */
  const rowsForRef = formingMs
    ? rows.filter((r) => Number(r.timestamp) < formingMs)
    : rows;
  if (basisBars > 0) {
    assert.ok(
      Math.abs(rowsForRef.length - basisBars) <= 2,
      `هم‌ترازی مرجع/چارت خارج از تحمل: ref=${rowsForRef.length} · chart=${basisBars}`,
    );
  }

  const axis = buildAxis(rowsForRef);
  const closes = axis.map((c) => c.close);
  const emaWant = ref.ema(closes, 21);
  /**
   * **تشخیص پارټی (موقت):** سر/ته/طول دو سری — تا معلوم شود اختلاف از «سر پنجره»
   * است یا «میانه/DST». (چارت: `basisBars` از SSR · مرجع: همان `rows` تراز‌شده)
   */
  console.log(
    `     ↳ diag: rows=${rows.length} refRows=${rowsForRef.length} chartBars=${basisBars} ` +
      `axis=${axis.length} ` +
      `refHead=${new Date(rowsForRef[0]?.timestamp ?? 0).toISOString()} ` +
      `refTail=${new Date(rowsForRef[rowsForRef.length - 1]?.timestamp ?? 0).toISOString()} ` +
      `axisHead=${axis[0]?.axisTime ?? 0} axisTail=${axis[axis.length - 1]?.axisTime ?? 0} ` +
      `forming=${formingTsAttr ?? "none"}`,
  );
  const smaWant = ref.sma(closes, 50);
  const emaGot = Number((html.match(/data-hist-ema21="([^"]+)"/) || [])[1]);
  const smaGot = Number((html.match(/data-hist-sma50="([^"]+)"/) || [])[1]);
  ok(Number.isFinite(emaGot) && Number.isFinite(emaWant), "مقدار EMA از صفحه یا مرجع نیامد");
  ok(Number.isFinite(smaGot) && Number.isFinite(smaWant), "مقدار SMA از صفحه یا مرجع نیامد");
  const relEma = Math.abs(emaGot - emaWant) / Math.abs(emaWant);
  const relSma = Math.abs(smaGot - smaWant) / Math.abs(smaWant);
  ok(relEma < 1e-6, `برابری EMA21: AL=${emaGot} · CJS=${emaWant} (اختلاف نسبی ${relEma})`);
  ok(relSma < 1e-6, `برابری SMA50: AL=${smaGot} · CJS=${smaWant} (اختلاف نسبی ${relSma})`);
  console.log(
    `  ✔ A1 parity AL↔CJS: EMA21 ${emaGot.toFixed(3)}≈${emaWant.toFixed(3)} · SMA50 ${smaGot.toFixed(3)}≈${smaWant.toFixed(3)} (${axis.length} کندل محور · مبنا=${basisIsClosed ? "closed" : "closed+forming"})`,
  );

  // ۶) پنل AL: `?pane=macd`
  const paneRes = await fetch(`${BASE}/dashboard/historical/crypto?pane=macd`);
  assert.strictEqual(paneRes.status, 200, `صفحه با پنل: HTTP ${paneRes.status}`);
  const paneHtml = await paneRes.text();
  const points = (paneHtml.match(/data-points="([^"]+)"/) || [])[1] ?? "";
  ok(/data-hist-pane="macd"/.test(paneHtml), "پارامتر پنل در SSR منتشر نشد");
  ok(/macd/.test(points), `سری پنل MACD در data-points نیست: ${points}`);
  ok(/data-hist-volume="0"/.test(paneHtml), "با پنل اندیکاتور، پنل حجم باید کنار برود");
  console.log(`  ✔ A1 pane: ?pane=macd → ${points}`);

  // ۷) A2 — Signal Engine: سیگنال‌های AL در SSR
  const alSignals = (html.match(/data-al-signals="([^"]*)"/) || [])[1] ?? "";
  const sigFormula = (html.match(/data-al-signal-formulas="([^"]*)"/) || [])[1] ?? "";
  ok(
    /golden_cross:\d+|death_cross:\d+/.test(alSignals),
    `کراس از AL منتشر نشد: «${alSignals}»`,
  );
  ok(/volume_spike:\d+/.test(alSignals), `سیگنال جهش حجم تولید نشد: «${alSignals}»`);
  ok(
    /atr_breakout_(up|down):\d+/.test(alSignals),
    `سیگنال شکست ATR تولید نشد: «${alSignals}»`,
  );
  ok(/cross:1\.0\.0/.test(sigFormula), `فرمول‌نسخهٔ سیگنال منتشر نشد: «${sigFormula}»`);

  /** A3: ساختار بازار — فرمول‌نسخه + دست‌کم یک رویداد ساختاری روی دادهٔ واقعی */
  ok(/structure:1\.0\.0/.test(sigFormula), `فرمول‌نسخهٔ ساختار منتشر نشد: «${sigFormula}»`);
  ok(/fvg:1\.1\.0/.test(sigFormula), `فرمول‌نسخهٔ FVG باید ۱٫۱٫۰ باشد (سیاست پرنشده‌ها): «${sigFormula}»`);
  ok(
    /bos_(up|down):\d+|choch_(up|down):\d+/.test(alSignals),
    `هیچ شکست ساختاری (BOS/CHoCH) روی دادهٔ واقعی تولید نشد: «${alSignals}»`,
  );
  ok(/fvg_(bull|bear):\d+/.test(alSignals), `هیچ FVG تولید نشد: «${alSignals}»`);

  /** A3: provisional/confirmed — شمارش رویدادهای تأییدنشده در SSR */
  const provisional = (html.match(/data-al-provisional="(\d+)"/) || [])[1];
  ok(provisional !== undefined, "شمارندهٔ رویدادهای provisional منتشر نشد");
  ok(Number(provisional) >= 0, `مقدار provisional نامعتبر: «${provisional}»`);
  ok(/data-spec-version="3\.2"/.test(html), "قرارداد دامنه باید ۳.۲ باشد");

  /**
   * **C2/C3 — مبنا و کندل در حال تشکیل:**
   *  · با `forming` ⇒ مبنا باید `closed` باشد و میله‌های مبنا = candles − ۱
   *  · بدون `forming` ⇒ `closed+forming` و تساوی کامل (بدون تغییر رفتار)
   */
  const alBasis = (html.match(/data-al-basis="([^"]+)"/) || [])[1];
  const formingAttr = (html.match(/data-hist-forming="([^"]+)"/) || [])[1];
  const basisBarsUi = Number((html.match(/data-al-basis-bars="(\d+)"/) || [])[1] ?? -1);
  const renderedBars = Number((html.match(/data-hist-candles="(\d+)"/) || [])[1] ?? -2);
  ok(alBasis !== undefined, "data-al-basis منتشر نشد");
  ok(formingAttr !== undefined, "data-hist-forming منتشر نشد");
  ok(basisBarsUi > 0 && renderedBars > 0, `شمارنده‌های مبنا نامعتبر (${basisBarsUi}/${renderedBars})`);
  if (formingAttr && formingAttr !== "none") {
    ok(alBasis === "closed", `با کندل در حال تشکیل، مبنا باید closed باشد («${alBasis}»)`);
    ok(
      basisBarsUi === renderedBars - 1,
      `میله‌های مبنا باید candles−1 باشد (basis=${basisBarsUi} · candles=${renderedBars})`,
    );
  } else {
    ok(alBasis === "closed+forming", `بدون کندل در حال تشکیل مبنا باید closed+forming باشد («${alBasis}»)`);
    ok(
      basisBarsUi === renderedBars,
      `بدون کندل در حال تشکیل میله‌های مبنا = candles (basis=${basisBarsUi} · candles=${renderedBars})`,
    );
  }

  /** سیاست شلوغی چارت: فقط ساختارهای مهم رسم شوند */
  const markers = (html.match(/data-al-markers="([^"]*)"/) || [])[1] ?? "";
  ok(markers.length > 0, "زیرمجموعهٔ نمایش مارکرها منتشر نشد (data-al-markers)");
  ok(
    /=|^.*(bos_|choch_|fvg_|cross)/.test(markers),
    `مارکرهای رسم‌شده باید فقط ساختار/کراس باشند: «${markers}»`,
  );
  ok(
    !/(volume_spike|pattern_|divergence_|atr_breakout_):/.test(markers),
    `سیگنال‌های پرنویز نباید روی بوم رسم شوند: «${markers}»`,
  );
  ok(/volume_spike:\d+/.test(alSignals), "سیگنال‌های پرنویز باید همچنان محاسبه/منتشر شوند");

  /** کلیدهای i18n سیگنال‌های AL باید در fa/en موجود باشند (ضد drift) */
  for (const lang of ["fa", "en"]) {
    const msg = JSON.parse(read(`frontend/messages/macro.${lang}.json`));
    for (const k of [
      "al.signals.volume.hint",
      "al.signals.atr.hint",
      "al.signals.patterns.hint",
      "al.signals.divergence.hint",
    ]) {
      let cur = msg;
      for (const part of k.split(".")) cur = cur && typeof cur === "object" ? cur[part] : undefined;
      ok(typeof cur === "string", `${lang}: کلید i18n ناموجود «${k}»`);
    }
  }

  /** A2-2 (D11): آمار مشترک نباید دو بار تعریف شده باشد */
  const chartSignals = read("frontend/lib/chart/signals.ts");
  ok(
    /from "@\/lib\/analysis\/signals\/compute\/stats"/.test(chartSignals),
    "D11: کتابخانهٔ سیگنال ماکرو باید آمار را از AL بگیرد",
  );
  ok(
    !/^function stdev\(/m.test(chartSignals) && !/^function mean\(/m.test(chartSignals),
    "D11: mean/stdev نباید در کتابخانهٔ ماکرو دوباره تعریف شده باشند",
  );
  ok(
    exists("frontend/lib/analysis/signals/compute/stats.ts"),
    "فایل آمار مشترک AL موجود نیست",
  );
  console.log(`  ✔ A2 signals: ${alSignals} · formulas: ${sigFormula}`);

  console.log(`analysis-a1: ${checks} assertion(s) passed`);
})().catch((e) => {
  console.error(`analysis-a1 FAILED: ${e && e.message}`);
  process.exitCode = 1;
});


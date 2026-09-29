/**
 * AL — خودآزمون طلایی (بردارهای مرجع + ناوردها)
 * frontend/lib/analysis/indicators/selftest.ts
 * ============================================================
 * **چرا این‌جا و نه فقط در فایل تست؟** رانر تست پروژه pure CJS است و نمی‌تواند
 * ماژول TS را import کند (همان محدودیتی که در H1 هم داشتیم). پس بردارهای طلایی
 * **کنار خودِ ریاضی** زندگی می‌کنند و نتیجهٔ اجرایشان از طریق SSR منتشر می‌شود
 * (`data-al-selftest`) ⇒ تست CJS فقط «ok» بودن را می‌سنجد و ریاضی واقعی
 * در همان runtime تولید اجرا می‌شود.
 *
 * هر بردار **دستی** محاسبه و کامنت شده است؛ تغییر ریاضی بدون به‌روزکردن بردار
 * = شکست همین تابع.
 * ============================================================
 */
import { emaSeries } from "./compute/ema";
import { smaSeries } from "./compute/sma";
import { rsiSeries } from "./compute/rsi";
import { macdSeries } from "./compute/macd";
import { atrSeries } from "./compute/atr";
import { bbandsSeries } from "./compute/bbands";
import { vwapSeries } from "./compute/vwap";
import { validateParams, validateSignalParams } from "./params.schema";
import { analyzeStructure, structureInvariantErrors } from "../market-structure/engine";

const EPS = 1e-9;

/** مقایسهٔ یک سری با بردار انتظار (با تحمل اعشار). */
function seriesEq(got: (number | null)[], want: (number | null)[], tol = EPS): boolean {
  if (got.length !== want.length) return false;
  for (let i = 0; i < got.length; i++) {
    const g = got[i] ?? null;
    const w = want[i] ?? null;
    if (g === null || w === null) {
      if (g !== w) return false;
      continue;
    }
    if (Math.abs(g - w) > tol) return false;
  }
  return true;
}

export interface SelfTestResult {
  errors: string[];
  /** تعداد بررسی‌های موفق (برای گزارش) */
  checks: number;
}

/**
 * اجرای بردارهای طلایی و ناوردها.
 * @returns خطاها (خالی = سالم) + تعداد بررسی‌های موفق
 */
export function alSelfTest(): SelfTestResult {
  const errors: string[] = [];
  let checks = 0;
  const ok = (cond: boolean, msg: string) => {
    if (cond) checks++;
    else errors.push(msg);
  };

  // ۱) SMA(3) روی [1,2,3,4,5] ⇒ [null,null,2,3,4]
  ok(
    seriesEq(smaSeries([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]),
    "SMA: بردار مرجع نادرست است",
  );

  // ۲) EMA(3) با seed میانگین ساده (هم‌راستا با CJS): [1,2,3,4] ⇒ [null,null,2,3]
  //    seed = (1+2+3)/3 = 2 · سپس EMA = (4−2)·0.5 + 2 = 3
  ok(
    seriesEq(emaSeries([1, 2, 3, 4], 3), [null, null, 2, 3]),
    "EMA: بردار مرجع seed-SMA نادرست است",
  );

  // ۳) RSI(14) روی نمونهٔ کلاسیک وایلدر ⇒ ≈ ۷۰٫۴۶
  const rsiCloses = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
    46.28, 46.28,
  ];
  const rsi = rsiSeries(rsiCloses, 14);
  const rsiLast = rsi[rsi.length - 1] ?? null;
  ok(
    rsiLast !== null && Math.abs(rsiLast - 70.46) < 0.05,
    `RSI(14): مقدار آخر ${String(rsiLast)} (انتظار ≈۷۰٫۴۶)`,
  );

  // ۴) MACD — ناوردها: سری ثابت ⇒ line = histogram = 0 · و histogram = line − signal
  const flat = new Array(60).fill(100);
  const macdFlat = macdSeries(flat, 12, 26, 9);
  const flatLine = (macdFlat.line ?? []).slice(-1)[0] ?? null;
  const flatHist = (macdFlat.histogram ?? []).slice(-1)[0] ?? null;
  ok(flatLine !== null && Math.abs(flatLine) < 1e-9, "MACD: سری ثابت باید خط صفر بدهد");
  ok(flatHist !== null && Math.abs(flatHist) < 1e-9, "MACD: هیستوگرام سری ثابت باید صفر باشد");

  const rising = Array.from({ length: 80 }, (_, i) => 100 + i);
  const macdRise = macdSeries(rising, 12, 26, 9);
  const line = macdRise.line ?? [];
  const sig = macdRise.signal ?? [];
  const hist = macdRise.histogram ?? [];
  let histOk = true;
  for (let i = 0; i < line.length; i++) {
    const l = line[i] ?? null;
    const s = sig[i] ?? null;
    const h = hist[i] ?? null;
    if (l !== null && s !== null && h !== null && Math.abs(h - (l - s)) > 1e-9) {
      histOk = false;
      break;
    }
  }
  ok(histOk, "MACD: رابطهٔ histogram = line − signal نقض شد");
  ok((line[line.length - 1] ?? 0) > 0, "MACD: سری صعودی باید خط مثبت بدهد");

  // ۵) ATR(2) — TRهای دستی: c1⇒2 · c2⇒3 · c3⇒2 ⇒ ATR در انتها = (3+2)/2 = 2.5
  const atr = atrSeries(
    [
      { open: 9, high: 10, low: 8, close: 9 },
      { open: 9, high: 12, low: 9, close: 11 },
      { open: 11, high: 13, low: 11, close: 12 },
    ],
    2,
  );
  const atrLast = atr[atr.length - 1] ?? null;
  ok(
    atrLast !== null && Math.abs(atrLast - 2.5) < 1e-9,
    `ATR(2): مقدار آخر ${String(atrLast)} (انتظار ۲٫۵)`,
  );

  // ۶) Bollinger(20,2) روی [1..20]: middle=10.5 · σ(جامعه)=sqrt(33.25)≈5.7663
  const sigma = Math.sqrt(33.25);
  const bb = bbandsSeries(
    Array.from({ length: 20 }, (_, i) => i + 1),
    20,
    2,
  );
  const bbMid = (bb.middle ?? []).slice(-1)[0] ?? null;
  const bbUp = (bb.upper ?? []).slice(-1)[0] ?? null;
  const bbLow = (bb.lower ?? []).slice(-1)[0] ?? null;
  ok(bbMid !== null && Math.abs(bbMid - 10.5) < 1e-9, "BB: میانه باید ۱۰٫۵ باشد");
  ok(
    bbUp !== null && Math.abs(bbUp - (10.5 + 2 * sigma)) < 1e-6,
    `BB: باند بالا ${String(bbUp)} (انتظار ${10.5 + 2 * sigma})`,
  );
  ok(
    bbLow !== null && Math.abs(bbLow - (10.5 - 2 * sigma)) < 1e-6,
    `BB: باند پایین ${String(bbLow)} (انتظار ${10.5 - 2 * sigma})`,
  );

  // ۷) VWAP: دو کندل با قیمت معمول ۱۰ و ۲۰ و حجم ۱ و ۳ ⇒ (10·1 + 20·3)/4 = 17.5
  const vwap = vwapSeries([
    { open: 10, high: 10, low: 10, close: 10, volume: 1 },
    { open: 20, high: 20, low: 20, close: 20, volume: 3 },
  ]);
  const vwapLast = vwap[vwap.length - 1] ?? null;
  ok(
    vwapLast !== null && Math.abs(vwapLast - 17.5) < 1e-9,
    `VWAP: مقدار آخر ${String(vwapLast)} (انتظار ۱۷٫۵)`,
  );

  // ۸) ناورد «بدون مقدار جعلی»: طول خروجی = طول ورودی
  const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5);
  ok(smaSeries(closes, 10).length === closes.length, "SMA: طول خروجی با ورودی یکی نیست");
  ok(emaSeries(closes, 10).length === closes.length, "EMA: طول خروجی با ورودی یکی نیست");
  ok(rsiSeries(closes, 14).length === closes.length, "RSI: طول خروجی با ورودی یکی نیست");

  // ۹) اسکیمای پارامترها باید بدون خطا باشد (fail-fast در startup)
  const params = validateParams();
  ok(params.errors.length === 0, `params.json: ${params.errors.join(" · ")}`);

  // ۱۰) A2: پارامترهای سیگنال‌ها هم از اسکیما عبور کنند
  const signalParams = validateSignalParams();
  ok(signalParams.errors.length === 0, `params.json (signals): ${signalParams.errors.join(" · ")}`);

  // ۱۱) A3: ناوردهای ساختار بازار (پیوت‌محور + انضباط نگاه-به-آینده)
  const candles = Array.from({ length: 60 }, (_, i) => {
    const base = 100 + Math.sin(i / 3) * 5 + i * 0.2;
    return { open: base - 0.3, high: base + 1, low: base - 1, close: base + 0.3 };
  });
  const times = candles.map((_, i) => 1_700_000_000 + i * 3600);
  const struct = analyzeStructure({
    times,
    candles,
    params: { pivot: 2, minBars: 3, maxEvents: 50 },
  });
  ok(struct.swings.length > 0, "ساختار: هیچ سوینگی در سری آزمایشی پیدا نشد");
  const inv = structureInvariantErrors(struct, 2);
  ok(inv.length === 0, `ساختار: نقض ناورد — ${inv[0] ?? ""}`);
  ok(
    struct.breaks.every((b) => b.confirmedIndex === b.index),
    "ساختار: شکست باید در همان کندل close تأیید شود",
  );
  ok(
    struct.fvgs.every((z) => z.top > z.bottom),
    "ساختار: FVG با ناحیهٔ نامعتبر ساخته شده است",
  );

  return { errors, checks: checks + 1 };
}

/** خلاصهٔ یک‌خطی برای انتشار در SSR (`data-al-selftest`). */
export function alSelfTestSummary(): string {
  const { errors, checks } = alSelfTest();
  return errors.length === 0 ? `ok:${checks}` : `fail:${errors[0]}`;
}

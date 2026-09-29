/**
 * H1 — Historical indicators (pure) · EMA21 / SMA50 + Cross
 * frontend/lib/historical/indicators.ts
 * ============================================================
 * ⚠️ **D11 (مهاجرت به AL):** از این پس ریاضی EMA/SMA **تنها** در
 *    `frontend/lib/analysis/indicators/compute/*` زندگی می‌کند و این ماژول فقط
 *    یک **re-export** است تا importهای قدیمی (چارت تاریخی، تست‌ها) نشکنند.
 *    سیگنال‌های cross/spread/candleStats هم در فاز **A2** به AL منتقل می‌شوند.
 * ============================================================
 */
export { emaSeries as ema, emaLast } from "@/lib/analysis/indicators/compute/ema";
export { smaSeries as sma, smaLast } from "@/lib/analysis/indicators/compute/sma";
export { rsiSeries as rsi, rsiLast } from "@/lib/analysis/indicators/compute/rsi";
export { macdSeries as macd, macdLast } from "@/lib/analysis/indicators/compute/macd";
export { atrSeries as atr, atrLast } from "@/lib/analysis/indicators/compute/atr";
export { bbandsSeries as bbands, bbandsLast } from "@/lib/analysis/indicators/compute/bbands";
export { vwapSeries as vwap, vwapLast } from "@/lib/analysis/indicators/compute/vwap";

import { detectGaps, type GapStats, type RawCandle } from "./timeBoundary";
import { emaSeries } from "@/lib/analysis/indicators/compute/ema";
import { smaSeries } from "@/lib/analysis/indicators/compute/sma";

/** سری اندیکاتور با تهی‌های دورهٔ گرم‌شدن. */
export type IndicatorSeries = (number | null)[];

/**
 * ⚠️ **A2 (D11):** منطق کراس به AL منتقل شد
 * (`lib/analysis/signals/compute/cross.ts`) و این‌جا فقط re-export است تا
 * importهای قدیمی (چارت/تست) نشکنند.
 */
export { detectCross, lastCross, spreadPct } from "@/lib/analysis/signals/compute/cross";
export type { CrossDir } from "@/lib/analysis/signals/compute/cross";

import { detectCross, lastCross, spreadPct } from "@/lib/analysis/signals/compute/cross";

/** تنظیمات پیش‌فرض اندیکاتورهای تاریخی — ⚠️ منبع حقیقت اکنون `params.json` در AL است. */
export const HIST_INDICATORS = {
  emaFast: 21,
  smaSlow: 50,
  /** گرم‌شدن EMA (کاهش نویز ابتدای سری؛ مستند) */
  emaWarmup: 10,
  volumeWindow: 20,
} as const;

/** آماره‌های پایهٔ قیمت/حجم برای سطر سیگنال (بدون مقدار جعلی). */
export interface CandleStats {
  last: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  volumeAvg: number | null;
  volumeZ: number | null;
  gaps: GapStats;
}

/** محاسبهٔ آماره‌های پنجرهٔ آخر (پیش‌فرض ۲۰ کندل). */
export function candleStats(
  candles: RawCandle[],
  tfWidthMs: number,
  window = HIST_INDICATORS.volumeWindow,
): CandleStats {
  const gaps = detectGaps(candles, tfWidthMs);
  if (!candles.length) {
    return {
      last: null,
      changePct: null,
      high: null,
      low: null,
      volumeAvg: null,
      volumeZ: null,
      gaps,
    };
  }
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1]!;
  const prev = closes.length > 1 ? closes[closes.length - 2]! : null;
  const win = candles.slice(-window);
  const vols = win.map((c) => c.volume ?? 0);
  const vAvg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  const lastVol = candles[candles.length - 1]!.volume ?? null;
  let z: number | null = null;
  if (vAvg != null && lastVol != null && vols.length > 2) {
    const sd = Math.sqrt(vols.reduce((a, b) => a + (b - vAvg) ** 2, 0) / (vols.length - 1)) || 0;
    z = sd ? (lastVol - vAvg) / sd : null;
  }
  return {
    last,
    changePct: prev && prev !== 0 ? ((last - prev) / prev) * 100 : null,
    high: win.length ? Math.max(...win.map((c) => c.high)) : null,
    low: win.length ? Math.min(...win.map((c) => c.low)) : null,
    volumeAvg: vAvg,
    volumeZ: z,
    gaps,
  };
}

/**
 * **تست طلایی (C7)** — فقط EMA21/SMA50 طبق دستور (به‌همراه SMA/کراس/spread که
 * پایهٔ همان دو هستند). مقادیر با فرمول استاندارد و محاسبهٔ دستی بررسی می‌شوند.
 * @returns فهرست خطاها (خالی = سالم)
 */
export function indicatorsSelfTest(): string[] {
  const errs: string[] = [];
  // SMA(3) روی [1,2,3,4,5] ⇒ [null,null,2,3,4]
  const s = smaSeries([1, 2, 3, 4, 5], 3);
  if (s[0] !== null || s[1] !== null || s[2] !== 2 || s[3] !== 3 || s[4] !== 4) {
    errs.push(`sma=${JSON.stringify(s)}`);
  }
  /**
   * EMA(3) با `k = 0.5` و **seed = میانگین سادهٔ سه مقدار اول** — همان قاعدهٔ
   * مرجع CJS (`…/price-indicators.cjs#ema`). روی `[1,2,3,4]` ⇒ `[null,null,2,3]`
   * (`seed = 2` · سپس `(4−2)·0.5 + 2 = 3`).
   * ⚠️ این انتظار در D11 (مهاجرت ریاضی به AL) **عوض شد**؛ قبلاً seed = «اولین
   * مقدار» بود که با مرجع نمی‌خواند.
   */
  const e = emaSeries([1, 2, 3, 4], 3);
  const eWant: (number | null)[] = [null, null, 2, 3];
  eWant.forEach((w, i) => {
    const got = e[i] ?? null;
    const ok = w === null ? got === null : got !== null && Math.abs(got - w) <= 1e-9;
    if (!ok) errs.push(`ema[${i}]=${String(got)} (انتظار ${String(w)})`);
  });
  // cross: fast از پایین به بالا ⇒ golden در ایندکس 2
  const fast: IndicatorSeries = [1, 1, 3];
  const slow: IndicatorSeries = [2, 2, 2];
  const cx = detectCross(fast, slow);
  if (cx[2] !== "golden" || cx[0] !== null) errs.push(`cross=${JSON.stringify(cx)}`);
  if (lastCross(cx)?.dir !== "golden") errs.push("lastCross نادرست");
  // spreadPct: (3−2)/2×100 = 50
  if (Math.abs((spreadPct(fast, slow) ?? 0) - 50) > 1e-9) errs.push("spreadPct نادرست");
  // gap: دو کندل با فاصلهٔ ۴ برابر ⇒ ۳ کندل غایب
  const g = detectGaps(
    [
      { timestamp: 0, open: 1, high: 1, low: 1, close: 1 },
      { timestamp: 4 * 60_000, open: 1, high: 1, low: 1, close: 1 },
    ],
    60_000,
  );
  if (g.gaps !== 1 || g.maxGapBars !== 3) errs.push(`detectGaps=${JSON.stringify(g)}`);
  return errs;
}

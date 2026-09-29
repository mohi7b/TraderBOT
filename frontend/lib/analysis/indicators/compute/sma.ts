/**
 * AL · SMA — میانگین متحرک ساده (سری)
 * frontend/lib/analysis/indicators/compute/sma.ts
 * ============================================================
 * **فرمول (نسخه 1.0.0):** `SMA[i] = mean(x[i-period+1 … i])`
 *   · خروجی **هم‌طول ورودی** با `null` تا `i = period-1`
 *   · مقدار آخر، **عیناً** برابر اسکالر نسخهٔ CJS مرجع است
 *     (`collector/crypto/common/analysis/indicators/base/price/price-indicators.cjs#sma`) و
 *     تست برابری همین را قفل می‌کند.
 *   · ورودی غیرعددی ⇒ پنجره **باطل** می‌شود (نه صفر فرض‌کردن) و از نو شروع می‌شود.
 * ============================================================
 */
import type { IndicatorSeries } from "../types";

export function smaSeries(values: number[], period: number): IndicatorSeries {
  const out: IndicatorSeries = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period < 2) return out;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) {
      // ورودی نامعتبر ⇒ پنجرهٔ جاری باطل است (صداقت آماری، بدون مقدار جعلی)
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count += 1;
    while (count > period) {
      const drop = Number(values[i - count + 1]);
      sum -= Number.isFinite(drop) ? drop : 0;
      count -= 1;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

/** مقدار آخر SMA — برای تست برابری با تابع اسکالر CJS. */
export function smaLast(values: number[], period: number): number | null {
  const s = smaSeries(values, period);
  return s.length ? (s[s.length - 1] ?? null) : null;
}

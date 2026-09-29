/**
 * AL · EMA — میانگین متحرک نمایی (سری)
 * frontend/lib/analysis/indicators/compute/ema.ts
 * ============================================================
 * **فرمول (نسخه 1.0.0) — دقیقاً مطابق مرجع CJS:**
 *   · `k = 2 / (period + 1)`
 *   · **seed** = میانگین سادهٔ `period` مقدار اول (نه «اولین مقدار»!)
 *   · بازگشت: `EMA[i] = (x[i] − EMA[i−1]) · k + EMA[i-1]`
 *
 * ⚠️ این انتخاب seed **عمدی** است: نسخهٔ مرجع
 * (`collector/crypto/common/analysis/indicators/base/price/price-indicators.cjs#ema`) همین کار
 * را می‌کند و تست طلایی، برابری مقدار آخر را قفل می‌کند. اگر روزی seed عوض شود،
 * `formulaVersion` هم باید bump شود (D12).
 *
 * `warmup` اختیاری: چند نقطهٔ اول `null` بماند (برای خوانایی چارت؛ پیش‌فرض ۰ =
 * همان چیزی که مرجع می‌دهد).
 * ============================================================
 */
import type { IndicatorSeries } from "../types";

export function emaSeries(values: number[], period: number, warmup = 0): IndicatorSeries {
  const out: IndicatorSeries = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period < 2) return out;
  const k = 2 / (period + 1);
  let seedSum = 0;
  let seedCount = 0;
  let prev: number | null = null;

  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) {
      // ورودی نامعتبر ⇒ محاسبه از نو seed می‌شود (بدون مقدار جعلی)
      seedSum = 0;
      seedCount = 0;
      prev = null;
      continue;
    }
    if (prev === null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount < period) continue;
      prev = seedSum / period;
      out[i] = i < warmup ? null : prev;
      continue;
    }
    prev = (v - prev) * k + prev;
    out[i] = i < warmup ? null : prev;
  }
  return out;
}

/** مقدار آخر EMA — برای تست برابری با تابع اسکالر CJS. */
export function emaLast(values: number[], period: number): number | null {
  const s = emaSeries(values, period);
  return s.length ? (s[s.length - 1] ?? null) : null;
}

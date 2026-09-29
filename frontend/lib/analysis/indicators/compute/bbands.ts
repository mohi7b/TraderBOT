/**
 * AL · Bollinger Bands
 * frontend/lib/analysis/indicators/compute/bbands.ts
 * ============================================================
 * **فرمول (نسخه 1.0.0):**
 *   · `middle = SMA(closes, period)`
 *   · `σ` = انحراف معیار **جامعه** (تقسیم بر n) روی همان پنجره
 *   · `upper = middle + deviation·σ` · `lower = middle − deviation·σ`
 *
 * ⚠️ انتخاب «جامعه» (نه نمونه) عمدی و مستند است، چون پلتفرم‌های مرجع هم همین
 *    را می‌دهند؛ بردار طلایی در تست، همین تعریف را قفل می‌کند. تغییر تعریف =
 *    bump `formulaVersion` (D12).
 * ============================================================
 */
import type { IndicatorSeries, IndicatorSeriesMap } from "../types";
import { smaSeries } from "./sma";

export function bbandsSeries(
  closes: number[],
  period = 20,
  deviation = 2,
): IndicatorSeriesMap {
  const middle = smaSeries(closes, period);
  const upper: IndicatorSeries = new Array(closes.length).fill(null);
  const lower: IndicatorSeries = new Array(closes.length).fill(null);
  if (!Number.isInteger(period) || period < 5) return { middle, upper, lower };

  for (let i = period - 1; i < closes.length; i++) {
    const mid = middle[i];
    if (mid === null || mid === undefined) continue;
    let sq = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = Number(closes[j]);
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      sq += (v - mid) ** 2;
    }
    if (!ok) continue;
    const sigma = Math.sqrt(sq / period); // σ جامعه
    upper[i] = mid + deviation * sigma;
    lower[i] = mid - deviation * sigma;
  }
  return { middle, upper, lower };
}

/** مقادیر آخر باندها — برای تست طلایی. */
export function bbandsLast(
  closes: number[],
  period = 20,
  deviation = 2,
): { middle: number | null; upper: number | null; lower: number | null } {
  const s = bbandsSeries(closes, period, deviation);
  const last = (arr: IndicatorSeries) => (arr.length ? (arr[arr.length - 1] ?? null) : null);
  return { middle: last(s.middle!), upper: last(s.upper!), lower: last(s.lower!) };
}

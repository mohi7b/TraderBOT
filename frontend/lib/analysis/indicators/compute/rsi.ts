/**
 * AL · RSI — شاخص قدرت نسبی (Wilder)
 * frontend/lib/analysis/indicators/compute/rsi.ts
 * ============================================================
 * **فرمول (نسخه 1.0.0) — نسخهٔ استاندارد Wilder:**
 *   ۱) `change[i] = close[i] − close[i−1]` · `gain = max(Δ,0)` · `loss = max(−Δ,0)`
 *   ۲) **seed** در `i = period`: میانگین سادهٔ `period` مقدار اول gain/loss
 *   ۳) سپس هموارسازی Wilder: `avg = (avg·(period−1) + x) / period`
 *   ۴) `RSI = 100 − 100/(1 + avgGain/avgLoss)` · اگر `avgLoss = 0` ⇒ `RSI = 100`
 *
 * ⚠️ این تعریف «قراردادی» است (نسخهٔ مرجع CJS ندارد) ⇒ در `formulaVersion`
 *    ثبت و در تست طلایی با بردار مرجع قفل می‌شود. هر تغییر تعریف = bump نسخه.
 * ============================================================
 */
import type { IndicatorSeries } from "../types";

export function rsiSeries(closes: number[], period = 14): IndicatorSeries {
  const out: IndicatorSeries = new Array(closes.length).fill(null);
  if (!Number.isInteger(period) || period < 2 || closes.length <= period) return out;

  let seedGain = 0;
  let seedLoss = 0;
  let avgGain: number | null = null;
  let avgLoss: number | null = null;

  for (let i = 1; i < closes.length; i++) {
    const prev = Number(closes[i - 1]);
    const cur = Number(closes[i]);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) {
      seedGain = 0;
      seedLoss = 0;
      avgGain = null;
      avgLoss = null;
      continue;
    }
    const change = cur - prev;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (avgGain === null || avgLoss === null) {
      seedGain += gain;
      seedLoss += loss;
      if (i < period) continue;
      avgGain = seedGain / period;
      avgLoss = seedLoss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    out[i] =
      avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** مقدار آخر RSI — برای تست طلایی. */
export function rsiLast(closes: number[], period = 14): number | null {
  const s = rsiSeries(closes, period);
  return s.length ? (s[s.length - 1] ?? null) : null;
}

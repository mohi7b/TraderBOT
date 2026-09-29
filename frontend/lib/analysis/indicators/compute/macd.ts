/**
 * AL · MACD
 * frontend/lib/analysis/indicators/compute/macd.ts
 * ============================================================
 * **فرمول (نسخه 1.0.0):**
 *   · `line   = EMA(fast) − EMA(slow)`   (هر دو با seed میانگین ساده — مثل مرجع)
 *   · `signal = EMA(line, signalPeriod)` با **همان قاعدهٔ seed** (میانگین سادهٔ
 *     نخستین `signalPeriod` مقدار معتبر — چون سری خط `null` دارد)
 *   · `histogram = line − signal`
 *
 * ⚠️ قاعدهٔ seed برای سری دارای `null` صریح و مستند است تا «شروع از اولین مقدار»
 *    خاموش وارد نشود؛ بردار طلایی تست همین را قفل می‌کند.
 * ============================================================
 */
import type { IndicatorSeries, IndicatorSeriesMap } from "../types";
import { emaSeries } from "./ema";

export function macdSeries(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): IndicatorSeriesMap {
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const line: IndicatorSeries = closes.map((_, i) => {
    const f = emaFast[i] ?? null;
    const s = emaSlow[i] ?? null;
    return f === null || s === null ? null : f - s;
  });

  const signal: IndicatorSeries = new Array(closes.length).fill(null);
  const histogram: IndicatorSeries = new Array(closes.length).fill(null);
  if (!Number.isInteger(signalPeriod) || signalPeriod < 2) return { line, signal, histogram };

  const k = 2 / (signalPeriod + 1);
  let seedSum = 0;
  let seedCount = 0;
  let prev: number | null = null;

  for (let i = 0; i < line.length; i++) {
    const v = line[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (prev === null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount < signalPeriod) continue;
      prev = seedSum / signalPeriod;
    } else {
      prev = (v - prev) * k + prev;
    }
    signal[i] = prev;
    histogram[i] = v - prev;
  }
  return { line, signal, histogram };
}

/** مقادیر آخر MACD — برای تست طلایی. */
export function macdLast(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { line: number | null; signal: number | null; histogram: number | null } {
  const s = macdSeries(closes, fast, slow, signalPeriod);
  const last = (arr: IndicatorSeries) => (arr.length ? (arr[arr.length - 1] ?? null) : null);
  return { line: last(s.line!), signal: last(s.signal!), histogram: last(s.histogram!) };
}

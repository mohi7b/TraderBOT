/**
 * AL · ATR — میانگین دامنهٔ واقعی
 * frontend/lib/analysis/indicators/compute/atr.ts
 * ============================================================
 * **فرمول (نسخه 1.0.0) — دقیقاً مطابق مرجع CJS:**
 *   · `TR[i] = max(high−low, |high−close[i−1]|, |low−close[i−1]|)`
 *     و برای نخستین کندل (بدون close قبلی): `TR = high − low`
 *   · `ATR[i] = mean(TR[i−period+1 … i])`  ← **میانگین ساده** (نه Wilder)
 *
 * ⚠️ مرجع CJS (`…/price-indicators.cjs#atr`) هم میانگین ساده می‌گیرد؛ اگر روزی
 *    «ATR وایلدر» خواستیم، شناسهٔ جدا (`atr_wilder`) می‌سازیم — نه تغییر خاموش
 *    این تعریف (D12).
 * ============================================================
 */
import type { IndicatorSeries, OHLC } from "../types";
import { smaSeries } from "./sma";

/** دامنهٔ واقعی هر کندل (هم‌طول کندل‌ها). */
export function trueRangeSeries(candles: OHLC[]): IndicatorSeries {
  const out: IndicatorSeries = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const high = Number(c.high);
    const low = Number(c.low);
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    const prevClose = i > 0 ? Number(candles[i - 1]!.close) : Number.NaN;
    out[i] = Number.isFinite(prevClose)
      ? Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
      : high - low;
  }
  return out;
}

export function atrSeries(candles: OHLC[], period = 14, warmup = 0): IndicatorSeries {
  const tr = trueRangeSeries(candles);
  if (!candles.length) return tr;
  /** `null`ها را به‌عنوان «پنجرهٔ باطل» رد می‌کنیم؛ سری TR ما کامل است ✓ */
  const series = smaSeries(
    tr.map((v) => (v === null ? Number.NaN : v)),
    period,
  );
  return warmup > 0
    ? series.map((v, i) => (i < warmup ? null : v))
    : series;
}

/** مقدار آخر ATR — برای تست برابری با CJS. */
export function atrLast(candles: OHLC[], period = 14): number | null {
  const s = atrSeries(candles, period);
  return s.length ? (s[s.length - 1] ?? null) : null;
}

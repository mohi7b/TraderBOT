/**
 * AL · VWAP — میانگین موزون حجمی
 * frontend/lib/analysis/indicators/compute/vwap.ts
 * ============================================================
 * **فرمول (نسخه 1.0.0):**
 *   · `price[i] = (high + low + close) / 3`  (قیمت معمول)
 *   · `VWAP[i] = Σ(price·volume) / Σ(volume)` از **شروع سری** (تجمعی)
 *   · اگر حجم کندلی نامعتبر/صفر باشد ⇒ `null` (هیچ مقدار جعلی ساخته نمی‌شود)
 *
 * ⚠️ «ریست در شروع سشن» عمداً **پیاده نشده**: نیازمند منطق سشن بازار است و
 *    باید جداگانه تصویب شود (نسخهٔ بعدی با شناسهٔ `vwap_session`).
 * ============================================================
 */
import type { IndicatorSeries, OHLC } from "../types";

export function vwapSeries(candles: OHLC[]): IndicatorSeries {
  const out: IndicatorSeries = new Array(candles.length).fill(null);
  let pv = 0;
  let vol = 0;
  let started = false;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const price = (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
    const v = Number(c.volume);
    if (!Number.isFinite(price) || !Number.isFinite(v) || v <= 0) continue;
    pv += price * v;
    vol += v;
    started = true;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return started ? out : out;
}

/** مقدار آخر VWAP — برای تست طلایی. */
export function vwapLast(candles: OHLC[]): number | null {
  const s = vwapSeries(candles);
  return s.length ? (s[s.length - 1] ?? null) : null;
}

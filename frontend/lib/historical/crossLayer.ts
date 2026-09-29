/**
 * H2 — لایهٔ نشانگر کراس (Golden / Death) · **دادهٔ خالص**
 * frontend/lib/historical/crossLayer.ts
 * ============================================================
 * **چرا این‌جا و نه در کامپوننت؟**
 *   `CandleChart` یک Server Component است و موتور چارت یک Client Component؛
 *   پاس‌دادن **تابع** (نقاش لایه) از سرور به کلاینت ممنوع است (همان باگ ۵۰۰ و
 *   پنیک Turbopack این پروژه). پس دامنه فقط **دادهٔ سریالایزپذیر** می‌سازد
 *   و نقاشی در موتور انجام می‌شود (`paintCrossMarkers` در `lib/chart/layers.ts`).
 *
 * **شکل نشانگر:** مثلث رو به بالا زیر `low` کندل برای کراس طلایی · مثلث رو به
 *   پایین بالای `high` کندل برای کراس مرگ. رنگ‌ها از اسلات‌های تم
 *   (`goldenCross`/`deathCross`) ⇒ هیچ رنگ هاردکدی نیست.
 * ============================================================
 */
import type { CrossMarkerPoint, CrossMarkersLayer } from "@/lib/chart/types";
import type { CrossDir } from "./indicators";

/** کندل محور (کمینهٔ لازم برای جای‌گیری نشانگر). */
export interface AxisCandleLike {
  axisTime: number;
  low: number;
  high: number;
}

/**
 * رویدادهای کراس → نقاط نشانگر (زمان **ثانیه** + قیمت مرجع).
 * ترتیب و ایندکس‌ها با سری محور یکی است (خروجی `detectCross` هم‌طول کندل‌هاست).
 */
export function crossMarkerPoints(
  crosses: CrossDir[],
  candles: AxisCandleLike[],
): CrossMarkerPoint[] {
  const out: CrossMarkerPoint[] = [];
  const n = Math.min(crosses.length, candles.length);
  for (let i = 0; i < n; i++) {
    const dir = crosses[i];
    if (!dir) continue;
    const c = candles[i]!;
    if (!Number.isFinite(c.axisTime) || !Number.isFinite(c.low) || !Number.isFinite(c.high)) continue;
    out.push({
      t: Math.floor(c.axisTime / 1000),
      /** طلایی: زیر کف کندل · مرگ: بالای سقف کندل */
      price: dir === "golden" ? c.low : c.high,
      dir,
    });
  }
  return out;
}

/** لایهٔ آمادهٔ تزریق — فقط داده (بدون تابع) ⇒ ارسال‌پذیر از سرور به کلاینت. */
export function crossMarkersLayer(
  points: CrossMarkerPoint[],
  opts?: { size?: number; showLabels?: boolean },
): CrossMarkersLayer {
  return {
    id: "cross-markers",
    enabled: points.length > 0,
    points,
    size: opts?.size ?? 5,
    showLabels: opts?.showLabels ?? false,
  };
}

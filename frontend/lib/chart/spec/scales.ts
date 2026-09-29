/**
 * Chart Engine v3 — مقیاس‌های استاندارد
 * frontend/lib/chart/spec/scales.ts
 * ============================================================
 * **درسی که دو بار هزینه داد:** دو سری با واحد متفاوت روی یک محور (FCI ∈ ±۱
 * کنار بازدهی ۱۰ساله؛ نرخ سیاستی ۳۷٪ کنار تورم ۳٪) چارت را «صاف» و گمراه‌کننده
 * می‌کند. در v3 مقیاس‌ها **صریح** اعلام می‌شوند:
 *   · `right`   = محور راست **دیدنی** برای سری اصلی
 *   · `overlay` = مقیاس کمکی **مخفی** (`priceScaleId` غیر right/left) برای سری
 *     کمکی — خط دیده می‌شود ولی محورش شلوغی نمی‌سازد.
 * ولیدیتور (`validate.ts`) بیش از **یک** مقیاس دیدنی را خطا می‌داند.
 * ============================================================
 */
import type { ScaleSpec } from "./types";

/** مقیاس اصلی چارت (محور راست دیدنی، مارجین ۰٫۰۵/۰٫۱ — استاندارد شهریور). */
export const PRIMARY_SCALE: ScaleSpec = {
  id: "right",
  position: "right",
  mode: "normal",
  visible: true,
  scaleMargins: { top: 0.05, bottom: 0.1 },
};

/** مقیاس کمکی مخفی (برای سری دوم با واحد متفاوت). */
export const OVERLAY_SCALE: ScaleSpec = {
  id: "overlay",
  position: "overlay",
  mode: "normal",
  visible: false,
};

/** مجموعهٔ مقیاس‌های یک چارت: اصلی + (اختیاری) کمکی مخفی. */
export function scalesFor(opts: { overlay?: boolean; mode?: ScaleSpec["mode"] } = {}): ScaleSpec[] {
  const primary: ScaleSpec = { ...PRIMARY_SCALE, mode: opts.mode ?? "normal" };
  return opts.overlay ? [primary, OVERLAY_SCALE] : [primary];
}

/**
 * شناسهٔ مقیاس مقادیر درصدی (استفاده در `priceFormat` چارت‌ها).
 * ⚠️ `percent` در این پروژه به‌معنای «نمایش مقدار به‌صورت ٪» است، **نه**
 *    تبدیل خودکار عدد؛ تبدیل توسط دامنه انجام می‌شود (مثل YoY/SAAR).
 */
export const PERCENT_MODE = "percent" as const;

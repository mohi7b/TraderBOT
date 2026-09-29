/**
 * ============================================================
 * Chart Theme — لایهٔ سازگاری (Legacy Adapter)
 * frontend/lib/chart/theme.ts
 * ============================================================
 * ⚠️ منبع اصلی تایپ‌ها و تم‌ها الان این‌جاست:
 *      types.ts        (قراردادها: ChartTheme/ChartPalette/...)
 *      themePresets.ts (تم‌های آماده + mergeTheme + resolveSlot)
 *
 * این فایل فقط برای **سازگاری عقب‌رو** نگه داشته شده تا مصرف‌کننده‌های
 * قدیمی (BaseLwcChart · EventMarkers · EventOverlay) بدون تغییر کار کنند.
 * کد جدید باید مستقیم از `themePresets.ts` استفاده کند.
 * ============================================================
 */
import { getThemePreset, resolveSlot } from "./themePresets";
import type { ChartPalette, ChartTheme } from "./types";

export type {
  ChartPalette,
  ChartTheme,
  ChartThemeSpec,
} from "./types";

/**
 * نام تم (سازگاری با فراخوانی قدیمی).
 * union برای autocomplete است؛ تم‌های ثبت‌شدهٔ جدید
 * (`inflation_modern_dark`/`_light`) و `"auto"` هم پذیرفته می‌شوند.
 */
export type ChartThemeName = "light" | "dark" | "terminal" | "print" | (string & {});

/** تم آماده (light/dark/terminal/print) — سازگار با فراخوانی قدیمی. */
export function getChartTheme(name: ChartThemeName | string): ChartTheme {
  return getThemePreset(String(name));
}

/** رنگ سری بر اساس اندیس (برای چندسری). */
export function seriesColor(theme: ChartTheme, index: number): string {
  return resolveSlot(theme, undefined, index);
}

/** نگاشت اهمیت رویداد → رنگ (از اسلات‌های تم). */
export function eventColor(
  theme: ChartTheme,
  importance: "low" | "medium" | "high",
): string {
  return resolveSlot(
    theme,
    importance === "high" ? "eventHigh" : importance === "medium" ? "eventMedium" : "eventLow",
  );
}

/** پالت تم فعال (میان‌بر برای مصرف‌کننده‌های قدیمی). */
export function paletteOf(theme: ChartTheme): ChartPalette {
  return theme.palette;
}


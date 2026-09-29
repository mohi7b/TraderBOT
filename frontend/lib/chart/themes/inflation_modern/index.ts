/**
 * ============================================================
 * Theme: Inflation Modern — خانوادهٔ «تورم مدرن»
 * frontend/lib/chart/themes/inflation_modern/index.ts
 * ============================================================
 * قالب نویسندگی تم (نگاه: THEME_AUTHORING.md):
 *
 *   base      ← ارث‌بری از تم پایه (dark/light) — بقیهٔ رنگ‌ها نمی‌آید
 *   palette   ← ChartThemePaletteInput (رنگ‌های معنایی + series)
 *   layout    ← ChartLayoutSpec (Partial + میانبر scaleMargins)
 *   signals   ← ids + style (استایل بج‌ها این‌جاست، نه در موتور)
 *   meta      ← manifest (نسخه/نویسنده) + کلید i18n توضیح
 *
 * ⚠️ این پوشه فقط `../../types` را import می‌کند (بدون وابستگی به
 *    registry) تا دورِ import ایجاد نشود.
 * ============================================================
 */
import type { ChartThemeSpec } from "../../types";
import darkColors from "./colors.dark";
import lightColors from "./colors.light";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const INFLATION_MODERN_DARK: ChartThemeSpec = {
  name: "inflation_modern_dark",
  family: "inflation_modern",
  mode: "dark",
  base: "dark",
  palette: darkColors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

export const INFLATION_MODERN_LIGHT: ChartThemeSpec = {
  name: "inflation_modern_light",
  family: "inflation_modern",
  mode: "light",
  base: "light",
  palette: lightColors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "light" } },
};

/** هر دو حالت خانواده (برای انتخاب‌گرهای خانواده/حالت). */
export const INFLATION_MODERN_VARIANTS = {
  light: INFLATION_MODERN_LIGHT,
  dark: INFLATION_MODERN_DARK,
} as const;

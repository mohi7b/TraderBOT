/**
 * ============================================================
 * Theme: Default Chart — آرشیو ظاهر پیشین چارت تورم
 * frontend/lib/chart/themes/default_chart/index.ts
 * ============================================================
 * اسنپ‌شات ظاهری که چارت ماکرو **قبل از قالب «شهریور»** داشت:
 *   theme = تم تیره + `MACRO_THEME_OVERRIDE` (باند هدف نرم‌تر)
 *   layout = `MACRO_LAYOUT` (۵ ساله · مقیاس ۰٫۱۲ · بدون گرید عمودی)
 *   signals = `MACRO_SIGNALS` (۸ شناسه، حداکثر ۶ — استایل پیش‌فرض موتور)
 *
 * ⇒ با `themeName="default_chart"` می‌توان ظاهر قبلی را عیناً برگرداند،
 *   و `MACRO_LAYOUT`/`MACRO_SIGNALS`/`MACRO_THEME_OVERRIDE` در
 *   `lib/chart/presets/macro.ts` دست‌نخورده (برای مقایسه/چارت‌های دیگر) باقی است.
 * ============================================================
 */
import type { ChartThemeSpec } from "../../types";
import colors from "./colors";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const default_chart: ChartThemeSpec = {
  name: "default_chart",
  family: "default_chart",
  mode: "dark",
  base: "dark",
  palette: colors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

/**
 * ============================================================
 * Theme: Shahrivar Policy — قالب «شهریور» برای چارت سیاست پولی
 * frontend/lib/chart/themes/shahrivar_policy/index.ts
 * ============================================================
 * چارت «Policy Rate vs Headline CPI»:
 *   · پس‌زمینهٔ سفید + خطوط ظریف خاکستری (base = light)
 *   · خط نرخ بهره آبی ملایم · خط تورم قرمز ملایم
 *   · ناحیهٔ آیندهٔ یک‌ساله (Forecast Zone) با رنگ کم‌رنگ‌تر
 *   · **همان** چینش/فاصله‌گذاری/استایل بج‌های قالب تورم «شهریور»
 *
 * سوئیچ ظاهر: `themeName="shahrivar_policy"` · نسخهٔ تیره = `themeName="shahrivar"`
 * ⚠️ این پوشه فقط `../../types` را import می‌کند (بدون وابستگی به registry).
 * ============================================================
 */
import type { ChartThemeSpec } from "../../types";
import colors from "./colors";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const shahrivar_policy: ChartThemeSpec = {
  name: "shahrivar_policy",
  family: "shahrivar_policy",
  mode: "dark",
  base: "dark",
  palette: colors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

/**
 * ============================================================
 * Theme: Shahrivar Growth — قالب رسمی «شهریور — رشد اقتصادی»
 * frontend/lib/chart/themes/shahrivar_growth/index.ts
 * ============================================================
 * قالب چارت «رشد اقتصادی» (GDP Growth):
 *   · خط اصلی رشد سالانه (سبز فسفری) + رشد فصلی SAAR (آبی) — **بدون نقطهٔ داده**
 *   · زوم ۳ سال و نیم (۴۲ ماه) + یک سال فضای خالی سمت راست (۴ میلهٔ فصلی)
 *   · پنل ۷ سیگنال: GAS + GMI/OGI/GSI/PMI/NOW/GAPg
 *   · چینش/مارجین/ترنسپرنسی **یکسان** با دو چارت قبلی
 *
 * استفاده: `<BaseChart themeName="shahrivar_growth" … />`
 * ⚠️ این پوشه فقط `../../types` را import می‌کند (بدون وابستگی به registry).
 * ============================================================
 */
import type { ChartThemeSpec } from "../../types";
import colors from "./colors";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const shahrivar_growth: ChartThemeSpec = {
  name: "shahrivar_growth",
  family: "shahrivar_growth",
  mode: "dark",
  base: "dark",
  palette: colors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

/**
 * ============================================================
 * Theme: Shahrivar Financial — قالب «شهریور — شرایط مالی»
 * frontend/lib/chart/themes/shahrivar_financial/index.ts
 * ============================================================
 * قالب چارت «شرایط مالی» (Financial Conditions / FAS):
 *   · خط اصلی FCI (**آبی درخشان**) + سری دوم (**آبی استاندارد**) — بدون نقطه
 *   · زوم ۳٫۵ سال + ۱۲ میله (یک سال) فضای خالی سمت راست
 *   · پنل ۷ سیگنال: FAS + Y10/Credit/DXY/Equity/Liquidity/Vol
 *   · چینش/مارجین/ترنسپرنسی **یکسان** با سه چارت قبلی
 *
 * استفاده: `<BaseChart themeName="shahrivar_financial" … />`
 * ⚠️ این پوشه فقط `../../types` را import می‌کند (بدون وابستگی به registry).
 * ============================================================
 */
import type { ChartThemeSpec } from "../../types";
import colors from "./colors";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const shahrivar_financial: ChartThemeSpec = {
  name: "shahrivar_financial",
  family: "shahrivar_financial",
  mode: "dark",
  base: "dark",
  palette: colors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

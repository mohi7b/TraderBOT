/**
 * ============================================================
 * Theme: Shahrivar — قالب رسمی «شهریور» (تورم)
 * frontend/lib/chart/themes/shahrivar/index.ts
 * ============================================================
 * قالب مستقل و قابل‌سوئیچ چارت تورم:
 *   · نوار سبز ترنسپرنت محدودهٔ هدف (`palette.slots.targetBand`)
 *   · پنل ۶ سیگنال دسته‌بندی‌شده (trend/momentum/deviation/
 *     volatility/pressure/stability) با بج‌های شفاف و هم‌اندازه
 *   · چینش ۵ساله با حاشیهٔ مقیاس جمع‌تر (scaleMargins 0.05/0.1)
 *
 * استفاده: `<BaseChart themeName="shahrivar" … />`
 * ⚠️ این پوشه فقط `../../types` را import می‌کند (بدون وابستگی به registry).
 * ============================================================
 */
import type { ChartThemeSpec } from "../../types";
import colors from "./colors";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const shahrivar: ChartThemeSpec = {
  name: "shahrivar",
  family: "shahrivar",
  mode: "dark",
  base: "dark",
  palette: colors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

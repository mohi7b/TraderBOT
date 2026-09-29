/**
 * ============================================================
 * Theme: Shahrivar Hist — قالب رسمی «شهریور — چارت تاریخی (کندلی)»
 * frontend/lib/chart/themes/shahrivar_hist/index.ts
 * ============================================================
 * قالب چارت **تاریخی/کندلی** (دامنهٔ Historical · H1: BTCUSDT):
 *   · کندل OHLC + ویک، بدون نقطهٔ دادهٔ اضافی
 *   · overlayهای EMA21 (سبز فسفری) و SMA50 (آبی) + نشانگر Golden/Death Cross
 *   · **پنل حجم** زیر کندل اصلی (فقط حجم — B3)
 *   · ۸ بج سیگنال در یک خط: ۱ اصلی + ۶ فرعی + ۱ **هشدار عریض**
 *   · زوم `3Y6M` — **یکسان** با چهار چارت ماکرو (ظاهر هم‌خانواده)
 *
 * ⚠️ مرز زمانی (NY close) در لایهٔ TAMC اعمال می‌شود، نه این‌جا (D6).
 * ⚠️ این پوشه فقط `../../types` را import می‌کند (بدون وابستگی به registry).
 * ============================================================
 */
import type { ChartThemeSpec } from "../../types";
import colors from "./colors";
import layout from "./layout";
import signals from "./signals";
import manifest from "./manifest.json";

export const shahrivar_hist: ChartThemeSpec = {
  name: "shahrivar_hist",
  family: "shahrivar_hist",
  mode: "dark",
  base: "dark",
  palette: colors,
  layout,
  signals,
  meta: { manifest: { ...manifest, mode: "dark" } },
};

/**
 * shahrivar_base — تم پایهٔ مشترک خانوادهٔ شهریور (بازبینی هفدهم)
 * frontend/lib/chart/themes/shahrivar_base/index.ts
 * ============================================================
 * تنها منبعِ مرجع «همهٔ تنظیمات پایهٔ چارت»:
 *   · پالت کامل (background/surface/text/grid/axis/border/crosshair/tooltip/pos/neg/warn/neutral)
 *   · اسلات‌ها: کندل (بدنه/سایه) · حجم (صعودی/نزولی) · اورلی EMA/SMA · سیگنال‌ها
 *   · چیدمان پایه (zoom/futureMargin/scaleMargins/grid/panes.volume/timeScale/series)
 *   · سیگنال‌ها (ids/max/style) · typography (fontSize از base dark) · ui پیش‌فرض کشو
 *
 * تم‌های خانوادگی این‌ها را از صفر نمی‌سازند — فقط تفاوت‌ها را override می‌کنند
 * (`screenThemeOf(cls, shahrivar_base)`).
 * محل چارت و ارتفاع در تم نیستند (معماری دروازهٔ چارت).
 */
import type { ChartThemeSpec } from "../../types";
import histColors from "../shahrivar_hist/colors";
import histLayout from "../shahrivar_hist/layout";
import histSignals from "../shahrivar_hist/signals";

export const shahrivar_base: ChartThemeSpec = {
  name: "shahrivar_base",
  family: "shahrivar",
  mode: "dark",
  base: "dark",
  fontSize: 11,
  palette: histColors,
  layout: { ...histLayout },
  signals: { ...histSignals, style: { ...histSignals.style } },
  /** ui پیش‌فرض (معیار دسکتاپ) — هر نسخهٔ اسکرینی آن را override می‌کند. */
  ui: {
    drawerWidth: "max(15rem,min(22rem,34%))",
    railWidth: 36,
    touchTarget: 28,
    itemColumns: 2,
    legendFontSize: 10,
    uiFontSize: 12,
    motion: "normal",
  },
  meta: {
    manifest: {
      name: "shahrivar_base",
      family: "shahrivar",
      mode: "dark",
      version: "2.0.0-alpha",
      author: "TraderBOT · ChartEngine V2",
      created: "2026-09-25",
      description_key: "themeNames.shahrivar_base.description",
    },
  },
};

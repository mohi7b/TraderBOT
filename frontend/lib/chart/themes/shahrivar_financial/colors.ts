/**
 * رنگ‌های قالب «شهریور — شرایط مالی» (Financial Conditions)
 * frontend/lib/chart/themes/shahrivar_financial/colors.ts
 * ============================================================
 * ⚠️ ظاهر/چیدمان **دقیقاً مثل سه چارت قبلی** (ترنسپرنت روی بدنهٔ کارت).
 * **رنگ‌ها (قاعدهٔ «سری اصلی یکتا»):**
 *   · FCI (سری **اصلی**) = **آبی درخشان** `#38bdf8`
 *   · Vol/دومین سری (کمکی) = **آبی استاندارد** `#3b82f6` (همرنگ چارت‌های قبلی)
 *   · روند (خط کمکی) = خاکستری **نقطه‌چین**
 * ============================================================
 */
export default {
  background: "rgba(17,24,38,0)",
  surface: "rgba(17,24,38,0.85)",
  text: "#e5e5e5",
  textMuted: "#94a3b8",
  grid: "#2a2a2a",
  axis: "#cfcfcf",
  border: "#333333",
  crosshair: "#888888",

  tooltipBg: "rgba(17,24,38,0.95)",
  tooltipBorder: "#253046",
  tooltipText: "#ffffff",

  slots: {
    /** سری اصلی: شاخص شرایط مالی (آبی درخشان) */
    fci: "#38bdf8",
    /** سری دوم: نوسان/بازدهی (آبی استاندارد چارت‌های قبلی) */
    fin2: "#3b82f6",
    /** خط کمکی (روند) — خاکستری نقطه‌چین */
    trend: "rgba(148,163,184,0.75)",
    /** نردبان وضعیت (۴ سطح) — همان اسلات‌های شهریور */
    signalPos: "#22c55e",
    signalWarn: "#fde047",
    signalRisk: "#ea580c",
    signalNeg: "#f43f5e",
    valueUp: "#22c55e",
    valueDown: "#ff3b30",
    valueFlat: "#e2e8f0",
    badgeBg: "rgba(255,255,255,0.08)",
    badgeBorder: "rgba(255,255,255,0.15)",
  },
} satisfies import("../../types").ChartThemePaletteInput;

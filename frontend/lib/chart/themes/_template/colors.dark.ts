/**
 * رنگ‌های حالت تیره — فقط چیزهایی که با `base` فرق دارد.
 * ⚠️ هیچ متن کاربری‌ای این‌جا نیست (فقط رنگ).
 */
export default {
  // اگر کلیدهای پایه را ندهید، از تم base ارث می‌برند.
  headline: "#3b82f6",
  core: "#facc15",
  annualized3m: "rgba(100,255,100,0.4)",
  targetBand: "rgba(74,222,128,0.14)",
  series: ["#3b82f6", "#facc15", "#4ade80", "#f472b6"],
  badgeBg: "rgba(255,255,255,0.08)",
  badgeBorder: "rgba(255,255,255,0.15)",
} satisfies import("../../types").ChartThemePaletteInput;

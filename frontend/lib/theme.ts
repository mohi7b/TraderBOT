/** تم سراسری — کلید ذخیره‌سازی و نوع‌ها. */

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "traderbot-theme";

export const DEFAULT_THEME: ThemeMode = "dark";

/** رنگ‌های معنایی برای چارت‌ها (Visx/LWC). */
export const CHART_COLORS = {
  up: "#34d399",
  down: "#f87171",
  flat: "#94a3b8",
  series: ["#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f472b6"],
} as const;

export function chartColor(direction: "up" | "down" | "flat"): string {
  if (direction === "up") return CHART_COLORS.up;
  if (direction === "down") return CHART_COLORS.down;
  return CHART_COLORS.flat;
}

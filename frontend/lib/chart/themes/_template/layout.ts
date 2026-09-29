/**
 * چینش تم — Partial است و روی DEFAULT_LAYOUT می‌نشیند.
 * `scaleMargins` میانبر → priceScale.top/bottom (۰..۰٫۵)
 */
export default {
  zoom: "2Y",
  signals: "bottom-right",
  legend: "none",
  scaleMargins: { top: 0.05, bottom: 0.1 },
} satisfies import("../../types").ChartLayoutSpec;

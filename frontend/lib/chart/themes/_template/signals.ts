/**
 * سیگنال‌های تم — شناسه‌ها باید در SIGNAL_LIBRARY باشند:
 *   trend · momentum · deviation · volatility · pressure · divergence · reversal · stability
 */
export default {
  ids: ["trend", "momentum", "stability"],
  max: 3,
  style: {
    transparent: true,
    uniform: true,
    fontSize: 10,
    background: "slot:badgeBg",
    border: "slot:badgeBorder",
  },
} satisfies import("../../types").ChartSignalsSpec;

/**
 * چینش قالب «پیش‌فرض» — آرشیو `MACRO_LAYOUT` (ظاهر قبل از شهریور).
 * زوم ۵ ساله · لجند در ChartFrame (none) · سیگنال پایین-راست ·
 * گرید افقی · حاشیهٔ مقیاس ۰٫۱۲ · محور زمان بدون ساعت.
 */
export default {
  zoom: "5Y",
  legend: "none",
  signals: "bottom-right",
  tooltip: "crosshair",
  grid: { vert: false, horz: true },
  scaleMargins: { top: 0.12, bottom: 0.12 },
  timeScale: {
    visible: true,
    timeVisible: false,
    secondsVisible: false,
    rightOffset: 3,
    barSpacing: 6,
    minBarSpacing: 2,
  },
  crosshair: { mode: "normal", dashed: true },
  watermark: { visible: false },
} satisfies import("../../types").ChartLayoutSpec;

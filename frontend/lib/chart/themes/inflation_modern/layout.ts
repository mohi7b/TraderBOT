/**
 * چینش تم تورم مدرن — فقط چیزی که با تم فرق دارد.
 * ⚠️ `scaleMargins` میانبری است که به `priceScale.top/bottom` نگاشت می‌شود
 *    (خروجی: scaleMargins در LWC). قاعدهٔ تقدم:
 *    DEFAULT_LAYOUT → layout تم → layout دامنه (props) همیشه برنده است.
 */
export default {
  zoom: "2Y",
  signals: "bottom-right",
  legend: "none",
  scaleMargins: { top: 0.05, bottom: 0.1 },
  grid: { vert: false, horz: true },
  crosshair: { mode: "normal", dashed: true },
  watermark: { visible: false },
} satisfies import("../../types").ChartLayoutSpec;

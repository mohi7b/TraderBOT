/**
 * چینش قالب «شهریور — سیاست پولی» — **همان چینش قالب تورم شهریور**
 * (درخواست: ظاهر/فاصله‌گذاری/محل آیتم‌ها یکسان باشد)
 */
export default {
  // بازهٔ نمایش: ۳ سال و نیم گذشته (۴۲ ماه) — مطابق چارت تورم
  zoom: "3Y6M",
  // پنل سیگنال‌ها: پایین چارت، از **چپ** (PAS اولین بج)
  signals: "bottom-left",
  legend: "none",
  scaleMargins: { top: 0.05, bottom: 0.1 },
  grid: { vert: false, horz: true },
  /** ناحیهٔ آیندهٔ سمت راست = ۱۲ دوره (یک سال) برای Forecast Zone */
  futureMargin: 12,
} satisfies import("../../types").ChartLayoutSpec;

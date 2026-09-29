/**
 * چینش قالب «شهریور» (Partial روی DEFAULT_LAYOUT).
 * `scaleMargins` میانبر → priceScale.top/bottom (۰..۰٫۵)
 */
export default {
  // بازهٔ نمایش: **۳ سال و نیم** (پریست رسمی `3Y6M` = ۴۲ ماه)
  zoom: "3Y6M",
  // چینش از **چپ** شروع می‌شود و به راست می‌رود تا از چارت بیرون نزند
  // (تعداد سیگنال‌ها زیاد است و راست‌چین بیرون می‌زد)
  signals: "bottom-left",
  legend: "none",
  scaleMargins: { top: 0.05, bottom: 0.1 },
  grid: { vert: false, horz: true },
  /**
   * فضای خالی سمت راست نمودار = **یک سال آینده** (۱۲ دورهٔ ماهانه).
   * برای منابع فصلی، چارت خودش آن را به ۴ فصل (≈یک سال) تنظیم می‌کند.
   */
  futureMargin: 12,
} satisfies import("../../types").ChartLayoutSpec;

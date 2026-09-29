/**
 * سیگنال‌های قالب «پیش‌فرض» — آرشیو `MACRO_SIGNALS`
 * (۸ شناسه از کتابخانه، حداکثر ۶ نمایش، بدون استایل سفارشی ⇒
 *  ظاهر پیش‌فرض موتور: پنل سطح + بج‌های رنگ‌دار بر اساس tone).
 */
export default {
  ids: [
    "trend",
    "momentum",
    "deviation",
    "volatility",
    "pressure",
    "divergence",
    "reversal",
    "stability",
  ],
  max: 6,
} satisfies import("../../types").ChartSignalsSpec;

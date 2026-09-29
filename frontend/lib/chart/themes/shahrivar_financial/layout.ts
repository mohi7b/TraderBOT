/**
 * چینش قالب «شهریور — شرایط مالی» — **همان چینش سه چارت قبلی**
 *   · زوم ۳٫۵ سال (`3Y6M` = ۴۲ ماه؛ زوم **زمان‌محور** است)
 *   · `futureMargin: 12` میلهٔ **ماهانه** = یک سال فضای خالی سمت راست
 *   · مارجین مقیاس ۰٫۰۵/۰٫۱ · پنل سیگنال پایین-چپ · لجند داخل چارت
 */
export default {
  zoom: "3Y6M",
  signals: "bottom-left",
  legend: "none",
  scaleMargins: { top: 0.05, bottom: 0.1 },
  grid: { vert: false, horz: true },
  /** سری‌های این چارت **ماهانه/روزانه**اند ⇒ ۱۲ میله ≈ یک سال (مثل چارت تورمی) */
  futureMargin: 12,
} satisfies import("../../types").ChartLayoutSpec;

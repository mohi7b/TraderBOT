/**
 * سیگنال‌های تم تورم مدرن.
 * ⚠️ شناسه‌ها باید در SIGNAL_LIBRARY موجود باشند (اعتبارسنج: themeSpec.ts).
 *    استایل بج‌ها این‌جاست — در موتور هاردکد نیست.
 */
export default {
  ids: ["trend", "pressure", "divergence", "stability"],
  max: 4,
  style: {
    transparent: true,
    uniform: true,
    fontSize: 10,
    background: "slot:badgeBg",
    border: "slot:badgeBorder",
  },
} satisfies import("../../types").ChartSignalsSpec;

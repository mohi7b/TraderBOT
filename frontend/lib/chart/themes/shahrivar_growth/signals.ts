/**
 * سیگنال‌های قالب «شهریور — رشد اقتصادی».
 * `GAS` و شش سیگنال رشد (GMI/OGI/GSI/PMI/NOW/GAPg) **داده‌محور** در دامنه
 * ساخته می‌شوند (`lib/macro/growth.ts`) و به‌صورت `signals.custom` تزریق
 * می‌شوند؛ پس این‌جا فقط **استایل** تعریف می‌شود (ids خالی = بدون سیگنال کتابخانه).
 *
 * ⚠️ همهٔ سیگنال‌ها در **یک خط** (بدون شکست خط) و ترتیب از چپ:
 *    `Gas` → `GMI` → `OGI` → `GSI` → `PMI` → `NOW` → `GAPg`
 */
export default {
  ids: [],
  /** ۷ = GAS + شش سیگنال فرعی رشد (همه در یک خط) */
  max: 7,
  style: {
    transparent: true,
    uniform: true,
    fontSize: 10,
    background: "slot:badgeBg",
    /** حالهٔ رنگ GFT روی بج GAS (مثل ISS/PAS) */
    statusTint: 0.35,
    /** صفحهٔ زیرین متن مقدار (متن «جلوتر» و رنگش مطلق) */
    valuePlate: 0.75,
  },
} satisfies import("../../types").ChartSignalsSpec;

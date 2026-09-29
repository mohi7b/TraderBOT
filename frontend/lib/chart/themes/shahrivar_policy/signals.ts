/**
 * سیگنال‌های قالب «شهریور — سیاست پولی».
 * PAS و سیگنال‌های فرعی (Real/Yld/Rmi/Im/Gap/Prf) **داده‌محور** در دامنه
 * ساخته می‌شوند (`lib/macro/policy.ts` + `lib/macro/macroSignals.ts`) و
 * به‌صورت `signals.custom` تزریق می‌شوند؛ پس این‌جا فقط **استایل** تعریف
 * می‌شود (ids خالی = بدون سیگنال کتابخانه).
 *
 * ⚠️ همهٔ سیگنال‌ها در **یک خط** می‌نشینند (بدون شکست خط) و ترتیب از چپ:
 *    `Pas` → `Real` → `Yld` → `Rmi` → `Im` → `Gap` → `Prf`
 *    (اولین بج `Pas` است — مطابق چارت تورمی که ISS اولین بج آن است.)
 */
export default {
  ids: [],
  /** ۷ = Pas + Real + Yld + Rmi + Im + Gap + Prf (همه در یک خط) */
  max: 7,
  style: {
    transparent: true,
    uniform: true,
    fontSize: 10,
    background: "slot:badgeBg",
    /** حالهٔ رنگ EFT روی بج PAS (مثل ISS) */
    statusTint: 0.35,
    /** صفحهٔ زیرین متن مقدار (متن «جلوتر» و رنگش مطلق) */
    valuePlate: 0.75,
  },
} satisfies import("../../types").ChartSignalsSpec;

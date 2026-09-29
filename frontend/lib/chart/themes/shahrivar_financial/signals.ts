/**
 * سیگنال‌های قالب «شهریور — شرایط مالی».
 * `FAS` و شش سیگنال مالی (Y10/Credit/DXY/Equity/Liquidity/Vol) **داده‌محور**
 * در دامنه ساخته می‌شوند (`lib/macro/financial.ts`) و با `signals.custom`
 * تزریق می‌شوند؛ این‌جا فقط **استایل** (ids خالی = بدون سیگنال کتابخانه).
 *
 * ⚠️ همه در **یک خط** (بدون شکست) و ترتیب از چپ:
 *    `Fas` → `Y10` → `Credit` → `DXY` → `Equity` → `Liquidity` → `Vol`
 */
export default {
  ids: [],
  /** ۷ = FAS + شش سیگنال فرعی (همه در یک خط) */
  max: 7,
  style: {
    transparent: true,
    uniform: true,
    fontSize: 10,
    background: "slot:badgeBg",
    /** حالهٔ رنگ FCI روی بج FAS (مثل ISS/PAS/GAS) */
    statusTint: 0.35,
    /** صفحهٔ زیرین متن مقدار (متن «جلوتر» و رنگش مطلق) */
    valuePlate: 0.75,
  },
} satisfies import("../../types").ChartSignalsSpec;

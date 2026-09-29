/**
 * AL · قرارداد ساختار بازار (فاز A3 · D9)
 * frontend/lib/analysis/market-structure/types.ts
 * ============================================================
 * دامنهٔ نسخهٔ اول (تصویب D9): **Swing · BOS · CHoCH · FVG**
 * (Order Blocks و Liquidity Zones عمداً به فاز بعد موکول شده‌اند تا تعریف
 * ریاضی غیرسلیقه‌ای‌شان تصویب شود.)
 *
 * ⚠️ **انضباط نگاه-به-آینده:** هر آیتم ساختاری `confirmedIndex` دارد؛ پیوت‌محورها
 *    فقط پس از `pivot` کندل آینده قطعی می‌شوند. نشانگر روی بوم می‌تواند روی خود
 *    پیوت رسم شود، ولی **تصمیم** (AI/بک‌تست) نباید پیش از `confirmedIndex` بگیرد.
 * ============================================================
 */

/** سوینگ (پیوت فرکتال). */
export interface SwingPoint {
  /** ایندکس کندل پیوت */
  index: number;
  /** ایندکسی که پیوت قطعی می‌شود (`index + pivot`) */
  confirmedIndex: number;
  /** زمان محور (ثانیه) */
  t: number;
  price: number;
  kind: "high" | "low";
}

/** شکست سطح ساختاری. */
export interface StructureBreak {
  /** `bos_*` = ادامهٔ روند · `choch_*` = تغییر کاراکتر */
  kind: "bos_up" | "bos_down" | "choch_up" | "choch_down";
  /** کندلی که سطح را شکست */
  index: number;
  /** شکست با `close` تأیید می‌شود ⇒ تأیید در همان کندل */
  confirmedIndex: number;
  t: number;
  /** سطح شکسته‌شده (قیمت سوینگ) */
  level: number;
  /** سوینگی که سطح از آن آمده */
  swingIndex: number;
  /** مقدار close کندل شکست */
  close: number;
}

/** روند ساختاری جاری. */
export type StructureTrend = "up" | "down" | "none";

/** شکاف نقدینگی/ارزش (سه‌کندلی). */
export interface FvgZone {
  kind: "fvg_bull" | "fvg_bear";
  /** کندل سوم (تأییدکننده) */
  index: number;
  confirmedIndex: number;
  t: number;
  top: number;
  bottom: number;
  /** اگر بعداً قیمت داخل منطقه آمده باشد: ایندکس پر شدن */
  filledIndex?: number;
}

/** خروجی کامل موتور ساختار. */
export interface StructureResult {
  swings: SwingPoint[];
  breaks: StructureBreak[];
  fvgs: FvgZone[];
  trend: StructureTrend;
}

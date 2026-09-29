/**
 * AL · CHoCH — تغییر کاراکتر (A3)
 * frontend/lib/analysis/market-structure/choch.ts
 * ============================================================
 * طبقه‌بندی BOS/CHoCH یک **ماشین حالت مشترک** است (شکست هم‌جهت = ادامه · شکست
 * خلاف روند = تغییر کاراکتر) و در `bos.ts` پیاده شده است تا وضعیت روند دو بار
 * محاسبه نشود. این فایل فقط برای چیدمان درخواستی، همان تابع را re-export می‌کند
 * و **فیلتر CHoCH** را در اختیار مصرف‌کننده می‌گذارد.
 * ============================================================
 */
export { classifyBreaks, detectBreaks } from "./bos";
export type { RawBreak, BreakInput } from "./bos";

import type { StructureBreak } from "./types";

/** فقط تغییرهای کاراکتر (CHoCH) از میان شکست‌های طبقه‌بندی‌شده. */
export function onlyChoch(breaks: StructureBreak[]): StructureBreak[] {
  return breaks.filter((b) => b.kind === "choch_up" || b.kind === "choch_down");
}

/** فقط شکست‌های ادامه‌دهندهٔ روند (BOS). */
export function onlyBos(breaks: StructureBreak[]): StructureBreak[] {
  return breaks.filter((b) => b.kind === "bos_up" || b.kind === "bos_down");
}

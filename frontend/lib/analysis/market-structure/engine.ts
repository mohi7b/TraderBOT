/**
 * AL · موتور ساختار بازار (A3 · D9)
 * frontend/lib/analysis/market-structure/engine.ts
 * ============================================================
 * خط لولهٔ ساختار در یک جا (و تنها یک‌بار محاسبه):
 *   ۱) `findSwings` (فرکتال) → ۲) `mergeClusteredSwings` (حذف نویز)
 *   ۳) `detectBreaks` (شکست سطح با سوینگ **تأییدشده**) → ۴) `classifyBreaks` (BOS/CHoCH + روند)
 *   ۵) `findFvgs` (شکست‌های سه‌کندلی)
 *
 * ⚠️ همهٔ خروجی‌ها `confirmedIndex` دارند؛ مصرف‌کننده (چارت/AI/بک‌تست) نباید
 *    پیش از آن اتکا کند. `trend` آخرین روند ساختاری است.
 * ============================================================
 */
import { classifyBreaks, detectBreaks } from "./bos";
import { findFvgs } from "./fvg";
import { findSwings, mergeClusteredSwings } from "./swing";
import type { StructureResult } from "./types";

export interface StructureInput {
  times: number[];
  candles: { open: number; high: number; low: number; close: number }[];
  params: Record<string, number>;
}

/** تحلیل کامل ساختار (بدون UI · خالص). */
export function analyzeStructure(input: StructureInput): StructureResult {
  const pivot = Math.max(1, Math.round(input.params.pivot ?? 2));
  const minBars = Math.max(1, Math.round(input.params.minBars ?? 3));
  const maxEvents = Math.max(1, Math.round(input.params.maxEvents ?? 50));

  const swings = mergeClusteredSwings(
    findSwings({ times: input.times, candles: input.candles }, pivot),
    minBars,
  );
  const { breaks, trend } = classifyBreaks(
    detectBreaks({ times: input.times, candles: input.candles, swings }),
  );
  const fvgs = findFvgs({ times: input.times, candles: input.candles }, maxEvents);

  return { swings, breaks, fvgs, trend };
}

/**
 * ناوردهای ساختار (برای خودآزمون/CI):
 *   · هیچ شکستی نباید به سوینگی ارجاع دهد که در همان لحظه تأیید نشده است
 *   · `confirmedIndex` هر پیوت = `index + pivot`
 *   · FVG فقط با ناحیهٔ مثبت
 * @returns فهرست خطاها (خالی = سالم)
 */
export function structureInvariantErrors(result: StructureResult, pivot: number): string[] {
  const errs: string[] = [];
  const p = Math.max(1, Math.round(pivot));
  for (const s of result.swings) {
    if (s.confirmedIndex !== s.index + p) {
      errs.push(`پیوت ایندکس ${s.index}: confirmedIndex=${s.confirmedIndex} (انتظار ${s.index + p})`);
    }
  }
  const byIndex = new Map(result.swings.map((s) => [s.index, s]));
  for (const b of result.breaks) {
    const sw = byIndex.get(b.swingIndex);
    if (!sw) continue;
    if (sw.confirmedIndex > b.index) {
      errs.push(`شکست ایندکس ${b.index} به سوینگ تأییدنشدهٔ ${b.swingIndex} ارجاع دارد (نگاه به آینده)`);
    }
  }
  for (const z of result.fvgs) {
    if (!(z.top > z.bottom)) errs.push(`FVG نامعتبر در ایندکس ${z.index}`);
    if (z.filledIndex !== undefined && z.filledIndex <= z.index) {
      errs.push(`FVG ایندکس ${z.index}: filledIndex نامعتبر`);
    }
  }
  return errs;
}

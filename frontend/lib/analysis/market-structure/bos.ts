/**
 * AL · BOS / CHoCH — شکست ساختاری و تغییر کاراکتر (A3 · D9)
 * frontend/lib/analysis/market-structure/bos.ts
 * ============================================================
 * **تعریف میخکوب‌شده (نسخه 1.0.0):**
 *   ۱) **شکست خام:** کندلی که `close` آن از **آخرین سوینگ تأییدشدهٔ** همان سو
 *      رد شود (`close > lastHigh` یا `close < lastLow`). هر سوینگ **حداکثر
 *      یک‌بار** شکسته می‌شود (شکست‌های تکراری روی همان سطح ثبت نمی‌شوند).
 *      ⚠️ فقط سوینگ‌هایی که `confirmedIndex ≤ index` دارند استفاده می‌شوند
 *      ⇒ هیچ نگاه-به-آینده‌ای در تشخیص شکست وجود ندارد.
 *   ۲) **طبقه‌بندی (ماشین حالت):**
 *      · شکست هم‌جهت با روند جاری ⇒ `bos_*` (ادامه)
 *      · شکست خلاف روند جاری ⇒ `choch_*` (تغییر کاراکتر)
 *      · اولین شکست (روند `none`) ⇒ `bos_*` (قرارداد مستند)
 *      سپس روند با آخرین شکست به‌روز می‌شود.
 *   · تأیید در همان کندل شکست است (`confirmedIndex = index`) چون `close` ملاک است.
 *
 * ⚠️ طبقه‌بندی در همین فایل است چون به **ماشین حالت مشترک** نیاز دارد؛
 *    `choch.ts` فقط برای چیدمان درخواستی، `classifyBreaks` را re-export می‌کند.
 * ============================================================
 */
import { lastConfirmedSwing } from "./swing";
import type { StructureBreak, StructureTrend, SwingPoint } from "./types";

export interface BreakInput {
  times: number[];
  candles: { open: number; high: number; low: number; close: number }[];
  swings: SwingPoint[];
}

/** شکست خام (پیش از طبقه‌بندی). */
export interface RawBreak {
  side: "up" | "down";
  index: number;
  t: number;
  level: number;
  swingIndex: number;
  close: number;
}

/** تشخیص شکست‌های خام سطح ساختاری. */
export function detectBreaks(input: BreakInput): RawBreak[] {
  const { candles, times, swings } = input;
  const out: RawBreak[] = [];
  const brokenHigh = new Set<number>();
  const brokenLow = new Set<number>();

  for (let i = 1; i < candles.length; i++) {
    const close = Number(candles[i]!.close);
    const t = times[i];
    if (!Number.isFinite(close) || t === undefined) continue;

    const hi = lastConfirmedSwing(swings, "high", i);
    if (hi && !brokenHigh.has(hi.index) && close > hi.price) {
      brokenHigh.add(hi.index);
      out.push({ side: "up", index: i, t, level: hi.price, swingIndex: hi.index, close });
      continue;
    }
    const lo = lastConfirmedSwing(swings, "low", i);
    if (lo && !brokenLow.has(lo.index) && close < lo.price) {
      brokenLow.add(lo.index);
      out.push({ side: "down", index: i, t, level: lo.price, swingIndex: lo.index, close });
    }
  }
  return out;
}

/**
 * طبقه‌بندی شکست‌ها به BOS/CHoCH + روند نهایی.
 * @returns breaks طبقه‌بندی‌شده (به ترتیب زمان) و `trend` آخرین روند
 */
export function classifyBreaks(raw: RawBreak[]): {
  breaks: StructureBreak[];
  trend: StructureTrend;
} {
  let trend: StructureTrend = "none";
  const breaks: StructureBreak[] = [];
  for (const b of raw) {
    const isUp = b.side === "up";
    const kind: StructureBreak["kind"] =
      trend === "none"
        ? isUp
          ? "bos_up"
          : "bos_down"
        : isUp
          ? trend === "down"
            ? "choch_up"
            : "bos_up"
          : trend === "up"
            ? "choch_down"
            : "bos_down";
    breaks.push({
      kind,
      index: b.index,
      /** ملاک شکست، `close` است ⇒ تأیید در همان کندل */
      confirmedIndex: b.index,
      t: b.t,
      level: b.level,
      swingIndex: b.swingIndex,
      close: b.close,
    });
    trend = isUp ? "up" : "down";
  }
  return { breaks, trend };
}

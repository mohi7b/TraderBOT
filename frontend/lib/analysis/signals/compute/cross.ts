/**
 * AL · سیگنال کراس (Golden / Death) + کمک‌توابع سازگاری
 * frontend/lib/analysis/signals/compute/cross.ts
 * ============================================================
 * **منبع حقیقت کراس از A2 اینجاست** (`historical/indicators.ts` فقط re-export می‌کند).
 * تعریف قفل‌شده (نسخه 1.0.0) — عیناً همان منطق H1 تا بج `CX` تغییر نکند:
 *   · فقط جایی بررسی می‌شود که **هر دو سری معتبر** باشند
 *   · `golden` ⇔ `f0 ≤ s0` و `f1 > s1` · `death` ⇔ `f0 ≥ s0` و `f1 < s1`
 * ============================================================
 */
import type { SignalEvent, SignalInput } from "../types";

export type CrossDir = "golden" | "death" | null;

/** تشخیص کراس در سری (هم‌طول ورودی · سازگار با API دورهٔ H1). */
export function detectCross(
  fast: (number | null)[],
  slow: (number | null)[],
): CrossDir[] {
  const out: CrossDir[] = new Array(fast.length).fill(null);
  for (let i = 1; i < fast.length; i++) {
    const f0 = fast[i - 1];
    const s0 = slow[i - 1];
    const f1 = fast[i];
    const s1 = slow[i];
    if (f0 == null || s0 == null || f1 == null || s1 == null) continue;
    if (f0 <= s0 && f1 > s1) out[i] = "golden";
    else if (f0 >= s0 && f1 < s1) out[i] = "death";
  }
  return out;
}

/** آخرین کراس معتبر + فاصله تا انتهای سری (به تعداد کندل). */
export function lastCross(
  crosses: CrossDir[],
): { dir: Exclude<CrossDir, null>; barsAgo: number } | null {
  for (let i = crosses.length - 1; i >= 0; i--) {
    const c = crosses[i];
    if (c) return { dir: c, barsAgo: crosses.length - 1 - i };
  }
  return null;
}

/** فاصلهٔ درصدی دو سری در آخرین نقطه (مثلاً EMA21 نسبت به SMA50). */
export function spreadPct(
  fast: (number | null)[],
  slow: (number | null)[],
): number | null {
  const f = fast[fast.length - 1];
  const s = slow[slow.length - 1];
  if (f == null || s == null || s === 0) return null;
  return ((f - s) / s) * 100;
}

/**
 * رویدادهای کراس برای موتور سیگنال (AL-native).
 * @param fastKey/slowKey کلید سری‌ها در `input.series` (مثل `ema21` و `sma50`)
 */
export function crossEvents(input: SignalInput, fastKey: string, slowKey: string): SignalEvent[] {
  const fast = input.series?.[fastKey];
  const slow = input.series?.[slowKey];
  if (!fast || !slow) return [];
  const dirs = detectCross(fast, slow);
  const out: SignalEvent[] = [];
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    if (!dir) continue;
    const t = input.times[i];
    if (t === undefined) continue;
    out.push({
      kind: dir === "golden" ? "golden_cross" : "death_cross",
      index: i,
      t,
      tone: dir === "golden" ? "pos" : "neg",
      label: dir === "golden" ? "GC" : "DC",
      meta: { fast: fastKey, slow: slowKey },
    });
  }
  return out;
}

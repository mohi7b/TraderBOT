/**
 * AL · Swing — پیوت فرکتال متقارن (A3 · D9)
 * frontend/lib/analysis/market-structure/swing.ts
 * ============================================================
 * **تعریف میخکوب‌شده (نسخه 1.0.0):**
 *   `high[i]` پیوت سقف است اگر برای هر `k = 1..pivot`:
 *   `high[i] > high[i−k]` **و** `high[i] > high[i+k]` (اکید؛ تساوی پیوت نمی‌سازد)
 *   کف: قرینه.
 *   · فقط نقاطی بررسی می‌شوند که `pivot` کندل چپ و راست دارند
 *   · `confirmedIndex = index + pivot` ⇒ پیش از آن، پیوت **موقت** است
 *   · پیوت‌های هم‌جنس **متوالی** با فاصلهٔ کمتر از `minBars` ادغام می‌شوند
 *     (همیشه سقف‌تر/کف‌تر برنده است) تا ساختار پرنویز نشود.
 * ============================================================
 */
import type { SwingPoint } from "./types";

export interface SwingInput {
  times: number[];
  candles: { high: number; low: number; close: number; open: number }[];
}

/** پیوت‌های خام (های/لو) با فرکتال متقارن. */
export function findSwings(input: SwingInput, pivot = 2): SwingPoint[] {
  const { candles, times } = input;
  const out: SwingPoint[] = [];
  const p = Math.max(1, Math.round(pivot));

  for (let i = p; i < candles.length - p; i++) {
    const c = candles[i]!;
    const high = Number(c.high);
    const low = Number(c.low);
    let isHigh = Number.isFinite(high);
    let isLow = Number.isFinite(low);
    for (let k = 1; k <= p && (isHigh || isLow); k++) {
      const left = candles[i - k]!;
      const right = candles[i + k]!;
      const lh = Number(left.high);
      const rh = Number(right.high);
      const ll = Number(left.low);
      const rl = Number(right.low);
      if (![lh, rh, ll, rl].every(Number.isFinite)) {
        isHigh = false;
        isLow = false;
        break;
      }
      if (isHigh) isHigh = high > lh && high > rh;
      if (isLow) isLow = low < ll && low < rl;
    }
    const t = times[i];
    if (t === undefined) continue;
    if (isHigh) {
      out.push({ index: i, confirmedIndex: i + p, t, price: high, kind: "high" });
    }
    if (isLow) {
      out.push({ index: i, confirmedIndex: i + p, t, price: low, kind: "low" });
    }
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

/**
 * ادغام پیوت‌های هم‌جنسِ نزدیک (فاصلهٔ ایندکس < `minBars`):
 * برای سقف‌ها بالاترین و برای کف‌ها پایین‌ترین نگه داشته می‌شود.
 */
export function mergeClusteredSwings(swings: SwingPoint[], minBars = 3): SwingPoint[] {
  const keep: SwingPoint[] = [];
  for (const s of swings) {
    const last = keep[keep.length - 1];
    if (last && last.kind === s.kind && s.index - last.index < Math.max(1, minBars)) {
      const better =
        s.kind === "high" ? s.price > last.price : s.price < last.price;
      if (better) keep[keep.length - 1] = s;
      continue;
    }
    keep.push(s);
  }
  return keep;
}

/** آخرین سوینگ هم‌جنس که **در همان لحظه تأیید شده** باشد (`confirmedIndex ≤ index`). */
export function lastConfirmedSwing(
  swings: SwingPoint[],
  kind: "high" | "low",
  index: number,
): SwingPoint | null {
  for (let i = swings.length - 1; i >= 0; i--) {
    const s = swings[i]!;
    if (s.kind !== kind) continue;
    if (s.confirmedIndex <= index) return s;
  }
  return null;
}

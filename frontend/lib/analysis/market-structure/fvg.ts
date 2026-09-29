/**
 * AL · FVG — شکاف ارزش منصفانه (A3 · D9)
 * frontend/lib/analysis/market-structure/fvg.ts
 * ============================================================
 * **تعریف میخکوب‌شده (نسخه 1.0.0) — سه‌کندلی:**
 *   · **صعودی:** `low[i] > high[i−2]` ⇒ ناحیهٔ `[high[i−2] , low[i]]`
 *   · **نزولی:** `high[i] < low[i−2]` ⇒ ناحیهٔ `[high[i] , low[i−2]]`
 *   · تأیید در همان کندل سوم: `confirmedIndex = i`
 *   · **پر شدن**: اولین کندل بعدی که با `low ≤ top` و `high ≥ bottom` وارد ناحیه
 *     شود ⇒ `filledIndex` ثبت می‌شود (ناحیه باطل نمی‌شود؛ فقط علامت می‌خورد)
 *   · ناحیه‌های صفر/منفی ساخته نمی‌شوند (بدون مقدار جعلی)
 * ============================================================
 */
import type { FvgZone } from "./types";

export interface FvgInput {
  times: number[];
  candles: { open: number; high: number; low: number; close: number }[];
}

export function findFvgs(input: FvgInput, maxEvents?: number): FvgZone[] {
  const { candles, times } = input;
  const out: FvgZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2]!;
    const c2 = candles[i]!;
    const t = times[i];
    if (t === undefined) continue;
    const hi0 = Number(c0.high);
    const lo2 = Number(c2.low);
    const lo0 = Number(c0.low);
    const hi2 = Number(c2.high);
    if (![hi0, lo2, lo0, hi2].every(Number.isFinite)) continue;

    let zone: FvgZone | null = null;
    if (lo2 > hi0) {
      zone = { kind: "fvg_bull", index: i, confirmedIndex: i, t, top: lo2, bottom: hi0 };
    } else if (hi2 < lo0) {
      zone = { kind: "fvg_bear", index: i, confirmedIndex: i, t, top: lo0, bottom: hi2 };
    }
    if (!zone || !(zone.top > zone.bottom)) continue;

    /** پر شدن با کندل‌های بعدی */
    for (let j = i + 1; j < candles.length; j++) {
      const hi = Number(candles[j]!.high);
      const lo = Number(candles[j]!.low);
      if (!Number.isFinite(hi) || !Number.isFinite(lo)) continue;
      if (lo <= zone.top && hi >= zone.bottom) {
        zone = { ...zone, filledIndex: j };
        break;
      }
    }
    out.push(zone);
  }
  return typeof maxEvents === "number" && maxEvents > 0 ? out.slice(-maxEvents) : out;
}

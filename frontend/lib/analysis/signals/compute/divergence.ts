/**
 * AL · سیگنال دایورجنس (A2-2)
 * frontend/lib/analysis/signals/compute/divergence.ts
 * ============================================================
 * **تعریف میخکوب‌شده (نسخه 1.0.0):**
 *   ۱) **پیوت** با فرکتال متقارن: `high[i]` پیوت سقف است اگر از `pivot` کندل
 *      چپ و `pivot` کندل راست بزرگ‌تر باشد (و برای کف، قرینه)
 *   ۲) دو پیوت متوالی هم‌نوع با فاصلهٔ `≤ lookback` کندل مقایسه می‌شوند
 *   ۳) **دایورجنس نزولی:** سقف قیمت بالاتر · سقف اسیلاتور پایین‌تر
 *      **دایورجنس صعودی:** کف قیمت پایین‌تر · کف اسیلاتور بالاتر
 *
 * ⚠️ **انضباط نگاه-به-آینده (مهم):** پیوت فقط پس از `pivot` کندل آینده قطعی
 *    می‌شود ⇒ رویداد روی `index` پیوت ثبت می‌شود ولی `confirmedIndex = index + pivot`
 *    است. مصرف‌کننده (چارت/بک‌تست/AI) **نباید** پیش از `confirmedIndex` به آن
 *    اتکا کند. مارکر روی چارت تنها برای خوانایی، روی خود پیوت رسم می‌شود.
 *
 * اسیلاتور از سری‌های ورودی انتخاب می‌شود (قرارداد نام‌گذاری): اولین کلید
 * `rsi*` — اگر نباشد، هیچ رویدادی ساخته نمی‌شود (بدون حدس).
 * ============================================================
 */
import type { SignalEvent, SignalInput } from "../types";

interface Pivot {
  index: number;
  value: number;
}

/** پیوت‌های سقف/کف با فرکتال متقارن (فقط نقاطی که آیندهٔ کافی دارند). */
function findPivots(values: number[], pivot: number, kind: "high" | "low"): Pivot[] {
  const out: Pivot[] = [];
  for (let i = pivot; i < values.length - pivot; i++) {
    const v = values[i];
    if (v === undefined || !Number.isFinite(v)) continue;
    let isPivot = true;
    for (let k = 1; k <= pivot && isPivot; k++) {
      const left = values[i - k];
      const right = values[i + k];
      if (
        left === undefined ||
        right === undefined ||
        !Number.isFinite(left) ||
        !Number.isFinite(right)
      ) {
        isPivot = false;
        break;
      }
      if (kind === "high") isPivot = v > left && v > right;
      else isPivot = v < left && v < right;
    }
    if (isPivot) out.push({ index: i, value: v });
  }
  return out;
}

export function divergenceEvents(input: SignalInput): SignalEvent[] {
  const candles = input.candles ?? [];
  const oscKey = Object.keys(input.series ?? {}).find((k) => /^rsi/.test(k));
  const osc = oscKey ? input.series?.[oscKey] : undefined;
  if (!candles.length || !osc) return [];

  const pivot = Math.max(1, Math.round(input.params.pivot ?? 2));
  const lookback = Math.max(2, Math.round(input.params.lookback ?? 30));
  const maxEvents = Math.max(1, Math.round(input.params.maxEvents ?? 50));
  const highs = candles.map((c) => Number(c.high));
  const lows = candles.map((c) => Number(c.low));
  const out: SignalEvent[] = [];

  const scan = (kind: "high" | "low") => {
    const pivots = findPivots(kind === "high" ? highs : lows, pivot, kind);
    for (let p = 1; p < pivots.length; p++) {
      const a = pivots[p - 1]!;
      const b = pivots[p]!;
      if (b.index - a.index > lookback) continue;
      const oa = osc[a.index];
      const ob = osc[b.index];
      if (oa === null || ob === null || oa === undefined || ob === undefined) continue;
      const t = input.times[b.index];
      if (t === undefined) continue;
      const bearish = kind === "high" && b.value > a.value && ob < oa;
      const bullish = kind === "low" && b.value < a.value && ob > oa;
      if (!bearish && !bullish) continue;
      out.push({
        kind: bearish ? "divergence_bearish" : "divergence_bullish",
        index: b.index,
        /** تأیید فقط بعد از `pivot` کندل آینده */
        confirmedIndex: b.index + pivot,
        t,
        tone: bearish ? "warn" : "info",
        label: bearish ? "DV↓" : "DV↑",
        value: Math.round((ob - oa) * 100) / 100,
        meta: {
          osc: oscKey!,
          priceA: a.value,
          priceB: b.value,
          oscA: oa,
          oscB: ob,
          bars: b.index - a.index,
        },
      });
    }
  };

  scan("high");
  scan("low");
  out.sort((x, y) => x.index - y.index);
  return out.slice(-maxEvents);
}

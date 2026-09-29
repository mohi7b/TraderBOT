/**
 * AL · سیگنال الگوهای کندلی (A2-2)
 * frontend/lib/analysis/signals/compute/patterns.ts
 * ============================================================
 * **تعاریف میخکوب‌شده (نسخه 1.0.0)** — همه بر پایهٔ کندل و نسبت‌های پارامتری:
 *   `range = high − low` · `body = |close − open|`
 *   `upper = high − max(open,close)` · `lower = min(open,close) − low`
 *
 *   · **Doji**: `body ≤ dojiRatio·range`
 *   · **Hammer**: `lower ≥ shadowRatio·body` و `upper ≤ body` و `body > 0`
 *   · **Shooting Star**: قرینهٔ Hammer
 *   · **Bullish Engulfing**: کندل قبل نزولی، کندل جاری صعودی،
 *     `open ≤ prevClose` و `close ≥ prevOpen` و `body > prevBody`
 *   · **Bearish Engulfing**: قرینه
 *
 * ⚠️ رویداد روی **همان کندل** ثبت می‌شود (`index = i`) و **بلافاصله تأییدشده**
 *    است (`confirmedIndex = i`) چون هیچ کندل آینده‌ای لازم ندارد.
 * ⚠️ این‌ها «هشدار الگو»اند، نه سیگنال ورود/خروج؛ تُن فقط معنای صعودی/نزولی است.
 * ============================================================
 */
import type { SignalEvent, SignalInput } from "../types";

interface CandleShape {
  range: number;
  body: number;
  upper: number;
  lower: number;
  bull: boolean;
  bear: boolean;
}

function shape(candle: { open: number; high: number; low: number; close: number }): CandleShape | null {
  const { open, high, low, close } = candle;
  if (![open, high, low, close].every(Number.isFinite)) return null;
  const range = high - low;
  const body = Math.abs(close - open);
  return {
    range,
    body,
    upper: high - Math.max(open, close),
    lower: Math.min(open, close) - low,
    bull: close > open,
    bear: close < open,
  };
}

export function patternEvents(input: SignalInput): SignalEvent[] {
  const candles = input.candles ?? [];
  const dojiRatio = input.params.dojiRatio ?? 0.1;
  const shadowRatio = input.params.shadowRatio ?? 2;
  const maxEvents = Math.max(1, Math.round(input.params.maxEvents ?? 50));
  const out: SignalEvent[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = shape(candles[i]!);
    if (!c || c.range <= 0) continue;
    const t = input.times[i];
    if (t === undefined) continue;
    const push = (
      kind: string,
      tone: SignalEvent["tone"],
      label: string,
      value?: number,
    ) =>
      out.push({
        kind,
        index: i,
        confirmedIndex: i, // الگوی کندلی: تأیید در همان کندل
        t,
        tone,
        label,
        ...(value !== undefined ? { value } : {}),
      });

    if (c.body <= dojiRatio * c.range) push("pattern_doji", "neutral", "DOJI", c.body / c.range);

    if (c.body > 0 && c.lower >= shadowRatio * c.body && c.upper <= c.body) {
      push("pattern_hammer", "pos", "HAM", c.lower / c.body);
    }
    if (c.body > 0 && c.upper >= shadowRatio * c.body && c.lower <= c.body) {
      push("pattern_shooting_star", "neg", "SS", c.upper / c.body);
    }

    const prev = i > 0 ? shape(candles[i - 1]!) : null;
    if (prev && prev.range > 0) {
      const engulfBull =
        prev.bear && c.bull && c.body > prev.body &&
        Number(candles[i]!.open) <= Number(candles[i - 1]!.close) &&
        Number(candles[i]!.close) >= Number(candles[i - 1]!.open);
      const engulfBear =
        prev.bull && c.bear && c.body > prev.body &&
        Number(candles[i]!.open) >= Number(candles[i - 1]!.close) &&
        Number(candles[i]!.close) <= Number(candles[i - 1]!.open);
      if (engulfBull) push("pattern_bullish_engulfing", "pos", "BE", c.body / prev.body);
      if (engulfBear) push("pattern_bearish_engulfing", "neg", "SE", c.body / prev.body);
    }
  }
  return out.slice(-maxEvents);
}

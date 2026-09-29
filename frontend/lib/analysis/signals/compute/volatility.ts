/**
 * AL · سیگنال شکست ATR (ATR Breakout)
 * frontend/lib/analysis/signals/compute/volatility.ts
 * ============================================================
 * **تعریف (نسخه 1.0.0):** با ATR کندل قبل به‌عنوان واحد نوسان:
 *   · صعودی: `high[i] > close[i−1] + k·ATR[i−1]`
 *   · نزولی: `low[i]  < close[i−1] − k·ATR[i−1]`
 * فقط جایی بررسی می‌شود که ATR معتبر باشد؛ `k` پیش‌فرض ۱٫۵ (قابل تنظیم در
 * `params.json` زیر بخش سیگنال‌ها). تُن: صعودی `pos` · نزولی `neg`.
 * ⚠️ این «شکست» بر پایهٔ نوسان است، نه الگوی ساختاری (BOS در A3 می‌آید).
 * ============================================================
 */
import type { SignalEvent, SignalInput } from "../types";

export function atrBreakoutEvents(input: SignalInput): SignalEvent[] {
  const candles = input.candles ?? [];
  const atrKey = String(input.params.atrKey ?? "atr");
  const k = Math.max(0.1, input.params.k ?? 1.5);
  const maxEvents = Math.max(1, Math.round(input.params.maxEvents ?? 50));
  const atr = input.series?.[atrKey];
  if (!atr || candles.length === 0) return [];

  const out: SignalEvent[] = [];
  for (let i = 1; i < candles.length; i++) {
    const atrPrev = atr[i - 1];
    if (atrPrev === null || atrPrev === undefined || !(atrPrev > 0)) continue;
    const prevClose = Number(candles[i - 1]?.close);
    const high = Number(candles[i]?.high);
    const low = Number(candles[i]?.low);
    if (![prevClose, high, low].every(Number.isFinite)) continue;
    const up = high > prevClose + k * atrPrev;
    const down = low < prevClose - k * atrPrev;
    if (!up && !down) continue;
    const t = input.times[i];
    if (t === undefined) continue;
    out.push({
      kind: up ? "atr_breakout_up" : "atr_breakout_down",
      index: i,
      t,
      tone: up ? "pos" : "neg",
      label: up ? "AB↑" : "AB↓",
      value: Math.round(((up ? high - prevClose : prevClose - low) / atrPrev) * 100) / 100,
      meta: { k, atr: Math.round(atrPrev * 100) / 100 },
    });
  }
  return out.slice(-maxEvents);
}

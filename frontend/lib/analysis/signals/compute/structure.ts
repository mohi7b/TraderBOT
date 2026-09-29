/**
 * AL · سیگنال ساختار بازار (A3)
 * frontend/lib/analysis/signals/compute/structure.ts
 * ============================================================
 * پل بین **موتور ساختار** (`market-structure/engine.ts`) و **سیگنال‌ها**:
 *   · `structure_events` → `bos_up`/`bos_down`/`choch_up`/`choch_down`
 *   · `fvg_events` → `fvg_bull`/`fvg_bear`
 * هر رویداد `confirmedIndex` موتور را عیناً حمل می‌کند (انضباط نگاه-به-آینده).
 * ============================================================
 */
import { analyzeStructure } from "../../market-structure/engine";
import type { SignalEvent, SignalInput } from "../types";

/** رویدادهای شکست ساختاری (BOS + CHoCH). */
export function structureEvents(input: SignalInput): SignalEvent[] {
  const candles = input.candles ?? [];
  if (candles.length === 0) return [];
  const res = analyzeStructure({
    times: input.times,
    candles: candles.map((c) => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    })),
    params: input.params,
  });
  const maxEvents = Math.max(1, Math.round(input.params.maxEvents ?? 50));
  const out: SignalEvent[] = res.breaks.map((b) => ({
    kind: b.kind,
    index: b.index,
    confirmedIndex: b.confirmedIndex,
    t: b.t,
    tone: b.kind.startsWith("bos") ? (b.kind.endsWith("up") ? "pos" : "neg") : "warn",
    label: b.kind.startsWith("choch")
      ? b.kind.endsWith("up")
        ? "CHoCH↑"
        : "CHoCH↓"
      : b.kind.endsWith("up")
        ? "BOS↑"
        : "BOS↓",
    value: b.level,
    meta: { level: b.level, close: b.close, trend: res.trend },
  }));
  return out.slice(-maxEvents);
}

/** رویدادهای شکاف ارزش منصفانه (FVG).
 * `unfilledOnly` (پیش‌فرض ۱): فقط نواحی **پرنشده** رویداد می‌سازند — سیاست
 * «فقط ساختارهای مهم» (مصوب 2026-09-23)؛ ناحیه‌های پرشده در `meta` باقی می‌مانند.
 */
export function fvgEvents(input: SignalInput): SignalEvent[] {
  const candles = input.candles ?? [];
  if (candles.length === 0) return [];
  const unfilledOnly = (input.params.unfilledOnly ?? 1) !== 0;
  const res = analyzeStructure({
    times: input.times,
    candles: candles.map((c) => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    })),
    params: input.params,
  });
  const maxEvents = Math.max(1, Math.round(input.params.maxEvents ?? 50));
  const zones = unfilledOnly ? res.fvgs.filter((z) => z.filledIndex === undefined) : res.fvgs;
  const out: SignalEvent[] = zones.map((z) => ({
    kind: z.kind,
    index: z.index,
    confirmedIndex: z.confirmedIndex,
    t: z.t,
    tone: z.kind === "fvg_bull" ? "info" : "neutral",
    label: z.kind === "fvg_bull" ? "FVG↑" : "FVG↓",
    value: Math.round((z.top - z.bottom) * 100) / 100,
    meta: {
      top: z.top,
      bottom: z.bottom,
      ...(z.filledIndex !== undefined ? { filled: z.filledIndex } : {}),
    },
  }));
  return out.slice(-maxEvents);
}

/**
 * AL → Chart Engine · سیگنال‌ها (فاز A2)
 * frontend/lib/analysis/integrations/chart/signals.ts
 * ============================================================
 * خروجی AL برای سیگنال‌ها = **رویداد** ⇒ این لایه آن‌ها را به:
 *   · یک **لایهٔ مارکر** سریالایزپذیر (`signal-markers`) و
 *   · شمارش هر نوع رویداد (برای بج/تست/دیباگ)
 * تبدیل می‌کند. قیمت مرجع مارکر از خودِ کندل می‌آید (کف برای صعودی، سقف برای
 * نزولی/هشدار) و شکل/رنگ از تُن سیگنال (اسلات‌های تم).
 * ⚠️ هیچ متن/رنگ هاردکدی این‌جا نیست؛ برچسب کوتاه رویداد (`GC`/`VS`) فقط برای
 *    نمایش اختیاری روی بوم است و `showLabels` پیش‌فرض خاموش است.
 * ============================================================
 */
import type { SignalMarkerPoint, SignalMarkersLayer } from "@/lib/chart/types";
import type { IndicatorSeries, OHLC } from "../../indicators/types";
import { computeSignal, listSignals } from "../../signals/registry";
import type { SignalEvent } from "../../signals/types";

export interface SignalBuildInput {
  times: number[];
  closes: number[];
  candles?: OHLC[];
  /** سری‌های اندیکاتور (مثل `ema21`/`sma50`/`atr`) — ورودی سیگنال‌های وابسته */
  series?: Record<string, IndicatorSeries>;
  /** سیگنال‌های درخواستی (پیش‌فرض: همهٔ رجیستری = واژگان بسته) */
  ids?: string[];
  /**
   * **زیرمجموعهٔ نمایش** (سیاست شلوغی چارت · مصوب 2026-09-23):
   * فقط این شناسه‌ها روی بوم رسم می‌شوند؛ بقیه **محاسبه و منتشر** می‌شوند اما
   * رسم نمی‌شوند تا پنل مدیریت لایه‌ها (کار بعدی) بتواند هر لحظه روشن‌شان کند.
   * پیش‌فرض: `undefined` ⇒ همه رسم می‌شوند (رفتار قبلی).
   */
  display?: string[];
  /** بازنویسی پارامتر هر سیگنال (از UI/AI — همیشه از اسکیما عبور می‌کند) */
  overrides?: Record<string, Record<string, number>>;
}

export interface BuiltSignals {
  events: SignalEvent[];
  layer: SignalMarkersLayer;
  /** شمارش هر نوع رویداد، مثل `golden_cross: 40` (کل موتور) */
  counts: Record<string, number>;
  /** شمارش رویدادهای **رسم‌شده** روی بوم (زیرمجموعهٔ نمایش) */
  displayCounts: Record<string, number>;
  /** تعداد رویدادهای **تأییدنشده** (provisional) در انتهای سری */
  provisionalCount: number;
  /** نسخهٔ فرمول هر سیگنال (پرووننس · D12) */
  formulaVersions: Record<string, string>;
}

/** شکل مارکر از نوع رویداد (پیش‌فرض: دایره). */
function shapeOf(kind: string, tone: SignalEvent["tone"]): SignalMarkerPoint["shape"] {
  if (kind === "golden_cross" || kind.endsWith("_up")) return "triangle-up";
  if (kind === "death_cross" || kind.endsWith("_down")) return "triangle-down";
  return tone === "pos" ? "triangle-up" : tone === "neg" ? "triangle-down" : "circle";
}

/**
 * ساخت همهٔ سیگنال‌های درخواستی + لایهٔ مارکر.
 * خطای یک سیگنال، بقیه را متوقف نمی‌کند (زنجیرهٔ چارت هرگز نمی‌افتد).
 */
export function buildSignals(input: SignalBuildInput): BuiltSignals {
  const ids = input.ids ?? listSignals();
  /** زیرمجموعهٔ نمایش (پیش‌فرض: همه‌چیز — سازگاری با رفتار قبلی) */
  const display = input.display ? new Set(input.display) : null;
  const isDisplayed = (kind: string) => {
    if (!display) return true;
    /** `golden_cross`/`bos_up`/… ⇒ شناسهٔ رجیستری والدش هم بررسی می‌شود */
    const family = kind.split(/_(cross|up|down|bull|bear|spike|breakout|doji|hammer|star|engulfing)/)[0]!;
    return (
      display.has(kind) ||
      display.has(family) ||
      display.has(`${family}_cross`) ||
      display.has(`${family}_spike`) ||
      display.has(`${family}_breakout`) ||
      display.has(`${family}_zone`)
    );
  };
  const events: SignalEvent[] = [];
  const counts: Record<string, number> = {};
  const displayCounts: Record<string, number> = {};
  const formulaVersions: Record<string, string> = {};

  for (const id of ids) {
    try {
      const res = computeSignal(id, {
        times: input.times,
        closes: input.closes,
        candles: input.candles,
        series: input.series,
        params: input.overrides?.[id],
      });
      formulaVersions[id] = res.descriptor.formulaVersion;
      for (const e of res.events) {
        events.push(e);
        counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      }
    } catch (err) {
      console.warn(`[AL] سیگنال «${id}» رد شد:`, err);
    }
  }

  const points: SignalMarkerPoint[] = [];
  const lastIndex = (input.candles?.length ?? 0) - 1;
  let provisionalCount = 0;
  for (const e of events) {
    if (!isDisplayed(e.kind)) continue;
    const candle = input.candles?.[e.index];
    if (!candle) continue;
    const up = e.tone === "pos";
    /**
     * **provisional**: رویدادی که هنوز تأیید نشده
     * (`confirmedIndex` بعد از آخرین کندل) ⇒ کم‌رنگ و خط‌چین رسم می‌شود.
     */
    const provisional = (e.confirmedIndex ?? e.index) > lastIndex;
    if (provisional) provisionalCount += 1;
    displayCounts[e.kind] = (displayCounts[e.kind] ?? 0) + 1;
    points.push({
      t: e.t,
      price: up ? candle.low : candle.high,
      tone: e.tone,
      shape: shapeOf(e.kind, e.tone),
      ...(provisional ? { provisional: true } : {}),
      ...(e.label ? { label: e.label } : {}),
    });
  }
  points.sort((a, b) => a.t - b.t);

  return {
    events,
    counts,
    displayCounts,
    provisionalCount,
    formulaVersions,
    layer: {
      id: "signal-markers",
      enabled: points.length > 0,
      points,
      size: 5,
      showLabels: false,
    },
  };
}

/** رشتهٔ خلاصه برای `data-*` (تست/دیباگ): `golden_cross:40,volume_spike:12` */
export function signalCountsSummary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

/**
 * AL → Chart Engine · اندیکاتورها (A1)
 * frontend/lib/analysis/integrations/chart/indicators.ts
 * ============================================================
 * تنها وظیفهٔ این لایه: **تبدیل خروجی AL به ورودی چارت**.
 *   · چارت هیچ محاسبه‌ای نمی‌کند (قرارداد پرامپت AL).
 *   · خروجی: `ChartSeriesInput[]` + متادیتای provenance (نسخهٔ فرمول/پارامترها).
 *   · تهی‌های گرم‌شدن **حذف** می‌شوند (هیچ نقطهٔ جعلی روی چارت نمی‌نشیند).
 *   · رنگ فقط `colorKey` (اسلات تم) — نه رنگ خام.
 *   · برای پنل: `paneScaleId` + `paneHeightRatio` ⇒ لایهٔ چارت `scaleMargins`
 *     می‌سازد و موتور (BaseChart) پنل را بالای سطر سیگنال می‌نشاند.
 * ============================================================
 */
import type { ChartSeriesInput } from "@/lib/chart/types";
import { computeIndicator, getIndicator, isSeriesMap } from "../../indicators/registry";
import { paramsFor } from "../../indicators/params.schema";
import type { IndicatorSeries, OHLC } from "../../indicators/types";

/** سری محور (خروجی TAMC) — همه آرایه‌ها هم‌طول. */
export interface AxisInput {
  /** زمان محور به **ثانیه** (همان عددی که به LWC داده می‌شود) */
  times: number[];
  closes: number[];
  candles?: OHLC[];
}

export interface IndicatorRequest {
  /** شناسهٔ اندیکاتور در AL (واژگان بسته) */
  id: string;
  /** بازنویسی پارامترها (پیش‌فرض: `params.json`) */
  params?: Record<string, number>;
  /** برای اندیکاتورهای چندسری (MACD: line/signal/histogram) */
  output?: string;
  colorKey?: string;
  label?: string;
  /** مقیاس پنل (غیر `right`) — نبودش ⇒ overlay روی کندل */
  paneScaleId?: string;
  /** ارتفاع پنل نسبت به نمودار (مثل ۰٫۲۲) */
  paneHeightRatio?: number;
  type?: "line" | "histogram";
}

export interface BuiltIndicator {
  series: ChartSeriesInput[];
  /** شناسهٔ سری‌های ساخته‌شده (برای `data-*` و تست) */
  ids: string[];
  /** سری خام AL (هم‌طول ورودی · با تهی‌های گرم‌شدن) — برای سیگنال‌ها */
  values: IndicatorSeries;
  /** پارامترهای مؤثر (provenance) */
  params: Record<string, number>;
  /** نسخهٔ فرمول (provenance · D12) */
  formulaVersion: string;
}

/** پر کردن قالب شناسهٔ خروجی: `ema{period}` + `{period:21}` ⇒ `ema21`. */
function expandId(template: string, params: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) =>
    params[name] !== undefined ? String(params[name]) : name,
  );
}

/**
 * ساخت یک سری چارت از یک اندیکاتور AL.
 * @throws اگر شناسهٔ اندیکاتور/خروجی نامعتبر باشد (fail-fast).
 */
export function buildIndicator(request: IndicatorRequest, axis: AxisInput): BuiltIndicator {
  const descriptor = getIndicator(request.id);
  if (!descriptor) throw new RangeError(`اندیکاتور ناشناخته برای چارت: «${request.id}»`);

  const { result } = computeIndicator(request.id, {
    closes: axis.closes,
    candles: axis.candles,
    params: request.params,
  });
  const params = { ...(request.params ?? {}) };

  /** انتخاب سری: تک‌سری یا یکی از چندسری */
  const seriesMap = isSeriesMap(result) ? result : null;
  let values: IndicatorSeries;
  if (seriesMap) {
    const key = request.output ?? Object.keys(seriesMap)[0]!;
    const picked = seriesMap[key];
    if (!picked) {
      throw new RangeError(
        `خروجی «${key}» برای «${request.id}» وجود ندارد (موجود: ${Object.keys(seriesMap).join(", ")})`,
      );
    }
    values = picked;
  } else {
    values = result as IndicatorSeries;
  }

  const baseId = seriesMap
    ? `${request.id}.${request.output ?? Object.keys(seriesMap)[0]!}`
    : expandId(descriptor.outputs.id, { ...paramsFor(request.id), ...params });
  const id = baseId;

  /** نقاط: تهی‌ها حذف می‌شوند (بدون مقدار جعلی روی چارت) */
  const points = values
    .map((v, i) =>
      v === null || !Number.isFinite(v) || axis.times[i] === undefined
        ? null
        : { t: axis.times[i]!, value: v },
    )
    .filter((p): p is { t: number; value: number } => p !== null);

  const kind = request.type ?? (descriptor.outputs.kind === "histogram" ? "histogram" : "line");
  const series: ChartSeriesInput = {
    id,
    label: request.label,
    type: kind,
    points,
    colorKey: request.colorKey ?? descriptor.outputs.colorKey,
  };
  if (request.paneScaleId) {
    series.priceScaleId = request.paneScaleId;
    const ratio = Math.min(0.5, Math.max(0.08, request.paneHeightRatio ?? 0.22));
    series.scaleMargins = { top: 1 - ratio, bottom: 0 };
  }

  return {
    series: [series],
    ids: [id],
    /** سری خام (با تهی‌های گرم‌شدن) — برای سیگنال‌ها در همان محاسبه */
    values,
    params: { ...paramsFor(request.id), ...params },
    formulaVersion: descriptor.formulaVersion,
  };
}

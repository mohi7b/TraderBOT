/**
 * AL — رجیستری رسمی اندیکاتورها (تنها منبع حقیقت · D11)
 * frontend/lib/analysis/indicators/registry.ts
 * ============================================================
 * هر اندیکاتور یک **Descriptor** دارد: دسته، اسکیمای پارامتر، تابع محاسبهٔ خالص،
 * مشخصات خروجی، نسخهٔ فرمول و سیاست مقیاس.
 *
 * قواعد:
 *   · توابع محاسبه **خالص**اند (بدون UI/IO) و از `compute/*` می‌آیند.
 *   · پارامترها از `params.schema.ts` می‌آیند (پیش‌فرض‌ها آن‌جا ⇒ تک‌منبع).
 *   · `formulaVersion` از `../versioning` ⇒ کلید کش (D7) و provenance (D12).
 *   · هیچ رنگی این‌جا نیست؛ فقط `colorKey` (اسلات تم).
 *
 * ⚠️ قالب شناسهٔ خروجی: `"<id>{param}"` — مثل `ema{period}` ⇒ `ema21`.
 *    لایهٔ اتصال (integrations/chart) این قالب را با مقدار واقعی پر می‌کند.
 * ============================================================
 */
import { formulaVersionOf } from "../versioning";
import { PARAM_SCHEMA, paramsFor } from "./params.schema";
import type {
  IndicatorDescriptor,
  IndicatorInput,
  IndicatorParamSpec,
  IndicatorSeries,
  IndicatorSeriesMap,
} from "./types";
import { atrSeries } from "./compute/atr";
import { bbandsSeries } from "./compute/bbands";
import { emaSeries } from "./compute/ema";
import { macdSeries } from "./compute/macd";
import { rsiSeries } from "./compute/rsi";
import { smaSeries } from "./compute/sma";
import { vwapSeries } from "./compute/vwap";

/** اسکیمای پارامتر را از `params.schema` می‌کشد (تک‌منبع، بدون تکرار). */
function paramSpec(id: string): IndicatorParamSpec {
  const rules = PARAM_SCHEMA[id] ?? {};
  return Object.fromEntries(
    Object.entries(rules).map(([k, r]) => [
      k,
      { type: r.type, min: r.min, max: r.max, step: r.step, default: r.default },
    ]),
  ) as IndicatorParamSpec;
}

function descriptor(
  id: string,
  category: IndicatorDescriptor["category"],
  compute: IndicatorDescriptor["compute"],
  outputs: IndicatorDescriptor["outputs"],
  scalePolicy: IndicatorDescriptor["scalePolicy"],
): IndicatorDescriptor {
  return {
    id,
    category,
    params: paramSpec(id),
    compute,
    outputs,
    formulaVersion: formulaVersionOf(id),
    scalePolicy,
  };
}

/** رجیستری رسمی — افزودن اندیکاتور = یک ورودی همین‌جا (بدون تغییر چارت). */
export const INDICATOR_REGISTRY: Record<string, IndicatorDescriptor> = {
  ema: descriptor(
    "ema",
    "trend",
    (i) => emaSeries(i.closes, i.params.period ?? 21),
    { id: "ema{period}", kind: "line", colorKey: "emaFast" },
    "overlay",
  ),
  ema_fast: descriptor(
    "ema_fast",
    "trend",
    (i) => emaSeries(i.closes, i.params.period ?? 9),
    { id: "ema_fast{period}", kind: "line", colorKey: "emaFast" },
    "overlay",
  ),
  ema_slow: descriptor(
    "ema_slow",
    "trend",
    (i) => emaSeries(i.closes, i.params.period ?? 200),
    { id: "ema_slow{period}", kind: "line", colorKey: "smaSlow" },
    "overlay",
  ),
  sma: descriptor(
    "sma",
    "trend",
    (i) => smaSeries(i.closes, i.params.period ?? 50),
    { id: "sma{period}", kind: "line", colorKey: "smaSlow" },
    "overlay",
  ),
  rsi: descriptor(
    "rsi",
    "momentum",
    (i) => rsiSeries(i.closes, i.params.period ?? 14),
    { id: "rsi{period}", kind: "line", colorKey: "signalInfo", pane: true },
    "pane",
  ),
  macd: descriptor(
    "macd",
    "momentum",
    (i) => macdSeries(i.closes, i.params.fast ?? 12, i.params.slow ?? 26, i.params.signal ?? 9),
    { id: "macd", kind: "line", colorKey: "signalInfo", pane: true },
    "pane",
  ),
  atr: descriptor(
    "atr",
    "volatility",
    (i) => atrSeries(i.candles ?? [], i.params.period ?? 14),
    { id: "atr{period}", kind: "line", colorKey: "signalWarn", pane: true },
    "pane",
  ),
  bbands: descriptor(
    "bbands",
    "volatility",
    (i) => bbandsSeries(i.closes, i.params.period ?? 20, i.params.deviation ?? 2),
    { id: "bbands", kind: "line", colorKey: "trend", pane: false },
    "overlay",
  ),
  vwap: descriptor(
    "vwap",
    "volume",
    (i) => vwapSeries(i.candles ?? []),
    { id: "vwap", kind: "line", colorKey: "signalNeutral", pane: false },
    "overlay",
  ),
};

/** فهرست شناسه‌ها (برای UI/AI: واژگان بستهٔ مجاز). */
export function listIndicators(): string[] {
  return Object.keys(INDICATOR_REGISTRY);
}

/** Descriptor یک شناسه (ناشناخته ⇒ `undefined` تا خاموش رد نشود). */
export function getIndicator(id: string): IndicatorDescriptor | undefined {
  return INDICATOR_REGISTRY[id];
}

/**
 * اجرای یک اندیکاتور با پارامترهای کامل (پیش‌فرض‌ها اعمال‌شده).
 * ورودی‌های ناقص ⇒ خطای صریح (fail-fast، نه محاسبهٔ مبهم).
 */
export function computeIndicator(
  id: string,
  input: Omit<IndicatorInput, "params"> & { params?: Record<string, number> },
): { descriptor: IndicatorDescriptor; result: IndicatorSeries | IndicatorSeriesMap } {
  const descriptor = getIndicator(id);
  if (!descriptor) throw new RangeError(`اندیکاتور ناشناخته در AL: «${id}»`);
  const params = paramsFor(id, input.params);
  const result = descriptor.compute({ closes: input.closes, candles: input.candles, params });
  return { descriptor, result };
}

/** افزودنی: آیا نتیجه چندسری است؟ (MACD/BB) */
export function isSeriesMap(
  r: IndicatorSeries | IndicatorSeriesMap,
): r is IndicatorSeriesMap {
  return !Array.isArray(r);
}

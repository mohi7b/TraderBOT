/**
 * AL — رجیستری سیگنال‌ها (فاز A2)
 * frontend/lib/analysis/signals/registry.ts
 * ============================================================
 * همان الگوی اندیکاتورها، برای رویدادها:
 *   · هر سیگنال یک `SignalDescriptor` دارد (دسته · پارامتر · compute · `hintKey` · تُن).
 *   · پارامترها از `params.json` (بخش `signals`) می‌آیند ⇒ هیچ عددی در کد نیست.
 *   · `formulaVersion` از `versioning` ⇒ پرووننس + کلید کش (D7/D12).
 *   · سیگنال‌ها **رویداد** برمی‌گردانند (`SignalEvent[]`) نه سری ⇒ مارکر/بج.
 *
 * ⚠️ انتخاب کلید سری‌ها برای `cross`: عمداً از سری‌های **موجود** در `input.series`
 *    با قرارداد نام‌گذاری (`ema*` = سریع · `sma*` = کند) انتخاب می‌شود تا
 *    رجیستری به دامنه گره نخورد (چارت تاریخی همان `ema21`/`sma50` را می‌دهد).
 * ============================================================
 */
import { formulaVersionOf } from "../versioning";
import { SIGNAL_PARAM_SCHEMA, signalParamsFor } from "../indicators/params.schema";
import type { IndicatorParamSpec } from "../indicators/types";
import { crossEvents } from "./compute/cross";
import { divergenceEvents } from "./compute/divergence";
import { patternEvents } from "./compute/patterns";
import { fvgEvents, structureEvents } from "./compute/structure";
import { atrBreakoutEvents } from "./compute/volatility";
import { volumeSpikeEvents } from "./compute/volume";
import type { SignalDescriptor, SignalEvent, SignalInput } from "./types";

/** اسکیمای پارامتر سیگنال را از params.schema می‌کشد (تک‌منبع). */
function paramSpec(id: string): IndicatorParamSpec {
  const rules = SIGNAL_PARAM_SCHEMA[id] ?? {};
  return Object.fromEntries(
    Object.entries(rules).map(([k, r]) => [
      k,
      { type: r.type, min: r.min, max: r.max, step: r.step, default: r.default },
    ]),
  ) as IndicatorParamSpec;
}

/** تشخیص کلید سریع/کند از سری‌های موجود (قرارداد نام‌گذاری). */
function resolveMaKeys(input: SignalInput): { fast: string; slow: string } | null {
  const keys = Object.keys(input.series ?? {});
  const fast = keys.find((k) => /^ema/.test(k)) ?? keys.find((k) => /^sma/.test(k));
  const slow = keys.filter((k) => /^sma/.test(k)).sort().reverse()[0] ?? keys.find((k) => k !== fast);
  if (!fast || !slow || fast === slow) return null;
  return { fast, slow };
}

function descriptor(
  id: string,
  category: SignalDescriptor["category"],
  compute: SignalDescriptor["compute"],
  hintKey: string,
  labelKey: string,
  tone: SignalDescriptor["tone"],
): SignalDescriptor {
  return {
    id,
    category,
    params: paramSpec(id),
    compute,
    formulaVersion: formulaVersionOf(id),
    hintKey,
    labelKey,
    tone,
  };
}

/** رجیستری رسمی سیگنال‌ها (A2 · افزودن سیگنال = یک ورودی). */
export const SIGNAL_REGISTRY: Record<string, SignalDescriptor> = {
  cross: descriptor(
    "cross",
    "structure",
    (input) => {
      const keys = resolveMaKeys(input);
      if (!keys) return [];
      return crossEvents(input, keys.fast, keys.slow);
    },
    "hist.signals.cross.hint",
    "hist.signals.cross.label",
    "info",
  ),
  volume_spike: descriptor(
    "volume_spike",
    "volume",
    (input) => volumeSpikeEvents({ ...input, params: signalParamsFor("volume_spike", input.params) }),
    "al.signals.volume.hint",
    "al.signals.volume.label",
    "warn",
  ),
  atr_breakout: descriptor(
    "atr_breakout",
    "volatility",
    (input) => atrBreakoutEvents({ ...input, params: signalParamsFor("atr_breakout", input.params) }),
    "al.signals.atr.hint",
    "al.signals.atr.label",
    "info",
  ),
  patterns: descriptor(
    "patterns",
    "pattern",
    (input) => patternEvents({ ...input, params: signalParamsFor("patterns", input.params) }),
    "al.signals.patterns.hint",
    "al.signals.patterns.label",
    "neutral",
  ),
  divergence: descriptor(
    "divergence",
    "momentum",
    (input) => divergenceEvents({ ...input, params: signalParamsFor("divergence", input.params) }),
    "al.signals.divergence.hint",
    "al.signals.divergence.label",
    "warn",
  ),
  structure: descriptor(
    "structure",
    "structure",
    (input) => structureEvents({ ...input, params: signalParamsFor("structure", input.params) }),
    "al.signals.structure.hint",
    "al.signals.structure.label",
    "info",
  ),
  fvg: descriptor(
    "fvg",
    "structure",
    (input) => fvgEvents({ ...input, params: signalParamsFor("fvg", input.params) }),
    "al.signals.fvg.hint",
    "al.signals.fvg.label",
    "neutral",
  ),
};

/** شناسه‌های مجاز (واژگان بسته برای UI/AI). */
export function listSignals(): string[] {
  return Object.keys(SIGNAL_REGISTRY);
}

export function getSignal(id: string): SignalDescriptor | undefined {
  return SIGNAL_REGISTRY[id];
}

/**
 * اجرای یک سیگنال با پارامترهای کامل (fail-fast برای شناسهٔ ناشناخته).
 * @param overrides بازنویسی پارامترها (از UI/AI) — همیشه از اسکیما عبور می‌کند
 */
export function computeSignal(
  id: string,
  input: Omit<SignalInput, "params"> & { params?: Record<string, number> },
): { descriptor: SignalDescriptor; events: SignalEvent[] } {
  const descriptor = getSignal(id);
  if (!descriptor) throw new RangeError(`سیگنال ناشناخته در AL: «${id}»`);
  const params = signalParamsFor(id, input.params);
  const events = descriptor.compute({
    times: input.times,
    closes: input.closes,
    candles: input.candles,
    series: input.series,
    params,
  });
  return { descriptor, events };
}

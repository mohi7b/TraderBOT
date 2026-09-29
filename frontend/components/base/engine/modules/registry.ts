/**
 * ChartEngine V2 · **P4** — بستهٔ ماژول‌های موجود (Indicators · PriceAction · Signals)
 * frontend/components/base/engine/modules/registry.ts
 * ============================================================
 * هدف: سه توانایی **موجود** پروژه (که ریاضی‌شان در AL است ✓) به قرارداد `ChartModule`
 * درآیند تا Control Center و پروفایل‌ها بتوانند روی آن‌ها سوار شوند ✓.
 *
 * ⚠️ **ناورد طلایی (D11):** ماژول **فرمول ندارد** ✗ — فقط `computeRef` می‌دهد
 *    (نام تابع AL ✓). این ناورد در selfTest سنجیده می‌شود ✓.
 * ⚠️ صفر وابستگی به React/DOM ✗ ⇒ قابل سنجش در Node و انتشار در SSR ✓.
 */
import { MODULE_IDS, type ModuleId } from "../core/profiles";
import { validateModuleFragment, type SpecFragment } from "../core/specGate";
/** P9-الف: ماژول نمونهٔ تازه (یک فایل + یک ثبت ✓ · وابستگی نوعی ⇒ بدون چرخهٔ ران‌تایم ✓) */
import { PULSE_MODULE } from "./pulse.module";

export interface ModuleItem {
  key: string;
  label: string;
  default: number;
}

export interface ChartModuleDef {
  id: ModuleId;
  version: string;
  labelKey: string;
  /** زنده: روی کندل بسته ✓ یا نوک در حال تشکیل ✓ */
  live: "onClosed" | "onForming";
  /** مرجع محاسبه در AL ✓ (فرمول این‌جا نیست ✗) */
  computeRef: string;
  items: ModuleItem[];
  /** قطعهٔ قرارداد (از دروازهٔ SpecGate می‌گذرد ✓) */
  spec(): SpecFragment;
}

/** سنسورهای سه ماژول موجود — پارامترها همان‌های امروز پروژه ✓ */
export const MODULES: readonly ChartModuleDef[] = Object.freeze([
  {
    id: "indicators",
    version: "1.0.0",
    labelKey: "mod.indicators",
    live: "onClosed",
    computeRef: "lib/analysis/indicators/registry#computeIndicator",
    items: [
      { key: "ema", label: "EMA", default: 21 },
      { key: "sma", label: "SMA", default: 50 },
      { key: "rsi", label: "RSI", default: 14 },
      { key: "macd", label: "MACD", default: 12 },
      { key: "atr", label: "ATR", default: 14 },
      { key: "bb", label: "BB", default: 20 },
      { key: "vwap", label: "VWAP", default: 1 },
    ],
    spec: (): SpecFragment => ({ kind: "overlay", id: "indicators", version: "1.0.0" }),
  },
  {
    id: "priceaction",
    version: "1.0.0",
    labelKey: "mod.priceaction",
    live: "onClosed",
    computeRef: "lib/analysis/signals/registry#structure+fvg",
    items: [
      { key: "swing", label: "Swing", default: 2 },
      { key: "bos", label: "BOS", default: 1 },
      { key: "choch", label: "CHoCH", default: 1 },
      { key: "fvg", label: "FVG", default: 1 },
    ],
    spec: (): SpecFragment => ({ kind: "layer", id: "priceaction", version: "1.0.0" }),
  },
  {
    id: "signals",
    version: "1.0.0",
    labelKey: "mod.signals",
    live: "onClosed",
    computeRef: "lib/analysis/integrations/chart/signals#buildSignals",
    items: [
      { key: "cross", label: "Cross", default: 1 },
      { key: "volumeSpike", label: "Volume spike", default: 1 },
      { key: "atrBreakout", label: "ATR breakout", default: 1 },
      { key: "patterns", label: "Patterns", default: 1 },
      { key: "divergence", label: "Divergence", default: 1 },
    ],
    spec: (): SpecFragment => ({ kind: "layer", id: "signals", version: "1.0.0" }),
  },
  /** نمونهٔ ماژول تازه (P9-الف) — ثبت = همین یک خط ✓ */
  PULSE_MODULE,
]);

export function moduleById(id: string): ChartModuleDef | null {
  return MODULES.find((m) => m.id === id) ?? null;
}

export function moduleIds(): string[] {
  return MODULES.map((m) => m.id);
}

/** **خودآزمون** (الگوی پروژه · در SSR منتشر می‌شود) — `@returns` خطاها */
export function modulesSelfTest(): string[] {
  const errs: string[] = [];

  /** ۱) شناسه‌ها: شناخته‌شده ✓ · بدون تکرار ✓ */
  for (const m of MODULES) {
    if (!(MODULE_IDS as readonly string[]).includes(m.id)) errs.push(`شناسهٔ ماژول ناشناس: ${m.id} ✗`);
    if (!/^\d+\.\d+\.\d+$/.test(m.version)) errs.push(`نسخهٔ غیرsemver: ${m.id}=${m.version} ✗`);
    if (!(m.live === "onClosed" || m.live === "onForming")) errs.push(`live نامعتبر: ${m.id} ✗`);
    /** ۲) **ناورد D11:** ماژول باید مرجع AL داشته باشد، نه فرمول ✗ */
    if (!m.computeRef.trim()) errs.push(`ماژول بدون مرجع AL: ${m.id} ✗`);
    /** ۳) آیتم‌ها: ≥۱ ✓ · کلید تکراری ✗ · پیش‌فرض عددی ✓ */
    if (m.items.length === 0) errs.push(`ماژول بدون آیتم: ${m.id} ✗`);
    const keys = new Set<string>();
    for (const it of m.items) {
      if (!it.key.trim() || !it.label.trim()) errs.push(`آیتم ناقص در ${m.id} ✗`);
      if (keys.has(it.key)) errs.push(`کلید تکراری در ${m.id}: ${it.key} ✗`);
      keys.add(it.key);
      if (!Number.isFinite(it.default)) errs.push(`پیش‌فرض غیرعددی: ${m.id}.${it.key} ✗`);
    }
    /** ۴) قطعهٔ قرارداد باید از دروازهٔ SpecGate بگذرد ✓ */
    const gate = validateModuleFragment(m.spec());
    if (!gate.ok) errs.push(`spec ماژول ${m.id} رد شد: ${gate.errors.join(" · ")} ✗`);
  }
  if (new Set(moduleIds()).size !== MODULES.length) errs.push("شناسهٔ ماژول تکراری ✗");

  /** ۵) سه ماژول موجود باید حاضر باشند ✓ */
  for (const id of ["indicators", "priceaction", "signals"]) {
    if (!moduleById(id)) errs.push(`ماژول موجود غایب است: ${id} ✗`);
  }
  if (moduleById("nope") !== null) errs.push("ماژول ناشناس باید null بدهد ✗");

  /** ۶) هم‌خوانی پیش‌فرض‌ها با پارامترهای امروز پروژه ✓ */
  const ind = moduleById("indicators")!;
  const d = (k: string) => ind.items.find((x) => x.key === k)?.default;
  if (d("ema") !== 21 || d("sma") !== 50 || d("rsi") !== 14 || d("atr") !== 14 || d("bb") !== 20) {
    errs.push(`پیش‌فرض اندیکاتورها با پروژه هم‌خوان نیست ✗ (ema=${d("ema")} sma=${d("sma")})`);
  }

  /** ۷) پوشش توانایی‌های امروز: انتخاب‌گرهای نمایش (`cross/structure/fvg`) ✓ */
  const sig = moduleById("signals")!;
  if (!sig.items.some((x) => x.key === "cross")) errs.push("آیتم cross در ماژول signals نیست ✗");
  const pa = moduleById("priceaction")!;
  if (!pa.items.some((x) => x.key === "fvg")) errs.push("آیتم fvg در priceaction نیست ✗");
  return errs;
}

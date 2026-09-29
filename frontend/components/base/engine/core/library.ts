/**
 * ChartEngine V2 · **P5/4-UI** — کتابخانهٔ آیتم‌های ماژول‌ها (منبع حقیقت واحد ✓)
 * frontend/components/base/engine/core/library.ts
 * ============================================================
 * **چرا این ماژول؟** پیش از این فهرست آیتم‌ها (`ema`, `sma`, …) **داخل**
 * کامپوننت کشو بود ✗ ⇒ دو مشکل: (۱) پارامترها عدد هاردکد داشتند ✗،
 * (۲) «چند بار افزودن» پشتیبانی نمی‌شد ✗.
 *
 * **قواعد (قفل‌شده):**
 *   · پارامترها **از AL** می‌آیند (`PARAM_SCHEMA` / `SIGNAL_PARAM_SCHEMA` ✓)
 *     — هیچ `min/max/step/default` دوباره‌نویسی نمی‌شود ✗ (تک‌منبع D11 ✓).
 *   · رنگ آیتم **اسمی** است (`colorKey` ✓ = همان کلید رجیستری AL/تم ✓)
 *     ⇒ رنگ در کشو **عیناً** مثل رنگ همان سری در چارت درمی‌آید ✓ (مورد ۵ کاربر ✓).
 *   · هر آیتم می‌تواند **چند نمونه** داشته باشد (`ParamInstance[]` ✓) با
 *     پارامترهای متفاوت (مورد ۴ کاربر ✓) — هیچ «حالت خنثی/غیرفعال» ✗.
 *   · آیتمی که شناسهٔ AL ندارد، **پارامتر عددی هم ندارد** ✓ (`params: []`)
 *     ⇒ هیچ پارامتر ساختگی ساخته نمی‌شود ✗.
 *
 * ⚠️ صفر وابستگی به React/DOM ✗ ⇒ `librarySelfTest` در SSR منتشر می‌شود ✓.
 * ⛔ جهت import یک‌طرفه است: `profiles.ts` هیچ‌گاه `library.ts` را (در ران‌تایم)
 *    import نمی‌کند ✗ ⇒ بدون دور (cycle) ✓؛ فقط `import type` ✓.
 */

import {
  PARAM_SCHEMA,
  SIGNAL_PARAM_SCHEMA,
  type ParamRule,
} from "@/lib/analysis/indicators/params.schema";
/** فقط **نوع** — بدون دور ران‌تایم ✓ */
import type { ModuleId } from "./profiles";

/**
 * **یک نمونهٔ پارامتری** = یک آیتمِ مستقل روی چارت با پارامترهای خودش ✓
 *   · `on`     ⇒ کلید ON/OFF ظریفِ همان آیتم (مورد ۳ کاربر ✓)
 *   · `values` ⇒ پارامترهای عددی همان نمونه (از AL ✓)
 */
export interface ParamInstance {
  on: boolean;
  values: Record<string, number>;
}

export interface LibraryItemSpec {
  /** کلید پارامتر در وضعیت ماژول (سازگار با پروفایل‌های موجود ✓) */
  key: string;
  /** نام نمایشیِ پشتیبان (برندِ اندیکاتور ✓) — i18n آن را بازنویسی می‌کند ✓ */
  fallbackLabel: string;
  /** اسلات رنگ تم / کلید رنگ AL ✓ (رنگ کشو = رنگ چارت ✓) */
  colorKey: string;
  /** شناسهٔ اندیکاتور در AL (پارامترها از همین اسکیما می‌آید ✓) */
  alId?: string;
  /** شناسهٔ سیگنال در AL ✓ */
  signalId?: string;
  /** فقط پارامترهای **کاربرمحور** (پارامترهای عملیاتی مثل `maxEvents` نمایش داده نمی‌شوند ✗) */
  params?: readonly string[];
  /** در پنل جدا رسم می‌شود (نه overlay روی کندل) ✓ */
  pane?: boolean;
}

/** سقف نمونه‌ها/پارامترها ⇒ URL کوتاه و امن ✓ (ضد سوءاستفاده در کدک ✓) */
export const MAX_INSTANCES_PER_ITEM = 8;
export const MAX_PARAMS_PER_INSTANCE = 6;

/**
 * **کتابخانهٔ رسمی** — کلیدها با پروفایل‌ها (`profiles.ts`) یکسان‌اند ✓
 * (`ema`, `sma`, `swing`, `fvg`, `cross`, `volumeSpike`, `cvd`, …).
 * ⚠️ `colorKey` برای اندیکاتورها **عیناً** = کلید رجیستری AL ✓ (`emaFast`,
 * `smaSlow`, `signalInfo`, `signalWarn`, `trend`, `signalNeutral`) ⇒ چارت و
 * کشو از **یک** منبع رنگ می‌خوانند ✓. برای آیتم‌های بدون رندرِ AL، اندیس پالت
 * سری تم (`series.N`) استفاده می‌شود ✓ (رنگ واقعی پالت، نه رنگ اختراعی ✗).
 */
export const LIBRARY: Record<ModuleId, readonly LibraryItemSpec[]> = {
  multichart: [
    { key: "panes", fallbackLabel: "Panes", colorKey: "series.0" },
    { key: "sync", fallbackLabel: "Sync", colorKey: "series.1" },
  ],
  microflow: [
    { key: "delta", fallbackLabel: "Delta", colorKey: "series.2" },
    { key: "imbalance", fallbackLabel: "Imbalance", colorKey: "series.3" },
  ],
  indicators: [
    { key: "ema", fallbackLabel: "EMA", colorKey: "emaFast", alId: "ema", params: ["period"] },
    { key: "sma", fallbackLabel: "SMA", colorKey: "smaSlow", alId: "sma", params: ["period"] },
    { key: "rsi", fallbackLabel: "RSI", colorKey: "signalInfo", alId: "rsi", params: ["period"], pane: true },
    { key: "macd", fallbackLabel: "MACD", colorKey: "signalInfo", alId: "macd", params: ["fast", "slow", "signal"], pane: true },
    { key: "atr", fallbackLabel: "ATR", colorKey: "signalWarn", alId: "atr", params: ["period"], pane: true },
    { key: "bb", fallbackLabel: "BB", colorKey: "trend", alId: "bbands", params: ["period", "deviation"] },
    { key: "vwap", fallbackLabel: "VWAP", colorKey: "signalNeutral", alId: "vwap", params: [] },
  ],
  priceaction: [
    { key: "swing", fallbackLabel: "Swing", colorKey: "series.0", signalId: "structure", params: ["pivot", "minBars"] },
    { key: "bos", fallbackLabel: "BOS", colorKey: "series.1", signalId: "structure", params: [] },
    { key: "fvg", fallbackLabel: "FVG", colorKey: "series.2", signalId: "fvg", params: [] },
  ],
  signals: [
    { key: "cross", fallbackLabel: "Cross", colorKey: "series.3", signalId: "cross", params: [] },
    { key: "volumeSpike", fallbackLabel: "Volume", colorKey: "series.4", signalId: "volume_spike", params: ["window", "z"] },
    { key: "atrBreakout", fallbackLabel: "ATR break", colorKey: "series.5", signalId: "atr_breakout", params: ["k"] },
  ],
  moneyflow: [
    { key: "cvd", fallbackLabel: "CVD", colorKey: "signalPos" },
    { key: "funding", fallbackLabel: "Funding", colorKey: "signalWarn" },
    { key: "openInterest", fallbackLabel: "OI", colorKey: "signalInfo" },
  ],
  pulse: [
    { key: "events", fallbackLabel: "Events", colorKey: "signalRisk" },
    { key: "sentiment", fallbackLabel: "Sentiment", colorKey: "series.0" },
  ],
  ai: [{ key: "summary", fallbackLabel: "Summary", colorKey: "series.1" }],
  bots: [
    { key: "paper", fallbackLabel: "Paper", colorKey: "series.2" },
    { key: "alerts", fallbackLabel: "Alerts", colorKey: "signalWarn" },
  ],
  advanced: [
    { key: "frame", fallbackLabel: "Frame", colorKey: "signalNeutral" },
    { key: "payload", fallbackLabel: "Payload", colorKey: "series.3" },
    { key: "cache", fallbackLabel: "Cache", colorKey: "series.4" },
  ],
};

/** آیتم‌های یک ماژول ✓ */
export function itemsOf(moduleId: ModuleId): readonly LibraryItemSpec[] {
  return LIBRARY[moduleId] ?? [];
}

/** مشخصات یک آیتم ✓ (`undefined` = کلید ناشناس ⇒ نادیده ✓) */
export function specOf(moduleId: ModuleId, key: string): LibraryItemSpec | undefined {
  return itemsOf(moduleId).find((x) => x.key === key);
}

/** قواعد پارامترهای یک آیتم — از اسکیمای AL ✓ (بدون تکرار عدد ✗) */
export function paramRulesOf(spec: LibraryItemSpec): Record<string, ParamRule> {
  const source: Record<string, ParamRule> | undefined = spec.alId
    ? PARAM_SCHEMA[spec.alId]
    : spec.signalId
      ? SIGNAL_PARAM_SCHEMA[spec.signalId]
      : undefined;
  const out: Record<string, ParamRule> = {};
  for (const name of spec.params ?? []) {
    const rule = source?.[name];
    /** ⛔ پارامترِ اعلام‌شده ولی ناموجود در AL = باگ پیکربندی (selfTest می‌گیرد ✓) */
    if (rule) out[name] = rule;
  }
  return out;
}

/** مقدار پیش‌فرض یک نمونه (همهٔ پارامترها از AL ✓ · بی‌پارامتر ⇒ `{}` ✓) */
export function defaultValues(spec: LibraryItemSpec): Record<string, number> {
  const rules = paramRulesOf(spec);
  return Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, r.default]));
}

/** نمونهٔ تازه (با پیش‌فرض‌های AL ✓) — برای «افزودن چندباره» ✓ */
export function newInstance(spec: LibraryItemSpec): ParamInstance {
  return { on: true, values: defaultValues(spec) };
}

/** محدودسازی یک مقدار به بازهٔ اسکیما ✓ (ورودی کاربر/URL ✓) */
export function clampValue(rule: ParamRule, value: number): number {
  if (!Number.isFinite(value)) return rule.default;
  const v = Math.min(rule.max, Math.max(rule.min, value));
  return rule.type === "int" ? Math.round(v) : v;
}

/** آیا مقدار یک نمونهٔ کانونی است؟ ✓ */
function isInstanceLike(v: unknown): v is ParamInstance {
  if (!v || typeof v !== "object") return false;
  const o = v as { on?: unknown; values?: unknown };
  return typeof o.on === "boolean" && !!o.values && typeof o.values === "object";
}

/** کپی امن یک نمونهٔ کانونی (فقط اعداد متناهی ✓ · سقف پارامتر ✓) */
function copyInstance(inst: ParamInstance): ParamInstance {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(inst.values ?? {})) {
    if (Object.keys(values).length >= MAX_PARAMS_PER_INSTANCE) break;
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
  }
  return { on: !!inst.on, values };
}

/**
 * **خواندن نمونه‌های یک آیتم** — تحمل‌پذیر ✓ (منبع حقیقت = خودِ `params` ماژول ✓):
 *   · `[{on,values}]` ⇒ کانونی ✓
 *   · `[21, 55]`      ⇒ دو نمونه (فرم قدیمیِ آرایه‌ای ✓)
 *   · `21`            ⇒ یک نمونه با پارامتر نخستِ اسکیما ✓ (فرم قدیمیِ اسکالر ✓)
 *   · هر چیز دیگر      ⇒ نادیده ✓ (هیچ نمونهٔ ساختگی ✗)
 */
export function readInstances(
  params: Record<string, unknown> | undefined,
  spec: LibraryItemSpec,
): ParamInstance[] {
  const raw = params?.[spec.key];
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    if (!raw.length) return [];
    if (raw.every((v) => typeof v === "number" && Number.isFinite(v))) {
      return raw.slice(0, MAX_INSTANCES_PER_ITEM).map((v) => legacyInstance(spec, v as number));
    }
    return raw
      .filter(isInstanceLike)
      .slice(0, MAX_INSTANCES_PER_ITEM)
      .map((v) => copyInstance(v as ParamInstance));
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return [legacyInstance(spec, raw)];
  return [];
}

/** نمونهٔ فرم قدیمی (عدد تنها) ⇒ پارامتر نخستِ اسکیما ✓ (بی‌پارامتر ⇒ `{}` ✓) */
function legacyInstance(spec: LibraryItemSpec, value: number): ParamInstance {
  const first = spec.params?.[0];
  return { on: true, values: first ? { [first]: value } : {} };
}

/**
 * نوشتن نمونه‌ها در `params` ماژول (**بدون جهش** ✓):
 * فهرست خالی ⇒ **تومبستون** `[]` می‌شود (کلید حذف نمی‌شود ✗) — چون در URL هم
 * باید «آیتم حذف شده» ثبت شود ✓ وگرنه با هر تغییر URL، پریستِ پروفایل آن را
 * **زنده می‌کرد** ✗ (باگ واقعی: حذف SMA ⇒ تیک یک ماژول ⇒ SMA با ۵۰ برمی‌گشت ✗).
 */
export function withInstances(
  params: Record<string, unknown> | undefined,
  spec: LibraryItemSpec,
  instances: readonly ParamInstance[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(params ?? {}) };
  next[spec.key] = instances.slice(0, MAX_INSTANCES_PER_ITEM).map(copyInstance);
  return next;
}

/** شمارش نمونه‌های روشن یک آیتم ✓ (نمایش «چند نسخه روی چارت» ✓) */
export function activeCountOf(
  params: Record<string, unknown> | undefined,
  spec: LibraryItemSpec,
): number {
  return readInstances(params, spec).filter((i) => i.on).length;
}

/**
 * **خودآزمون کتابخانه** — `@returns` خطاها (خالی = سالم ✓)
 * هدف: گرفتن **پیکربندی نادرست** پیش از ران‌تایم (نه تست رفتار UI ✓).
 */
export function librarySelfTest(): string[] {
  const errs: string[] = [];
  const schemas: Record<string, Record<string, ParamRule>> = { ...PARAM_SCHEMA, ...SIGNAL_PARAM_SCHEMA };

  for (const m of Object.keys(LIBRARY) as ModuleId[]) {
    const items = itemsOf(m);
    if (!items.length) errs.push(`ماژول «${m}» هیچ آیتمی ندارد ✗`);
    const keys = items.map((x) => x.key);
    if (new Set(keys).size !== keys.length) errs.push(`ماژول «${m}» کلید تکراری دارد ✗`);

    for (const spec of items) {
      if (!spec.fallbackLabel.trim()) errs.push(`آیتم «${m}.${spec.key}» برچسب پشتیبان ندارد ✗`);
      if (!spec.colorKey.trim()) errs.push(`آیتم «${m}.${spec.key}» رنگ (colorKey) ندارد ✗`);

      const id = spec.alId ?? spec.signalId;
      const declared = spec.params ?? [];
      /** ۱) آیتم بدون شناسهٔ AL ⇒ باید **بی‌پارامتر** باشد ✓ (هیچ پارامتر ساختگی ✗) */
      if (!id) {
        if (declared.length) {
          errs.push(`آیتم «${m}.${spec.key}» شناسهٔ AL ندارد ولی پارامتر اعلام کرده ✗`);
        }
        continue;
      }
      const schema = schemas[id];
      if (!schema) {
        errs.push(`شناسهٔ AL «${id}» (آیتم «${m}.${spec.key}») در هیچ اسکیمایی نیست ✗`);
        continue;
      }
      /** ۲) هر پارامتر اعلامی باید در اسکیمای AL موجود باشد ✓ (ضد تایپو ✓) */
      for (const name of declared) {
        if (!schema[name]) {
          errs.push(`پارامتر «${id}.${name}» در اسکیمای AL نیست ✗ (آیتم ${m}.${spec.key})`);
        }
      }
      /** ۳) پیش‌فرض‌ها داخل بازه و نوع درست ✓ */
      for (const [name, rule] of Object.entries(paramRulesOf(spec))) {
        if (rule.default < rule.min || rule.default > rule.max) {
          errs.push(`پیش‌فرض «${id}.${name}» بیرون بازه است ✗`);
        }
        if (rule.type === "int" && !Number.isInteger(rule.default)) {
          errs.push(`پیش‌فرض «${id}.${name}» باید صحیح باشد ✗`);
        }
      }
    }
  }

  /** ۴) تحمل‌پذیری خواندن (فرم اسکالر/آرایهٔ قدیمی ⇒ نمونه ✓ · ورودی بی‌معنا ⇒ هیچ ✓) */
  const ema = specOf("indicators", "ema")!;
  if (readInstances({ ema: 21 }, ema).length !== 1) errs.push("خواندن فرم اسکالر قدیمی نادرست ✗");
  if (readInstances({ ema: 55 }, ema)[0]?.values.period !== 55) {
    errs.push("مقدار اسکالر قدیمی به پارامتر نخست نگاشت نشد ✗");
  }
  if (readInstances({ ema: [21, 55] }, ema).length !== 2) errs.push("خواندن آرایهٔ قدیمی نادرست ✗");
  if (readInstances({ ema: [newInstance(ema), newInstance(ema)] }, ema).length !== 2) {
    errs.push("خواندن نمونه‌های کانونی نادرست ✗");
  }
  if (readInstances({ ema: "junk" }, ema).length !== 0) {
    errs.push("ورودی نامعتبر باید نادیده گرفته شود ✗");
  }

  /** ۵) «چند بار افزودن» واقعاً مستقل است ✓ (هیچ شیء مشترک ✗ — باگ کلاسیک ✗) */
  const a = newInstance(ema);
  const b = newInstance(ema);
  a.values.period = 7;
  if (b.values.period === 7) errs.push("نمونه‌های تازه شیء مشترک دارند ✗ (باید مستقل باشند)");

  /** ۶) نوشتن: فهرست خالی ⇒ **تومبستون** `[]` ✓ (کلید می‌ماند تا حذف در URL ثبت شود ✓) · سقف نمونه‌ها ✓ */
  const cleared = withInstances({ ema: [a] }, ema, []);
  if (!Array.isArray(cleared.ema) || (cleared.ema as unknown[]).length !== 0) {
    errs.push("حذف همهٔ نمونه‌ها باید تومبستون `[]` بگذارد ✗");
  }
  if (readInstances(cleared, ema).length !== 0) errs.push("تومبستون باید صفر نمونه بخواند ✗");
  const many = withInstances({}, ema, new Array(MAX_INSTANCES_PER_ITEM + 4).fill(a));
  if ((many.ema as unknown[]).length > MAX_INSTANCES_PER_ITEM) {
    errs.push("سقف تعداد نمونه‌ها اعمال نشد ✗");
  }

  /** ۷) محدودسازی مقدار: بیرون بازه ⇒ کلمپ ✓ · عدد صحیح ⇒ رُند ✓ */
  const period = paramRulesOf(ema).period!;
  if (clampValue(period, 1e6) !== period.max) errs.push("کلمپ بالا کار نکرد ✗");
  if (clampValue(period, 1.6) !== 2) errs.push("رُندکردن پارامتر صحیح کار نکرد ✗");

  /** ۸) آیتم بی‌پارامتر: نمونهٔ خالی ساخته می‌شود ✓ (هیچ پارامتر جعلی ✗) */
  const cross = specOf("signals", "cross")!;
  if (Object.keys(newInstance(cross).values).length !== 0) {
    errs.push("آیتم بی‌پارامتر نباید مقدار بسازد ✗");
  }
  return errs;
}



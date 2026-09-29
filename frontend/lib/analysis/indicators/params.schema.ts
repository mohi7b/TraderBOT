/**
 * AL — اسکیمای پارامترها (ولیدیتور fail-fast · D7/D11)
 * frontend/lib/analysis/indicators/params.schema.ts
 * ============================================================
 * چرا اسکیما و نه فقط JSON؟ (نکتهٔ N4 گزارش)
 *   · هر پارامتر `type/min/max/step/default/unit` دارد ⇒ ورودی AI هم بی‌قید
 *     نیست و ولیدیتور می‌تواند رد کند.
 *   · خروجی، همیشه **کامل با پیش‌فرض‌ها** است ⇒ تابع محاسبه هرگز `undefined`
 *     نمی‌بیند.
 *   · خطای اسکیما در **build/startup** دیده می‌شود، نه در چارت کاربر.
 *
 * ⚠️ هیچ متن کاربری این‌جا نیست؛ فقط `descriptionKey` برای i18n.
 * ============================================================
 */
import raw from "./params.json";

export type ParamType = "int" | "float";

export interface ParamRule {
  type: ParamType;
  min: number;
  max: number;
  step: number;
  default: number;
  /** یکای نمایش (در ردیف متا) */
  unit?: string;
  /** کلید i18n توضیح پارامتر */
  descriptionKey: string;
}

/** پارامترهای مجاز هر اندیکاتور/نسخه (شناسهٔ AL). */
export const PARAM_SCHEMA: Record<string, Record<string, ParamRule>> = {
  ema: {
    period: { type: "int", min: 2, max: 400, step: 1, default: 21, descriptionKey: "al.params.period" },
  },
  ema_fast: {
    period: { type: "int", min: 2, max: 200, step: 1, default: 9, descriptionKey: "al.params.period" },
  },
  ema_slow: {
    period: {
      type: "int",
      min: 5,
      max: 400,
      step: 1,
      default: 200,
      descriptionKey: "al.params.period",
    },
  },
  sma: {
    period: { type: "int", min: 2, max: 400, step: 1, default: 50, descriptionKey: "al.params.period" },
  },
  rsi: {
    period: { type: "int", min: 2, max: 100, step: 1, default: 14, descriptionKey: "al.params.period" },
  },
  macd: {
    fast: { type: "int", min: 2, max: 100, step: 1, default: 12, descriptionKey: "al.params.fast" },
    slow: { type: "int", min: 3, max: 200, step: 1, default: 26, descriptionKey: "al.params.slow" },
    signal: {
      type: "int",
      min: 2,
      max: 100,
      step: 1,
      default: 9,
      descriptionKey: "al.params.signal",
    },
  },
  atr: {
    period: { type: "int", min: 2, max: 100, step: 1, default: 14, descriptionKey: "al.params.period" },
  },
  bbands: {
    period: { type: "int", min: 5, max: 200, step: 1, default: 20, descriptionKey: "al.params.period" },
    deviation: {
      type: "float",
      min: 0.5,
      max: 5,
      step: 0.1,
      default: 2,
      unit: "σ",
      descriptionKey: "al.params.deviation",
    },
  },
  vwap: {},
};

/** پارامترهای خام (از `params.json`) — مقادیر پیش‌فرض قابل‌بازنویسی. */
export type RawParamsFile = Record<string, Record<string, number> | undefined>;

/**
 * ⚠️ `params.json` یک کلید توضیحی `$comment` (رشته) هم دارد که با
 * `RawParamsFile` جور نیست ⇒ کست با واسطهٔ `unknown` و توضیح صریح.
 */
const RAW = raw as unknown as RawParamsFile;

export interface ParamsValidation {
  /** پارامترهای کامل (پیش‌فرض‌ها اعمال‌شده) به‌ازای شناسه */
  params: Record<string, Record<string, number>>;
  errors: string[];
  warnings: string[];
}

/**
 * ولیدیتور fail-fast: هر مقدار باید در بازهٔ اسکیما باشد و نوعش درست باشد.
 * مقادیر نامعتبر ⇒ `errors` (نه اصلاح بی‌صدا) تا در startup دیده شود.
 */
export function validateParams(file: RawParamsFile = RAW): ParamsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const params: Record<string, Record<string, number>> = {};

  for (const [id, rules] of Object.entries(PARAM_SCHEMA)) {
    const given = file[id] ?? {};
    const resolved: Record<string, number> = {};
    for (const [name, rule] of Object.entries(rules)) {
      const value = given[name];
      if (value === undefined) {
        resolved[name] = rule.default;
        warnings.push(`پارامتر «${id}.${name}» داده نشده ⇒ پیش‌فرض ${rule.default}`);
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(`پارامتر «${id}.${name}» عدد نیست (${String(value)})`);
        resolved[name] = rule.default;
        continue;
      }
      if (rule.type === "int" && !Number.isInteger(value)) {
        errors.push(`پارامتر «${id}.${name}» باید صحیح باشد (${value})`);
      }
      if (value < rule.min || value > rule.max) {
        errors.push(`پارامتر «${id}.${name}» بیرون بازهٔ ${rule.min}..${rule.max} (${value})`);
        resolved[name] = Math.min(rule.max, Math.max(rule.min, value));
        continue;
      }
      resolved[name] = value;
    }
    // کلیدهای ناشناخته = هشدار (نه خطا) تا فایل جلوتر از اسکیما پوسیده نشود
    for (const name of Object.keys(given)) {
      if (!rules[name]) warnings.push(`پارامتر ناشناخته «${id}.${name}» نادیده گرفته شد`);
    }
    params[id] = resolved;
  }
  // شناسه‌های بدون اسکیما در فایل = خطا (تایپو) — `signals` بخش ساختاری است
  for (const id of Object.keys(file)) {
    if (id.startsWith("$") || id === "signals") continue;
    if (!PARAM_SCHEMA[id]) errors.push(`شناسهٔ ناشناخته در params.json: «${id}» (اسکیمایی ندارد)`);
  }
  return { params, errors, warnings };
}

/** پارامترهای یک شناسه (کامل با پیش‌فرض‌ها) — برای موتور اندیکاتور. */
export function paramsFor(id: string, overrides?: Record<string, number>): Record<string, number> {
  const base = validateParams().params[id] ?? {};
  return { ...base, ...(overrides ?? {}) };
}

// ------------------------------------------------------------------
// پارامترهای سیگنال‌ها (فاز A2) — همان قاعدهٔ «خارج از کد»
// ------------------------------------------------------------------
/** اسکیمای پارامترهای سیگنال (کلید = شناسهٔ سیگنال در AL). */
export const SIGNAL_PARAM_SCHEMA: Record<string, Record<string, ParamRule>> = {
  cross: {},
  volume_spike: {
    window: { type: "int", min: 2, max: 200, step: 1, default: 20, descriptionKey: "al.params.window" },
    z: { type: "float", min: 0.5, max: 6, step: 0.1, default: 2, descriptionKey: "al.params.z" },
    maxEvents: {
      type: "int",
      min: 1,
      max: 500,
      step: 1,
      default: 50,
      descriptionKey: "al.params.maxEvents",
    },
  },
  atr_breakout: {
    k: { type: "float", min: 0.1, max: 5, step: 0.1, default: 1.5, descriptionKey: "al.params.k" },
    maxEvents: {
      type: "int",
      min: 1,
      max: 500,
      step: 1,
      default: 50,
      descriptionKey: "al.params.maxEvents",
    },
  },
  // A2-2: الگوهای کندلی (نسبت‌های بدنه/سایه) و دایورجنس (پیوت/بازه)
  patterns: {
    dojiRatio: {
      type: "float",
      min: 0.01,
      max: 0.5,
      step: 0.01,
      default: 0.1,
      descriptionKey: "al.params.dojiRatio",
    },
    shadowRatio: {
      type: "float",
      min: 1,
      max: 6,
      step: 0.1,
      default: 2,
      descriptionKey: "al.params.shadowRatio",
    },
    maxEvents: {
      type: "int",
      min: 1,
      max: 500,
      step: 1,
      default: 50,
      descriptionKey: "al.params.maxEvents",
    },
  },
  divergence: {
    pivot: { type: "int", min: 1, max: 10, step: 1, default: 2, descriptionKey: "al.params.pivot" },
    lookback: {
      type: "int",
      min: 2,
      max: 200,
      step: 1,
      default: 30,
      descriptionKey: "al.params.lookback",
    },
    maxEvents: {
      type: "int",
      min: 1,
      max: 500,
      step: 1,
      default: 50,
      descriptionKey: "al.params.maxEvents",
    },
  },
  // A3: ساختار بازار (D9) — سوینگ/شکست ساختاری + شکاف ارزش
  structure: {
    pivot: { type: "int", min: 1, max: 10, step: 1, default: 2, descriptionKey: "al.params.pivot" },
    minBars: {
      type: "int",
      min: 1,
      max: 50,
      step: 1,
      default: 3,
      descriptionKey: "al.params.minBars",
    },
    maxEvents: {
      type: "int",
      min: 1,
      max: 500,
      step: 1,
      default: 50,
      descriptionKey: "al.params.maxEvents",
    },
  },
  fvg: {
    /** ۱ = فقط نواحی پرنشده (سیاست «ساختارهای مهم») · ۰ = همه */
    unfilledOnly: {
      type: "int",
      min: 0,
      max: 1,
      step: 1,
      default: 1,
      descriptionKey: "al.params.unfilledOnly",
    },
    maxEvents: {
      type: "int",
      min: 1,
      max: 500,
      step: 1,
      default: 50,
      descriptionKey: "al.params.maxEvents",
    },
  },
};

/** مقادیر سیگنال از `params.json` (فلت‌شده: همهٔ زیرکلیدها در یک آبجکت). */
export function signalParamsFor(id: string, overrides?: Record<string, number>): Record<string, number> {
  const raw = RAW as unknown as { signals?: Record<string, Record<string, number>> };
  const given = raw.signals?.[id] ?? {};
  const rules = SIGNAL_PARAM_SCHEMA[id] ?? {};
  const out: Record<string, number> = {};
  for (const [name, rule] of Object.entries(rules)) {
    const v = given[name];
    out[name] =
      typeof v === "number" && Number.isFinite(v) && v >= rule.min && v <= rule.max ? v : rule.default;
  }
  return { ...out, ...(overrides ?? {}) };
}

/** اعتبارسنجی پارامترهای سیگنال (fail-fast مثل اندیکاتورها). */
export function validateSignalParams(file?: RawParamsFile): ParamsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const params: Record<string, Record<string, number>> = {};
  const raw = ((file ?? RAW) as unknown as { signals?: Record<string, unknown> }).signals ?? {};
  for (const [id, rules] of Object.entries(SIGNAL_PARAM_SCHEMA)) {
    const given = (raw as Record<string, Record<string, number>>)[id] ?? {};
    const resolved: Record<string, number> = {};
    for (const [name, rule] of Object.entries(rules)) {
      const v = given[name];
      if (v === undefined) {
        resolved[name] = rule.default;
        continue;
      }
      if (typeof v !== "number" || v < rule.min || v > rule.max) {
        errors.push(`پارامتر سیگنال «${id}.${name}» نامعتبر است (${String(v)})`);
        resolved[name] = rule.default;
        continue;
      }
      resolved[name] = v;
    }
    for (const name of Object.keys(given)) {
      if (!rules[name]) warnings.push(`پارامتر سیگنال ناشناخته «${id}.${name}»`);
    }
    params[id] = resolved;
  }
  for (const id of Object.keys(raw)) {
    if (id.startsWith("$")) continue; // کلیدهای توضیحی، نه شناسهٔ سیگنال
    if (!SIGNAL_PARAM_SCHEMA[id]) errors.push(`شناسهٔ سیگنال ناشناخته در params.json: «${id}»`);
  }
  return { params, errors, warnings };
}

/**
 * مقدار یک پارامتر به‌صورت **نوع‌دار** (`number`, نه `number | undefined`).
 * دلیل وجود: `noUncheckedIndexedAccess` در این پروژه فعال است و دسترسی مستقیم
 * به `params.period` نوع مبهم می‌دهد؛ این تابع پیش‌فرض اسکیما را تضمین می‌کند.
 */
export function paramValue(id: string, name: string): number {
  const resolved = paramsFor(id)[name];
  if (typeof resolved === "number" && Number.isFinite(resolved)) return resolved;
  return PARAM_SCHEMA[id]?.[name]?.default ?? 0;
}
